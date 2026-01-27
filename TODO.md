# Churn TODO

## Next Up

### Add time-of-day support to recurrence patterns

**Location:** task-parser library (`../task-parser`)

**Current syntax:**
```
every monday Team standup
daily Check dashboards
```

**Proposed syntax:**
```
every monday 16:00 Team standup    # Due at 4pm every Monday
daily 09:00 Check dashboards       # Due at 9am every day
```

**Changes needed:**
1. Update task-parser recurrence parser to recognize time after weekday/interval
2. Add `time` field to `RecurrencePattern` interface
3. Update churn to use recurrence time when calculating `next_due_at`
4. Update README with new syntax

---

## Backlog

- [ ] Add `timeline` command (show priority curve over time for a task)
- [ ] Add `--json` output flag for commands
- [ ] Phase 2: Daily planning workflow
- [ ] Phase 2: tt-time-tracker integration
