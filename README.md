# Churn

Time-decay-based task management with priority curves.

Unlike traditional task managers with static priorities, Churn models how task urgency changes over time. Tasks have **priority curves** that automatically increase urgency as deadlines approach.

## Installation

```bash
git clone https://github.com/kevjava/churn.git
cd churn
npm install
npm run build
npm link
```

## Quick Start

```bash
# Initialize the database
churn init

# Create some tasks
churn create "tomorrow Deploy the new API @backend +urgent ~2h"
churn create "2025-02-15 Write quarterly report @work +admin ~4h"
churn create "daily Review pull requests @github +code-review ~30m"

# See what's most important right now
churn pri

# List all tasks
churn ls

# Complete a task
churn done 1
```

## Task Grammar

Tasks are created using a simple grammar:

```
[date] <title> [@project] [+tag...] [~duration] [$bucket] [recurrence] [window:HH:MM-HH:MM] [after:id,id]
```

### Components

| Component | Example | Description |
|-----------|---------|-------------|
| Date | `tomorrow`, `2025-02-01`, `monday` | Deadline for the task |
| Title | `Fix the login bug` | Task description (required) |
| Project | `@backend` | Project association |
| Tags | `+urgent +bug` | One or more tags |
| Duration | `~2h`, `~30m`, `~1h30m` | Time estimate |
| Bucket | `$ProjectA` | Time allocation bucket |
| Recurrence | `daily`, `weekly`, `every monday`, `every 2w`, `after 2w` | Recurring schedule |
| Window | `window:09:00-17:00` | Time window when task is active |
| Dependencies | `after:1,2` | Task IDs that must complete first |

### Examples

```bash
# Simple task with deadline
churn create "2025-02-01 Submit tax documents @personal +finance"

# Task with estimate and tags
churn create "Fix authentication bug @backend +bug +urgent ~2h"

# Daily recurring task with time window
churn create "daily Check monitoring dashboards @ops +routine ~15m window:09:00-10:00"

# Weekly task on specific day
churn create "every monday Team standup @work +meeting ~30m"

# Task that recurs 2 weeks after completion
churn create "after 2w Get haircut @personal ~1h"

# Task with dependencies
churn create "Deploy to production @backend +release ~1h after:42,43"

# Task in a bucket
churn create "Review design docs @frontend +design ~1h \$ProjectA"
```

## Commands

### Task Management

| Command | Shortcut | Description |
|---------|----------|-------------|
| `churn task create <desc>` | `churn create` | Create a new task |
| `churn task list` | `churn ls` | List tasks |
| `churn task show <id>` | `churn show` | Show task details |
| `churn task update <id>` | `churn update` | Update a task |
| `churn task complete <id>` | `churn done` | Mark task complete |
| `churn task delete <id>` | `churn rm` | Delete a task |
| `churn task reopen <id>` | `churn reopen` | Reopen completed task |
| `churn task search <query>` | `churn search` | Search tasks |

### Priority

```bash
# Show top priority tasks
churn pri

# Show top 20 priorities
churn pri --limit 20

# Calculate priority at a specific time
churn pri --at "2025-02-01 09:00"
```

### Buckets

Buckets are containers for time allocation (e.g., "ProjectA gets 20 hours/week").

```bash
# Create a bucket
churn bucket create ProjectA --type project

# List buckets
churn buckets

# Delete a bucket
churn bucket delete ProjectA
```

### Data Management

```bash
# Export all data to JSON
churn export -o backup.json

# Import data (replaces existing)
churn import backup.json

# Import and merge with existing
churn import backup.json --merge
```

## Priority Curves

Each task has a priority curve that determines how its urgency changes over time.

### Curve Types

| Type | Behavior | Use Case |
|------|----------|----------|
| `linear` | Steady increase from start to deadline | Most tasks (default) |
| `exponential` | Slow rise, then rapid increase near deadline | Tasks that can wait but become urgent |
| `hard_window` | On/off within specific time range | Time-sensitive tasks |
| `blocked` | Zero until dependencies complete | Dependent tasks |
| `accumulator` | Pressure builds since last completion | Recurring maintenance tasks |

```bash
# Override curve type
churn create "Write tests @backend ~2h" --curve exponential

# Set exponential curve steepness
churn create "Prepare presentation @work ~4h" --curve exponential --exponent 3
```

## Recurrence

### Calendar Mode (`every`)

Fixed schedule, happens whether you completed it or not:

```bash
churn create "every monday Team meeting @work ~1h"
churn create "every monday 16:00 Standup @work ~30m"
churn create "every 2w Sprint planning @work ~2h"
churn create "daily 09:00 Check email @work ~15m"
churn create "weekly Review goals @personal ~30m"
churn create "monthly Pay rent @personal ~5m"
```

You can add a time (HH:MM format) after the recurrence pattern to specify when the task is due.

### Completion Mode (`after`)

Next occurrence is relative to when you complete it:

```bash
churn create "after 2w Get haircut @personal ~1h"
churn create "after 3m Dentist appointment @health ~1h"
churn create "after 1w Clean desk @home ~30m"
```

## Filtering Tasks

```bash
# By status
churn ls --status open
churn ls --status completed

# By project
churn ls --project backend

# By tag
churn ls --tag urgent
churn ls --tag bug --tag critical

# Overdue tasks
churn ls --overdue

# Recurring tasks only
churn ls --recurring

# Sort by priority
churn ls --priority

# Combine filters
churn ls --project backend --tag urgent --priority
```

## Global Options

```bash
# Verbose output
churn -v create "New task"

# Use alternate database
churn --db /path/to/other.db ls

# Use alternate config
churn --config /path/to/config.json ls
```

## File Locations

```
~/.config/churn/
├── config.json    # Configuration
└── churn.db       # SQLite database
```

## Development

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type checking
npm run lint

# Build
npm run build
```

## License

MIT
