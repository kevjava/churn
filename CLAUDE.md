# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build          # Compile TypeScript
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run lint           # Type-check without emitting (tsc --noEmit)

# Run a single test file
npx jest tests/core/task-service.test.ts

# Run tests matching a pattern
npx jest --testNamePattern="creates a task"
```

## Manual Testing

Use a separate database to avoid affecting real data:
```bash
node dist/cli/index.js --db /tmp/churn-test.db <command>
```

## Architecture

### Core Layer (`src/core/`)

- **types.ts** - All TypeScript types, enums, and interfaces (Task, Bucket, CurveConfig, RecurrencePattern, etc.)
- **database.ts** - SQLite wrapper using better-sqlite3, handles all SQL operations
- **task-service.ts** - Business logic for tasks: CRUD, priority calculation, completion handling, recurrence
- **bucket-service.ts** - Business logic for time-allocation buckets
- **planner.ts** - Daily planning workflow: schedules tasks into time slots based on priority

### Priority Curves (`src/core/curves/`)

Tasks have dynamic priority that changes over time via priority curves:

- **types.ts** - `PriorityCurve` and `AsyncPriorityCurve` interfaces with `calculate(datetime): number`
- **factory.ts** - `CurveFactory.create()` instantiates curves from `CurveConfig`
- **linear.ts** - Steady 0→1 increase from start to deadline
- **exponential.ts** - Slow rise then rapid increase (configurable exponent)
- **hard-window.ts** - On/off priority within date range
- **blocked.ts** - Zero priority until dependencies complete (async)
- **accumulator.ts** - Builds pressure since last completion (for recurring tasks)

### CLI Layer (`src/cli/`)

- **index.ts** - Entry point, registers all commands with Commander
- **context.ts** - Creates shared `CliContext` with database, services, config
- **config.ts** - Config file handling (`~/.config/churn/`)
- **format.ts** - Output formatting helpers (tables, colors, dates, durations)
- **commands/** - Each file registers related commands (task.ts, bucket.ts, priority.ts, plan.ts, data.ts)

### Task Parsing

Uses external `@kevjava/task-parser` library (local dependency at `../task-parser`, source at `/home/kev/Code/task-parser`) to parse natural language task descriptions into structured data. The parser handles dates, projects (`@`), tags (`+`), durations (`~`), buckets (`$`), recurrence patterns, time windows, and dependencies.

When modifying task parsing syntax, changes are needed in the task-parser repo first, then rebuild both projects.

### Key Patterns

- Services receive `Database` instance, not raw SQL
- Priority is calculated on-demand via curves, not stored
- Tasks with `window_start`/`window_end` have zero priority outside those hours
- Blocked tasks (with incomplete dependencies) have zero priority
- Recurring tasks use `next_due_at` for scheduling, `last_completed_at` for accumulator curves

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

Format: `<type>[optional scope]: <description>`

Types:
- `feat`: New feature (correlates with MINOR in semver)
- `fix`: Bug fix (correlates with PATCH in semver)
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `chore`: Maintenance tasks
- `build`: Build system or external dependencies
- `ci`: CI configuration

Breaking changes: Add `!` before the colon (e.g., `feat!: remove deprecated API`) or include `BREAKING CHANGE:` in the footer.

## Git Workflow

Always use feature branches and pull requests for changes:

1. Create a feature branch from the main branch
2. Make changes and commit with conventional commit messages
3. Push the branch and create a pull request
4. Merge via PR after review

Never commit directly to the main branch.
