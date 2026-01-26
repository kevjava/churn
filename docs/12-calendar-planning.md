# Calendar Planning & Velocity-Based Forecasting

## Overview

This feature converts Monte Carlo simulation results (in work-hours) into calendar date forecasts by accounting for:
- **Velocity**: Sustainable work rate on a project (e.g., 3.2 hours/day)
- **Holidays**: Days when no work happens
- **PTO/Leave**: Personal time off
- **Working schedule**: Which days of the week are work days

## Core Concepts

### Velocity

**Definition:** Average productive hours per calendar day devoted to a project.

**Examples:**
- 3.2 hr/day = ~40% of an 8-hour workday on this project
- 1.5 hr/day = Side project, evenings only
- 6.0 hr/day = Primary focus with some other responsibilities

**Why not 8 hours?**
- Meetings, interruptions, context switching
- Multiple projects competing for time
- Administrative overhead
- Realistic sustainable pace

### Calendar Constraints

**Holidays:** Federal/company holidays when no work occurs
**PTO/Leave:** Planned time off
**Weekend policy:** Does this project happen on weekends?
**Working days:** Default Mon-Fri, or custom schedule

## Data Model Extensions

### ProjectConfig Enhancement

```typescript
interface ProjectConfig {
  // ... existing fields ...
  
  // NEW: Calendar planning
  velocity_hours_per_day?: number;     // e.g., 3.2
  working_days?: number[];             // 1-5 for Mon-Fri (default)
  holidays?: Date[];                   // Specific dates when no work
  pto_periods?: PTOPeriod[];           // Planned time off
  start_date?: Date;                   // When work begins (default: today)
}

interface PTOPeriod {
  start: Date;
  end: Date;
  description?: string;  // e.g., "Christmas vacation"
}
```

### Database Schema Addition

```sql
-- Add to buckets.config JSON:
-- {
--   "velocity_hours_per_day": 3.2,
--   "working_days": [1, 2, 3, 4, 5],  -- Mon-Fri
--   "holidays": ["2025-01-20", "2025-02-17", ...],
--   "pto_periods": [
--     {"start": "2025-12-24", "end": "2025-12-26", "description": "Christmas"}
--   ],
--   "start_date": "2025-01-15"
-- }
```

## Algorithm: Hours to Calendar Date

### Basic Conversion

```typescript
function hoursToCalendarDate(
  workHours: number,
  config: ProjectConfig,
  startDate: Date = new Date()
): Date {
  const velocity = config.velocity_hours_per_day || 8.0; // Default: full day
  const workingDays = new Set(config.working_days || [1,2,3,4,5]); // Mon-Fri
  
  let remainingHours = workHours;
  let currentDate = new Date(startDate);
  
  while (remainingHours > 0) {
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Skip if not a working day
    if (!workingDays.has(currentDate.getDay())) {
      continue;
    }
    
    // Skip if holiday
    if (isHoliday(currentDate, config.holidays)) {
      continue;
    }
    
    // Skip if PTO
    if (isDuringPTO(currentDate, config.pto_periods)) {
      continue;
    }
    
    // Subtract a day's worth of work
    remainingHours -= velocity;
  }
  
  return currentDate;
}

function isHoliday(date: Date, holidays?: Date[]): boolean {
  if (!holidays) return false;
  return holidays.some(h => 
    h.getFullYear() === date.getFullYear() &&
    h.getMonth() === date.getMonth() &&
    h.getDate() === date.getDate()
  );
}

function isDuringPTO(date: Date, periods?: PTOPeriod[]): boolean {
  if (!periods) return false;
  return periods.some(p => date >= p.start && date <= p.end);
}
```

### Monte Carlo with Calendar

Extend simulation to produce calendar date distributions:

```typescript
function simulateProjectWithCalendar(
  tasks: Task[],
  dependencies: Map<number, number[]>,
  config: ProjectConfig,
  iterations: number = 10000
): CalendarForecast {
  const startDate = config.start_date || new Date();
  const completionDates: Date[] = [];
  
  for (let i = 0; i < iterations; i++) {
    // 1. Simulate work hours
    const workHours = simulateSingleRun(tasks, dependencies);
    
    // 2. Convert to calendar date
    const completionDate = hoursToCalendarDate(workHours, config, startDate);
    
    completionDates.push(completionDate);
  }
  
  // Sort and calculate percentiles
  completionDates.sort((a, b) => a.getTime() - b.getTime());
  
  return {
    start_date: startDate,
    percentile_50: completionDates[Math.floor(iterations * 0.50)],
    percentile_75: completionDates[Math.floor(iterations * 0.75)],
    percentile_90: completionDates[Math.floor(iterations * 0.90)],
    percentile_95: completionDates[Math.floor(iterations * 0.95)],
    mean_date: new Date(mean(completionDates.map(d => d.getTime()))),
    total_work_hours: {
      mean: mean(workHoursResults),
      p50: workHoursResults[Math.floor(iterations * 0.50)],
      p90: workHoursResults[Math.floor(iterations * 0.90)]
    },
    calendar_days: {
      mean: meanCalendarDays(completionDates, startDate),
      p50: calendarDays(completionDates[Math.floor(iterations * 0.50)], startDate),
      p90: calendarDays(completionDates[Math.floor(iterations * 0.90)], startDate)
    }
  };
}
```

## Holiday Data Sources

### US Federal Holidays (2025)

```typescript
const US_FEDERAL_HOLIDAYS_2025 = [
  new Date('2025-01-01'), // New Year's Day
  new Date('2025-01-20'), // MLK Jr. Day
  new Date('2025-02-17'), // Presidents' Day
  new Date('2025-05-26'), // Memorial Day
  new Date('2025-06-19'), // Juneteenth
  new Date('2025-07-04'), // Independence Day
  new Date('2025-09-01'), // Labor Day
  new Date('2025-10-13'), // Columbus Day
  new Date('2025-11-11'), // Veterans Day
  new Date('2025-11-27'), // Thanksgiving
  new Date('2025-12-25'), // Christmas
];
```

### Auto-Import Options

Users can specify:
- **US Federal**: Standard government holidays
- **Custom**: Manually specified dates
- **Calendar file**: Import from ICS (future)
- **None**: No holidays (for personal projects)

## CLI Interface

### Set Velocity

```bash
# Set velocity for a project bucket
$ churn project velocity "Q1 Website Redesign" 3.2

Set velocity: 3.2 hours/day
Working days: Mon-Fri (default)

# With custom working days (include Saturday)
$ churn project velocity "Side Project" 1.5 --days mon,tue,thu,sat
```

### Add Holidays

```bash
# Import standard US federal holidays for 2025
$ churn project holidays "Q1 Website Redesign" --us-federal 2025

Added 11 federal holidays

# Add custom holidays
$ churn project holidays "Q1 Website Redesign" --add 2025-03-17 "Company event"
$ churn project holidays "Q1 Website Redesign" --add 2025-04-01 "Team offsite"
```

### Add PTO

```bash
# Add PTO period
$ churn project pto "Q1 Website Redesign" --add 2025-12-24:2025-12-26 "Christmas"
$ churn project pto "Q1 Website Redesign" --add 2025-07-15:2025-07-22 "Summer vacation"

# List PTO
$ churn project pto "Q1 Website Redesign" --list

PTO Periods:
  Dec 24-26, 2025  (3 days)  Christmas
  Jul 15-22, 2025  (8 days)  Summer vacation
```

### Forecast with Calendar

```bash
$ churn project forecast "Q1 Website Redesign"

Project: Q1 Website Redesign
Start date: January 15, 2025
Velocity: 3.2 hours/day
Working days: Mon-Fri (excluding 3 holidays, 11 days PTO)

Work Effort:
  Mean: 52.3 work hours
  50% confidence: 48.0 hours
  90% confidence: 68.5 hours

Calendar Forecast:
  50% confidence: March 15, 2025 (31 calendar days)
  75% confidence: March 22, 2025 (38 calendar days)
  90% confidence: March 29, 2025 (45 calendar days)
  95% confidence: April  2, 2025 (49 calendar days)

Expected completion: March 18, 2025 (34 calendar days)

Note: Accounts for:
  - 12 weekend days
  - 2 federal holidays (Feb 17, Mar —)
  - 0 PTO days in range
```

## Configuration

### Config File

```json
{
  "calendar_planning": {
    "default_velocity": 4.0,
    "default_working_days": [1, 2, 3, 4, 5],
    "default_holidays": "us_federal",
    "holiday_year": 2025
  }
}
```

### Per-Bucket Override

```bash
$ churn bucket config "Q1 Website Redesign"

{
  "velocity_hours_per_day": 3.2,
  "working_days": [1, 2, 3, 4, 5],
  "holidays": [
    "2025-01-20",
    "2025-02-17",
    "2025-05-26"
  ],
  "pto_periods": [
    {
      "start": "2025-12-24",
      "end": "2025-12-26",
      "description": "Christmas"
    }
  ],
  "start_date": "2025-01-15"
}
```

## Visualization

### Calendar View (ASCII)

```bash
$ churn project calendar "Q1 Website Redesign"

           January 2025               February 2025              March 2025
  Su Mo Tu We Th Fr Sa      Su Mo Tu We Th Fr Sa      Su Mo Tu We Th Fr Sa
            1  2  3  4                         1                         1
   5  6  7  8  9 10 11       2  3  4  5  6  7  8       2  3  4  5  6  7  8
  12 13 14 ▓▓ ▓▓ ▓▓ 18       9 10 11 12 13 14 15       9 10 11 12 13 14 ▓▓
  19 ⊗  ▓▓ ▓▓ ▓▓ ▓▓ 25      16 ⊗  ▓▓ ▓▓ ▓▓ ▓▓ 22      ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ 22
  26 ▓▓ ▓▓ ▓▓ ▓▓ ▓▓          23 ▓▓ ▓▓ ▓▓ ▓▓ ▓▓        23 24 25 26 27 28 29
                                                       30 31

Legend:
  ▓▓ = Working day (3.2 hrs)
  ⊗  = Holiday (no work)
  ░░ = Weekend
  ◉  = 50% completion estimate (Mar 15)
  ◎  = 90% completion estimate (Mar 29)
```

## Integration with Existing Features

### With Priority Curves

Project deadline from calendar forecast feeds into:
- Linear curve: Start date → forecast p50
- Exponential curve: Use p90 as deadline

### With tt-time-tracker

Actual hours tracked per day refine velocity estimate:
```typescript
function learnVelocity(bucketId: number): number {
  // Query completions in this bucket
  const completions = getCompletionsForBucket(bucketId, last30Days);
  
  // Calculate work days in period
  const workDays = countWorkingDays(last30Days, config);
  
  // Average hours per working day
  const totalHours = completions.reduce((sum, c) => sum + c.actual_minutes / 60, 0);
  return totalHours / workDays;
}
```

### With Recurrence

Recurring tasks in project buckets:
- Affect velocity (reduce available hours)
- Show in calendar view
- Factor into simulations

## Uncertainty in Velocity

Velocity itself can vary. Advanced version could model this:

```typescript
interface VelocityConfig {
  mean: number;              // e.g., 3.2 hr/day
  std_deviation?: number;    // e.g., 0.8 (variability)
}

// Sample velocity each simulation run
function sampleVelocity(config: VelocityConfig): number {
  if (!config.std_deviation) {
    return config.mean;
  }
  // Normal distribution, bounded to positive values
  return Math.max(0.1, randomNormal(config.mean, config.std_deviation));
}
```

## Edge Cases

### Insufficient Working Days

If start date is late and too many holidays/PTO:
```
Warning: With current velocity (1.5 hr/day) and constraints,
project cannot complete before deadline (March 31).

Options:
  1. Increase velocity to 2.8 hr/day minimum
  2. Move start date earlier to January 1
  3. Reduce scope (remove tasks)
  4. Accept deadline miss
```

### Negative Remaining Time

If project is behind schedule:
```
Project is delayed!
Expected completion was: March 15 (passed 3 days ago)
Current estimate: March 25 (10 days from now)

Remaining work: 22.5 hours
At current velocity (3.2 hr/day): 7 working days
Calendar days: 10 days (includes 1 weekend)
```

## Testing Strategy

### Unit Tests

**hoursToCalendarDate:**
- No constraints → simple division
- Skip weekends
- Skip holidays
- Skip PTO periods
- Combined (weekends + holidays + PTO)

**Velocity learning:**
- Calculate from historical data
- Handle sparse data (few completions)
- Exclude outliers

### Integration Tests

**Full calendar simulation:**
- Create project with velocity + constraints
- Run Monte Carlo
- Verify dates are realistic
- Check percentiles increase monotonically

### Edge Cases

- Start date in the past
- Velocity = 0
- No working days between start and deadline
- All days are holidays/PTO

## Performance Considerations

Calendar date calculation is fast (simple iteration), but:
- Cache working day calculations
- Pre-compute holiday set (O(1) lookups)
- Batch date arithmetic

For 10,000 Monte Carlo iterations with calendar:
- Expected runtime: < 2 seconds
- Mostly dominated by task simulation, not calendar math

## Future Enhancements

### Phase 2 Ideas

- **Resource contention**: Multiple projects sharing same person
- **Team velocity**: Aggregate across multiple people
- **Velocity trends**: Learning if velocity changes over time
- **Weather the deadline**: Show probability of hitting specific date
- **Calendar sync**: Import holidays from Google Calendar/Outlook
- **Velocity by day of week**: More productive Mon-Wed?

### Advanced Analytics

- **Burndown prediction**: When will specific tasks complete?
- **Slack time visualization**: Show free time in calendar
- **What-if scenarios**: "What if I take next week off?"
- **Optimal start date**: When should I start to hit deadline with 90% confidence?

## Implementation Checklist

- [ ] Add velocity/calendar fields to ProjectConfig
- [ ] Implement hoursToCalendarDate function
- [ ] Add holiday checking logic
- [ ] Add PTO period checking
- [ ] Extend Monte Carlo for calendar dates
- [ ] Add velocity CLI commands
- [ ] Add holidays CLI commands
- [ ] Add PTO CLI commands
- [ ] Add forecast CLI command with calendar output
- [ ] Implement velocity learning from tt data
- [ ] Create calendar ASCII visualization
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Add to documentation
- [ ] Handle edge cases (insufficient time, etc.)

## Open Questions

1. **Holiday data sources**: Bundle common holiday calendars or require manual entry?
2. **Velocity persistence**: Store learned velocity or always calculate from historical data?
3. **Multiple people**: How to model team projects with different velocities?
4. **Partial days**: Some tasks might require full-day focus (can't do 0.2 days). Model this?
5. **Calendar export**: Should we generate ICS files with forecasted dates?
