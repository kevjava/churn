# Testing Strategy

## Overview

Comprehensive testing ensures reliability across parsing, priority calculations, recurrence, and dependencies.

## Test Levels

### Unit Tests
Test individual functions/classes in isolation.

### Integration Tests
Test interactions between components (database, services, curves).

### End-to-End Tests
Test complete CLI workflows.

## Test Structure

```
tests/
├── unit/
│   ├── parser/
│   │   ├── grammar.test.ts
│   │   ├── dates.test.ts
│   │   └── durations.test.ts
│   ├── curves/
│   │   ├── linear.test.ts
│   │   ├── exponential.test.ts
│   │   ├── hard-window.test.ts
│   │   ├── blocked.test.ts
│   │   └── accumulator.test.ts
│   ├── recurrence.test.ts
│   └── dependencies.test.ts
├── integration/
│   ├── task-service.test.ts
│   ├── priority-calculation.test.ts
│   ├── recurring-completion.test.ts
│   └── dependency-cascade.test.ts
└── e2e/
    ├── cli-basic.test.ts
    ├── cli-recurring.test.ts
    └── cli-dependencies.test.ts
```

## Coverage Goals

- Overall: 80%+
- Core logic (curves, recurrence, dependencies): 95%+
- Database layer: 80%+
- CLI: 70%+

## Critical Test Cases

### Parser

- [ ] All grammar variations
- [ ] Date formats (ISO, relative, weekdays)
- [ ] Duration formats (hours, minutes, mixed)
- [ ] Recurrence patterns (calendar, completion)
- [ ] Time windows (normal, crossing midnight)
- [ ] Dependencies (single, multiple)
- [ ] Error cases (missing title, invalid formats)

### Curves

- [ ] Linear at various points
- [ ] Exponential with different exponents
- [ ] Hard window (before, during, after)
- [ ] Blocked (with complete/incomplete deps)
- [ ] Accumulator (calendar and completion modes)
- [ ] Overdue calculations
- [ ] Edge cases (same start/end, far future)

### Recurrence

- [ ] Calendar mode - daily, weekly, monthly
- [ ] Calendar mode - specific weekday
- [ ] Calendar mode - interval (every 2w)
- [ ] Completion mode - various intervals
- [ ] Skipped occurrences
- [ ] Early completion
- [ ] Month boundaries
- [ ] Leap years

### Dependencies

- [ ] Simple chain (A → B → C)
- [ ] Multiple dependencies (A → [B, C, D])
- [ ] Circular detection (A → B → A)
- [ ] Complex circular (A → B → C → A)
- [ ] Self-dependency
- [ ] Unblocking cascade
- [ ] Delete with dependents

## Test Data

### Sample Tasks

```typescript
export const sampleTasks = {
  simple: {
    title: 'Buy groceries',
    tags: ['personal'],
    curve_config: { type: 'linear', deadline: addDays(7) },
  },
  
  withDeadline: {
    title: 'Deploy Relay',
    project: 'relay',
    tags: ['deployment', 'urgent'],
    deadline: new Date('2025-01-10T17:00:00Z'),
    estimate_minutes: 120,
    curve_config: { type: 'exponential', exponent: 2.0 },
  },
  
  recurring: {
    title: 'Take out trash',
    tags: ['chore'],
    recurrence_pattern: {
      mode: RecurrenceMode.CALENDAR,
      type: RecurrenceType.WEEKLY,
      dayOfWeek: 1,
    },
    window_start: '18:00',
    window_end: '08:00',
    curve_config: { type: 'hard_window' },
  },
  
  withDependencies: {
    title: 'Deploy to prod',
    dependencies: [143, 144],
    curve_config: { type: 'blocked', then_curve: 'linear' },
  },
};
```

### Database Fixtures

```typescript
export async function setupTestDatabase(): Promise<Database> {
  const db = new Database(':memory:');
  await db.init();
  
  // Insert test buckets
  await db.insertBucket({ name: 'ProjectA', type: 'project' });
  await db.insertBucket({ name: 'Admin', type: 'category' });
  
  // Insert test tasks
  for (const task of Object.values(sampleTasks)) {
    await db.insertTask(task);
  }
  
  return db;
}
```

## Testing Utilities

### Time Travel

```typescript
export class MockClock {
  private currentTime: Date;
  
  constructor(initialTime: Date) {
    this.currentTime = initialTime;
  }
  
  now(): Date {
    return new Date(this.currentTime);
  }
  
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
  
  advanceDays(days: number): void {
    this.advance(days * 86400000);
  }
}
```

### Assertions

```typescript
export function assertPriorityBetween(
  actual: number,
  min: number,
  max: number,
  message?: string
): void {
  expect(actual).toBeGreaterThanOrEqual(min);
  expect(actual).toBeLessThanOrEqual(max);
  if (message) {
    console.log(message);
  }
}

export function assertNextDueDate(
  actual: Date,
  expected: Date,
  toleranceMs: number = 1000
): void {
  const diff = Math.abs(actual.getTime() - expected.getTime());
  expect(diff).toBeLessThan(toleranceMs);
}
```

## Example Tests

### Parser Test

```typescript
describe('TaskParser', () => {
  test('parses complete task description', () => {
    const input = 'every monday Take out trash @home +chore ~5m window:18:00-08:00';
    const parsed = TaskParser.parse(input);
    
    expect(parsed.title).toBe('Take out trash');
    expect(parsed.project).toBe('home');
    expect(parsed.tags).toEqual(['chore']);
    expect(parsed.duration).toBe(5);
    expect(parsed.recurrence).toMatchObject({
      mode: RecurrenceMode.CALENDAR,
      type: RecurrenceType.WEEKLY,
      dayOfWeek: 1,
    });
    expect(parsed.window).toEqual({
      start: '18:00',
      end: '08:00',
    });
  });
});
```

### Curve Test

```typescript
describe('ExponentialCurve', () => {
  test('grows slowly early, rapidly near deadline', () => {
    const curve = new ExponentialCurve(
      new Date('2025-01-01'),
      new Date('2025-01-10'),
      2.0
    );
    
    const priority25 = curve.calculate(new Date('2025-01-03'));
    const priority50 = curve.calculate(new Date('2025-01-05'));
    const priority75 = curve.calculate(new Date('2025-01-08'));
    
    expect(priority25).toBeLessThan(0.1); // Still very low
    expect(priority50).toBeCloseTo(0.25, 1); // x^2 at 0.5
    expect(priority75).toBeGreaterThan(0.5); // Growing fast
  });
});
```

### Integration Test

```typescript
describe('Recurring Task Completion', () => {
  test('schedules next instance for calendar mode', async () => {
    const db = await setupTestDatabase();
    const taskService = new TaskService(db);
    
    const task = await taskService.create({
      title: 'Weekly meeting',
      recurrence_pattern: {
        mode: RecurrenceMode.CALENDAR,
        type: RecurrenceType.WEEKLY,
        dayOfWeek: 1,
      },
    });
    
    const completedAt = new Date('2025-01-06T10:00:00'); // Monday
    await completeRecurringTask(task.id, completedAt, taskService, db);
    
    const updated = await taskService.get(task.id);
    expect(updated!.status).toBe(TaskStatus.OPEN);
    expect(updated!.next_due_at.getDay()).toBe(1); // Monday
    expect(updated!.next_due_at.getDate()).toBe(13); // Jan 13
  });
});
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test -- --coverage
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Performance Tests

### Priority Calculation

```typescript
test('calculates priority for 1000 tasks quickly', async () => {
  const start = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    await churn.calculatePriority(i);
  }
  
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(1000); // < 1ms per task
});
```

## Implementation Checklist

- [ ] Set up Jest configuration
- [ ] Create test database utilities
- [ ] Write parser tests (all grammar)
- [ ] Write curve tests (all types)
- [ ] Write recurrence tests
- [ ] Write dependency tests
- [ ] Write integration tests
- [ ] Write CLI e2e tests
- [ ] Set up coverage reporting
- [ ] Configure CI/CD
- [ ] Document testing patterns
