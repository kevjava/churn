# tt-time-tracker + churn Integration Plan

> **Status: Complete** (January 2026)
>
> This integration has been implemented. The core logic has been extracted to
> `@kevjava/churn-core` and integrated with tt-time-tracker via the TaskScheduler
> interface.

## Architecture Overview

Extract service layers into separate core libraries with a shared interface:

```
@kevjava/task-parser     → Parsing + TaskScheduler interface (shared contract)
@kevjava/tt-core         → TTScheduler, TimeTrackingService, Session management
@kevjava/churn-core      → ChurnScheduler, PriorityCurves, Recurrence, DailyPlanner

tt (CLI)                 → Thin wrapper, uses tt-core (or churn-core when enabled)
churn (CLI)              → Thin wrapper, uses churn-core
```

**Key principle:** tt's scheduler stays simple and capable. Churn's complexity is an optional add-on.

---

## Phase 1: Define TaskScheduler Interface (task-parser)

**File:** `src/interfaces/scheduler.ts` (new)

```typescript
export interface ScheduledTask {
  id: number;
  title: string;
  project?: string;
  tags: string[];
  estimateMinutes?: number;
  priority?: number;
  scheduledDateTime?: Date;
  deadline?: Date;
  windowStart?: string;  // HH:MM
  windowEnd?: string;    // HH:MM
}

export interface DailyPlan {
  tasks: ScheduledTask[];
  totalMinutes: number;
  remainingMinutes: number;
}

export interface CompletionData {
  taskId: number;
  completedAt: Date;
  actualMinutes: number;
  scheduledMinutes?: number;
}

export interface TaskScheduler {
  /** Get prioritized tasks for a given date */
  getDailyPlan(date: Date, options?: { limit?: number }): DailyPlan;

  /** Get a specific task by ID */
  getTask(id: number): ScheduledTask | null;

  /** Mark task complete with time tracking data */
  completeTask(completion: CompletionData): void;

  /** Add a new scheduled task */
  addTask(task: Omit<ScheduledTask, 'id'>): ScheduledTask;

  /** Remove a scheduled task */
  removeTask(id: number): void;

  /** Check if scheduler is available/configured */
  isAvailable(): boolean;
}
```

**Export from task-parser index:**
```typescript
export * from './interfaces/scheduler';
```

---

## Phase 2: Create tt-core Package

**New package:** `/home/kev/Code/tt-core/`

### Structure
```
tt-core/
├── src/
│   ├── index.ts           # Exports
│   ├── scheduler.ts       # TTScheduler implements TaskScheduler
│   ├── time-tracking.ts   # TimeTrackingService (sessions)
│   ├── database.ts        # Database wrapper (from tt-time-tracker)
│   └── types.ts           # Session, etc.
├── package.json
└── tsconfig.json
```

### TTScheduler Implementation

```typescript
import { TaskScheduler, ScheduledTask, DailyPlan, CompletionData } from '@kevjava/task-parser';

export class TTScheduler implements TaskScheduler {
  constructor(private db: TTDatabase) {}

  getDailyPlan(date: Date, options?: { limit?: number }): DailyPlan {
    // Query scheduled_tasks ordered by:
    // 1. Incomplete/paused sessions (highest priority)
    // 2. Urgent (scheduled for today)
    // 3. Important (priority != 5)
    // 4. Oldest (FIFO)
  }

  completeTask(completion: CompletionData): void {
    // Remove from scheduled_tasks (task is now a session)
    // Record completion metadata for reporting
  }

  // ... other methods
}
```

### TimeTrackingService

Move session management from tt-time-tracker:
- `startSession()`, `stopSession()`, `pauseSession()`
- `getActiveSession()`, `resumeSession()`
- Continuation chains, interruptions

---

## Phase 3: Create churn-core Package

**New package:** `/home/kev/Code/churn-core/`

### Structure
```
churn-core/
├── src/
│   ├── index.ts           # Exports
│   ├── scheduler.ts       # ChurnScheduler implements TaskScheduler
│   ├── task-service.ts    # Task CRUD, recurrence (from churn)
│   ├── planner.ts         # DailyPlanner (from churn)
│   ├── curves/            # Priority curves (from churn)
│   ├── database.ts        # Database wrapper (from churn)
│   └── types.ts           # Task, Completion, etc.
├── package.json
└── tsconfig.json
```

### ChurnScheduler Implementation

```typescript
import { TaskScheduler, ScheduledTask, DailyPlan, CompletionData } from '@kevjava/task-parser';

export class ChurnScheduler implements TaskScheduler {
  constructor(private taskService: TaskService, private planner: DailyPlanner) {}

  getDailyPlan(date: Date, options?: { limit?: number }): DailyPlan {
    // Use DailyPlanner with priority curves
    // Filter actionable tasks (deadlines, windows, high priority)
    // Schedule into time slots
  }

  completeTask(completion: CompletionData): void {
    // Record in completions table with actual_minutes
    // Handle recurrence (calculate next_due)
    // Update task status
  }

  // ... other methods
}
```

---

## Phase 4: Refactor tt-time-tracker CLI

**Changes to tt-time-tracker:**

1. **Add dependencies:**
   ```json
   {
     "dependencies": {
       "@kevjava/tt-core": "file:../tt-core",
       "@kevjava/churn-core": "file:../churn-core"  // optional peer dep
     }
   }
   ```

2. **Add config for churn integration:**
   ```typescript
   churn?: {
     enabled?: boolean;
     db_path?: string;
   }
   ```

3. **Scheduler factory:**
   ```typescript
   function getScheduler(config: UserConfig, db: TTDatabase): TaskScheduler {
     if (config.churn?.enabled) {
       const churnDb = new ChurnDatabase(config.churn.db_path);
       return new ChurnScheduler(new TaskService(churnDb), new DailyPlanner());
     }
     return new TTScheduler(db);
   }
   ```

4. **Update commands to use TaskScheduler interface:**
   - `tt start` (no args) → `scheduler.getDailyPlan()`
   - `tt schedule list` → `scheduler.getDailyPlan()`
   - `tt schedule add` → `scheduler.addTask()`
   - `tt stop` → `scheduler.completeTask()` (if linked)

---

## Phase 5: Refactor churn CLI

**Changes to churn:**

1. **Add dependency:**
   ```json
   {
     "dependencies": {
       "@kevjava/churn-core": "file:../churn-core"
     }
   }
   ```

2. **CLI becomes thin wrapper:**
   - Commands call into churn-core services
   - Formatting/display stays in CLI
   - Business logic moves to churn-core

---

## Files Summary

| Package | Key Files | Purpose |
|---------|-----------|---------|
| task-parser | `src/interfaces/scheduler.ts` | TaskScheduler interface |
| tt-core | `src/scheduler.ts` | TTScheduler (simple FIFO + priority) |
| tt-core | `src/time-tracking.ts` | Session management |
| churn-core | `src/scheduler.ts` | ChurnScheduler (curves, recurrence) |
| churn-core | `src/planner.ts` | DailyPlanner logic |
| churn-core | `src/curves/*` | Priority curve implementations |
| tt (CLI) | `src/cli/commands/*` | Uses TaskScheduler interface |
| churn (CLI) | `src/cli/commands/*` | Uses churn-core services |

---

## Implementation Order

1. **task-parser**: Add TaskScheduler interface + types
2. **tt-core**: Extract from tt-time-tracker (scheduler, sessions, DB)
3. **churn-core**: Extract from churn (task service, planner, curves, DB)
4. **tt-time-tracker**: Refactor to use tt-core, add churn config
5. **churn**: Refactor to use churn-core
6. **Integration**: Wire up ChurnScheduler in tt when enabled

---

## Verification

1. `tt schedule list` works with TTScheduler (no churn)
2. `tt config churn.enabled true` enables churn integration
3. `tt schedule list` shows churn's daily plan when enabled
4. `tt start` → select churn task → `tt stop` → completes in churn with actual time
5. `churn pri` / `churn plan` work as before (using churn-core)
6. All existing tests pass after refactor
