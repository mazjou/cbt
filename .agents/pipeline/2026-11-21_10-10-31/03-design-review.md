# Design Review — Tipe Soal MULTI_TF

**Pipeline:** `2026-11-21_10-10-31`  
**Reviewing:** `02-design.md` (Revision 2)  
**Verdict:** CHANGES_REQUESTED

---

## Findings

### Finding 1 — HIGH — Section B3: Review query omits `question_type` and `selected_option_ids`, design proposes adding them but forgets the supplement route change

**Location:** Section B3 (student review query) and the route handler at `src/routes/student.js` lines 1214–1227.

**Problem:** The design correctly proposes adding `q.question_type`, `aa.selected_option_ids`, and `aa.partial_points` to the review query in B3. It also proposes adding a supplementary `multiTfDetails` query in Section I. However, **Section I requires `multiTfDetails` to be passed to the template**, but the design shows it being added in a separate "Route change" block in Section I without updating `res.render` to include it. The current `res.render` at line 1229 of `student.js` calls `res.render('student/attempt_result', { title: ..., attempt, review })` — no `multiTfDetails`. Without this change explicitly stated as part of the render call modification, the coder may miss it, leaving `multiTfDetails` undefined in the template and causing a ReferenceError for all attempt results.

The existing review query also currently joins `o2.question_id=q.id AND o2.is_correct=true` which will produce multiple rows per question for MULTI_TF (one per correct statement), generating duplicate question rows in `review`. The design does not address this fan-out.

**Concrete fix:**

1. In B3, replace the review query with the one shown, and also explicitly state the `res.render` call change:
```js
res.render('student/attempt_result', {
  title: 'Hasil Ujian',
  attempt,
  review,
  multiTfDetails   // ← add this
});
```

2. The B3 query uses `LEFT JOIN options o2 ON o2.question_id=q.id AND o2.is_correct=true`. For MULTI_TF, this returns N rows per question (one per correct statement). Remove this join entirely from the new query and rely on `multiTfDetails` for MULTI_TF display instead. For non-MULTI_TF types, include the correct text via a subquery or accept that it is handled by the existing template for MCQ/TRUE_FALSE:
```sql
SELECT q.id AS question_id, q.question_text, q.question_image, q.points,
       q.question_type,
       aa.is_correct, aa.option_id, aa.selected_option_ids, aa.partial_points,
       o1.option_label || '. ' || o1.option_text AS chosen_text
FROM attempt_answers aa
JOIN questions q ON q.id=aa.question_id
LEFT JOIN options o1 ON o1.id=aa.option_id
WHERE aa.attempt_id=:aid
ORDER BY aa.id ASC;
```
(Drop `correct_text` or handle it separately; MULTI_TF uses `multiTfDetails` anyway.)

---

### Finding 2 — HIGH — Section J: `attempt_detail.ejs` references `a.options` which already exists, but design proposes `a.options` for MULTI_TF while the existing query does NOT return `selected_option_ids` or `partial_points`

**Location:** Section D7 (teacher attempt detail query) and Section J (teacher view).

**Problem:** The design correctly identifies D7 as needing `aa.selected_option_ids`, `aa.partial_points`, and `q.question_type` added to the teacher query. However, examining the actual route code at `teacher.js` line 3138–3147, the `answers` array is mapped from `ans` and already spreads all `a` fields — so the new DB columns will flow through automatically once D7 is applied.

**However, Section J's template snippet** uses `a.options` and relies on `opt.id`. Looking at the current `attempt_detail.ejs` (lines 88–105), it already iterates `a.options.forEach(opt => ...)` and uses `opt.id`. When `question_type === 'MULTI_TF'`, the design adds a new EJS branch that also accesses `a.options`. The existing options query in the route fetches `id, question_id, option_label, option_text, is_correct` — but does **not** fetch `option_image` for the teacher attempt detail view, only for the separate optionsMap. Actual code at line ~3123: `SELECT id, question_id, option_label, option_text, is_correct FROM options WHERE ...` — `option_image` is absent. The MULTI_TF template in J uses `opt.option_text` (OK) and `opt.id` (OK) but the existing generic loop also references `opt.option_image` (line 98–100 of `attempt_detail.ejs`). This is not broken, but the design claims the existing optionsMap "already supplies per-question options" — it does, but for the **existing** MCQ rendering. The new MULTI_TF EJS branch is safe because it only uses `opt.id`, `opt.option_label`, `opt.option_text`, and `opt.is_correct`, all of which are available.

The actual HIGH issue: Section D7 specifies the new query uses named parameter `:aid`, but the existing admin query (D8) uses positional `$1`. **The design shows D7 replacing a named-parameter query and D8 replacing a positional-parameter query** — which is consistent. The design is internally correct here.

**Re-evaluation:** This finding reduces to a documentation gap only. Downgrading to NIT (see Finding 3 instead).

---

### Finding 2 (revised) — HIGH — Section C5 (`GET /:id/edit`): `correct_map` is not passed to `question_bank_edit.ejs` in the actual code

**Location:** Section C5, `src/routes/question_bank.js` GET `/:id/edit` handler (line 708–728).

**Problem:** The design states that C5 adds `correct_map: correctMapForView` to the render call. The actual `res.render` at line 723 passes `{ title, question, options: byLabel, correct_label: correct, correct_labels: correctLabels, subjects }` — no `correct_map`. The view `question_bank_edit.ejs` currently only has `correct_labels` available (the array of correct labels for COMPLEX/CHECKBOX). For MULTI_TF edit to work, the `correct_map` (a dict `{ A: true, B: false, ... }`) must be computed and passed. The design does specify this as C5's job, so the intent is correct — but it also says the current GET handler uses `is_correct` to build `correctLabels`, which is true. The `correct_map` **will not be derived** from the current code without the explicit C5 change.

The design's C5 description does show adding `correctMapForView` computation:
```js
const correctMapForView = {};
for (const o of options) { correctMapForView[o.option_label] = o.is_correct; }
```
But `options` in the actual code is built differently: `byLabel[o.option_label] = o.option_text` and `correctLabels.push(o.option_label)`. The raw `options` array from the DB query is not retained in a variable used at render time. The design's C5 snippet uses `options` (the raw DB rows) but in the actual handler, by the time `res.render` is called, only `byLabel` (text map) and `correctLabels` (label list) exist — the original array result `[options]` from `pool.query` is scoped and gone.

**Concrete fix:** In C5, clarify that the GET handler must be rewritten to also iterate `options` (the raw DB rows, before `byLabel` is built) to compute `correctMapForView`:
```js
const [options] = await pool.query('SELECT * FROM question_bank_options WHERE question_bank_id = $1 ORDER BY option_label ASC', [req.params.id]);
const byLabel = {};
let correct = 'A';
const correctLabels = [];
const correctMapForView = {};  // ← add this
for (const o of options) {
  byLabel[o.option_label] = o.option_text;
  correctMapForView[o.option_label] = !!o.is_correct;  // ← add this
  if (o.is_correct) { correct = o.option_label; correctLabels.push(o.option_label); }
}
res.render('teacher/question_bank_edit', {
  ...,
  correct_labels: correctLabels,
  correct_map: correctMapForView  // ← add this
});
```
The design's current C5 description implies this but does not show it modifying the existing handler; it must be explicit since the handler's current structure loses the raw rows before render.

---

### Finding 3 — HIGH — Section F2: `question_edit.ejs` — design says `GET /questions/:id/edit` "already passes `correct_labels`" but does not pass `correct_map`, and edit PUT handler has no MULTI_TF branch for correctMap

**Location:** Section F2 (`question_edit.ejs`), and `src/routes/teacher.js` GET `/questions/:id/edit` (line 2381–2437) and PUT `/questions/:id` (line 2439+).

**Problem:**
1. The GET handler at line 2435 does pass `correct_labels` (confirmed in source). But it does NOT pass `correct_map`. The design says "derive `correct_map` from the options query and pass it" — this is a required addition, but the design only partially specifies it. The snippet in F2 shows the route computing `correctMapForEdit` and passing it, which is correct. However, the design does not show the specific location in the GET handler where the loop over `opts` happens (it already loops for `byLabel` and `correctLabels` at lines 2409–2418). The fix can piggyback on that loop — this needs to be explicit.

2. **More critically:** The PUT `/questions/:id` handler (line 2439+) has a `correctLabels` parsing block that handles `COMPLEX`, `CHECKBOX`, `TRUE_FALSE`, and `MCQ` — but has no `MULTI_TF` branch. For MULTI_TF, `correctLabels` will fall through to the `else` MCQ branch and pick only a single letter. The design section D2 says "Add an `else if (qtype === 'MULTI_TF')` branch for `correctLabels` parsing identical to C1's `correctMap` logic" — but this is **vague**: it says "identical to C1's correctMap logic" without showing the actual code for the PUT `/questions/:id` handler in `teacher.js`. The coder must infer this from C1's `question_bank.js` logic. Since the PUT handler stores with `correctLabels.includes(lbl)` and the optsToUpsert loop at line ~2535 uses that, without a MULTI_TF branch the `correct_map` body params will be silently ignored and all MULTI_TF options will be saved with `is_correct = false`.

**Concrete fix:** Section D2 must include explicit code for the `teacher.js` PUT handler that:
- Parses `correct_map` from `req.body.correct_A`, `req.body.correct_B`, etc. (or `correct_${lbl}` with B/S values, as in C1)
- Uses it in the `optsToUpsert` loop for MULTI_TF

Minimal explicit snippet for D2:
```js
// In PUT /questions/:id — after the existing correctLabels parsing block:
let correctMapForEdit = null;
if (qtype === 'MULTI_TF') {
  correctMapForEdit = {};
  for (const lbl of ['A','B','C','D','E']) {
    const val = req.body['correct_' + lbl];
    if (val === 'B') correctMapForEdit[lbl] = true;
    else if (val === 'S') correctMapForEdit[lbl] = false;
  }
}

// In the optsToUpsert loop:
let isCorrectVal;
if (qtype === 'MULTI_TF' && correctMapForEdit) {
  isCorrectVal = correctMapForEdit[lbl] !== undefined ? correctMapForEdit[lbl] : false;
} else {
  isCorrectVal = correctLabels.includes(lbl);
}
```

---

### Finding 4 — HIGH — Section H5: `toggleMultiTf` sends fetch to hardcoded URL with EJS interpolation inside a `<script>` block — this causes a template literal / EJS conflict

**Location:** Section H5, the `fetch(...)` call inside `toggleMultiTf()`.

**Problem:** The design shows:
```js
fetch('/student/attempts/<%= attempt.id %>/answer', { ... })
```
This EJS tag inside a JS function body is valid only if the function is defined inside the `<% ... %>` EJS script block of `attempt_take.ejs`. Looking at the actual file structure, the existing autosave fetch calls for COMPLEX (around line 1001–1016 in `attempt_take.ejs`) are defined inside `<script>` tags within the EJS file, so EJS interpolation does work there. However, `toggleMultiTf` is a named function that must be accessible via `onclick="toggleMultiTf(this)"` on dynamically rendered buttons. The design defines `toggleMultiTf` as a plain JS function with `<%= attempt.id %>` interpolated inside. This is correct for an EJS file — the EJS engine renders it server-side before the JS reaches the browser.

**However,** the design places the function definition in what appears to be a `<script>` block but does not specify **where** in `attempt_take.ejs` to place it. The existing autosave handlers for COMPLEX are in an event-listener setup block that runs on DOMContentLoaded (after all questions are rendered). `toggleMultiTf` must be a **globally accessible function** (not inside an IIFE or addEventListener callback) because it is called via inline `onclick`. The design does not specify whether to place it inside or outside the DOMContentLoaded listener, which is a meaningful distinction.

**Concrete fix:** Add a note to H5: "Define `toggleMultiTf` as a function in the top-level `<script>` scope of `attempt_take.ejs`, outside any `DOMContentLoaded` or IIFE wrapper, so that it is accessible from inline `onclick` attributes." Show the placement comment:
```js
// Place this function at the TOP-LEVEL script scope, NOT inside addEventListener('DOMContentLoaded')
function toggleMultiTf(btn) { ... }
```

---

### Finding 5 — MEDIUM — Section D4: Commit handler's `oCorrect` loop uses `r.correctLabels` fallback for MULTI_TF but `r.correctMap` could be `null` from Word import if `startNew()` doesn't initialise it

**Location:** Section D4 (Excel import commit) and Section D5 (`startNew()` initialization).

**Problem:** The design correctly shows D5 updating `startNew()` to initialise `correctMap: null`. When an item from Word import has `correctMap: null` (e.g., because the question has fewer than 2 `KUNCI_X:` lines and was placed in `errors[]`, not `preview[]`), only valid items reach the commit. However, there is a subtle gap: when `r.question_type === 'MULTI_TF'` and `r.correctMap` is `null` (which shouldn't happen for items in `preview[]` after validation, but could happen if validation is bypassed or an edge case occurs), `D4`'s `const map = r.correctMap || {}` falls back to `{}`, silently storing all options as `is_correct = false`. This is a silent data corruption with no error thrown.

The design's D5 validation block requires `Object.keys(cm).length >= 2` before an item enters `preview[]`. So for the normal Excel → preview → commit path, this cannot happen. For Word import, D5 also validates before adding to `preview[]`. So in practice this is safe.

**However,** D4 also applies to Excel import (not just Word), and the Excel import commit handler at teacher.js line ~1965 uses `r.correctLabels || (r.correct ? ...)` as the fallback — **not** `r.correctMap`. The design changes D4 to add an `if (r.question_type === 'MULTI_TF')` branch, but the fallback for non-MULTI_TF is `correctLabels` derived from `r.correctLabels` or `r.correct`. For MULTI_TF rows coming from Excel import (not Word), `r.correctLabels` will be `[]` (since MULTI_TF uses `correctMap` not `correctLabels`). The existing fallback at the top of the commit loop:
```js
const correctLabels = r.correctLabels
  || (r.correct ? String(r.correct).split(',').map(s => s.trim().toUpperCase()) : ['A']);
```
would produce `['A:B', 'B:S', ...]` — split by comma from the raw `correct` string — not valid labels, but this doesn't matter because D4 would use `r.correctMap` for MULTI_TF, bypassing `correctLabels`.

**Concrete fix:** Add a defensive check in D4's MULTI_TF branch:
```js
if (r.question_type === 'MULTI_TF') {
  const map = r.correctMap;
  if (!map || Object.keys(map).length === 0) {
    // Should not happen after validation, but guard against silent corruption
    throw new Error(`Row ${i+1}: MULTI_TF correctMap missing or empty`);
  }
  icVal = (map[label] !== undefined ? map[label] : false) ? 'true' : 'false';
}
```
This ensures a commit-time error surfaces instead of silently storing wrong data.

---

### Finding 6 — MEDIUM — Section H2: Drawer button EJS uses `q.chosen_option_ids !== null` for the "answered" check, but after Section B2 the mapping returns `null` for null DB rows AND `[]` for no-answered MULTI_TF — the EJS condition is wrong for `[]` case

**Location:** Section H2 (drawer button EJS), and Section B2 (server-side mapping change).

**Problem:** Section B2 changes the `chosen_option_ids` mapping to:
```js
if (r.selected_option_ids === null || r.selected_option_ids === undefined) return null;
try { return JSON.parse(r.selected_option_ids); }
catch(_) { return null; }
```
So:
- DB `NULL` → `null` (never answered)
- DB `'[]'` → `[]` (answered but marked nothing Benar)
- DB `'[1001]'` → `[1001]`

Section H2's drawer condition:
```js
(q.question_type === 'MULTI_TF'
  ? (q.chosen_option_ids !== null && q.chosen_option_ids !== undefined)
  : !!q.chosen_option_id)
```
This marks MULTI_TF as "answered" (green) when `chosen_option_ids` is `[]` (empty array) — which means the student saved an autosave with zero Benar selections (all Salah, or they interacted but deselected). An empty array is a valid answered state (all-Salah answer), so green is correct. **However**, `[]` (empty array) could also arise if a student briefly clicks Benar and then clicks Benar again to deselect (toggle off) — after which the autosave sends `option_ids: []`. In this case the drawer shows green even though effectively the student has no active answer. This is an acceptable edge case per the design's stated UX trade-off — but it is undocumented in H2.

More importantly: the condition `q.chosen_option_ids !== null && q.chosen_option_ids !== undefined` also evaluates to **true** for `[]`. Since FR-2.4 says "answered if at least one statement was answered," an all-Salah answer (all statements explicitly marked Salah) also qualifies. The design should state this clearly rather than leaving it implicit.

**Concrete fix:** Add a note in H2:
> "An empty `chosen_option_ids = []` (student autosaved all-Salah or deselected all Benar) also shows the drawer button as green. This is intentional — an explicitly deselected state means the student has interacted with the question. The teacher-visible scoring still computes Salah answers correctly from the absence of option IDs."

---

### Finding 7 — MEDIUM — Section K: Design instructs running `node generate-word-template.js` and committing the binary `.docx`, but this is a runtime side-effect that cannot be described as a file edit — it is an out-of-band step with no fallback if `docx` package API has changed

**Location:** Section K (Word template update).

**Problem:** `generate-word-template.js` exists (confirmed: 8984 bytes at root). The design tells the implementer to edit it and then `node generate-word-template.js` to regenerate `src/public/templates/import_template_word.docx`. This is correct in intent. However, the design does not verify that `generate-word-template.js` uses the `docx` package correctly nor that it currently produces a valid template. If the existing generator has bugs or the `docx` package version is incompatible, the regeneration step silently produces a corrupt template. Additionally, committing a binary `.docx` file is an operational step not covered by the design's automated test plan.

The design also does not specify what `src/public/templates/import_template_word.docx` currently contains or whether it needs to be regenerated from scratch — only that it needs a MULTI_TF example added.

**Concrete fix:** Add to Section K:
1. Verify `generate-word-template.js` runs without error first (`node generate-word-template.js` and open the output).
2. Add a note: "If the generator fails, manually create the Word template by opening the existing `.docx` and inserting the MULTI_TF example block by hand."
3. The commit step should be: `git add src/public/templates/import_template_word.docx && git commit -m "chore: regenerate Word import template with MULTI_TF example"`.

---

### Finding 8 — NIT — Section A: The `else` MCQ/TRUE_FALSE branch comment says "Uses `aa.is_correct` directly (set by the autosave endpoint when option_id matches)" — this is misleading for TRUE_FALSE which uses a dropdown/select, not option_id

**Location:** Section A, the `else` branch comment in the scoring loop.

**Problem:** The comment says `is_correct` is "set by the autosave endpoint when option_id matches." For TRUE_FALSE, the autosave endpoint (`B1`) runs the `else` branch (MCQ/TRUE_FALSE path) in the current code and sets `is_correct` via `SELECT is_correct FROM options WHERE id=:oid`. This is accurate. But the comment in Section A is slightly misleading: it implies this happens for TRUE_FALSE via the COMPLEX path after B1 is extended to include MULTI_TF. In fact, TRUE_FALSE autosave still uses the existing MCQ/TRUE_FALSE `else` branch — it does NOT go through `option_ids`. The comment is harmless but could confuse the coder.

**Concrete fix:** Change the comment to: `// MCQ / TRUE_FALSE: all-or-nothing. is_correct is set by the autosave endpoint's MCQ/TRUE_FALSE branch (option_id subquery). Does NOT use allOpts.`

---

### Finding 9 — NIT — Section C3: The `rawQtype` normalisation says `COMPLEX → COMPLEX` (line 503 in actual code: `rawQtype === 'COMPLEX' ? 'COMPLEX' : rawQtype`) but the design's C3 snippet replaces `rawQtype` without noting the COMPLEX→COMPLEX passthrough

**Location:** Section C3 (import preview in `question_bank.js`), line ~501–503.

**Problem:** The actual code at line 500–503 of `question_bank.js` has:
```js
const rawQtype = ['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX'].includes(qtypeRaw) ? qtypeRaw : 'MCQ';
// Treat COMPLEX sama seperti CHECKBOX (multi-jawaban)
const validQtype = rawQtype === 'COMPLEX' ? 'COMPLEX' : rawQtype;
const isMulti = validQtype === 'COMPLEX' || validQtype === 'CHECKBOX';
```
The design's C3 extends line ~501 from `['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX']` to include `'MULTI_TF'`. But lines 503–504 (`validQtype` and `isMulti`) remain. After the fix, `MULTI_TF` will not match `isMulti` (correct), but it will fall through the `else` branch of the option validation which checks `A` and `B` are present — which is also what we want for MULTI_TF. This is fine.

The design omits the need to also update the error message at line ~311: `reasons.push(`Tipe soal "${qtypeRaw}" tidak dikenal. Gunakan: MCQ, CHECKBOX, TRUE_FALSE`)` — this message should also include MULTI_TF now. It won't cause a bug (the type is accepted and the message never fires for valid MULTI_TF), but the error message will be misleading for users who type `MULTI_TF` and misspell it.

**Concrete fix:** Add to C3: also update the error message at line ~311 to `Gunakan: MCQ, CHECKBOX, TRUE_FALSE, MULTI_TF`.

---

### Finding 10 — NIT — Section D5: The design says the second Word import handler at line 2183 is "dead code" and "must be commented out" — but the coder is told to comment it out rather than delete it, with no explanation of why deletion is not preferred

**Location:** Section D5 (dead code comment instruction).

**Problem:** Commenting out rather than deleting live/dead code is unusual. If the coder comments it out, the file grows with hundreds of commented-out lines. Deletion would be cleaner and Git history preserves the old code. The instruction to "comment it out with `/* DEAD CODE — superseded by handler at line 1563 */`" is a stylistic choice that leaves technical debt.

The more important point: the second handler at line 2183 has a **different** parser (simpler, MCQ-only, no TIPE: support) and directly commits to DB without a preview step. It is confirmed dead because Express registers the first matching handler. But it still exists and could confuse future maintainers.

**Concrete fix:** Change the instruction to: "Delete the second handler (lines 2183–2379 in `teacher.js`) entirely. The first handler at line 1563 supersedes it. Git history preserves the original if rollback is needed."

---

## Verified Assumptions

1. **`submission-utils.js` stores `correctOptionsMap` as a flat array of option IDs (not objects):** Confirmed at line 95–96. The design correctly identifies the old shape as `[option_id, ...]` and proposes replacing it with `[{ option_id, is_correct }, ...]`. ✅

2. **The outer `const correctIds = correctOptionsMap[aa.question_id] || []` is at line 110 of the loop, used by both branches:** Confirmed at lines 110–112. The design's Step 2 correctly removes this line and rederives per-branch. ✅

3. **The autosave endpoint in `student.js` (line 859) currently branches on `COMPLEX || CHECKBOX` only:** Confirmed at line 859. The design's B1 fix of extending to include `MULTI_TF` is correct and sufficient. ✅

4. **`chosen_option_ids` in `attempt_take.ejs` is used only on lines 471 and 473, both guarded by `&&`:** Confirmed — lines 471 and 473 both use `q.chosen_option_ids && q.chosen_option_ids.includes(o.id)`. ✅

5. **`saveBackupToLocalStorage()` reads from DOM only (no iteration of `q.chosen_option_ids`):** Confirmed — the function at line 557–620 only queries DOM elements (`querySelectorAll`). The null-change in B2 is safe. ✅

6. **Two `router.post('/exams/:id/questions/import-word', ...)` handlers exist in `teacher.js` at lines 1563 and 2183:** Confirmed at both lines. Express will serve only the first. ✅

7. **The first Word import handler (line 1563) stores to `req.session.importPreview` and uses the shared commit endpoint:** Confirmed — session stored at line ~1796, preview rendered. The commit path at `/teacher/exams/:id/questions/import/commit` reads from `sess.preview`. ✅

8. **`generate-word-template.js` exists at the project root:** Confirmed — 8984 bytes. ✅

9. **The admin attempt detail route (`admin.js` ~line 4222) uses the old query without `selected_option_ids`, `partial_points`, or `question_type`:** Confirmed — query at line 4223–4227 is exactly as the design shows. ✅

10. **The teacher attempt detail route (`teacher.js` ~line 3113) uses the old query without `selected_option_ids`, `partial_points`, or `question_type`:** Confirmed — query at line 3115–3118. ✅

11. **The `question_bank.js` GET `/:id/edit` handler passes `correct_labels` but NOT `correct_map`:** Confirmed — line 723 passes `{ ..., correct_labels: correctLabels, ... }` with no `correct_map`. ✅

12. **The `teacher.js` GET `/questions/:id/edit` handler passes `correct_labels` but NOT `correct_map`:** Confirmed — line 2435 passes `correct_labels: correctLabels`. ✅

13. **`buildImportPreview` in `teacher.js` currently has `['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX']` as the valid types list and rejects MULTI_TF:** Confirmed — line 310. ✅

14. **The `question_bank.js` import preview loop similarly lacks MULTI_TF in `rawQtype` normalisation:** Confirmed — line 501. ✅

15. **The second Word import handler (line 2183) has a different, simpler parser (MCQ-only, no TIPE: or KUNCI_X: support):** Confirmed — the second handler uses a simple `startRe`, `optRe`, `keyRe` regex set without TIPE support, and directly commits without a session/preview step. ✅

---

## Unverified / Wrong Assumptions

1. **Design (B2) claims "`attempt_take.ejs` uses `q.chosen_option_ids` in exactly two EJS lines (471, 473)":** **Partially wrong.** The drawer button at line ~256 also uses `q.chosen_option_id` (singular, not plural — this is the MCQ field). There is no third reference to `q.chosen_option_ids` (plural). But H2 proposes adding a NEW reference to `q.chosen_option_ids` for the MULTI_TF drawer button condition. The existing drawer at line 256 uses only `q.chosen_option_id` (MCQ/single), so the design's B2 regression safety claim stands for existing types. However, the design says "exactly two EJS lines" — there are actually two for `chosen_option_ids` (plural) but the coder should know this is the COMPLEX/CHECKBOX field and the drawer separately uses `chosen_option_id` (singular). The claim is not wrong but it is imprecise enough to cause confusion. ⚠️

2. **Design (Section D4 / commit handler) claim: "line ~1750" for the `oCorrect.push(...)` loop:** **Wrong.** The actual loop is at lines ~1958–1967 (in the commit handler starting at line 1910). The design says "line ~1750" but the actual commit handler doesn't start until line 1910 and the loop is at ~1962. The implementer must search by context, not line number. ⚠️

3. **Design (D3) refers to `buildImportPreview` as a named function "at line ~300":** **Correct in spirit but wrong in detail.** The function is not named `buildImportPreview` in the actual source — the teacher.js imports are structured differently. The preview logic lives inside the `router.post('/exams/:id/questions/import/preview')` handler at around line 300, inside a `rows.forEach` callback, not as a standalone exported function. The design refers to it as `buildImportPreview` (the name used in a prior review round), but this name does not exist in the actual code. The implementer must map "buildImportPreview" → the forEach loop inside the preview POST handler. ⚠️

---

## Verdict

**5 HIGH findings** (Findings 1, 2-revised, 3, 4, and the HIGH aspects of Finding 7 reclassified as MEDIUM) → **CHANGES_REQUESTED**

| # | Severity | Summary |
|---|---|---|
| 1 | HIGH | B3 review query fan-out for MULTI_TF; `multiTfDetails` not added to `res.render` call |
| 2 | HIGH | C5: `correct_map` computation in GET `/:id/edit` requires explicit handler rewrite |
| 3 | HIGH | D2/F2: PUT `/questions/:id` MULTI_TF branch not shown with explicit code |
| 4 | HIGH | H5: `toggleMultiTf` scope placement (global vs DOMContentLoaded) unspecified |
| 5 | MEDIUM | D4: missing defensive guard when `correctMap` is null/empty at commit time |
| 6 | MEDIUM | H2: `chosen_option_ids = []` drawer behaviour undocumented |
| 7 | MEDIUM | K: `generate-word-template.js` execution is unverified; no fallback for generator failure |
| 8 | NIT | A: misleading comment about `is_correct` for TRUE_FALSE |
| 9 | NIT | C3: error message not updated to include MULTI_TF |
| 10 | NIT | D5: comment-out vs delete for dead code |
