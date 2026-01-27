# Churn TODO

## Completed

- [x] Add time-of-day support to recurrence patterns (`every monday 16:00`, `daily 09:00`)
- [x] `timeline` command (already implemented - shows priority curve over time)
- [x] `--json` output flag for ls, show, pri, timeline, buckets commands

---

## Next

- [x] Ensure we have complex custom repetition patterns like:

  ```churn
  weekdays 07:00 Read email @admin ~15m
  Mon,Tue,Thu 09:30 Standup @projectA +meeting ~15m
  ```

## Backlog

- [x] Phase 2: Daily planning workflow (`churn plan` / `churn today`)
- [ ] Phase 2: tt-time-tracker integration
