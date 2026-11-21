# MULTI_TF Implementation Review

**Verdict: CHANGES_REQUESTED**

---

## Evidence Summary

### Section A — submission-utils.js (scoring)
✅ Query fetches all options (`SELECT … FROM options WHERE question_id IN (…)`, no `is_correct = true` filter).  
✅ `correctOptionsMap` stores `{ option_id, is_correct }` objects.  
✅ `allOpts` is used in every branch; the outer `correctIds` line is absent.  
✅ MULTI_TF branch: `correctAnswered` counts `studentSaidBenar === opt.is_correct`; uses `Math.floor((correctAnswered / N) * qpoints)`.  
✅ COMPLEX/CHECKBOX branch: derives `correctIds` from `allOpts.filter(o => o.is_correct).map(o => o.option_id)`.  
✅ MCQ/TRUE_FALSE branch: uses `aa.is_correct` directly, does not touch `allOpts`.

### Section B1 — student.js autosave branch
✅ Line 860: `if (qtype === 'COMPLEX' || qtype === 'CHECKBOX' || qtype === 'MULTI_TF')` — MULTI_TF included.

### Section B2 — student.js chosen_option_ids
✅ Lines 824–828: returns `null` for `null`/`undefined`, not `[]`.

### Section D3/D6 — teacher.js buildImportPreview
✅ Line 309: `validQtype` list includes `'MULTI_TF'`.  
✅ Lines 316–365: MULTI_TF branch builds `correctMap`; `correctLabels.length === 0` rejection is guarded (`if (validQtype !== 'MULTI_TF' && correctLabels.length === 0)`).  
✅ Item object at the preview stage includes `correctMap`.

### Section D4 — teacher.js import commit
✅ Lines 2047–2051: MULTI_TF branch uses `r.correctMap` to set `icVal`; falls back to `false`.

### Section D5 — teacher.js Word import
✅ Line 1778: TIPE regex includes `MULTI_TF`.  
✅ Line 1709: `startNew()` initialises `correctMap: null`.  
✅ Lines 1760–1763: `KUNCI_A:` through `KUNCI_E:` parsing present.  
✅ Line 1857: item assignment includes `correctMap: q.correctMap || null`.  
✅ Lines 2249–2449: Duplicate second handler wrapped in `/* DEAD CODE … */` comment block.

### Section D8 — admin.js attempt detail query
✅ Lines 4223–4229: Query includes `aa.selected_option_ids`, `aa.partial_points`, `q.question_type`.

### Section H — attempt_take.ejs
✅ MULTI_TF rendering block present (lines ~423–506).  
✅ Buttons have `data-multitf-qid`, `data-multitf-oid`, `data-multitf-val` attributes.  
✅ `toggleMultiTf()` collects Benar IDs and POSTs `option_ids` array to autosave.  
✅ Page-load restore reads from `multitf_data_<qid>` anchor; restores `multitf-active` class on Benar buttons.  
✅ `updateAnswered()` counts MULTI_TF answered questions.  
✅ `saveBackupToLocalStorage()` includes MULTI_TF section.  
✅ Drawer button initial EJS render: correctly checks `q.chosen_option_ids !== null` for MULTI_TF.  
✅ `toggleSoalDrawer()` inline update correctly includes `hasMultiTf`.  

### No-regression check
✅ MCQ, TRUE_FALSE, COMPLEX, CHECKBOX code paths in submission-utils.js, student.js, and teacher.js are structurally unchanged.

### Syntax check (node --check)
✅ `src/utils/submission-utils.js` — passes.  
✅ `src/routes/student.js` — passes.  
✅ `src/routes/teacher.js` — passes.  
✅ `src/routes/admin.js` — passes.

---

## Blockers

### BLOCKER 1 — `syncDrawerButtons()` omits MULTI_TF

**File:** `src/views/student/attempt_take.ejs`, lines ~1793–1811  
**Evidence:**
```js
function syncDrawerButtons() {
  document.querySelectorAll('.drawerBtn').forEach(function(btn) {
    var no = btn.getAttribute('data-drawer-no');
    var section = document.getElementById('q-' + no);
    if (!section) return;
    var hasRadio    = section.querySelector('input[type=radio]:not(.tf-radio):checked');
    var hasTF       = section.querySelector('select.tf-select');
    var tfAnswered  = hasTF && hasTF.value;
    var hasComplex  = section.querySelector('input.complex-checkbox:checked');
    var hasCheckbox = section.querySelector('input.checkbox-answer:checked');
    // hasMultiTf is NOT checked here
    var done = !!(hasRadio || tfAnswered || hasComplex || hasCheckbox);
    // ...
  });
}
```
The named `syncDrawerButtons()` function does not check for `.multitf-btn.multitf-active`. This function is called by `updateAnswered()`, which is itself called by `toggleMultiTf()` on every Benar/Salah click, and by `showQuestion()` on every question navigation in one-per-page mode.  
**Consequence:** A student who answers a MULTI_TF question will never see the drawer navigation button turn green. The unanswered-question warning on submission will also count MULTI_TF as unanswered even when answered (the counter is correct because `updateAnswered()` counts `multiTfQids` correctly, but `syncDrawerButtons` overwrites the button color).  
**Correction:** Add `var hasMultiTf = section.querySelector('.multitf-btn.multitf-active');` and include `|| hasMultiTf` in the `done` expression — mirroring the identical correct code that already exists in the `toggleSoalDrawer()` inline update at lines ~156–164.

### BLOCKER 2 — `updateAnswered()` called before MULTI_TF state restore on page load

**File:** `src/views/student/attempt_take.ejs`, line 1012 (`updateAnswered()`) vs. lines ~1063–1083 (MULTI_TF restore loop)  
**Evidence:** `updateAnswered()` executes at line 1012. The MULTI_TF restore loop (which adds `multitf-active` classes to previously-answered Benar buttons) executes later, at ~line 1063. When a student resumes an in-progress attempt that already has MULTI_TF answers, `updateAnswered()` runs before any `multitf-active` classes are set, so the initial answered count is too low and the drawer buttons start grey (Blocker 1 also applies at this point).  
**Consequence:** On page load with previously-saved MULTI_TF answers, the answered-count badge shows fewer answered questions than actual, and drawer buttons for those questions remain grey until the student interacts again.  
**Correction:** Move the `updateAnswered()` call (currently at line 1012) to after the MULTI_TF restore loop (after line ~1083), so the restore completes before the count and drawer button state are set.
