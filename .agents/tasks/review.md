# TP (Tujuan Pembelajaran) scoped per class in raport_subject_kd

Two commits (530623d, 5709cba) fix a cross-class TP leak: TP entries created for kelas X were visible in kelas XI because `raport_subject_kd` had no `class_id` column. The fix adds the column via a DDL migration, threads `class_id` through every INSERT and SELECT touching that table, and adds a validation guard before INSERT. The backward-compatibility strategy — `OR class_id IS NULL` in all filters — preserves existing TP rows whose `class_id` was never set.

**Watch for:** The `print-all` admin route uses `ANY($N::int[])` with an array of distinct class IDs built at the application layer — confirmed working but worth understanding its edge case when `uniqueClassIds` is empty (see details). The TP-labels `max_tp` query counts the widest column set across all classes in the period, which is a deliberate global-widest approach; no concern if that matches the admin's intent for label configuration.

**Verdict**: APPROVED

---

## High-level view

The migration adds `class_id INT NULL REFERENCES classes(id) ON DELETE SET NULL` to `raport_subject_kd`, along with an index. Using `NULL` as the default preserves all existing TP rows without requiring a backfill, and the `OR class_id IS NULL` clause in every read query makes them visible in all classes — a clean backward-compatible contract.

Every route that reads from `raport_subject_kd` — four in the first commit, four bulk-print paths patched in the second — now carries the class filter. The INSERT in `POST /raport/:period_id/:subject_id/kd` now writes `class_id`, and a pre-insert validation check confirms that the class is actually associated with the subject before allowing the write.

The `print-all` admin path handles a multi-class scenario by deduplicating all `class_id` values across students in the print run, then using `ANY(array::int[])`. This works correctly for non-empty arrays; a period with zero students carrying a `class_id` would produce an empty array, and Postgres's `= ANY('{}')` is false for all rows, which would drop all non-NULL TP rows. This scenario is unlikely in practice but is worth noting.

The TP-labels `max_tp` query (GET and POST `/admin/raport/:period_id/tp-labels`) groups by `(raport_subject_id, COALESCE(class_id, 0))` to prevent different per-class TP sets from inflating the count. The query's purpose is to determine how many label slots to render in the admin UI; treating it as a global maximum across all classes in the period is the correct behavior for a period-level label configuration screen.

---

<details>
<summary>Issues (1)</summary>

1. **Empty uniqueClassIds in print-all** — If a period's students all have `class_id = NULL` (no class assigned), `uniqueClassIds` is `[]` and the query condition becomes `rsk.class_id = ANY('{}'::int[]) OR rsk.class_id IS NULL`. The `ANY('{}')` arm evaluates to false for every row, but the `IS NULL` arm still catches legacy rows, so legacy TP is shown and class-scoped TP is silently dropped. In practice this state shouldn't exist in production, but adding a guard (`if (uniqueClassIds.length === 0)` skip the array binding and rely solely on `IS NULL`) would make the behavior explicit.

</details>

---

<details>
<summary>Details</summary>

### INSERT guard on POST /raport/:period_id/:subject_id/kd

Before the INSERT, the route queries `raport_subject_classes` to confirm `(raport_subject_id, class_id)` exists. This prevents a teacher from associating a TP with a class their subject is not configured for. The guard only fires when `class_id` is truthy; a falsy `class_id` falls through and writes `NULL`, reached only if the form sends no class — a client-side bug path.

### Filter coverage across all read paths

All six read queries now use `AND (class_id = $N OR class_id IS NULL)`:

- `GET /raport/:period_id/:subject_id/:class_id` — subject editor view
- `POST /raport/:period_id/:subject_id/:class_id` — bulk score save
- `GET /raport/:period_id/:subject_id/:class_id/export` — Excel export
- `POST /raport/:period_id/:subject_id/:class_id/import` — Excel import
- `GET /raport/:period_id/print-kelas` — keyed to `homeroomClass.id` (from DB lookup, not request param)
- `GET /raport/:period_id/print-siswa/:student_id` — keyed to `stu.class_id` (from DB lookup, not request param)

The class identifier in both teacher print routes comes from a prior authenticated DB lookup, so a caller cannot supply a spoofed class value.

### admin.js print-all: empty uniqueClassIds edge case

```
AND (rsk.class_id = ANY($N::int[]) OR rsk.class_id IS NULL)
```

`uniqueClassIds` is `[...new Set(students.map(s => s.class_id).filter(Boolean))]`. When empty — all students have no class assignment — `ANY('{}')` is false for every row. Only `IS NULL` rows survive, so class-scoped TP rows added after this migration would be silently excluded from the print run. Legacy TP (class_id NULL) is unaffected. Adding a guard when `uniqueClassIds.length === 0` to skip the array binding would make this failure mode explicit.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `sql/add_kd_class_id.sql` | New migration: adds `class_id` column and index to `raport_subject_kd` |
| `run-migration-kd-class-id.js` | New runner script: applies migration from `.env`, exits non-zero on failure |
| `src/routes/teacher.js` | Adds `class_id` to INSERT; adds `class_id` filter to 4 read queries + pre-insert validation; adds class filter to 2 bulk-print queries |
| `src/routes/admin.js` | Adds class filter to 2 bulk-print queries; fixes TP-labels `max_tp` group-by |

Full diff: `git diff c1b7582 HEAD -- src/routes/teacher.js src/routes/admin.js sql/add_kd_class_id.sql run-migration-kd-class-id.js`

</details>
