# Recurrence Engine Specification

## Overview

The recurrence engine handles automatic task regeneration based on calendar or completion-based patterns.

## Recurrence Modes

### Calendar Mode (`every`)
Tasks occur on fixed schedule, independent of completion.

**Use cases:**
- Weekly meetings
- Regular maintenance on specific days
- Fixed schedule commitments

### Completion Mode (`after`)
Next occurrence based on when task was last completed.

**Use cases:**
- Personal grooming (haircut every 2 weeks)
- Maintenance intervals (oil change after 3000 miles)
- Health checkups (dental every 6 months)

## Next Due Calculation

### Algorithm

```typescript
export function calculateNextDue(
  pattern: RecurrencePattern,
  lastCompleted: Date | null,
  createdAt: Date
): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Calendar mode: independent of completion
  if (pattern.mode === RecurrenceMode.CALENDAR) {
    return calculateCalendarNextDue(pattern, now, createdAt);
  }
  
  // Completion mode: based on last completion
  else {
    const base = lastCompleted || createdAt;
    return calculateCompletionNextDue(pattern, base);
  }
}

function calculateCalendarNextDue(
  pattern: RecurrencePattern,
  now: Date,
  anchor: Date
): Date {
  const next = new Date(now);
  
  switch (pattern.type) {
    case RecurrenceType.DAILY:
      // Next day at midnight
      next.setDate(next.getDate() + 1);
      return next;
      
    case RecurrenceType.WEEKLY:
      if (pattern.dayOfWeek !== undefined) {
        // Next occurrence of specific weekday
        const currentDay = next.getDay();
        const targetDay = pattern.dayOfWeek;
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        next.setDate(next.getDate() + daysUntil);
        return next;
      } else {
        // Next week, same day
        next.setDate(next.getDate() + 7);
        return next;
      }
      
    case RecurrenceType.MONTHLY:
      // Next month, same day
      next.setMonth(next.getMonth() + 1);
      return next;
      
    case RecurrenceType.INTERVAL:
      // Calculate from fixed anchor
      const intervalMs = getIntervalMilliseconds(pattern.interval!, pattern.unit!);
      const anchorTime = anchor.getTime();
      const timeSinceAnchor = now.getTime() - anchorTime;
      const periods = Math.floor(timeSinceAnchor / intervalMs);
      return new Date(anchorTime + (periods + 1) * intervalMs);
  }
  
  throw new Error(`Unknown recurrence type: ${pattern.type}`);
}

function calculateCompletionNextDue(
  pattern: RecurrencePattern,
  lastCompleted: Date
): Date {
  const intervalMs = getIntervalMilliseconds(pattern.interval!, pattern.unit!);
  return new Date(lastCompleted.getTime() + intervalMs);
}

function getIntervalMilliseconds(interval: number, unit: 'days' | 'weeks' | 'months'): number {
  const msPerDay = 86400000;
  const msPerWeek = 604800000;
  const msPerMonth = 2592000000; // 30 days
  
  switch (unit) {
    case 'days': return interval * msPerDay;
    case 'weeks': return interval * msPerWeek;
    case 'months': return interval * msPerMonth;
  }
}
```

## Completion Handling

When a recurring task is completed:

```typescript
export async function completeRecurringTask(
  taskId: number,
  completedAt: Date,
  taskService: TaskService,
  db: Database
): Promise<void> {
  const task = await taskService.get(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  // Record completion with context
  await db.insertCompletion({
    task_id: taskId,
    completed_at: completedAt,
    day_of_week: completedAt.getDay(),
    hour_of_day: completedAt.getHours(),
    actual_minutes: null, // Will be filled by tt integration
    scheduled_minutes: task.estimate_minutes,
  });
  
  // If recurring, schedule next instance
  if (task.recurrence_pattern) {
    const nextDue = calculateNextDue(
      task.recurrence_pattern,
      completedAt,
      task.created_at
    );
    
    await db.updateTask(taskId, {
      status: TaskStatus.OPEN,
      last_completed_at: completedAt,
      next_due_at: nextDue,
    });
  } else {
    // Non-recurring, just mark complete
    await db.updateTask(taskId, {
      status: TaskStatus.COMPLETED,
      last_completed_at: completedAt,
    });
  }
}
```

## Edge Cases

### Skipped Occurrences (Calendar Mode)

If user skips a weekly task:
```
Task: every monday Take out trash
Due: Monday Jan 6
User completes: Wednesday Jan 8
Next due: Monday Jan 13 (not Monday Jan 15)
```

### Early Completion (Completion Mode)

If user completes early:
```
Task: after 2w Get haircut
Due: Jan 15
User completes: Jan 10
Next due: Jan 24 (14 days from Jan 10)
```

### Missed Multiple Occurrences

If user misses several instances:
```
Task: daily Morning standup
Last completed: Jan 1
Today: Jan 5
Status: Overdue
Next due: Jan 6 (tomorrow, not catching up)
```

### Month Boundary

```
Task: every 30d Change HVAC filter
Completed: Jan 31
Next due: Mar 2 (30 days later, even in February)
```

## Recurrence Analytics

Track patterns for learning:

```typescript
export async function analyzeRecurringTask(
  taskId: number,
  db: Database
): Promise<RecurrenceAnalytics> {
  const completions = await db.getCompletions(taskId, 20);
  const task = await db.getTask(taskId);
  
  if (completions.length < 2) {
    return {
      task_id: taskId,
      insufficient_data: true,
    };
  }
  
  // Calculate actual interval
  const intervals: number[] = [];
  for (let i = 1; i < completions.length; i++) {
    const prev = new Date(completions[i].completed_at);
    const curr = new Date(completions[i - 1].completed_at);
    const daysBetween = (curr.getTime() - prev.getTime()) / 86400000;
    intervals.push(daysBetween);
  }
  
  const avgInterval = mean(intervals);
  const expectedInterval = getExpectedIntervalDays(task!.recurrence_pattern!);
  const variance = standardDeviation(intervals);
  
  // Analyze by day of week
  const byDay = groupBy(completions, 'day_of_week');
  
  return {
    task_id: taskId,
    completions_count: completions.length,
    avg_interval_days: avgInterval,
    expected_interval_days: expectedInterval,
    adherence_rate: avgInterval / expectedInterval,
    consistency: variance,
    preferred_days: byDay.map(g => ({
      day: g.key,
      count: g.items.length,
      percentage: (g.items.length / completions.length) * 100,
    })),
  };
}

interface RecurrenceAnalytics {
  task_id: number;
  insufficient_data?: boolean;
  completions_count?: number;
  avg_interval_days?: number;
  expected_interval_days?: number;
  adherence_rate?: number; // actual / expected
  consistency?: number; // standard deviation
  preferred_days?: Array<{
    day: number;
    count: number;
    percentage: number;
  }>;
}
```

## Testing

### Test Cases

```typescript
describe('Recurrence Engine', () => {
  test('calendar mode - weekly on specific day', () => {
    const pattern: RecurrencePattern = {
      mode: RecurrenceMode.CALENDAR,
      type: RecurrenceType.WEEKLY,
      dayOfWeek: 1, // Monday
    };
    
    const lastCompleted = new Date('2025-01-06T18:00:00'); // Monday
    const created = new Date('2025-01-01');
    
    const next = calculateNextDue(pattern, lastCompleted, created);
    
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(13); // Jan 13
  });
  
  test('completion mode - 2 weeks', () => {
    const pattern: RecurrencePattern = {
      mode: RecurrenceMode.COMPLETION,
      type: RecurrenceType.INTERVAL,
      interval: 2,
      unit: 'weeks',
    };
    
    const lastCompleted = new Date('2025-01-01');
    const created = new Date('2024-12-01');
    
    const next = calculateNextDue(pattern, lastCompleted, created);
    
    expect(next.getDate()).toBe(15); // Jan 15 (14 days later)
  });
  
  test('calendar mode - skipped occurrence', () => {
    const pattern: RecurrencePattern = {
      mode: RecurrenceMode.CALENDAR,
      type: RecurrenceType.WEEKLY,
      dayOfWeek: 1,
    };
    
    const lastCompleted = new Date('2025-01-08'); // Wednesday
    const created = new Date('2025-01-01');
    
    const next = calculateNextDue(pattern, lastCompleted, created);
    
    // Should be next Monday (Jan 13), not Monday after (Jan 20)
    expect(next.getDate()).toBe(13);
  });
});
```

## Implementation Checklist

- [ ] Implement calculateNextDue()
- [ ] Implement calendar mode logic
- [ ] Implement completion mode logic
- [ ] Implement completeRecurringTask()
- [ ] Handle edge cases (skipped, early, etc)
- [ ] Implement recurrence analytics
- [ ] Write unit tests
- [ ] Test month boundaries
- [ ] Test leap years
- [ ] Test daylight saving time transitions
