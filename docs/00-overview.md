# Churn - Project Overview

## Project Vision

Churn is a time-decay-based task management system that uses priority curves to intelligently surface the right tasks at the right time. Unlike traditional task managers that rely on static priorities or simple due dates, Churn models how task urgency changes over time, learning from user behavior to provide increasingly accurate prioritization.

## Core Philosophy

1. **Time-based priority**: Task importance is a function of time, not a static value
2. **Learn from behavior**: System adapts to user patterns rather than forcing rigid workflows
3. **Reduce cognitive load**: Surface only actionable tasks, hide what's not yet relevant
4. **Unix philosophy**: Composable tools with clear interfaces
5. **Local-first**: User data stays on their machine, no cloud dependency

## Architecture Overview

```
┌─────────────────────────────────────────┐
│ task-parser (shared library)           │
│ - Common grammar for task descriptions  │
│ - Used by both churn and tt             │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ churn-core (business logic)            │
│ - Task management                       │
│ - Priority curve calculations           │
│ - Recurrence engine                     │
│ - Dependency resolution                 │
│ - SQLite database access                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ churn-cli (user interface)             │
│ - Command-line interface                │
│ - Task CRUD operations                  │
│ - Priority queries                      │
│ - Display formatting                    │
└─────────────────────────────────────────┘
```

## Repository Structure

Two separate repositories:

### 1. task-parser
- **Purpose**: Shared task description grammar
- **Consumers**: churn, tt-time-tracker, future tools
- **Location**: `kevjava/task-parser`
- **Published**: npm package `@kevjava/task-parser`

### 2. churn
- **Purpose**: Task management with priority curves
- **Structure**: Monorepo with churn-core and churn-cli
- **Location**: `kevjava/churn`
- **Published**: npm package `churn` (CLI)

## Technology Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20.x (LTS)
- **Database**: SQLite 3
- **Testing**: Jest
- **Package Manager**: npm
- **CLI Framework**: Commander.js

## Development Phases

### Phase 1: Core Foundation (Current Spec)
**Goal**: Working task manager with priority curves

**Features**:
- Task CRUD with grammar parser
- Projects and buckets
- 5 curve types (linear, exponential, hard_window, blocked, accumulator)
- Recurrence (calendar and completion modes)
- Time windows
- Dependencies
- SQLite storage
- CLI interface
- Priority calculation
- Verbose logging

**Not Included**:
- Daily planning workflow
- Learning/analytics
- ICS calendar export
- API server
- tt-time-tracker integration

**Success Criteria**:
- User can create/manage tasks using grammar
- System correctly calculates priorities at any time
- Recurring tasks generate next instances
- Dependencies block tasks appropriately
- Can dogfood alongside TickTick

### Phase 2: Usability & Integration
**Goal**: Production-ready for daily use

**Features**:
- Daily planning workflow
- Task completion history tracking
- Priority timeline visualization
- Better filtering/searching
- tt-time-tracker integration
- Basic analytics queries
- ICS calendar export

### Phase 3: Intelligence
**Goal**: System learns and adapts

**Features**:
- Pattern detection from completion history
- Automatic curve type inference
- Estimate adjustments based on actuals
- Personalized scheduling suggestions
- Time-of-day optimization

### Phase 4: Multi-Device
**Goal**: Web and mobile interfaces

**Features**:
- REST API server
- Web interface
- Mobile apps (iOS/Android)
- Sync infrastructure
- Multi-user support
- Push notifications

## Key Concepts

### Priority Curves
Tasks don't have static priorities. Instead, each task has a **priority curve** that defines how its priority changes over time. The system evaluates curves at the current moment to determine what's most important now.

**Curve Types**:
- **Linear**: Steady increase from start to deadline
- **Exponential**: Slow rise, then rapid increase near deadline
- **Hard Window**: On/off within specific time range
- **Blocked**: Zero until dependencies complete, then normal curve
- **Accumulator**: Pressure builds since last completion

### Recurrence Modes
- **Calendar mode** (`every`): Fixed schedule independent of completion
  - Example: `every monday` - happens every Monday whether you did it or not
- **Completion mode** (`after`): Next occurrence based on last completion
  - Example: `after 2w` - happens 2 weeks after you complete it

### Task Grammar
Common language shared with tt-time-tracker:
```
<date> <title> [@project] [+tag...] [~duration] [^bucket] [recurrence] [window] [after:deps]
```

Example:
```
2025-01-10 Deploy Relay @relay +deployment +urgent ~2h ^ProjectA
every monday Take out trash +chore ~5m window:18:00-08:00
after 2w Get haircut @personal ~1h
```

## File Locations

Following Unix conventions:
```
~/.config/churn/
├── config.json          # User configuration
├── churn.db            # SQLite database
└── churn.log           # Application logs (if enabled)
```

## Data Model

### Core Entities
- **Tasks**: Individual work items with curves
- **Projects**: Grouping mechanism (compatible with tt)
- **Buckets**: Time allocation contexts (ProjectA, Admin, Training)
- **Tags**: Flexible categorization
- **Completions**: Historical record of task completions

### Relationships
- Tasks belong to Projects (optional)
- Tasks belong to Buckets (optional)
- Tasks have Tags (many-to-many)
- Tasks depend on other Tasks (many-to-many)
- Completions reference Tasks (one-to-many)

## Integration with tt-time-tracker

**Current State**: tt has completed MVP with its own grammar parser

**Phase 1**: Independent operation
- churn manages tasks
- tt tracks time
- Both use similar grammar (via task-parser)
- No direct integration

**Phase 2**: Bidirectional integration
- tt queries churn for task metadata
- tt reports actual time back to churn
- churn learns from tt actuals
- Shared task references (`tt start churn:143`)

## Configuration

### config.json Structure
```json
{
  "database": {
    "path": "~/.config/churn/churn.db"
  },
  "logging": {
    "level": "info",
    "file": "~/.config/churn/churn.log"
  },
  "defaults": {
    "curve_type": "linear",
    "work_hours_start": "08:00",
    "work_hours_end": "17:00"
  }
}
```

### CLI Flags
- `--verbose` / `-v`: Enable verbose output
- `--config <path>`: Use alternate config file
- `--db <path>`: Use alternate database

## Testing Strategy

### Unit Tests
- Parser: All grammar variations
- Curves: Priority calculations at various times
- Recurrence: Next due calculations
- Dependencies: Blocking logic

### Integration Tests
- Database operations
- CLI commands end-to-end
- Curve type interactions

### Test Data
- Predefined task sets for various scenarios
- Edge cases (missed recurrences, circular dependencies)
- Timezone considerations

## Documentation

### User Documentation
- README.md: Quick start, installation
- GRAMMAR.md: Task description syntax reference
- CURVES.md: Curve types and behavior
- FAQ.md: Common questions

### Developer Documentation
- CONTRIBUTING.md: Development setup
- ARCHITECTURE.md: Code organization
- API.md: churn-core API reference (Phase 2)

## Success Metrics

### Phase 1 (MVP)
- [ ] All CLI commands working
- [ ] Can manage 100+ tasks without performance issues
- [ ] Priority calculations accurate
- [ ] Recurring tasks generate correctly
- [ ] Dependencies block appropriately
- [ ] User can dogfood daily

### Phase 2
- [ ] Daily planning workflow reduces decision fatigue
- [ ] tt integration provides actual vs estimated data
- [ ] User relies on churn instead of TickTick for 50%+ of tasks

### Phase 3
- [ ] System automatically adjusts estimates within 20% accuracy
- [ ] Curve type inference correct 80%+ of the time
- [ ] User rarely manually adjusts priorities

## Non-Goals (For Now)

- Collaboration features
- Cloud sync
- Mobile apps
- Subtasks
- File attachments
- Email integration
- Third-party app integrations (beyond tt)
- Gamification
- Social features
- Subscription/monetization

These may be reconsidered in Phase 4+.

## Design Principles

1. **Progressive disclosure**: Simple by default, complexity available when needed
2. **Fail gracefully**: Errors should be helpful, not cryptic
3. **Fast feedback**: Commands should be instant (<100ms for most operations)
4. **Predictable**: Same input should always produce same output
5. **Transparent**: User can inspect why system made decisions
6. **Respectful**: Never lose user data, always allow export

## Questions & Decisions

### Resolved
- ✅ SQLite for MVP storage
- ✅ Separate repos (task-parser and churn)
- ✅ Config location: `~/.config/churn/`
- ✅ Phase 1 scope: Core functionality, no learning
- ✅ Recurrence modes: calendar (`every`) and completion (`after`)

### Open (For Later)
- How to handle timezone-aware recurrence?
- Should we support subtasks eventually?
- What's the sync strategy for Phase 4?
- How to version the database schema for migrations?

## Getting Started (For Implementer)

1. Read all spec documents in order (00-10)
2. Start with task-parser implementation
3. Build churn-core with tests
4. Implement CLI commands
5. Test end-to-end with real usage
6. Document edge cases discovered
7. Iterate on UX

## References

- tt-time-tracker: https://github.com/kevjava/tt-time-tracker
- Original discussion: (This conversation)
- Related concepts: GTD, Time Blocking, Temporal Discounting
