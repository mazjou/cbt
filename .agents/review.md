# Review: Toggle Score Visibility + Browser Translate Detection

Commit: `0dfce09` — `feat: nilai ujian default tersembunyi + toggle guru, deteksi & blokir translate otomatis`

---

## Evidence Gathered

### Build / Syntax Check
Commit message records: `Verified: node --check student.js=OK, teacher.js=OK, admin.js=OK`

---

## Checklist

### 1. Route `POST /exams/:id/toggle-score-visibility` — teacher.js

- **Authentication/Authorization**: `router.use(requireRole('TEACHER', 'ADMIN'))` at line 51 applies to all routes on this router. ✅
- **Ownership check**: SELECT query includes `(:isAdmin=1 OR teacher_id=:tid)` — teacher can only see/update their own exam; ADMIN bypasses. Same guard repeated on the UPDATE. ✅
- **Parameterized query**: Both SELECT and UPDATE use named-parameter syntax (`:id`, `:tid`, `:isAdmin`, `:val`). ✅
- **Race-condition double-fetch toggle**: The SELECT+UPDATE is a two-statement non-atomic toggle. Under normal load with a single guru clicking the button, this is acceptable and consistent with the rest of the codebase (the same pattern is used for `toggle-publish`). Not a blocker.
- **Redis invalidation**: Wrapped in a try/catch with silent discard; will not crash the route if Redis is unavailable. ✅
- **Response**: Returns `{ ok: true, show: newValue }` on success, `{ ok: false, message }` on failure. ✅

### 2. AJAX in `exam_detail.ejs`

- **Fetch**: Calls `POST /teacher/exams/${examId}/toggle-score-visibility` with header `X-Requested-With: XMLHttpRequest`. ✅
- **Button disabled during inflight**: `btn.disabled = true` before fetch, restored in `finally`. ✅
- **Error handling**: `catch` block shows `alert('Gagal mengubah status nilai: ' + e.message)`. ✅
- **UI update without reload**: Button text, classes, and `onclick` attribute updated in-place after success. ✅
- **`onclick` state drift**: After a successful toggle, the button's `onclick` is re-set to `toggleScoreVisibility(${examId}, ${show})`. The `currentShow` parameter is never used inside the function body (the actual state is taken from server response), so the parameter value passed is irrelevant to correctness. ✅

### 3. `attempt_result.ejs` — hidden score message

- Condition: `<% if (attempt.show_score_to_student) { %>` — renders score/stats when true, falls through to the `else` block when false. ✅
- The `else` block now shows: "Ujian Telah Selesai", "Jawaban tersimpan", and "📝 Nilai belum dirilis: Guru akan mengumumkan nilai setelah ujian selesai diperiksa." — clearly communicates the state to students. ✅
- `attempt.show_score_to_student` is populated from `e.show_score_to_student` in the JOIN query at `student.js:1140`. ✅

### 4. MutationObserver in `attempt_take.ejs` — calls `reportViolation`

- `reportViolation` is defined at line 1105 in the same `<script>` block, before the observer IIFE at line ~1133. ✅
- The observer IIFE calls `if (typeof reportViolation === 'function') { reportViolation(...) }` — safe guard. ✅

### 5. Infinite loop guard

- `translateReported` flag is set to `true` immediately on first detection, before the `setAttribute('translate', 'no')` call that would otherwise re-trigger the `attributes` observer. ✅
- The `setAttribute('translate', 'no')` will fire the observer again (attributeFilter includes `translate`), but `handleTranslateDetected()` returns early on line 1 of the function because `translateReported === true`. ✅
- Class cleanup (`html.className.replace(...)`) writes back to `className`, which could retrigger the class observer; but again `translateReported` blocks re-entry. ✅
- Flag resets after 10 s via `setTimeout` — allows re-detection if student tries again. ✅

---

## Blocker Found

### B1 — `exam_new.ejs`: New exam creation still defaults to `show_score_to_student = true` (checked)

**File**: `src/views/teacher/exam_new.ejs`, line 299  
**Evidence**:
```html
<input type="checkbox" name="show_score_to_student" checked …
```
The user's explicit requirement: *"buat ujian default nilai tidak ditampilkan di siswa"* (make the exam default to score hidden from students).

The toggle button and the `else` branch in `attempt_result.ejs` correctly handle the hidden state. However, every new exam created via the form will have `show_score_to_student = true` (checked → submitted → `show_score_to_student ? true : false` → `true`), so scores are **visible to students by default** — the opposite of what was requested.

The teacher would need to manually uncheck the checkbox at exam creation time, or use the toggle button on `exam_detail` after the fact, to enforce the hidden default. Neither of these is automatic.

**Consequence**: New exams created by teachers will expose scores to students immediately after submission, violating the stated "default tersembunyi" requirement.

**Correction**: Remove `checked` from the `show_score_to_student` checkbox in `exam_new.ejs` and update the helper tip text from *"Secara default, nilai akan ditampilkan ke siswa"* to *"Secara default, nilai disembunyikan dari siswa"*.

---

## Summary

One blocker: `exam_new.ejs` defaults the score-visibility checkbox to checked (visible), contradicting the "default hidden" requirement. All other review points pass.
