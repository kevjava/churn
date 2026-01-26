# Task Description Grammar

## Overview

The task description grammar is a concise, human-friendly syntax for creating and describing tasks. It's designed to minimize cognitive load by allowing natural language-like expressions while maintaining parseable structure.

This grammar is shared between `churn` and `tt-time-tracker` via the `task-parser` library.

## Grammar Specification (EBNF)

```ebnf
task_description = [recurrence] [date] title [metadata]*

recurrence = calendar_recurrence | completion_recurrence
calendar_recurrence = "every" (weekday | interval) | shorthand
completion_recurrence = "after" interval
shorthand = "daily" | "weekly" | "monthly"

weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
interval = number unit
unit = "d" | "w" | "m"  (* days, weeks, months *)

date = iso_date | relative_date
iso_date = YYYY-MM-DD
relative_date = "today" | "tomorrow" | weekday

title = <any text until metadata marker>

metadata = project | tag | duration | bucket | window | dependencies

project = "@" identifier
tag = "+" identifier  
duration = "~" time_amount
bucket = "^" identifier
window = "window:" time "-" time
dependencies = "after:" task_id_list

identifier = <alphanumeric string>
time_amount = number ("m" | "h") | number "h" number "m"
time = HH:MM  (* 24-hour format *)
task_id_list = number ("," number)*
```

## Component Syntax

### Recurrence (Optional)

**Calendar-based** (fixed schedule):
```
every <weekday>           # every monday, every friday
every <interval>          # every 2w, every 3d, every 1m
daily | weekly | monthly  # shorthand for every 1d/1w/1m
```

**Completion-based** (flexible schedule):
```
after <interval>          # after 2w, after 30d, after 3m
```

Examples:
- `every monday` - Every Monday, regardless of completion
- `every 2w` - Every 2 weeks from anchor date
- `after 2w` - 2 weeks after last completion
- `daily` - Every day (shorthand for `every 1d`)

### Date (Optional)

**ISO format**:
```
2025-01-10
2025-12-31
```

**Relative**:
```
today
tomorrow
monday, tuesday, ..., sunday  # Next occurrence of weekday
```

If date is omitted and no recurrence specified, task has no specific deadline.

### Title (Required)

Any text until a metadata marker. Greedy matching - consumes all tokens that don't start with special prefixes.

Examples:
- `Deploy Relay to production`
- `Fix Docker networking issue`
- `Review Q4 sales presentation`

### Project (Optional)

Prefix: `@`

Single project per task. Compatible with tt-time-tracker project tracking.

Examples:
- `@relay`
- `@work`
- `@personal`

### Tags (Optional)

Prefix: `+`

Multiple tags allowed. Used for categorization and filtering.

Examples:
- `+deployment`
- `+urgent`
- `+bug`
- `+meeting`

### Duration (Optional)

Prefix: `~`

Estimated time to complete. Used for:
- Scheduling and time blocking
- Matching tasks to available time slots
- Learning from actuals (via tt integration)

Formats:
- `~30m` - 30 minutes
- `~2h` - 2 hours
- `~1h30m` - 1 hour 30 minutes
- `~90m` - 90 minutes (equivalent to 1h30m)

### Bucket (Optional)

Prefix: `^`

Assigns task to a time allocation bucket (context/category for scheduling).

Examples:
- `^ProjectA`
- `^Admin`
- `^Training`

### Time Window (Optional)

Prefix: `window:`

Specifies valid time range for task execution. Automatically selects `hard_window` curve type.

Format: `window:HH:MM-HH:MM` (24-hour time)

Examples:
- `window:09:00-17:00` - Business hours
- `window:18:00-08:00` - Evening/morning (crosses midnight)
- `window:14:00-14:30` - Specific meeting time

### Dependencies (Optional)

Prefix: `after:`

Comma-separated list of task IDs that must complete before this task. Automatically selects `blocked` curve type.

Examples:
- `after:143` - Depends on task 143
- `after:143,144,145` - Depends on tasks 143, 144, and 145

## Complete Examples

### Simple tasks
```
2025-01-10 Deploy Relay
tomorrow Fix bug
Review presentation
```

### With metadata
```
2025-01-10 Deploy Relay @relay +deployment +urgent ~2h
tomorrow Fix Docker networking @relay +bug ~30m ^ProjectA
Review Q4 presentation @work +review ~1h
```

### Recurring tasks
```
every monday Take out trash +chore ~5m window:18:00-08:00
daily Morning standup @work +meeting ~30m window:09:00-09:30
every 2w Team retrospective @work +meeting ~1h
weekly Admin review @work +admin ~2h
after 2w Get haircut @personal ~1h
after 30d Change HVAC filter @home +maintenance ~10m
```

### With dependencies
```
2025-01-05 Deploy to production @relay ~1h after:143,144
2025-01-06 Send launch announcement @marketing ~30m after:200
```

### Complex examples
```
every friday Project A standup @projectA +meeting ~30m window:14:00-15:00 ^ProjectA
after 3m Dental checkup @health +appointment ~1h
2025-01-15 Finalize architecture doc @relay +documentation ~3h after:150,151,152
```

## Parsing Rules

### Token Processing Order

1. **Check for recurrence** (`every`, `after`, shorthand)
   - Consume recurrence tokens
   - Set recurrence pattern
   
2. **Check for date** (ISO, relative, weekday)
   - If not recurrence, try to parse date
   - Consume date token if found
   
3. **Collect title tokens**
   - Everything until metadata marker
   - Join with spaces
   
4. **Parse metadata** (any order)
   - `@` → project
   - `+` → tag (append to list)
   - `~` → duration
   - `^` → bucket
   - `window:` → time window
   - `after:` → dependencies

### Ambiguity Resolution

**Date vs Weekday in Recurrence**:
```
every monday Take out trash    # Recurrence, not date
monday Take out trash           # Date (next Monday)
```

**Title vs Metadata**:
```
Deploy @relay to production     # Title: "Deploy", project: relay, rest: "to production"
                                # WRONG - greedy title matching
                                
Deploy to production @relay     # Title: "Deploy to production", project: relay
                                # CORRECT - put metadata at end
```

Best practice: **Put all metadata at the end** to avoid ambiguity.

### Error Handling

**Missing title**:
```
@relay +deployment ~2h
ERROR: Task title is required
```

**Invalid recurrence**:
```
every 5x Deploy
ERROR: Invalid recurrence pattern: every 5x
```

**Invalid duration**:
```
~2.5m Deploy
ERROR: Invalid duration format: 2.5m (use ~2h30m or ~150m)
```

**Invalid time window**:
```
window:25:00-26:00
ERROR: Invalid time window: 25:00-26:00 (hours must be 0-23)
```

**Invalid dependencies**:
```
after:abc,def
ERROR: Invalid dependency ID: abc (must be numeric)
```

## tt-time-tracker Compatibility

### Shared Syntax
Both tools understand:
- `@project`
- `+tag`
- `~duration` (tt records actual, churn uses as estimate)

### churn-only Syntax
tt ignores but doesn't error on:
- Recurrence (`every`, `after`)
- Buckets (`^bucket`)
- Time windows (`window:`)
- Dependencies (`after:`)
- Dates (tt uses current time)

### Usage Examples

**In churn**:
```bash
churn task create 2025-01-10 Deploy Relay @relay +deployment ~2h
# Creates task with deadline, estimate, project, tags
```

**In tt** (after churn task exists):
```bash
tt start churn:143
# Fetches task metadata from churn
# Displays: "Deploy Relay @relay +deployment"
# Starts time tracking
```

**In tt** (standalone):
```bash
tt start Fix bug @relay +bug
# Creates time entry with project and tags
# No churn task created
```

## Format Output (Reconstructing Grammar)

For displaying tasks, reconstruct the grammar string:

```typescript
function formatTask(task: Task): string {
  const parts: string[] = [];
  
  // Recurrence
  if (task.recurrence) {
    parts.push(formatRecurrence(task.recurrence));
  }
  
  // Date
  if (task.deadline && !task.recurrence) {
    parts.push(formatDate(task.deadline));
  }
  
  // Title
  parts.push(task.title);
  
  // Project
  if (task.project) {
    parts.push(`@${task.project}`);
  }
  
  // Tags
  task.tags.forEach(tag => parts.push(`+${tag}`));
  
  // Duration
  if (task.estimate_minutes) {
    parts.push(formatDuration(task.estimate_minutes));
  }
  
  // Bucket
  if (task.bucket) {
    parts.push(`^${task.bucket}`);
  }
  
  // Window
  if (task.window) {
    parts.push(`window:${task.window.start}-${task.window.end}`);
  }
  
  // Dependencies
  if (task.dependencies?.length > 0) {
    parts.push(`after:${task.dependencies.join(',')}`);
  }
  
  return parts.join(' ');
}
```

Output example:
```
every monday Take out trash @home +chore ~5m window:18:00-08:00
```

## Grammar Extensions (Future)

Reserved for future expansion:

### Priority Override
```
!priority      # !high, !low, !critical
```

### Location
```
@location:place   # @location:home, @location:office
```

### Context
```
#context      # #focus, #calls, #computer
```

### Energy Level
```
~energy:level    # ~energy:high, ~energy:low
```

These are **not implemented** in Phase 1 but syntax is reserved.

## Grammar Quick Reference

```
# Basic
<title>
<date> <title>

# With metadata  
<date> <title> @project +tag +tag ~duration

# Recurring
every monday <title>
daily <title>
after 2w <title>

# Advanced
every friday <title> @project +tag ~duration ^bucket window:HH:MM-HH:MM
<date> <title> after:ID,ID
```

## EBNF Notes for Parser Implementation

- **Greedy title matching**: Consume all non-metadata tokens
- **Metadata order-independent**: Can appear in any order
- **Whitespace**: Single space between tokens (normalize multiple spaces)
- **Case-insensitive**: Weekdays, recurrence keywords, shorthand
- **Case-sensitive**: Project names, tags, bucket names
- **Validation**: Perform after parsing (date validity, time ranges, etc)

## Testing Checklist

Parser must correctly handle:

- [x] Simple title only
- [x] Title with date (ISO)
- [x] Title with date (relative)
- [x] Title with date (weekday)
- [x] Title with project
- [x] Title with multiple tags
- [x] Title with duration (minutes only)
- [x] Title with duration (hours only)
- [x] Title with duration (mixed)
- [x] Title with bucket
- [x] Title with time window
- [x] Title with dependencies (single)
- [x] Title with dependencies (multiple)
- [x] Calendar recurrence (weekday)
- [x] Calendar recurrence (interval)
- [x] Calendar recurrence (shorthand)
- [x] Completion recurrence
- [x] All metadata combined
- [x] Metadata in various orders
- [x] Time window crossing midnight
- [x] Error: missing title
- [x] Error: invalid date
- [x] Error: invalid duration
- [x] Error: invalid time window
- [x] Error: invalid dependencies
- [x] Error: invalid recurrence

## Implementation Notes

The parser should be a **pure function** with no side effects:

```typescript
interface TaskParser {
  parse(input: string): ParsedTask;
  format(task: ParsedTask): string;
}
```

No database access, no file I/O, no network calls. Just string → structured data.

This allows:
- Easy testing
- Use in multiple contexts (CLI, API, tests)
- Reuse in other tools (tt-time-tracker)
- Potential browser usage (future web UI)
