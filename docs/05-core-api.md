# Churn Core API Specification

## Overview

The `churn-core` module contains all business logic for task management, priority calculation, recurrence, and dependencies. It's designed to be consumed by the CLI and future API server.

## Module Structure

```
churn/
├── src/
│   ├── core/
│   │   ├── index.ts           # Main exports
│   │   ├── churn.ts           # ChurnCore class
│   │   ├── tasks.ts           # Task CRUD operations
│   │   ├── buckets.ts         # Bucket management
│   │   ├── curves/            # Priority curve implementations
│   │   │   ├── index.ts
│   │   │   ├── linear.ts
│   │   │   ├── exponential.ts
│   │   │   ├── hard-window.ts
│   │   │   ├── blocked.ts
│   │   │   ├── accumulator.ts
│   │   │   └── factory.ts
│   │   ├── recurrence.ts      # Recurrence calculation
│   │   ├── dependencies.ts    # Dependency resolution
│   │   └── database.ts        # SQLite wrapper
│   ├── cli/                   # CLI implementation (separate doc)
│   └── index.ts               # Package entry point
├── tests/
│   ├── core/
│   └── integration/
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Core API

### ChurnCore Class

Main entry point for all operations:

```typescript
export class ChurnCore {
  constructor(config: ChurnConfig);
  
  // Task operations
  tasks: TaskService;
  buckets: BucketService;
  
  // Utilities
  calculatePriority(taskId: number, datetime?: Date): Promise<number>;
  getPriorityTimeline(taskId: number, start: Date, end: Date): Promise<TimelinePoint[]>;
  
  // Database management
  close(): Promise<void>;
  export(): Promise<ExportData>;
  import(data: ExportData): Promise<void>;
}

export interface ChurnConfig {
  databasePath: string;
  verbose?: boolean;
}
```

### TaskService

```typescript
export class TaskService {
  constructor(private db: Database);
  
  // CRUD
  async create(input: CreateTaskInput): Promise<Task>;
  async get(id: number): Promise<Task | null>;
  async list(filter?: TaskFilter): Promise<Task[]>;
  async update(id: number, updates: Partial<Task>): Promise<Task>;
  async delete(id: number): Promise<void>;
  
  // Status management
  async complete(id: number, completedAt?: Date): Promise<void>;
  async reopen(id: number): Promise<void>;
  
  // Queries
  async search(query: string): Promise<Task[]>;
  async getDependencies(id: number): Promise<Task[]>;
  async getDependents(id: number): Promise<Task[]>;
  async getRecurring(): Promise<Task[]>;
  
  // Priority
  async calculatePriority(id: number, datetime?: Date): Promise<number>;
  async getByPriority(limit?: number, datetime?: Date): Promise<Array<Task & { priority: number }>>;
}

export interface CreateTaskInput {
  title: string;
  project?: string;
  tags?: string[];
  deadline?: Date;
  estimate_minutes?: number;
  bucket_id?: number;
  recurrence_pattern?: RecurrencePattern;
  window_start?: string;
  window_end?: string;
  dependencies?: number[];
  curve_config?: CurveConfig;
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  project?: string;
  bucket_id?: number;
  tags?: string[];
  has_deadline?: boolean;
  has_recurrence?: boolean;
  overdue?: boolean;
}
```

### BucketService

```typescript
export class BucketService {
  constructor(private db: Database);
  
  async create(input: CreateBucketInput): Promise<Bucket>;
  async get(id: number): Promise<Bucket | null>;
  async getByName(name: string): Promise<Bucket | null>;
  async list(): Promise<Bucket[]>;
  async update(id: number, updates: Partial<Bucket>): Promise<Bucket>;
  async delete(id: number): Promise<void>;
  
  async getTasks(bucketId: number): Promise<Task[]>;
}

export interface CreateBucketInput {
  name: string;
  type: 'project' | 'category' | 'context';
  config?: Record<string, any>;
}
```

## Priority Calculation

### Curve Factory

```typescript
export class CurveFactory {
  static create(config: CurveConfig, taskService?: TaskService): PriorityCurve;
}
```

### Priority Query

```typescript
export async function calculateTaskPriority(
  task: Task,
  datetime: Date,
  taskService: TaskService
): Promise<number> {
  const curve = CurveFactory.create(task.curve_config, taskService);
  return curve.calculate(datetime);
}
```

## Recurrence Engine

### Next Due Calculation

```typescript
export function calculateNextDue(
  pattern: RecurrencePattern,
  lastCompleted: Date | null,
  createdAt: Date
): Date {
  // Implementation per spec in 07-recurrence.md
}
```

### Completion Handling

```typescript
export async function completeRecurringTask(
  task: Task,
  completedAt: Date,
  db: Database
): Promise<void> {
  // Record completion
  await db.insertCompletion({
    task_id: task.id,
    completed_at: completedAt,
    day_of_week: completedAt.getDay(),
    hour_of_day: completedAt.getHours(),
  });
  
  // If recurring, calculate next instance
  if (task.recurrence_pattern) {
    const nextDue = calculateNextDue(
      task.recurrence_pattern,
      completedAt,
      task.created_at
    );
    
    await db.updateTask(task.id, {
      last_completed_at: completedAt,
      next_due_at: nextDue,
      status: TaskStatus.OPEN,
    });
  } else {
    await db.updateTask(task.id, {
      status: TaskStatus.COMPLETED,
    });
  }
}
```

## Dependency Resolution

### Validation

```typescript
export function validateDependencies(
  taskId: number,
  dependencies: number[],
  allTasks: Task[]
): void {
  // Check for circular dependencies
  if (hasCircularDependency(taskId, dependencies, allTasks)) {
    throw new Error('Circular dependency detected');
  }
  
  // Check all dependencies exist
  for (const depId of dependencies) {
    if (!allTasks.find(t => t.id === depId)) {
      throw new Error(`Dependency task ${depId} not found`);
    }
  }
}

function hasCircularDependency(
  taskId: number,
  dependencies: number[],
  allTasks: Task[]
): boolean {
  const visited = new Set<number>();
  const queue = [...dependencies];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current === taskId) {
      return true; // Circular!
    }
    
    if (visited.has(current)) {
      continue;
    }
    
    visited.add(current);
    
    const task = allTasks.find(t => t.id === current);
    if (task?.dependencies) {
      queue.push(...task.dependencies);
    }
  }
  
  return false;
}
```

### Status Checking

```typescript
export async function allDependenciesComplete(
  dependencies: number[],
  taskService: TaskService
): Promise<boolean> {
  for (const depId of dependencies) {
    const task = await taskService.get(depId);
    if (!task || task.status !== TaskStatus.COMPLETED) {
      return false;
    }
  }
  return true;
}
```

## Database Wrapper

### Database Class

```typescript
export class Database {
  constructor(path: string);
  
  async init(): Promise<void>;
  async close(): Promise<void>;
  
  // Task operations
  async insertTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<number>;
  async getTask(id: number): Promise<Task | null>;
  async getTasks(filter?: any): Promise<Task[]>;
  async updateTask(id: number, updates: Partial<Task>): Promise<void>;
  async deleteTask(id: number): Promise<void>;
  
  // Bucket operations
  async insertBucket(bucket: Omit<Bucket, 'id' | 'created_at' | 'updated_at'>): Promise<number>;
  async getBucket(id: number): Promise<Bucket | null>;
  async getBuckets(): Promise<Bucket[]>;
  async updateBucket(id: number, updates: Partial<Bucket>): Promise<void>;
  async deleteBucket(id: number): Promise<void>;
  
  // Completion operations
  async insertCompletion(completion: Omit<Completion, 'id' | 'created_at'>): Promise<number>;
  async getCompletions(taskId: number, limit?: number): Promise<Completion[]>;
  
  // Search
  async searchTasks(query: string): Promise<Task[]>;
  
  // Transactions
  async transaction<T>(fn: () => Promise<T>): Promise<T>;
}
```

## Usage Examples

### Creating a Task

```typescript
import { ChurnCore } from 'churn';
import { TaskParser } from '@kevjava/task-parser';

const churn = new ChurnCore({
  databasePath: '~/.config/churn/churn.db',
});

// From grammar
const parsed = TaskParser.parse('2025-01-10 Deploy Relay @relay +deployment ~2h');

const task = await churn.tasks.create({
  title: parsed.title,
  project: parsed.project,
  tags: parsed.tags,
  deadline: parsed.date,
  estimate_minutes: parsed.duration,
});

console.log(`Created task #${task.id}`);
```

### Calculating Priority

```typescript
const priority = await churn.calculatePriority(143);
console.log(`Current priority: ${priority.toFixed(2)}`);

// At specific time
const futureDate = new Date('2025-01-09T09:00:00');
const futurePriority = await churn.calculatePriority(143, futureDate);
console.log(`Priority on Jan 9: ${futurePriority.toFixed(2)}`);
```

### Getting Top Priorities

```typescript
const topTasks = await churn.tasks.getByPriority(10);

for (const task of topTasks) {
  console.log(`[${task.priority.toFixed(2)}] ${task.title}`);
}
```

### Completing Recurring Task

```typescript
await churn.tasks.complete(47); // "every monday Take out trash"

const updated = await churn.tasks.get(47);
console.log(`Next due: ${updated.next_due_at}`);
// Output: Next due: Monday, Jan 6, 2025
```

## Error Handling

All methods throw errors for invalid operations:

```typescript
try {
  await churn.tasks.create({
    title: "Task with circular dep",
    dependencies: [143],
  });
} catch (error) {
  if (error.message.includes('Circular dependency')) {
    console.error('Cannot create task: circular dependency detected');
  }
}
```

Common error types:
- `TaskNotFoundError`
- `CircularDependencyError`
- `InvalidCurveConfigError`
- `DatabaseError`

## Implementation Checklist

- [ ] Implement Database class
- [ ] Implement TaskService
- [ ] Implement BucketService
- [ ] Implement all curve types
- [ ] Implement CurveFactory
- [ ] Implement recurrence engine
- [ ] Implement dependency validation
- [ ] Write unit tests for each service
- [ ] Write integration tests
- [ ] Document all public methods
- [ ] Create usage examples
