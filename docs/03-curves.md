# Priority Curves Specification

## Overview

Priority curves are the core innovation of Churn. Unlike static priorities, curves model how task urgency changes over time. Each curve type captures different temporal patterns in real-world work.

## Core Interface

All curves implement this interface:

```typescript
interface PriorityCurve {
  /**
   * Calculate priority at a specific moment.
   * @param datetime - When to calculate priority
   * @returns Priority value 0.0 to 1.0 (can exceed 1.0 for overdue)
   */
  calculate(datetime: Date): number;
  
  /**
   * Get curve metadata for display/debugging
   */
  metadata(): CurveMetadata;
}

interface CurveMetadata {
  type: string;
  parameters: Record<string, any>;
  description: string;
}
```

## Curve Types

### 1. Linear Curve

**Use Case**: Tasks with steady, predictable urgency increase.

**Behavior**:
- Priority 0.0 at start_date
- Priority 1.0 at deadline
- Linear interpolation between
- Priority > 1.0 after deadline (continues linearly)

**Parameters**:
- `start_date`: Date - When task becomes actionable
- `deadline`: Date - When task is due

**Formula**:
```
if now < start_date: priority = 0
if now > deadline: priority = 1.0 + ((now - deadline) / (deadline - start_date))
else: priority = (now - start_date) / (deadline - start_date)
```

**Implementation**:
```typescript
class LinearCurve implements PriorityCurve {
  constructor(
    private startDate: Date,
    private deadline: Date
  ) {
    if (deadline <= startDate) {
      throw new Error('Deadline must be after start date');
    }
  }
  
  calculate(datetime: Date): number {
    const start = this.startDate.getTime();
    const end = this.deadline.getTime();
    const now = datetime.getTime();
    
    if (now < start) return 0;
    
    if (now > end) {
      const overdueMs = now - end;
      const totalMs = end - start;
      return 1.0 + (overdueMs / totalMs);
    }
    
    return (now - start) / (end - start);
  }
  
  metadata(): CurveMetadata {
    return {
      type: 'linear',
      parameters: {
        start_date: this.startDate.toISOString(),
        deadline: this.deadline.toISOString()
      },
      description: 'Linear increase from start to deadline'
    };
  }
}
```

**Example Values**:
```
Start: 2025-01-01, Deadline: 2025-01-10 (9 days)

Date         Priority  Status
2024-12-30   0.00      Not started
2025-01-01   0.00      Just started
2025-01-03   0.22      Low
2025-01-05   0.44      Medium
2025-01-08   0.78      High
2025-01-10   1.00      Due now
2025-01-12   1.22      Overdue
```

**Curve Visualization**:
```
Priority
1.0 |                    ╱━━━━━
    |                  ╱
    |                ╱
0.5 |              ╱
    |            ╱
    |          ╱
0.0 |━━━━━━━━━━━━━━━━━━━━━━━━━━━ Time
    start              deadline
```

### 2. Exponential Curve

**Use Case**: Tasks that aren't urgent early but become critical near deadline (typical procrastination pattern).

**Behavior**:
- Slow priority growth early
- Rapid increase near deadline
- Captures "last-minute urgency"

**Parameters**:
- `start_date`: Date - When task becomes actionable
- `deadline`: Date - When task is due
- `exponent`: number - Curve steepness (default: 2.0, range: 1.0-5.0)

**Formula**:
```
if now < start_date: priority = 0
if now > deadline: priority = 1.0 + ((now - deadline) / (deadline - start_date))
else:
  linear = (now - start_date) / (deadline - start_date)
  priority = linear ^ exponent
```

**Implementation**:
```typescript
class ExponentialCurve implements PriorityCurve {
  constructor(
    private startDate: Date,
    private deadline: Date,
    private exponent: number = 2.0
  ) {
    if (deadline <= startDate) {
      throw new Error('Deadline must be after start date');
    }
    if (exponent < 1.0 || exponent > 5.0) {
      throw new Error('Exponent must be between 1.0 and 5.0');
    }
  }
  
  calculate(datetime: Date): number {
    const start = this.startDate.getTime();
    const end = this.deadline.getTime();
    const now = datetime.getTime();
    
    if (now < start) return 0;
    
    if (now > end) {
      const overdueMs = now - end;
      const totalMs = end - start;
      return 1.0 + (overdueMs / totalMs);
    }
    
    const linear = (now - start) / (end - start);
    return Math.pow(linear, this.exponent);
  }
  
  metadata(): CurveMetadata {
    return {
      type: 'exponential',
      parameters: {
        start_date: this.startDate.toISOString(),
        deadline: this.deadline.toISOString(),
        exponent: this.exponent
      },
      description: `Exponential increase (x^${this.exponent})`
    };
  }
}
```

**Example Values (exponent = 2.0)**:
```
Start: 2025-01-01, Deadline: 2025-01-10

Date         Linear  Priority  Delta
2025-01-01   0.00    0.00      -
2025-01-03   0.22    0.05      +0.05
2025-01-05   0.44    0.19      +0.14
2025-01-07   0.67    0.45      +0.26
2025-01-09   0.89    0.79      +0.34
2025-01-10   1.00    1.00      +0.21
```

**Curve Visualization (exponent = 2.0)**:
```
Priority
1.0 |                      ┏━━━
    |                   ┏━━┛
    |                 ┏━┛
0.5 |               ┏━┛
    |             ┏━┛
    |          ┏━━┛
0.0 |━━━━━━━━━━━━━━━━━━━━━━━━━━ Time
    start              deadline
```

**Exponent Comparison**:
```
Priority at 50% through timeline:
  exponent = 1.0: 0.50 (linear)
  exponent = 2.0: 0.25 (moderate curve)
  exponent = 3.0: 0.13 (steep curve)
  exponent = 5.0: 0.03 (very steep, extreme procrastination)
```

### 3. Hard Window Curve

**Use Case**: Tasks that must be done within specific time range (trash pickup, meetings, time-sensitive opportunities).

**Behavior**:
- Priority 0.0 before window
- Priority jumps to configured value at window start
- Priority stays constant during window
- Priority returns to 0.0 after window ends

**Parameters**:
- `window_start`: Date - When window opens
- `window_end`: Date - When window closes
- `priority`: number - Priority level during window (default: 1.0)

**Formula**:
```
if now < window_start: priority = 0
if now > window_end: priority = 0
else: priority = configured_priority
```

**Implementation**:
```typescript
class HardWindowCurve implements PriorityCurve {
  constructor(
    private windowStart: Date,
    private windowEnd: Date,
    private priority: number = 1.0
  ) {
    if (windowEnd <= windowStart) {
      throw new Error('Window end must be after window start');
    }
    if (priority < 0 || priority > 2.0) {
      throw new Error('Priority must be between 0 and 2.0');
    }
  }
  
  calculate(datetime: Date): number {
    const now = datetime.getTime();
    const start = this.windowStart.getTime();
    const end = this.windowEnd.getTime();
    
    if (now >= start && now <= end) {
      return this.priority;
    }
    
    return 0;
  }
  
  metadata(): CurveMetadata {
    return {
      type: 'hard_window',
      parameters: {
        window_start: this.windowStart.toISOString(),
        window_end: this.windowEnd.toISOString(),
        priority: this.priority
      },
      description: 'On/off within specific time window'
    };
  }
}
```

**Example Values**:
```
Window: Monday 18:00 to Tuesday 08:00 (14 hours)

Time              Priority  Status
Mon 12:00         0.00      Too early
Mon 17:59         0.00      Just before window
Mon 18:00         1.00      Window opens
Mon 22:00         1.00      During window
Tue 02:00         1.00      During window
Tue 07:59         1.00      Just before close
Tue 08:00         0.00      Window closed
Tue 12:00         0.00      Too late
```

**Curve Visualization**:
```
Priority
1.0 |        ┏━━━━━━━━━┓
    |        ┃         ┃
    |        ┃         ┃
0.5 |        ┃         ┃
    |        ┃         ┃
    |        ┃         ┃
0.0 |━━━━━━━━┛         ┗━━━━━━━━━ Time
         start        end
```

**Midnight Crossing**:
When window crosses midnight (e.g., 18:00-08:00):
```typescript
// Check if time is in window that crosses midnight
const isInWindow = (now >= start) || (now <= end);
```

### 4. Blocked Curve

**Use Case**: Tasks that cannot start until dependencies complete.

**Behavior**:
- Priority 0.0 while any dependency incomplete
- Switches to wrapped curve once all dependencies complete
- Wrapped curve can be any other curve type

**Parameters**:
- `dependencies`: number[] - Task IDs that must complete first
- `then_curve`: CurveType - Curve to use after unblocked
- Plus parameters for wrapped curve (deadline, etc.)

**Formula**:
```
if any dependency incomplete: priority = 0
else: priority = wrapped_curve.calculate(datetime)
```

**Implementation**:
```typescript
class BlockedCurve implements PriorityCurve {
  constructor(
    private dependencies: number[],
    private thenCurve: PriorityCurve,
    private taskService: TaskService
  ) {
    if (dependencies.length === 0) {
      throw new Error('Blocked curve requires at least one dependency');
    }
  }
  
  async calculate(datetime: Date): Promise<number> {
    // Check if all dependencies are complete
    const allComplete = await this.taskService.allDependenciesComplete(
      this.dependencies
    );
    
    if (!allComplete) {
      return 0; // Still blocked
    }
    
    // Dependencies done, use wrapped curve
    return this.thenCurve.calculate(datetime);
  }
  
  metadata(): CurveMetadata {
    return {
      type: 'blocked',
      parameters: {
        dependencies: this.dependencies,
        then_curve: this.thenCurve.metadata()
      },
      description: `Blocked by tasks ${this.dependencies.join(', ')}`
    };
  }
}
```

**Example Values**:
```
Task depends on: #143, #144
Then use: Linear curve (Jan 1 - Jan 10)

Date         #143    #144    Priority  Reason
2025-01-01   open    open    0.00      Blocked by #143, #144
2025-01-05   done    open    0.00      Still blocked by #144
2025-01-06   done    done    0.56      Unblocked! Linear curve active
2025-01-10   done    done    1.00      Deadline reached
```

**Curve Visualization**:
```
Priority
1.0 |                          ╱━━━━
    |                        ╱
    |                      ╱
0.5 |                    ╱
    |                  ╱
    |                ╱
0.0 |━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Time
    create    deps    linear
              done    starts
```

**Circular Dependency Detection**:
Must check for circular dependencies before allowing task creation:
```typescript
function hasCircularDependency(taskId: number, depId: number): boolean {
  // Breadth-first search through dependency graph
  // Return true if depId eventually depends on taskId
}
```

### 5. Accumulator Curve

**Use Case**: Recurring tasks where pressure builds since last completion (email processing, lawn mowing, routine maintenance).

**Behavior**:
- Priority based on time since last completion
- Different behavior for calendar vs completion mode
- Gradual buildup, not urgent until threshold

**Parameters**:
- `recurrence`: RecurrencePattern - How often task should recur
- `last_completed`: Date | null - When last completed
- `buildup_rate`: number - How fast pressure builds (default: 0.1)

**Formula (Completion Mode)**:
```
days_since = (now - last_completed) / 86400000
expected_days = recurrence_interval_in_days
ratio = days_since / expected_days

if ratio < 0.5: priority = 0.1
if ratio < 0.8: priority = 0.3
if ratio < 1.0: priority = 0.6
if ratio < 1.2: priority = 0.9
else: priority = 1.0
```

**Formula (Calendar Mode)**:
```
days_until_due = (next_due - now) / 86400000
expected_interval = recurrence_interval_in_days

if days_until_due > expected_interval / 2:
  priority = 0.2  // Plenty of time
  
if days_until_due < 0:
  // Overdue
  days_overdue = abs(days_until_due)
  priority = min(1.5, 1.0 + (days_overdue * 0.1))
  
else:
  // Second half of interval
  progress = 1 - (days_until_due / (expected_interval / 2))
  priority = 0.2 + (progress * 0.8)  // 0.2 to 1.0
```

**Implementation**:
```typescript
class AccumulatorCurve implements PriorityCurve {
  constructor(
    private recurrence: RecurrencePattern,
    private lastCompleted: Date | null,
    private nextDue: Date,
    private buildupRate: number = 0.1
  ) {}
  
  calculate(datetime: Date): number {
    const now = datetime.getTime();
    const due = this.nextDue.getTime();
    
    // Calendar mode: priority builds as we approach due date
    if (this.recurrence.mode === RecurrenceMode.CALENDAR) {
      const expectedInterval = this.getExpectedIntervalDays();
      const daysUntilDue = (due - now) / 86400000;
      
      if (daysUntilDue > expectedInterval / 2) {
        return 0.2; // Low priority, plenty of time
      }
      
      if (daysUntilDue < 0) {
        // Overdue! Priority increases
        const daysOverdue = Math.abs(daysUntilDue);
        return Math.min(1.5, 1.0 + (daysOverdue * 0.1));
      }
      
      // Linear buildup in second half of interval
      const progress = 1 - (daysUntilDue / (expectedInterval / 2));
      return 0.2 + (progress * 0.8); // 0.2 to 1.0
    }
    
    // Completion mode: priority builds from last completion
    else {
      const lastDone = this.lastCompleted?.getTime() || 
                       (now - this.getExpectedIntervalDays() * 86400000);
      const daysSince = (now - lastDone) / 86400000;
      const expectedDays = this.getExpectedIntervalDays();
      const ratio = daysSince / expectedDays;
      
      if (ratio < 0.5) return 0.1;  // Early, very low
      if (ratio < 0.8) return 0.3;  // Getting there
      if (ratio < 1.0) return 0.6;  // Should do soon
      if (ratio < 1.2) return 0.9;  // Definitely time
      return 1.0;                    // Overdue
    }
  }
  
  private getExpectedIntervalDays(): number {
    switch (this.recurrence.type) {
      case RecurrenceType.DAILY: return 1;
      case RecurrenceType.WEEKLY: return 7;
      case RecurrenceType.MONTHLY: return 30;
      case RecurrenceType.INTERVAL:
        const unitDays = { days: 1, weeks: 7, months: 30 };
        return (this.recurrence.interval || 1) * 
               unitDays[this.recurrence.unit!];
      default: return 7;
    }
  }
  
  metadata(): CurveMetadata {
    return {
      type: 'accumulator',
      parameters: {
        recurrence: this.recurrence,
        last_completed: this.lastCompleted?.toISOString() || null,
        buildup_rate: this.buildupRate
      },
      description: 'Priority increases since last completion'
    };
  }
}
```

**Example Values (Completion Mode, after 2w)**:
```
Last completed: 2025-01-01
Expected interval: 14 days

Date         Days Since  Ratio  Priority  Status
2025-01-08   7           0.50   0.10      Still early
2025-01-12   11          0.79   0.30      Getting there
2025-01-14   13          0.93   0.60      Should do
2025-01-15   14          1.00   0.90      Time now
2025-01-17   16          1.14   1.00      Overdue
```

**Curve Visualization (Completion Mode)**:
```
Priority
1.0 |                        ┏━━━━
    |                      ┏━┛
    |                    ┏━┛
0.5 |                 ┏━━┛
    |              ┏━━┛
    |         ┏━━━━┛
0.0 |━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Time
    last      50%   100%  overdue
    done      time  time
```

## Curve Factory

Creates curve instances from configuration:

```typescript
class CurveFactory {
  static create(config: CurveConfig, taskService?: TaskService): PriorityCurve {
    switch (config.type) {
      case CurveType.LINEAR:
        return new LinearCurve(
          config.start_date!,
          config.deadline!
        );
        
      case CurveType.EXPONENTIAL:
        return new ExponentialCurve(
          config.start_date!,
          config.deadline!,
          config.exponent ?? 2.0
        );
        
      case CurveType.HARD_WINDOW:
        return new HardWindowCurve(
          config.window_start!,
          config.window_end!,
          config.priority ?? 1.0
        );
        
      case CurveType.BLOCKED:
        if (!taskService) {
          throw new Error('TaskService required for blocked curve');
        }
        const wrappedCurve = this.create({
          type: config.then_curve || CurveType.LINEAR,
          start_date: new Date(),
          deadline: config.deadline
        });
        return new BlockedCurve(
          config.dependencies!,
          wrappedCurve,
          taskService
        );
        
      case CurveType.ACCUMULATOR:
        return new AccumulatorCurve(
          config.recurrence!,
          null, // Will be set from task data
          new Date(), // Will be set from task data
          config.buildup_rate ?? 0.1
        );
        
      default:
        throw new Error(`Unknown curve type: ${config.type}`);
    }
  }
}
```

## Automatic Curve Selection

When creating tasks from grammar, automatically select appropriate curve:

```typescript
function inferCurveType(parsed: ParsedTask): CurveConfig {
  // Has time window? → Hard Window
  if (parsed.window) {
    return {
      type: CurveType.HARD_WINDOW,
      window_start: parseWindowTime(parsed.date, parsed.window.start),
      window_end: parseWindowTime(parsed.date, parsed.window.end),
      priority: 1.0
    };
  }
  
  // Has dependencies? → Blocked
  if (parsed.dependencies && parsed.dependencies.length > 0) {
    return {
      type: CurveType.BLOCKED,
      dependencies: parsed.dependencies,
      then_curve: CurveType.LINEAR,
      deadline: parsed.date
    };
  }
  
  // Has recurrence? → Accumulator
  if (parsed.recurrence) {
    return {
      type: CurveType.ACCUMULATOR,
      recurrence: parsed.recurrence,
      buildup_rate: 0.1
    };
  }
  
  // Default: Linear with deadline
  return {
    type: CurveType.LINEAR,
    start_date: new Date(),
    deadline: parsed.date || new Date(Date.now() + 7 * 86400000)
  };
}
```

## Priority Timeline

Generate timeline for visualization:

```typescript
interface TimelinePoint {
  datetime: Date;
  priority: number;
  status: 'inactive' | 'low' | 'medium' | 'high' | 'overdue';
}

function getPriorityTimeline(
  curve: PriorityCurve,
  startDate: Date,
  endDate: Date,
  intervals: number = 10
): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const stepMs = (endDate.getTime() - startDate.getTime()) / intervals;
  
  for (let i = 0; i <= intervals; i++) {
    const datetime = new Date(startDate.getTime() + (stepMs * i));
    const priority = curve.calculate(datetime);
    
    const status = 
      priority === 0 ? 'inactive' :
      priority < 0.5 ? 'low' :
      priority < 0.8 ? 'medium' :
      priority < 1.0 ? 'high' : 'overdue';
    
    points.push({ datetime, priority, status });
  }
  
  return points;
}
```

## Testing

### Unit Tests Required

Each curve type:
- [x] Priority at various time points
- [x] Priority before start
- [x] Priority at deadline
- [x] Priority after deadline
- [x] Edge cases (same start/deadline, negative exponent, etc.)
- [x] Metadata generation

### Integration Tests

- [x] Curve factory creates correct types
- [x] Automatic curve selection from grammar
- [x] Priority timeline generation
- [x] Blocked curve dependency checking
- [x] Accumulator curve with recurrence

### Test Data

```typescript
const testCases = [
  {
    name: "Linear - midpoint",
    curve: new LinearCurve(
      new Date("2025-01-01"),
      new Date("2025-01-10")
    ),
    datetime: new Date("2025-01-05"),
    expected: 0.44 // Approximately
  },
  {
    name: "Exponential - early",
    curve: new ExponentialCurve(
      new Date("2025-01-01"),
      new Date("2025-01-10"),
      2.0
    ),
    datetime: new Date("2025-01-03"),
    expected: 0.05 // Much lower than linear
  },
  // ... more test cases
];
```

## Implementation Checklist

- [ ] Define PriorityCurve interface
- [ ] Implement LinearCurve
- [ ] Implement ExponentialCurve
- [ ] Implement HardWindowCurve
- [ ] Implement BlockedCurve
- [ ] Implement AccumulatorCurve
- [ ] Implement CurveFactory
- [ ] Implement automatic curve inference
- [ ] Write unit tests for each curve
- [ ] Write integration tests
- [ ] Document curve selection logic
- [ ] Create visualization examples
