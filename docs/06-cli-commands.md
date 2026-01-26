# CLI Commands Specification

## Overview

The `churn` CLI provides a command-line interface for all task management operations.

## Command Structure

```
churn <command> [subcommand] [options] [arguments]
```

## Global Options

- `--verbose`, `-v`: Enable verbose logging
- `--config <path>`: Use alternate config file
- `--db <path>`: Use alternate database
- `--help`, `-h`: Show help
- `--version`: Show version

## Commands

### init

Initialize churn database and configuration.

```bash
churn init [--force]
```

**Options:**
- `--force`: Overwrite existing database

**Behavior:**
- Creates `~/.config/churn/` directory
- Creates `churn.db` with schema
- Creates default `config.json`
- Runs automatically on first command if not initialized

### task create

Create a new task using grammar.

```bash
churn task create <description>
churn create <description>  # Shortcut
```

**Examples:**
```bash
churn create 2025-01-10 Deploy Relay @relay +deployment ~2h
churn create every monday Take out trash +chore ~5m window:18:00-08:00
churn create after 2w Get haircut @personal ~1h
churn create Fix bug @relay +bug ~30m ^ProjectA after:143
```

**Options:**
- `--curve <type>`: Override curve type (linear, exponential, hard_window)
- `--exponent <n>`: Set exponential curve exponent (default: 2.0)

**Output:**
```
Created task #145: Deploy Relay
  Project: relay
  Tags: deployment
  Deadline: 2025-01-10
  Estimate: 2h
  Curve: linear
```

### task list

List tasks with optional filtering.

```bash
churn task list [options]
churn list [options]  # Shortcut
churn ls [options]    # Shortcut
```

**Options:**
- `--status <status>`: Filter by status (open, in_progress, completed, blocked)
- `--project <name>`: Filter by project
- `--bucket <name>`: Filter by bucket
- `--tag <tag>`: Filter by tag (multiple allowed)
- `--priority`: Sort by current priority (default: by deadline)
- `--limit <n>`: Limit results (default: 50)
- `--overdue`: Show only overdue tasks
- `--recurring`: Show only recurring tasks

**Output:**
```
ID  Pri   Status  Title                    Project  Due
143 0.85  open    Deploy Relay            relay     2025-01-10
144 0.72  open    Fix Docker networking   relay     2025-01-12
47  1.00  open    Take out trash          -         Mon 18:00
```

### task show

Show detailed information about a task.

```bash
churn task show <id>
churn show <id>  # Shortcut
```

**Output:**
```
Task #143: Deploy Relay

Project: relay
Tags: deployment, urgent
Status: open
Bucket: ProjectA

Timeline:
  Created: 2025-01-01
  Deadline: 2025-01-10
  Estimate: 2 hours

Priority Curve: linear
  Current Priority: 0.85 (high)
  Start: 2025-01-01
  Deadline: 2025-01-10

Dependencies: None
Dependents: Task #148 (Deploy to prod)

History: No completions
```

### task update

Update task properties.

```bash
churn task update <id> [options]
churn update <id> [options]  # Shortcut
```

**Options:**
- `--title <text>`: New title
- `--deadline <date>`: New deadline
- `--project <name>`: Change project
- `--add-tag <tag>`: Add tag
- `--remove-tag <tag>`: Remove tag
- `--estimate <duration>`: New estimate (~2h, ~90m)
- `--bucket <name>`: Change bucket

**Example:**
```bash
churn update 143 --deadline 2025-01-15 --add-tag critical
```

### task complete

Mark task as complete.

```bash
churn task complete <id> [--at <datetime>]
churn complete <id>  # Shortcut
churn done <id>      # Shortcut
```

**Options:**
- `--at <datetime>`: Completion time (default: now)

**Behavior:**
- Records completion
- For recurring tasks, schedules next instance
- Updates dependent tasks (unblocks them)

**Output:**
```
Task #47 completed: Take out trash
Next due: Monday, Jan 6, 2025 18:00
```

### task delete

Delete a task.

```bash
churn task delete <id> [--force]
churn delete <id>  # Shortcut
churn rm <id>      # Shortcut
```

**Options:**
- `--force`: Don't ask for confirmation

**Behavior:**
- Warns if task has dependents
- Asks for confirmation unless --force

### task reopen

Reopen a completed task.

```bash
churn task reopen <id>
churn reopen <id>  # Shortcut
```

### task search

Search tasks by text.

```bash
churn task search <query>
churn search <query>  # Shortcut
```

**Example:**
```bash
churn search "docker networking"
```

**Output:** Same format as `task list`

### bucket create

Create a new bucket.

```bash
churn bucket create <name> [--type <type>]
```

**Options:**
- `--type <type>`: Bucket type (project, category, context; default: category)

**Example:**
```bash
churn bucket create ProjectA --type project
```

### bucket list

List all buckets.

```bash
churn bucket list
churn buckets  # Shortcut
```

**Output:**
```
ID  Name      Type      Tasks
1   ProjectA  project   12
2   Admin     category  5
3   Training  context   3
```

### bucket delete

Delete a bucket.

```bash
churn bucket delete <id|name>
```

**Behavior:**
- Tasks in bucket have bucket_id set to NULL
- Does not delete tasks

### priority

Show tasks by current priority.

```bash
churn priority [--limit <n>] [--at <datetime>]
churn pri  # Shortcut
```

**Options:**
- `--limit <n>`: Number of tasks to show (default: 10)
- `--at <datetime>`: Calculate priority at specific time

**Output:**
```
Top priorities right now:

1. [1.00] Take out trash (Mon 18:00 window)
2. [0.85] Deploy Relay (@relay, due 2025-01-10)
3. [0.72] Fix Docker networking (@relay, due 2025-01-12)
4. [0.65] Review Q4 presentation (@work, due 2025-01-08)
...
```

### timeline

Show priority timeline for a task.

```bash
churn timeline <id> [--from <date>] [--to <date>]
```

**Options:**
- `--from <date>`: Start date (default: today)
- `--to <date>`: End date (default: deadline + 3 days)

**Output:**
```
Priority timeline for Task #143: Deploy Relay

Date         Time    Priority  Status
2025-01-01   09:00   0.00      Just started
2025-01-03   09:00   0.22      Low
2025-01-05   09:00   0.44      Medium
2025-01-08   09:00   0.78      High
2025-01-10   09:00   1.00      Due now
2025-01-12   09:00   1.22      Overdue
```

### export

Export all data to JSON.

```bash
churn export [--output <file>]
```

**Options:**
- `--output <file>`: Output file (default: stdout)

**Output:** JSON format per 02-data-model.md spec

### import

Import data from JSON.

```bash
churn import <file> [--merge]
```

**Options:**
- `--merge`: Merge with existing data (default: replace)

## Output Formatting

### Table Format

Default for list commands:
```
ID  Pri   Status  Title                    Project  Due
143 0.85  open    Deploy Relay            relay     Jan 10
```

### Verbose Format

With `--verbose` flag:
```
Task #143
  Title: Deploy Relay
  Project: relay
  Tags: deployment, urgent
  Status: open
  Priority: 0.85
  Deadline: 2025-01-10T17:00:00Z
  Created: 2025-01-01T08:30:00Z
```

### JSON Format

With `--json` flag:
```json
{
  "id": 143,
  "title": "Deploy Relay",
  "project": "relay",
  "tags": ["deployment", "urgent"],
  "status": "open",
  "priority": 0.85,
  "deadline": "2025-01-10T17:00:00Z"
}
```

## Error Handling

### User Errors

Clear, actionable messages:
```
Error: Task not found: #999
  Run 'churn list' to see all tasks

Error: Invalid date format: 'yesterday'
  Use YYYY-MM-DD, 'today', 'tomorrow', or day name

Error: Circular dependency detected
  Task #143 depends on #144, which depends on #143
```

### System Errors

With stack trace in verbose mode:
```
Database error: unable to open database file
  Path: /home/user/.config/churn/churn.db
  
Run with --verbose for details
```

## Configuration File

`~/.config/churn/config.json`:

```json
{
  "database": {
    "path": "~/.config/churn/churn.db"
  },
  "defaults": {
    "curve_type": "linear",
    "work_hours_start": "08:00",
    "work_hours_end": "17:00"
  },
  "display": {
    "date_format": "YYYY-MM-DD",
    "time_format": "24h"
  },
  "logging": {
    "level": "info",
    "file": "~/.config/churn/churn.log"
  }
}
```

## Implementation Checklist

- [ ] Implement command parser (Commander.js)
- [ ] Implement all commands
- [ ] Implement table formatting
- [ ] Implement verbose output
- [ ] Implement JSON output
- [ ] Implement error handling
- [ ] Write help text for all commands
- [ ] Add command aliases
- [ ] Implement config file loading
- [ ] Add bash completion (optional)
