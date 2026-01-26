# Future Phases

## Overview

Features deferred beyond Phase 1 MVP, roughly organized by phase.

## Phase 2: Usability & Integration

### Daily Planning Workflow

**Goal:** Morning ritual to review and organize the day.

```bash
churn plan today
```

**Features:**
- Show top-priority tasks
- Interactive accept/defer/dismiss
- Suggest time blocks
- Generate daily schedule

### Task Completion History

**Features:**
- View completion history
- Actual vs estimated time
- Completion patterns
- Success rate tracking

### Priority Timeline Visualization

**Features:**
- ASCII chart of priority over time
- Color-coded status indicators
- Comparison of multiple tasks

### Better Filtering

**Features:**
- Complex queries: `--status open --project relay --tag urgent`
- Saved filters
- Smart filters: "overdue and high priority"

### tt-time-tracker Integration

**Features:**
- `tt start churn:143` - fetch task metadata
- `tt stop` - report actuals back to churn
- Shared task URIs
- Bidirectional sync

### Basic Analytics

```bash
churn stats [--project] [--bucket]
```

**Output:**
- Tasks by status
- Completion rate
- Average actual vs estimate
- Most common tags

### ICS Calendar Export

```bash
churn calendar generate [--output file.ics]
```

**Features:**
- Export tasks as calendar events
- Include priority as color/urgency
- Subscribe in calendar apps
- Auto-regenerate on change

## Phase 3: Intelligence & Learning

### Pattern Detection

**Features:**
- Detect task types from behavior
- Suggest curve types
- Identify time-of-day patterns
- Recognize procrastination patterns

### Automatic Curve Inference

**Features:**
- Learn optimal curve per task type
- Adjust curves based on completion patterns
- Confidence scoring
- User feedback loop

### Estimate Adjustments

**Features:**
- Track actual vs estimated consistently
- Adjust future estimates
- Per-task-type learning
- Outlier detection

### Personalized Scheduling

**Features:**
- Optimal time-of-day for task types
- Account for energy levels
- Minimize context switching
- Respect focus time

### Smart Prioritization

**Features:**
- Consider workload
- Account for upcoming deadlines
- Balance across projects
- Predict completion likelihood

### Time-of-Day Optimization

**Features:**
- "You're most productive 9-11am"
- "Avoid scheduling after lunch"
- "Fridays are 30% slower"
- Suggest best times for task types

## Phase 4: Multi-Device & Collaboration

### REST API Server

```bash
churn serve [--port 3847]
```

**Features:**
- REST endpoints for all operations
- Authentication
- Rate limiting
- API documentation

### Web Interface

**Features:**
- Browser-based task management
- Drag-and-drop scheduling
- Visual priority curves
- Real-time updates

### Mobile Apps

**Features:**
- iOS and Android apps
- Push notifications
- Quick task capture
- Offline support

### Sync Infrastructure

**Features:**
- CRDTs for conflict resolution
- End-to-end encryption
- Selective sync
- Backup/restore

### Multi-User Support

**Features:**
- User accounts
- Shared projects
- Task assignment
- Collaboration features

### Push Notifications

**Features:**
- Task reminders
- Deadline alerts
- Priority changes
- Collaboration updates

## Not Planned (But Possible)

### Subtasks
Too complex for initial scope, but could add hierarchical tasks.

### File Attachments
Storage and sync complexity. Could link to external files.

### Email Integration
Parse emails into tasks, send reminders. Requires email access.

### Voice Input
"Create task: call dentist tomorrow"

### AI-Powered Insights
"Your Thursday meetings always run long"

### Gamification
Points, streaks, achievements. May not align with philosophy.

### Social Features
Task sharing, leaderboards. Probably never.

### Third-Party Integrations
Jira, Asana, Todoist sync. Maybe via plugins.

## Migration Path

### Phase 1 → Phase 2
- Database schema stable
- Add new tables for history
- No breaking changes

### Phase 2 → Phase 3
- Add ML models
- Store training data
- Optional features

### Phase 3 → Phase 4
- Add API layer over existing core
- Core logic unchanged
- New deployment model

## Design Principles Across Phases

1. **Local-first:** Even with sync, local database is source of truth
2. **Privacy:** User data stays on device by default
3. **Progressive enhancement:** New features don't break old workflows
4. **Performance:** < 100ms for common operations
5. **Simplicity:** Hide complexity from users

## Timeline (Rough Estimates)

- **Phase 1:** 4-6 weeks (MVP)
- **Phase 2:** 6-8 weeks (usability)
- **Phase 3:** 8-12 weeks (intelligence)
- **Phase 4:** 12+ weeks (multi-device)

Total: ~6-9 months to full vision

## Decision Points

### After Phase 1
- Is the core concept validated?
- Are priority curves useful in practice?
- Does the grammar feel natural?

### After Phase 2
- Is daily planning workflow effective?
- Does tt integration provide value?
- Are users relying on churn?

### After Phase 3
- Is learning accurate enough?
- Do users trust automatic adjustments?
- Are suggestions helpful?

### Before Phase 4
- Is there demand for multi-device?
- Can we support server costs?
- Do we want to build mobile apps?

## Open Questions

1. **Monetization:** Free forever? Pro tier? Self-hosted only?
2. **Hosting:** User-hosted? Managed service? Both?
3. **Mobile:** Native apps or PWA?
4. **Collaboration:** How much? Teams? Organizations?
5. **ML:** Local models or server-side?

## Success Metrics

### Phase 1
- Can dogfood for own tasks
- Accurately calculates priorities
- Recurring tasks work reliably

### Phase 2
- Use daily for 80%+ of tasks
- Reduce TickTick usage
- tt integration provides insights

### Phase 3
- Estimates accurate within 20%
- Automatic curve selection 80%+ correct
- Feel "coached" by system

### Phase 4
- Use across all devices
- Seamless sync
- Mobile notifications valuable
