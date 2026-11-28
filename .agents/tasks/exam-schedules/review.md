# Review: exam-schedules feature

**Commits reviewed:** `32f0adf` (feat) + `e91cb5d` (fix)  
**Diff scope:** `HEAD~2..HEAD` covering 5 files, +213/-3 lines

---

## Checklist results

| # | Check | Result |
|---|-------|--------|
| 1 | `node --check src/routes/admin.js` passes | ✓ Confirmed — ran locally, exit 0; commit message records same |
| 2 | Migration `add_exam_schedules.sql` exists | ✓ File present at `src/db/migrations/add_exam_schedules.sql` |
| 3 | `exam_schedules.ejs` view exists | ✓ File present at `src/views/admin/exam_schedules.ejs` |
| 4 | GET / POST / DELETE routes for `/admin/exam-schedules` | ✓ All three present (DELETE + POST `/:id/delete` fallback) in `admin.js` lines 7824–7877 |
| 5 | `scheduleMap` built and passed to print-cards render | ✓ Built at lines 1911–1917, passed at line 1946 |
| 6 | `print_login_cards.ejs` has Jadwal row | ✓ Lines 181–184 render `Jadwal` row conditionally when `sched` is non-null |
| 7 | No emoji in new JS/EJS string literals | ✓ No non-ASCII characters in any added lines (confirmed via diff scan) |
| 8 | No existing route or feature removed/broken | ✓ Only new code added; print-cards SELECT extended with `u.sesi`; no deletions to existing routes |

---

## Detailed findings

**No blockers found.**

### Code correctness notes (non-blocking)

- **`pool.query` return shape:** `pq = pool.query.bind(pool)`. `pool.query()` in `pool.js` returns `pgResultToMysql2(result)` which is `[rows, fields]`. Destructuring as `const [examSchedules] = await pq(...)` correctly yields the rows array. ✓

- **`getLevelFromClassName` ordering:** XII is tested before XI before X, preventing XI matching as X and XII matching as XI. ✓

- **`scheduleKey` null-safety:** both the success and catch paths of the QR Promise.all loop compute `scheduleKey`, so no user ever lacks it due to a QR error. ✓

- **Jadwal row is conditional:** `<% if (sched) { %>` guards the row, so users with no matching schedule (no class, no sesi, or no schedule entered) simply show no Jadwal row — consistent with the user's requirement that the schedule is manually entered. ✓

- **Auth guard:** `router.use(requireRole('ADMIN'))` at line 13 covers all routes including the new exam-schedules endpoints. ✓

- **No UNIQUE constraint on `(level, sesi)`:** the migration allows duplicate rows for the same level+sesi combination. The `scheduleMap` build loop assigns the last row to each key (last-write-wins). This is a data-model simplification but is within the approved behaviour — the admin UI provides no edit route and rows are manually entered, so the admin is responsible for avoiding duplicates. No requirement for uniqueness was specified.

- **`sesi` input bounded 1–5 in the form** (`min="1" max="5"`) but the DB column has no CHECK constraint. The `max` HTML attribute is client-side only. This is acceptable for an internal admin tool.

---

## Verdict

**APPROVED** — all eight required checks pass, no reachable correctness, security, or data failures introduced.
