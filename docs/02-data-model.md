# Data Model Specification

## Overview

This document defines the data structures, database schema, and TypeScript types for Churn. The data model is designed to support priority curves, recurrence, dependencies, and future extensibility.

## Core Entities

### Task
The central entity representing a unit of work with temporal properties.

### Project  
Grouping mechanism compatible with tt-time-tracker.

### Bucket
Time allocation context (e.g., ProjectA, Admin, Training).

### Tag
Flexible categorization for tasks.

### Completion
Historical record of task completion for learning and analysis.

## TypeScript Type Definitions

```typescript
// ===== ENUMS =====

export enum TaskStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
}

export enum RecurrenceMode {
  CALENDAR = 'calendar',    // Fixed schedule (every)
  COMPLETION = 'completion', // Based on last completion (after)
}

export enum RecurrenceType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  INTERVAL = 'interval',
}

export enum CurveType {
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  HARD_WINDOW = 'hard_window',
  BLOCKED = 'blocked',
  ACCUMULATOR = 'accumulator',
}

// ===== INTERFACES =====

export interface RecurrencePattern {
  mode: RecurrenceMode;
  type: RecurrenceType;
  interval?: number;        // For interval type (2 in "every 2w")
  unit?: 'days' | 'weeks' | 'months';
  dayOfWeek?: number;       // 0-6 for weekly patterns (0 = Sunday)
  anchor?: Date;            // Fixed start for calendar mode
}

export interface TimeWindow {
  start: string;            // HH:MM format (24-hour)
  end: string;              // HH:MM format (24-hour)
}

export interface CurveConfig {
  type: CurveType;
  
  // Common parameters
  start_date?: Date;
  deadline?: Date;
  
  // Exponential curve
  exponent?: number;        // Default 2.0
  
  // Hard window curve
  window_start?: Date;
  window_end?: Date;
  priority?: number;        // Default 1.0
  
  // Blocked curve
  dependencies?: number[];  // Task IDs
  then_curve?: CurveType;   // Curve to use after unblocked
  
  // Accumulator curve
  recurrence?: RecurrencePattern;
  buildup_rate?: number;    // Default 0.1
}

export interface Task {
  id: number;
  title: string;
  
  // Optional associations
  project?: string;
  bucket_id?: number;
  tags: string[];
  
  // Temporal properties
  deadline?: Date;
  estimate_minutes?: number;
  
  // Recurrence
  recurrence_pattern?: RecurrencePattern;
  last_completed_at?: Date;
  next_due_at?: Date;
  
  // Time window
  window_start?: string;    // HH:MM
  window_end?: string;      // HH:MM
  
  // Dependencies
  dependencies: number[];   // Task IDs this task depends on
  
  // Priority curve
  curve_config: CurveConfig;
  
  // Status
  status: TaskStatus;
  
  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface Bucket {
  id: number;
  name: string;
  type: 'project' | 'category' | 'context';
  
  // Configuration stored as JSON
  config: {
    preferred_times?: string[];       // e.g., ["mornings", "afternoons"]
    min_block_duration?: number;      // minutes
    interruptible?: boolean;
    hours_per_week?: number;
  };
  
  created_at: Date;
  updated_at: Date;
}

export interface Completion {
  id: number;
  task_id: number;
  completed_at: Date;
  
  // Time tracking (from tt integration)
  actual_minutes?: number;
  scheduled_minutes?: number;
  variance_minutes?: number;
  interruptions?: number;
  notes?: string;
  
  // Context for learning
  day_of_week: number;      // 0-6
  hour_of_day: number;      // 0-23
  competing_tasks?: number; // Count of other tasks that day
  
  created_at: Date;
}

export interface ParsedTask {
  title: string;
  date?: Date;
  project?: string;
  tags: string[];
  duration?: number;        // minutes
  bucket?: string;
  recurrence?: RecurrencePattern;
  window?: TimeWindow;
  dependencies?: number[];
  raw: string;              // Original input string
}
```

## SQLite Database Schema

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ===== BUCKETS =====
CREATE TABLE buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('project', 'category', 'context')),
  config TEXT NOT NULL DEFAULT '{}',  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_buckets_name ON buckets(name);

-- ===== TASKS =====
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  
  -- Associations
  project TEXT,
  bucket_id INTEGER REFERENCES buckets(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  
  -- Temporal
  deadline TEXT,  -- ISO 8601 datetime
  estimate_minutes INTEGER,
  
  -- Recurrence
  recurrence_mode TEXT CHECK(recurrence_mode IN ('calendar', 'completion')),
  recurrence_pattern TEXT,  -- JSON: RecurrencePattern
  last_completed_at TEXT,   -- ISO 8601 datetime
  next_due_at TEXT,         -- ISO 8601 datetime
  
  -- Time window
  window_start TEXT,  -- HH:MM
  window_end TEXT,    -- HH:MM
  
  -- Dependencies (stored as JSON array of task IDs)
  dependencies TEXT NOT NULL DEFAULT '[]',
  
  -- Priority curve (stored as JSON)
  curve_config TEXT NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'blocked')),
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX idx_tasks_project ON tasks(project);
CREATE INDEX idx_tasks_bucket ON tasks(bucket_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_next_due ON tasks(next_due_at);

-- Full-text search
CREATE VIRTUAL TABLE tasks_fts USING fts5(
  title,
  project,
  tags,
  content=tasks,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, project, tags)
  VALUES (new.id, new.title, new.project, new.tags);
END;

CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM tasks_fts WHERE rowid = old.id;
END;

CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
  UPDATE tasks_fts SET
    title = new.title,
    project = new.project,
    tags = new.tags
  WHERE rowid = new.id;
END;

-- ===== COMPLETIONS =====
CREATE TABLE completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,  -- ISO 8601 datetime
  
  -- Time tracking
  actual_minutes INTEGER,
  scheduled_minutes INTEGER,
  variance_minutes INTEGER,
  interruptions INTEGER DEFAULT 0,
  notes TEXT,
  
  -- Context
  day_of_week INTEGER NOT NULL,  -- 0-6
  hour_of_day INTEGER NOT NULL,  -- 0-23
  competing_tasks INTEGER,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_completions_task ON completions(task_id);
CREATE INDEX idx_completions_time ON completions(completed_at);
CREATE INDEX idx_completions_day ON completions(day_of_week);

-- ===== CONFIGURATION =====
-- Store user preferences and system state
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,  -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initial config
INSERT INTO config (key, value) VALUES 
  ('version', '"1.0.0"'),
  ('defaults', '{"curve_type":"linear","work_hours_start":"08:00","work_hours_end":"17:00"}');
```

## Database Migrations

### Version 1 (Initial Schema)
The schema above represents version 1. Future migrations will be tracked here.

### Migration Strategy
- Store schema version in `config` table
- Check version on startup
- Run migrations sequentially if needed
- Backup database before migrations

## Data Validation Rules

### Task
- **title**: Required, non-empty, max 500 characters
- **project**: Optional, max 100 characters, alphanumeric + `-_`
- **tags**: Each tag max 50 characters, alphanumeric + `-_`
- **estimate_minutes**: If provided, must be > 0
- **deadline**: If provided, must be valid ISO 8601 datetime
- **window_start/end**: If provided, must be valid HH:MM (00:00 to 23:59)
- **dependencies**: Must reference existing task IDs
- **curve_config**: Must be valid JSON matching CurveConfig interface
- **recurrence_pattern**: If provided, must be valid JSON matching RecurrencePattern

### Bucket
- **name**: Required, unique, max 100 characters
- **type**: Must be 'project', 'category', or 'context'
- **config**: Must be valid JSON

### Completion
- **task_id**: Must reference existing task
- **completed_at**: Required, valid ISO 8601 datetime
- **day_of_week**: 0-6
- **hour_of_day**: 0-23

## JSON Storage Format

### Tags (in tasks.tags)
```json
["deployment", "urgent", "backend"]
```

### Dependencies (in tasks.dependencies)
```json
[143, 144, 145]
```

### Recurrence Pattern (in tasks.recurrence_pattern)
```json
{
  "mode": "calendar",
  "type": "weekly",
  "dayOfWeek": 1
}
```

```json
{
  "mode": "completion",
  "type": "interval",
  "interval": 2,
  "unit": "weeks"
}
```

### Curve Config (in tasks.curve_config)

**Linear:**
```json
{
  "type": "linear",
  "start_date": "2025-01-01T00:00:00Z",
  "deadline": "2025-01-10T17:00:00Z"
}
```

**Exponential:**
```json
{
  "type": "exponential",
  "start_date": "2025-01-01T00:00:00Z",
  "deadline": "2025-01-10T17:00:00Z",
  "exponent": 2.5
}
```

**Hard Window:**
```json
{
  "type": "hard_window",
  "window_start": "2025-01-06T18:00:00Z",
  "window_end": "2025-01-07T08:00:00Z",
  "priority": 1.0
}
```

**Blocked:**
```json
{
  "type": "blocked",
  "dependencies": [143, 144],
  "then_curve": "linear",
  "deadline": "2025-01-10T17:00:00Z"
}
```

**Accumulator:**
```json
{
  "type": "accumulator",
  "recurrence": {
    "mode": "calendar",
    "type": "weekly",
    "dayOfWeek": 1
  },
  "buildup_rate": 0.1
}
```

### Bucket Config (in buckets.config)
```json
{
  "preferred_times": ["mornings", "afternoons"],
  "min_block_duration": 120,
  "interruptible": false,
  "hours_per_week": 20
}
```

## Data Access Patterns

### Common Queries

**Get tasks due today:**
```sql
SELECT * FROM tasks
WHERE status = 'open'
  AND (
    deadline BETWEEN date('now') AND datetime('now', '+1 day')
    OR next_due_at BETWEEN date('now') AND datetime('now', '+1 day')
  );
```

**Get tasks by project:**
```sql
SELECT * FROM tasks
WHERE project = ?
  AND status != 'completed'
ORDER BY deadline ASC;
```

**Full-text search:**
```sql
SELECT t.*
FROM tasks_fts fts
JOIN tasks t ON t.id = fts.rowid
WHERE tasks_fts MATCH ?
ORDER BY rank;
```

**Get task with dependencies:**
```sql
-- Main task
SELECT * FROM tasks WHERE id = ?;

-- Dependencies
SELECT t.* FROM tasks t
WHERE t.id IN (
  SELECT json_each.value
  FROM tasks, json_each(tasks.dependencies)
  WHERE tasks.id = ?
);
```

**Get completion history for task:**
```sql
SELECT * FROM completions
WHERE task_id = ?
ORDER BY completed_at DESC
LIMIT 20;
```

**Get recurring tasks due soon:**
```sql
SELECT * FROM tasks
WHERE recurrence_pattern IS NOT NULL
  AND status = 'open'
  AND next_due_at <= datetime('now', '+7 days')
ORDER BY next_due_at ASC;
```

## Data Integrity Constraints

### Foreign Keys
- `tasks.bucket_id` → `buckets.id` (ON DELETE SET NULL)
- `completions.task_id` → `tasks.id` (ON DELETE CASCADE)

### Check Constraints
- `tasks.status` ∈ {'open', 'in_progress', 'completed', 'blocked'}
- `tasks.recurrence_mode` ∈ {'calendar', 'completion'}
- `buckets.type` ∈ {'project', 'category', 'context'}
- `completions.day_of_week` ∈ [0, 6]
- `completions.hour_of_day` ∈ [0, 23]

### Business Logic Constraints
(Enforced in application code)

- Cannot create circular dependencies
- Blocked tasks must have dependencies
- Hard window tasks must have valid time window
- Recurring tasks must have valid recurrence pattern
- Accumulator curve requires recurrence pattern

## Default Values

### New Task Defaults
```typescript
{
  status: TaskStatus.OPEN,
  tags: [],
  dependencies: [],
  curve_config: {
    type: CurveType.LINEAR,
    start_date: new Date(),
    deadline: new Date(Date.now() + 7 * 86400000) // 7 days
  }
}
```

### New Bucket Defaults
```typescript
{
  type: 'category',
  config: {}
}
```

## Data Export Format

### JSON Export Structure
```json
{
  "version": "1.0.0",
  "exported_at": "2025-01-01T12:00:00Z",
  "buckets": [
    {
      "id": 1,
      "name": "ProjectA",
      "type": "project",
      "config": {}
    }
  ],
  "tasks": [
    {
      "id": 143,
      "title": "Deploy Relay",
      "project": "relay",
      "tags": ["deployment", "urgent"],
      "deadline": "2025-01-10T17:00:00Z",
      "estimate_minutes": 120,
      "curve_config": {
        "type": "linear",
        "start_date": "2025-01-01T00:00:00Z",
        "deadline": "2025-01-10T17:00:00Z"
      },
      "status": "open"
    }
  ],
  "completions": [
    {
      "id": 1,
      "task_id": 142,
      "completed_at": "2024-12-30T15:30:00Z",
      "actual_minutes": 90,
      "scheduled_minutes": 120
    }
  ]
}
```

## Database Utilities

### Backup
```bash
sqlite3 ~/.config/churn/churn.db ".backup '/path/to/backup.db'"
```

### Vacuum (optimize)
```bash
sqlite3 ~/.config/churn/churn.db "VACUUM;"
```

### Integrity Check
```bash
sqlite3 ~/.config/churn/churn.db "PRAGMA integrity_check;"
```

## Performance Considerations

### Indexes
- Indexes created for: project, bucket_id, status, deadline, next_due_at
- FTS index for full-text search on title, project, tags
- Completion indexes for task_id, completed_at, day_of_week

### Query Optimization
- Use prepared statements for repeated queries
- Batch inserts for completions
- Limit result sets with pagination
- Use covering indexes where possible

### Expected Scale (Phase 1)
- Tasks: < 10,000
- Completions: < 100,000
- Buckets: < 100
- No performance issues expected at this scale with proper indexing

## Testing Data

### Sample Tasks
```typescript
const sampleTasks = [
  {
    title: "Deploy Relay to production",
    project: "relay",
    tags: ["deployment", "urgent"],
    deadline: new Date("2025-01-10T17:00:00Z"),
    estimate_minutes: 120,
    curve_config: { type: "exponential", exponent: 2.0 }
  },
  {
    title: "Take out trash",
    tags: ["chore"],
    recurrence_pattern: {
      mode: "calendar",
      type: "weekly",
      dayOfWeek: 1
    },
    window_start: "18:00",
    window_end: "08:00",
    curve_config: { type: "hard_window" }
  },
  {
    title: "Get haircut",
    project: "personal",
    recurrence_pattern: {
      mode: "completion",
      type: "interval",
      interval: 2,
      unit: "weeks"
    },
    estimate_minutes: 60,
    curve_config: { type: "accumulator" }
  }
];
```

## Implementation Checklist

- [ ] Define TypeScript types
- [ ] Create database schema SQL
- [ ] Implement database initialization
- [ ] Create indexes
- [ ] Set up FTS triggers
- [ ] Write validation functions
- [ ] Implement CRUD operations
- [ ] Test foreign key constraints
- [ ] Test check constraints
- [ ] Write sample data generators
- [ ] Implement export/import
- [ ] Document query patterns
