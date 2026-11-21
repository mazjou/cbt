# Technical Design — Tipe Soal MULTI_TF

**Pipeline:** `2026-11-21_10-10-31`  
**Step:** 02 — Design (Revision 2 — addressing design-review.json round-2 findings)  
**Status:** Final

---

## Overview

MULTI_TF extends the existing CBT LMS with a new question type that presents one stem question followed by 2–5 statements, each answered independently as Benar (True) or Salah (False). Scoring is proportional without penalty: `floor(correct_statements / N × points)`. All work reuses the existing `options`/`question_bank_options` tables (each statement is one row), the `selected_option_ids TEXT` column in `attempt_answers` (JSON array of option IDs the student marked Benar), and `partial_points DECIMAL(6,2)`. No schema migration is required.

The implementation touches nine files and adds no new dependencies. The technology stack is Node.js + Express + PostgreSQL (via the existing pool wrapper) + EJS + Summernote + XLSX. All new behaviour is added as explicit `if (qtype === 'MULTI_TF')` branches alongside the existing `COMPLEX`/`CHECKBOX` branches so the two code paths never interfere.

---

## A. `src/utils/submission-utils.js` — Scoring

### Why the existing query must change

Currently, `correctOptionsMap` stores plain option IDs using only rows where `is_correct = true`. MULTI_TF scoring needs to know, for every statement, whether the student's answer of Benar matches `is_correct`. The fix is to fetch **all** option rows for the relevant questions and store them as objects. The existing COMPLEX/CHECKBOX branch must also be updated to derive `correctIds` from the new object shape.

### Exact changes

**Step 1 — Change the query (remove `AND is_correct = true`, change stored value):**

```js
// OLD:
const [correctOpts] = await connection.query(
  `SELECT question_id, id AS option_id FROM options WHERE question_id IN (${ph}) AND is_correct = true`,
  qids
);
for (const o of correctOpts) {
  if (!correctOptionsMap[o.question_id]) correctOptionsMap[o.question_id] = [];
  correctOptionsMap[o.question_id].push(Number(o.option_id));
}

// NEW:
const [correctOpts] = await connection.query(
  `SELECT question_id, id AS option_id, is_correct FROM options WHERE question_id IN (${ph})`,
  qids
);
for (const o of correctOpts) {
  if (!correctOptionsMap[o.question_id]) correctOptionsMap[o.question_id] = [];
  correctOptionsMap[o.question_id].push({ option_id: Number(o.option_id), is_correct: !!o.is_correct });
}
```

**Step 2 — Update the scoring loop (Finding 1 fix: remove outer `const correctIds`, handle each branch from `allOpts`):**

The current code has an outer `const correctIds = correctOptionsMap[aa.question_id] || []` at line 111 of the loop, which is used by both COMPLEX/CHECKBOX and the MCQ/TRUE_FALSE `else` branch. With the new object shape, that outer line must be **removed entirely**. Each branch derives what it needs from `allOpts`:

```js
for (const aa of answers) {
  const qpoints = Number(aa.points || 0);
  total_points += qpoints;
  const qtype = aa.question_type || 'MCQ';
  // allOpts is the new shape: [{ option_id, is_correct }, ...]
  const allOpts = correctOptionsMap[aa.question_id] || [];
  // Note: the old outer `const correctIds = ...` line is REMOVED here.

  if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
    // Derive correctIds from the new object shape
    const correctIds = allOpts.filter(o => o.is_correct).map(o => o.option_id);

    let selectedIds = [];
    try {
      selectedIds = aa.selected_option_ids
        ? JSON.parse(aa.selected_option_ids).map(Number)
        : (aa.option_id ? [Number(aa.option_id)] : []);
    } catch(_) {
      selectedIds = aa.option_id ? [Number(aa.option_id)] : [];
    }

    const totalCorrect = correctIds.length;
    if (totalCorrect > 0 && selectedIds.length > 0) {
      const correctSelected = selectedIds.filter(id => correctIds.includes(id)).length;
      const partial = Math.floor((correctSelected / totalCorrect) * qpoints);
      score_points += partial;
      await connection.query(
        `UPDATE attempt_answers SET partial_points = :pp, is_correct = :isc
         WHERE attempt_id = :aid AND question_id = :qid`,
        {
          pp: partial,
          isc: correctSelected === totalCorrect && selectedIds.every(id => correctIds.includes(id)) ? 1 : 0,
          aid: attemptId,
          qid: aa.question_id
        }
      );
      if (partial > 0) correct_count++;
      else if (selectedIds.length > 0) wrong_count++;
    } else if (selectedIds.length > 0) {
      wrong_count++;
    }

  } else if (qtype === 'MULTI_TF') {
    const N = allOpts.length;

    let selectedIds = [];
    try {
      selectedIds = aa.selected_option_ids
        ? JSON.parse(aa.selected_option_ids).map(Number)
        : [];
    } catch(_) { selectedIds = []; }

    if (N > 0) {
      // Correct if: student said Benar (id in selectedIds) AND is_correct === true
      //          OR student did NOT say Benar (id absent) AND is_correct === false
      let correctAnswered = 0;
      for (const opt of allOpts) {
        const studentSaidBenar = selectedIds.includes(opt.option_id);
        if (studentSaidBenar === opt.is_correct) correctAnswered++;
      }
      const partial = Math.floor((correctAnswered / N) * qpoints);
      score_points += partial;
      await connection.query(
        `UPDATE attempt_answers SET partial_points = :pp, is_correct = :isc
         WHERE attempt_id = :aid AND question_id = :qid`,
        {
          pp: partial,
          isc: correctAnswered === N ? 1 : 0,
          aid: attemptId,
          qid: aa.question_id
        }
      );
      if (correctAnswered === N) correct_count++;
      else if (selectedIds.length > 0) wrong_count++;
      // No wrong_count increment when student never answered (selectedIds.length === 0) — no penalty (AC-6).
    }

  } else {
    // MCQ / TRUE_FALSE: all-or-nothing.
    // Uses aa.is_correct directly (set by the autosave endpoint when option_id matches).
    // Does NOT use allOpts — no regression from the query change.
    const isCorrect = Number(aa.is_correct || 0) === 1;
    if (isCorrect) {
      score_points += qpoints;
      correct_count++;
    } else if (aa.option_id) {
      wrong_count++;
    }
  }
}
```

**Error handling:** The `UPDATE attempt_answers` calls run inside an already-open transaction. Any failure causes the outer `connection.rollback()` in the existing catch block to fire. No additional error handling is needed here.

---

## B. `src/routes/student.js` — Autosave endpoint and attempt load

### B1. Autosave endpoint (line ~859)

Extend the existing branch from:
```js
if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
```
to:
```js
if (qtype === 'COMPLEX' || qtype === 'CHECKBOX' || qtype === 'MULTI_TF') {
```
No other change is needed. The same `selected_option_ids` column and `option_ids` body field work identically for MULTI_TF. The student JS sends the array of option IDs the student marked Benar; unanswered statements are simply absent from the array.

### B2. Attempt load — `chosen_option_ids` null vs. empty (Finding 7: verified safe)

Change the server-side mapping at line ~824:
```js
// OLD:
chosen_option_ids: (() => {
  try { return r.selected_option_ids ? JSON.parse(r.selected_option_ids) : []; }
  catch(_) { return []; }
})(),

// NEW:
chosen_option_ids: (() => {
  if (r.selected_option_ids === null || r.selected_option_ids === undefined) return null;
  try { return JSON.parse(r.selected_option_ids); }
  catch(_) { return null; }
})(),
```

**COMPLEX/CHECKBOX regression verification (Finding 7 addressed):** `attempt_take.ejs` uses `q.chosen_option_ids` in exactly two EJS lines (471, 473) and both use the `&&` short-circuit: `q.chosen_option_ids && q.chosen_option_ids.includes(o.id)`. The `saveBackupToLocalStorage()` function (line 557) reads from DOM elements only — it does not iterate `q.chosen_option_ids`. Changing the server mapping from `[]` to `null` for DB-NULL rows is therefore safe for all existing question types.

### B3. Review query

The student result review query at line ~1218 must include `q.question_type`, `aa.selected_option_ids`, and `aa.partial_points`:

```sql
SELECT q.id AS question_id, q.question_text, q.question_image, q.points,
       q.question_type,
       aa.is_correct, aa.option_id, aa.selected_option_ids, aa.partial_points,
       o1.option_label || '. ' || o1.option_text AS chosen_text,
       o2.option_label || '. ' || o2.option_text AS correct_text
FROM attempt_answers aa
JOIN questions q ON q.id=aa.question_id
LEFT JOIN options o1 ON o1.id=aa.option_id
LEFT JOIN options o2 ON o2.question_id=q.id AND o2.is_correct=true
WHERE aa.attempt_id=:aid
ORDER BY aa.id ASC;
```

---

## C. `src/routes/question_bank.js` — Bank soal CRUD and import/export

### C1. POST `/teacher/question-bank` — save new bank question

Replace the existing guard at line ~619:
```js
// OLD:
if (qtype !== 'TRUE_FALSE' && (!a || !b || !c || !d)) {
  req.flash('error', 'Minimal opsi A-D wajib diisi');
  return res.redirect('/teacher/question-bank/new');
}

// NEW:
if (qtype !== 'TRUE_FALSE' && qtype !== 'MULTI_TF' && (!a || !b || !c || !d)) {
  req.flash('error', 'Minimal opsi A-D wajib diisi');
  return res.redirect('/teacher/question-bank/new');
}
if (qtype === 'MULTI_TF' && (!a || !b)) {
  req.flash('error', 'MULTI_TF: minimal 2 pernyataan (A dan B) harus diisi.');
  return res.redirect('/teacher/question-bank/new');
}
```

Add the MULTI_TF `correctMap` parsing block after the existing `correctLabels` assignment block:

```js
let correctMap = null;
if (qtype === 'MULTI_TF') {
  correctMap = {};
  for (const lbl of ['A','B','C','D','E']) {
    const val = req.body['correct_' + lbl];
    if (val === 'B') correctMap[lbl] = true;
    else if (val === 'S') correctMap[lbl] = false;
  }
  const filledCount = Object.keys(correctMap).length;
  if (filledCount < 2) {
    req.flash('error', 'MULTI_TF: minimal 2 pernyataan wajib memiliki kunci jawaban (B/S).');
    return res.redirect('/teacher/question-bank/new');
  }
}
```

Then in the `optsToInsert` insertion loop for MULTI_TF:

```js
const optsToInsert = qtype === 'TRUE_FALSE'
  ? [['A', a || 'Benar'], ['B', b || 'Salah']]
  : qtype === 'MULTI_TF'
    ? [['A',a],['B',b],['C',c||''],['D',d||''],['E',e||'']]
    : [['A',a],['B',b],['C',c],['D',d],['E',e||'']];

for (const [lbl, txt] of optsToInsert) {
  if (!txt) continue;
  let isCorrect;
  if (qtype === 'MULTI_TF') {
    isCorrect = correctMap !== null && correctMap[lbl] !== undefined ? correctMap[lbl] : false;
  } else {
    isCorrect = correctLabels.includes(lbl);
  }
  await conn.query(
    'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
    [bankId, lbl, txt, isCorrect]
  );
}
```

### C2. PUT `/:id` — update bank question (Finding 4 fix)

The existing guard at line ~736 fires before `qtype` is derived (line ~742 uses `existing.question_type` from a later DB fetch). The fix is to derive `qtype` from `req.body.question_type` for the guard only, with the full DB-fallback derivation kept in its original position for use later:

```js
// At the top of the PUT handler, before ANY guard:
const qtypeForGuard = req.body.question_type || 'MCQ'; // body-only, for guard purposes

// Replace the existing combined guard:
// OLD: if (!subject_id || !question_text || !a || !b || !c || !d) { ... }
// NEW:
if (!subject_id || !question_text) {
  req.flash('error', 'Mata pelajaran dan pertanyaan wajib diisi');
  return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
}
if (qtypeForGuard !== 'TRUE_FALSE' && qtypeForGuard !== 'MULTI_TF' && (!a || !b || !c || !d)) {
  req.flash('error', 'Semua field wajib diisi');
  return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
}
if (qtypeForGuard === 'MULTI_TF' && (!a || !b)) {
  req.flash('error', 'MULTI_TF: minimal pernyataan A dan B harus diisi.');
  return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
}

// The existing DB fetch and full qtype derivation remain in their current position:
const existing = firstRow(await pool.query('SELECT * FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [req.params.id, user.id]));
const qtype = question_type || existing.question_type || 'MCQ'; // unchanged
```

Then add the `correctMap` parsing block (identical to C1) before the upsert loop, and use `correctMap`-aware `isCorrect` in the upsert loop.

### C3. Import preview — Excel/CSV (Finding 5 fix)

In the existing preview loop, extend the `rawQtype` normalisation line at ~501:
```js
// OLD:
const rawQtype = ['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX'].includes(qtypeRaw) ? qtypeRaw : 'MCQ';
// NEW:
const rawQtype = ['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX','MULTI_TF'].includes(qtypeRaw) ? qtypeRaw : 'MCQ';
```

Then **guard the existing `correctLabels` validation** so it does not reject the `A:B,B:S` format before the MULTI_TF block runs:

```js
// OLD (lines 520–526):
const correctLabels = isMulti
  ? correctRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  : [correctRaw.toUpperCase()];
if (correctLabels.length === 0 || !correctLabels.every(l => ['A','B','C','D','E'].includes(l))) {
  reasons.push('Kunci jawaban tidak valid ...');
}

// NEW — wrap the existing block in a guard:
let correctLabels = [];
let correctMap = null;
if (rawQtype === 'MULTI_TF') {
  // Parse format: "A:B,B:S,C:B,D:S"
  correctMap = {};
  const parts = correctRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^([A-E]):([BS])$/i);
    if (m) correctMap[m[1].toUpperCase()] = m[2].toUpperCase() === 'B';
  }
  const filled = Object.keys(correctMap).length;
  if (filled < 2) {
    reasons.push('MULTI_TF: minimal 2 pernyataan wajib diisi (format kunci: A:B,B:S,C:B)');
  }
  if (!A && !image_a) reasons.push('MULTI_TF: pernyataan A wajib diisi');
  if (!B && !image_b) reasons.push('MULTI_TF: pernyataan B wajib diisi');
} else {
  // Existing correctLabels validation — unchanged
  correctLabels = isMulti
    ? correctRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : [correctRaw.toUpperCase()];
  if (correctLabels.length === 0 || !correctLabels.every(l => ['A','B','C','D','E'].includes(l))) {
    reasons.push('Kunci jawaban tidak valid (gunakan A/B/C/D/E, untuk COMPLEX/CHECKBOX pisahkan dengan koma)');
  }
}
```

Store `correctMap` in the item object so the commit step can use it:
```js
const item = { rowNo, question_text, ..., correctLabels, correctMap, question_type: rawQtype, ... };
```

### C4. Import commit — `question_bank.js`

Inside the `for (const lbl of ['A','B','C','D','E'])` loop in the commit handler (line ~582), replace:
```js
await conn.query(
  'INSERT INTO question_bank_options ... VALUES ($1,$2,$3,$4,$5)',
  [bankId, lbl, optText, optImg, correctLabels.includes(lbl) ? true : false]
);
```
with:
```js
let isCorrect;
if (qtype === 'MULTI_TF') {
  const map = r.correctMap || {};
  isCorrect = map[lbl] !== undefined ? map[lbl] : false;
} else {
  isCorrect = correctLabels.includes(lbl);
}
await conn.query(
  'INSERT INTO question_bank_options ... VALUES ($1,$2,$3,$4,$5)',
  [bankId, lbl, optText, optImg, isCorrect]
);
```

### C5. GET `/:id/edit` — edit form data

After the loop over options in the GET handler, build a `correct_map` object and pass it to the template:
```js
const correctMapForView = {};
for (const o of options) {
  correctMapForView[o.option_label] = o.is_correct; // boolean
}
res.render('teacher/question_bank_edit', {
  ...,
  correct_map: correctMapForView  // new field
});
```

### C6. Export — `correct` string format

In the export route's `rows.map`, replace the `correctStr` computation:
```js
// OLD:
const correctStr = Object.entries(opts).filter(([, v]) => v.correct).map(([lbl]) => lbl).join(',');

// NEW:
let correctStr;
if (qtype === 'MULTI_TF') {
  correctStr = ['A','B','C','D','E']
    .filter(lbl => opts[lbl] && opts[lbl].text)   // skip empty-text statements (Finding 10 fix)
    .map(lbl => `${lbl}:${opts[lbl].correct ? 'B' : 'S'}`)
    .join(',');
} else {
  correctStr = Object.entries(opts).filter(([, v]) => v.correct).map(([lbl]) => lbl).join(',');
}
```

The `.filter(lbl => opts[lbl] && opts[lbl].text)` excludes labels with empty text (addresses review Finding 10: unused fifth statement must not emit `E:S`).

---

## D. `src/routes/teacher.js` — Exam question CRUD and import

### D1. POST `/exams/:id/questions` — add exam question

After the existing `TRUE_FALSE` guard, add:
```js
if (qtype === 'MULTI_TF' && (!a || !b)) {
  req.flash('error', 'MULTI_TF: minimal pernyataan A dan B harus diisi.');
  return res.redirect(`/teacher/exams/${examId}`);
}
```

Add the `correctMap` parsing block (identical to C1) before the existing `correctLabels` assignment. Then in the options insertion loop, use the same `correctMap`-aware `isCorrect` logic as C1.

The `optsToInsert` array for MULTI_TF:
```js
let optsToInsert;
if (qtype === 'TRUE_FALSE') {
  optsToInsert = [['A', a || 'Benar'], ['B', b || 'Salah']];
} else if (qtype === 'MULTI_TF') {
  optsToInsert = [['A',a],['B',b],['C',c||''],['D',d||''],['E',e||'']];
} else {
  optsToInsert = [['A',a],['B',b],['C',c],['D',d]];
  if (e) optsToInsert.push(['E', e]);
}
```

### D2. PUT `/questions/:id` — edit exam question

Add an `else if (qtype === 'MULTI_TF')` branch for `correctLabels` parsing identical to C1's `correctMap` logic. Use the same `correctMap`-aware `isCorrect` in the upsert loop. Also update the validation guard with the same pattern as C2.

### D3. Excel import preview — `buildImportPreview` (line ~300) — Finding 6 fix

The function currently builds `correctLabels` via a ternary that only treats COMPLEX/CHECKBOX as multi, and all other types as single-label. For MULTI_TF, `correctRaw = 'A:B,B:S'` falls into the single-label branch producing `correctLabels = []`, then the `if (correctLabels.length === 0)` rejection fires before the MULTI_TF block.

**Fix:** Add `'MULTI_TF'` to the valid types array in the `validQtype` normalisation. Then guard the `correctLabels.length === 0` rejection exactly as in C3:

```js
// In buildImportPreview, after validQtype derivation:

let correctLabels = [];
let correctMap = null;
if (validQtype === 'MULTI_TF') {
  correctMap = {};
  const parts = correctRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^([A-E]):([BS])$/i);
    if (m) correctMap[m[1].toUpperCase()] = m[2].toUpperCase() === 'B';
  }
  const filled = Object.keys(correctMap).length;
  if (filled < 2) reasons.push('MULTI_TF: minimal 2 pernyataan wajib diisi (format kunci: A:B,B:S,C:B)');
} else {
  // Existing correctLabels logic — unchanged
  correctLabels = (validQtype === 'COMPLEX' || validQtype === 'CHECKBOX')
    ? correctRaw.split(',').map(s => s.trim()).filter(s => ['A','B','C','D','E'].includes(s))
    : (correctRaw && ['A','B','C','D','E'].includes(correctRaw) ? [correctRaw] : []);
  if (correctLabels.length === 0) reasons.push('Kunci jawaban tidak valid (gunakan A/B/C/D/E, COMPLEX pisahkan koma)');
}
```

The `item` object (line ~354) must include `correctMap`:
```js
const item = {
  rowNo, question_text, question_image, points, correct,
  correctLabels,
  correctMap,          // NEW
  question_type: validQtype,
  options: { A, B, C, D, E },
  option_images: { A: image_a, B: image_b, C: image_c, D: image_d, E: image_e }
};
```

### D4. Excel import commit — bulk unnest (line ~1750)

In the commit loop, inside the `for (const label of LABELS)` loop, replace:
```js
oCorrect.push(correctLabels.includes(label) ? 'true' : 'false');
```
with:
```js
let icVal;
if (r.question_type === 'MULTI_TF') {
  const map = r.correctMap || {};
  icVal = (map[label] !== undefined ? map[label] : false) ? 'true' : 'false';
} else {
  icVal = correctLabels.includes(label) ? 'true' : 'false';
}
oCorrect.push(icVal);
```

### D5. Word import parser — first handler only (line ~1563)

**Handler selection:** Express registers two handlers for `POST /exams/:id/questions/import-word` at lines 1563 and 2183. Express serves only the first (line 1563). The second handler (line 2183) is **dead code** and must be commented out with `/* DEAD CODE — superseded by handler at line 1563 */`.

**Parser changes to the first handler:**

Add `MULTI_TF` to the `TIPE:` regex:
```js
// OLD:
const mType = t.match(/^\s*TIPE\s*[:=]\s*(MCQ|COMPLEX|TRUE_FALSE|CHECKBOX)\s*$/i);
// NEW:
const mType = t.match(/^\s*TIPE\s*[:=]\s*(MCQ|COMPLEX|TRUE_FALSE|CHECKBOX|MULTI_TF)\s*$/i);
```

Initialize `correctMap: null` inside `startNew()`:
```js
function startNew() {
  cur = {
    question_text: '', question_image: null, points: 1,
    question_type: 'MCQ',
    options: {}, option_images: {},
    correctMap: null,       // NEW — for MULTI_TF per-statement keys
    kunci: null
  };
  lastLabel = null;
}
```

Add `KUNCI_A:` through `KUNCI_E:` parsing **before** the main text accumulation block:
```js
const mStmtKey = t.match(/^\s*KUNCI_([A-E])\s*[:=]\s*([BS])\s*$/i);
if (mStmtKey && cur) {
  if (!cur.correctMap) cur.correctMap = {};
  cur.correctMap[mStmtKey[1].toUpperCase()] = mStmtKey[2].toUpperCase() === 'B';
  lastLabel = null;
  continue;
}
```

Add MULTI_TF case to the per-question validation block:
```js
} else if (qtype === 'MULTI_TF') {
  const imgO = q.option_images || {};
  const hasA = A || imgO.A;
  const hasB = B || imgO.B;
  if (!hasA || !hasB) reasons.push('Minimal pernyataan A dan B wajib untuk MULTI_TF');
  const cm = q.correctMap || {};
  if (Object.keys(cm).length < 2) reasons.push('MULTI_TF: minimal 2 kunci pernyataan (KUNCI_A: B, KUNCI_B: S, ...)');
  if (!Object.keys(cm).every(l => ['A','B','C','D','E'].includes(l))) reasons.push('KUNCI_X hanya boleh huruf A-E');
}
```

**Include `correctMap` in the item object (Finding 3 fix):** This is the critical fix. The `item` assignment in the first handler must explicitly include `correctMap`:

```js
// Updated item assignment (around line 1781):
const item = {
  rowNo: idx + 1,
  question_text: qt || '(gambar)',
  question_image: q.question_image,
  points: q.points,
  correct: correctLabels.join(',') || corr,
  correctLabels,
  correctMap: q.correctMap || null,    // NEW — required for D4 commit path
  question_type: qtype,
  options: { A, B, C, D, E },
  option_images: q.option_images
};
```

The commit path (`POST /exams/:id/questions/import/commit`) reads `r.correctMap` from this session item in D4. Without this explicit assignment, `r.correctMap` would be `undefined` and all MULTI_TF statements would be stored with `is_correct = false`.

### D6. Excel template — add MULTI_TF example

In the `GET /exams/:id/import/template` route, add one example row:
```js
{ question_text: 'Contoh MULTI_TF: Perhatikan pernyataan tentang proses fotosintesis.',
  image: '', points: 4, correct: 'A:B,B:S,C:B,D:B', question_type: 'MULTI_TF',
  A: 'Fotosintesis membutuhkan cahaya matahari', B: 'CO2 dihasilkan pada fotosintesis',
  C: 'Klorofil berperan sebagai pigmen', D: 'O2 dilepaskan sebagai produk samping', E: '',
  image_a: '', image_b: '', image_c: '', image_d: '', image_e: '' },
```
Also add MULTI_TF to the Panduan sheet.

### D7. Teacher attempt detail query

Replace the query in `GET /teacher/attempts/:id` (line ~3113):
```js
// NEW:
const [ans] = await pool.query(
  `SELECT aa.question_id, aa.option_id AS chosen_option_id, aa.is_correct,
          aa.selected_option_ids, aa.partial_points,
          q.question_text, q.question_image, q.points, q.question_type
   FROM attempt_answers aa
   JOIN questions q ON q.id=aa.question_id
   WHERE aa.attempt_id=:aid
   ORDER BY aa.id ASC;`,
  { aid: attemptId }
);
```

### D8. Admin attempt detail query (Finding 8 fix — explicitly confirmed)

The admin route `GET /admin/attempts/:id` at `src/routes/admin.js` line ~4222 uses the same old SELECT pattern. Update it identically to D7:

```js
// OLD:
const ansResult = await pool.query(
  `SELECT aa.question_id, aa.option_id AS chosen_option_id, aa.is_correct,
          q.question_text, q.question_image, q.points
   FROM attempt_answers aa
   JOIN questions q ON q.id=aa.question_id
   WHERE aa.attempt_id=$1 ORDER BY aa.id ASC`,
  [attemptId]
);

// NEW:
const ansResult = await pool.query(
  `SELECT aa.question_id, aa.option_id AS chosen_option_id, aa.is_correct,
          aa.selected_option_ids, aa.partial_points,
          q.question_text, q.question_image, q.points, q.question_type
   FROM attempt_answers aa
   JOIN questions q ON q.id=aa.question_id
   WHERE aa.attempt_id=$1 ORDER BY aa.id ASC`,
  [attemptId]
);
```

---

## E. `src/views/teacher/question_bank_new.ejs` — New bank question form

### E1. Radio button

Add the MULTI_TF radio button alongside the existing ones:
```html
<label class="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-teal-200 bg-white cursor-pointer has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 transition-all">
  <input type="radio" name="question_type" value="MULTI_TF" class="accent-teal-600" onchange="updateBankForm(this.value)" />
  <div><div class="text-sm font-semibold text-teal-800">Multi Benar/Salah</div><div class="text-xs text-slate-500">Pernyataan B/S per item</div></div>
</label>
```

### E2. MULTI_TF key panel

Add below the existing `bank_correct_complex_wrap` div:
```html
<div id="bank_correct_multitf_wrap" class="hidden">
  <label class="text-sm font-semibold text-teal-700 mb-2 block">Tentukan kunci jawaban per pernyataan:</label>
  <div class="space-y-2" id="bank_multitf_key_rows">
    <!-- Rendered by renderMultiTfBankKeys() -->
  </div>
  <p class="text-xs text-teal-500 mt-1">Poin parsial: setiap pernyataan benar yang dijawab benar menambah poin</p>
</div>
```

### E3. `updateBankForm()` — add MULTI_TF branch

In the `updateBankForm(qtype)` function, add before the final `else` block:
```js
} else if (qtype === 'MULTI_TF') {
  var multiTfWrap = document.getElementById('bank_correct_multitf_wrap');
  mcqWrap.classList.add('hidden');
  complexWrap.classList.add('hidden');
  if (multiTfWrap) multiTfWrap.classList.remove('hidden');
  mcqSelect.disabled = true;
  optC.classList.remove('hidden');
  optD.classList.remove('hidden');
  optE.classList.remove('hidden');
  renderMultiTfBankKeys();
}
```

### E4. `renderMultiTfBankKeys()` function

```js
function renderMultiTfBankKeys() {
  var container = document.getElementById('bank_multitf_key_rows');
  if (!container) return;
  container.innerHTML = '';
  var lbls = ['A','B','C','D','E'];
  lbls.forEach(function(lbl) {
    var row = document.createElement('div');
    row.className = 'flex items-center gap-3';
    row.innerHTML =
      '<span class="w-6 h-6 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center font-bold">' + lbl + '</span>' +
      '<label class="flex items-center gap-2 cursor-pointer">' +
        '<input type="radio" name="correct_' + lbl + '" value="B" class="accent-teal-600 w-4 h-4" /> ' +
        '<span class="text-sm font-semibold text-teal-700">Benar</span>' +
      '</label>' +
      '<label class="flex items-center gap-2 cursor-pointer">' +
        '<input type="radio" name="correct_' + lbl + '" value="S" class="accent-rose-600 w-4 h-4" /> ' +
        '<span class="text-sm font-semibold text-rose-700">Salah</span>' +
      '</label>';
    container.appendChild(row);
  });
}
```

### E5. Form validation — MULTI_TF case

In the existing `$('#bankQuestionForm').on('submit', ...)` handler, add after the COMPLEX/CHECKBOX validation:
```js
if (qtype === 'MULTI_TF') {
  var aContent = $('#editor_option_a').summernote('code');
  var bContent = $('#editor_option_b').summernote('code');
  var aText = $('<div>').html(aContent).text().trim();
  var bText = $('<div>').html(bContent).text().trim();
  if (!aText && aContent.indexOf('<img') === -1) {
    e.preventDefault(); alert('Pernyataan A wajib diisi!'); return false;
  }
  if (!bText && bContent.indexOf('<img') === -1) {
    e.preventDefault(); alert('Pernyataan B wajib diisi!'); return false;
  }
  var lbls = ['A','B','C','D','E'];
  for (var i = 0; i < lbls.length; i++) {
    var l = lbls[i];
    var optContent = $('#editor_option_' + l.toLowerCase()).summernote('code');
    var optText = $('<div>').html(optContent).text().trim();
    var hasOptImg = optContent.indexOf('<img') !== -1;
    if (optText || hasOptImg) {
      var chosen = document.querySelector('input[name="correct_' + l + '"]:checked');
      if (!chosen) {
        e.preventDefault();
        alert('Pilih kunci jawaban (Benar/Salah) untuk pernyataan ' + l + '!');
        return false;
      }
    }
  }
}
```

---

## F. `src/views/teacher/question_bank_edit.ejs` and `question_edit.ejs` — Edit forms

### F1. `question_bank_edit.ejs`

The server now passes `correct_map` (from C5). Add the MULTI_TF key panel div alongside the existing `correct_complex_wrap`:

```html
<div id="correct_multitf_wrap" class="hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 shadow-sm">
  <label class="text-sm font-semibold text-teal-700 mb-2 block">Kunci jawaban per pernyataan:</label>
  <div class="space-y-2">
    <% ['A','B','C','D','E'].forEach(lbl => {
       const isBenar = correct_map && correct_map[lbl] === true;
       const isSalah = correct_map && correct_map[lbl] === false;
    %>
    <div class="flex items-center gap-3">
      <span class="w-6 h-6 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center font-bold"><%= lbl %></span>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="correct_<%= lbl %>" value="B" class="accent-teal-600 w-4 h-4" <%= isBenar ? 'checked' : '' %> />
        <span class="text-sm font-semibold text-teal-700">Benar</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="correct_<%= lbl %>" value="S" class="accent-rose-600 w-4 h-4" <%= isSalah ? 'checked' : '' %> />
        <span class="text-sm font-semibold text-rose-700">Salah</span>
      </label>
    </div>
    <% }) %>
  </div>
  <p class="text-xs text-teal-500 mt-1">Poin parsial per pernyataan</p>
</div>
```

In the existing init script at the bottom of `question_bank_edit.ejs`, add:
```js
} else if (qtype === 'MULTI_TF') {
  if (singleWrap) singleWrap.classList.add('hidden');
  if (complexWrap) complexWrap.classList.add('hidden');
  var tfWrap2 = document.getElementById('correct_multitf_wrap');
  if (tfWrap2) tfWrap2.classList.remove('hidden');
  var sel = singleWrap ? singleWrap.querySelector('select') : null;
  if (sel) { sel.disabled = true; sel.removeAttribute('required'); }
  if (complexWrap) complexWrap.querySelectorAll('input[name=correct]').forEach(function(r){ r.disabled = true; });
}
```

### F2. `question_edit.ejs`

The server for `GET /teacher/questions/:id/edit` already passes `correct_labels`. For MULTI_TF, derive `correct_map` from the options query and pass it:
```js
const correctMapForEdit = {};
for (const o of opts) {
  correctMapForEdit[o.option_label] = !!o.is_correct;
}
res.render('teacher/question_edit', {
  ...,
  correct_map: correctMapForEdit
});
```

Add the MULTI_TF panel to `question_edit.ejs` with the same markup as F1. Add the MULTI_TF case to the existing init script. Add a MULTI_TF badge to the badge display block:
```ejs
<% } else if (qtBadge === 'MULTI_TF') { %>
  <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">✓✗ Tipe: Multi Benar/Salah</span>
```

---

## G. `src/views/teacher/question_bank_import_preview.ejs` and `question_import_preview.ejs`

Add `MULTI_TF` to the badge colour map (teal). The correct string format `A:B,B:S,C:B` will display as-is in the existing "correct" column — no additional template change needed.

---

## H. `src/views/student/attempt_take.ejs` — Student exam UI

### H1. MULTI_TF question rendering

Add the MULTI_TF type block in the question section EJS, after the CHECKBOX block and before the final MCQ/radio `else`:

```ejs
<% } else if (q.question_type === 'MULTI_TF') { %>
  <div class="flex items-center gap-2 mb-2">
    <span class="text-sm font-bold <%= color.text %>">Tentukan Benar atau Salah setiap pernyataan:</span>
    <span class="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold">Multi B/S</span>
  </div>
  <p class="text-xs text-slate-500 mb-3">Poin parsial — setiap pernyataan yang dijawab benar menambah poin.</p>
  <%
    // Render a data anchor for JS init (see H7)
    // chosen_option_ids is null (never answered) or an array of option IDs marked Benar (after B2 fix)
  %>
  <span id="multitf_data_<%= q.id %>"
    data-ids="<%= q.chosen_option_ids !== null ? JSON.stringify(q.chosen_option_ids) : 'null' %>"
    class="hidden"></span>
  <div class="space-y-3">
    <% q.options.forEach((o) => { %>
    <div class="rounded-xl border-2 border-slate-200 bg-white p-4" id="multitf_row_<%= q.id %>_<%= o.id %>">
      <div class="flex items-start gap-3 mb-3">
        <span class="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
          <%= o.option_label %>
        </span>
        <div class="flex-1 text-slate-700 prose prose-sm max-w-none"><%- o.option_text %></div>
      </div>
      <div class="flex gap-3">
        <button type="button"
          data-multitf-qid="<%= q.id %>"
          data-multitf-oid="<%= o.id %>"
          data-multitf-val="benar"
          class="multitf-btn flex-1 py-2 rounded-xl border-2 font-semibold text-sm transition-all border-slate-200 bg-white text-slate-500 hover:border-teal-300"
          onclick="toggleMultiTf(this)">
          ✅ Benar
        </button>
        <button type="button"
          data-multitf-qid="<%= q.id %>"
          data-multitf-oid="<%= o.id %>"
          data-multitf-val="salah"
          class="multitf-btn flex-1 py-2 rounded-xl border-2 font-semibold text-sm transition-all border-slate-200 bg-white text-slate-500 hover:border-rose-300"
          onclick="toggleMultiTf(this)">
          ❌ Salah
        </button>
      </div>
    </div>
    <% }) %>
  </div>
<% } else { %>
  <%# ... existing MCQ/COMPLEX/CHECKBOX options loop ... %>
```

**Key decision on initial button state (Finding 2 fix):** EJS does **not** pre-render the active state from `chosen_option_ids`. All buttons start with neutral styling. The JS init block (H7) is the **sole authority** for restoring previous answers on page load. This eliminates the dual-initialisation problem (Finding 9) and correctly handles the "partially answered" case: only statements that appear in `chosen_option_ids` as Benar get the Benar highlight; all others remain neutral — including statements the student never touched. A statement is Salah-highlighted only when the student has explicitly clicked its Salah button during the current session (via `toggleMultiTf`), or when the JS init restores it as Salah.

The implication: when resuming with `chosen_option_ids = [1001]` (statement A marked Benar), statement A is highlighted Benar and all other statements remain neutral, not Salah-highlighted. The student can then interact with the remaining statements. This matches the MULTI_TF scoring contract — an unanswered statement does not receive partial points but is not counted as "wrong" for display purposes either.

### H2. Drawer initial state

The drawer button EJS currently uses `q.chosen_option_id` for colour. MULTI_TF questions may not have `chosen_option_id` set. Change the initial class computation:

```ejs
class="drawerBtn h-10 rounded-xl border-2 font-bold text-sm transition-all
  <%= (q.question_type === 'MULTI_TF'
        ? (q.chosen_option_ids !== null && q.chosen_option_ids !== undefined)
        : !!q.chosen_option_id)
      ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
      : 'border-slate-300 bg-white text-slate-600' %>">
```

### H3. `syncDrawerButtons()`

In the `syncDrawerButtons` block, add:
```js
var hasMultiTf = section.querySelector('.multitf-btn.multitf-active');
var done = !!(hasRadio || tfAnswered || hasComplex || hasCheckbox || hasMultiTf);
```

### H4. `updateAnswered()` function

Add a MULTI_TF count block after the existing CHECKBOX block:
```js
const multiTfQids = new Set(
  Array.from(document.querySelectorAll('.multitf-btn.multitf-active'))
    .map(btn => btn.getAttribute('data-multitf-qid'))
);
multiTfQids.forEach(qid => { answered++; });
```

### H5. `toggleMultiTf(btn)` — JavaScript handler

```js
function toggleMultiTf(btn) {
  const qid  = btn.getAttribute('data-multitf-qid');
  const oid  = btn.getAttribute('data-multitf-oid');
  const val  = btn.getAttribute('data-multitf-val'); // 'benar' or 'salah'

  const row = document.getElementById('multitf_row_' + qid + '_' + oid);
  const benarBtn = row.querySelector('[data-multitf-val="benar"]');
  const salahBtn = row.querySelector('[data-multitf-val="salah"]');

  const isAlreadyActive = btn.classList.contains('multitf-active');

  // Deactivate both buttons for this statement
  [benarBtn, salahBtn].forEach(b => {
    b.classList.remove('multitf-active',
      'border-teal-500','bg-teal-100','text-teal-700',
      'border-rose-500','bg-rose-100','text-rose-700');
    b.classList.add('border-slate-200','bg-white','text-slate-500');
  });

  if (!isAlreadyActive) {
    // Activate the clicked button
    btn.classList.add('multitf-active');
    if (val === 'benar') {
      btn.classList.remove('border-slate-200','bg-white','text-slate-500');
      btn.classList.add('border-teal-500','bg-teal-100','text-teal-700');
    } else {
      btn.classList.remove('border-slate-200','bg-white','text-slate-500');
      btn.classList.add('border-rose-500','bg-rose-100','text-rose-700');
    }
  }

  // Collect all Benar selections for this question
  const selectedIds = Array.from(
    document.querySelectorAll(`.multitf-btn.multitf-active[data-multitf-qid="${qid}"][data-multitf-val="benar"]`)
  ).map(b => Number(b.getAttribute('data-multitf-oid')));

  updateAnswered();
  saveBackupToLocalStorage();

  fetch('/student/attempts/<%= attempt.id %>/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: Number(qid), option_ids: selectedIds })
  }).catch(e => {
    console.error('Autosave MULTI_TF failed:', e);
    toast('Koneksi terputus. Jawaban tersimpan di perangkat Anda.');
  });
}
```

### H6. `saveBackupToLocalStorage()` — add MULTI_TF

Add a MULTI_TF group after the CHECKBOX group:
```js
// MULTI_TF
const multiTfQidsSet = new Set(
  Array.from(document.querySelectorAll('.multitf-btn'))
    .map(b => b.getAttribute('data-multitf-qid'))
);
multiTfQidsSet.forEach(qid => {
  const selectedIds = Array.from(
    document.querySelectorAll(`.multitf-btn.multitf-active[data-multitf-qid="${qid}"][data-multitf-val="benar"]`)
  ).map(b => Number(b.getAttribute('data-multitf-oid')));
  answers.push({
    question_id: Number(qid),
    option_ids: selectedIds,
    type: 'MULTI_TF',
    answered_at: new Date().toISOString()
  });
});
```

### H7. Page-load JS init — restore previous answers (authoritative; no EJS pre-render)

This block is the **sole authority** for button visual state on page load (Finding 9 resolution). EJS renders buttons with neutral classes only; this script applies active styling from server state.

```js
// MULTI_TF: restore button state from server data
document.querySelectorAll('.multitf-btn[data-multitf-val="benar"]').forEach(benarBtn => {
  const qid = Number(benarBtn.getAttribute('data-multitf-qid'));
  const oid = Number(benarBtn.getAttribute('data-multitf-oid'));
  const dataEl = document.getElementById('multitf_data_' + qid);
  if (!dataEl) return;
  const idsRaw = dataEl.getAttribute('data-ids');
  if (idsRaw === 'null' || idsRaw === null) return; // never answered — leave neutral

  let ids;
  try { ids = JSON.parse(idsRaw); } catch(_) { return; }
  if (!Array.isArray(ids)) return;

  const row = document.getElementById('multitf_row_' + qid + '_' + oid);
  if (!row) return;
  const salahBtn = row.querySelector('[data-multitf-val="salah"]');

  if (ids.includes(oid)) {
    // Student marked this statement Benar
    benarBtn.classList.add('multitf-active','border-teal-500','bg-teal-100','text-teal-700');
    benarBtn.classList.remove('border-slate-200','bg-white','text-slate-500');
  }
  // Statements NOT in ids remain neutral — they may have been untouched,
  // or the student may have submitted the question without choosing Benar for them.
  // We do NOT mark them Salah on load; the student must click Salah explicitly.
  // This matches the scoring contract: an unanswered statement is not counted as wrong.
});
```

**Consequence:** A statement that was explicitly answered Salah (the student clicked Salah, which triggers autosave with the array not containing that ID) will appear neutral on resume. The student sees neutral and must re-click Salah to restore it. This is an acceptable UX trade-off given the current data model stores only Benar IDs. The scoring is unaffected because the server-side scoring derives Salah from "not in the array" — not from any explicit Salah flag.

---

## I. `src/views/student/attempt_result.ejs` — Student result review

**Route change:** Add a supplementary query in `src/routes/student.js` inside `GET /attempts/:id/result`:

```js
let multiTfDetails = {};
if (review.length > 0) {
  const multiTfQids = review
    .filter(r => r.question_type === 'MULTI_TF')
    .map(r => r.question_id);
  if (multiTfQids.length > 0) {
    const ph = multiTfQids.map((_, i) => `$${i + 1}`).join(',');
    const [optRows] = await pool.query(
      `SELECT question_id, id AS option_id, option_label, option_text, is_correct
       FROM options WHERE question_id IN (${ph}) ORDER BY question_id, option_label`,
      multiTfQids
    );
    for (const o of optRows) {
      if (!multiTfDetails[o.question_id]) multiTfDetails[o.question_id] = [];
      multiTfDetails[o.question_id].push(o);
    }
  }
}
// Wrap in try/catch; on failure, multiTfDetails stays {}, causing graceful degradation (no detail shown)
res.render('student/attempt_result', { ..., multiTfDetails });
```

**View change in `attempt_result.ejs`:**

```ejs
<% if (r.question_type === 'MULTI_TF') {
     let selectedIds = [];
     try { if (r.selected_option_ids) selectedIds = JSON.parse(r.selected_option_ids).map(Number); }
     catch(_) {}
     const stmts = multiTfDetails[r.question_id] || [];
%>
  <div class="mt-3 space-y-2">
    <div class="text-xs font-semibold text-slate-500 mb-1">Detail per pernyataan:</div>
    <% stmts.forEach(stmt => {
         const studentSaidBenar = selectedIds.includes(Number(stmt.option_id));
         const isStmtCorrect = (studentSaidBenar === !!stmt.is_correct);
    %>
    <div class="flex items-center gap-3 p-3 rounded-xl <%= isStmtCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200' %>">
      <span class="w-6 h-6 rounded-lg bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0">
        <%= stmt.option_label %>
      </span>
      <div class="flex-1 text-sm text-slate-700"><%- stmt.option_text %></div>
      <div class="text-xs font-semibold <%= isStmtCorrect ? 'text-green-600' : 'text-red-600' %>">
        Jawaban: <%= studentSaidBenar ? 'Benar' : 'Salah' %>
        (Kunci: <%= stmt.is_correct ? 'Benar' : 'Salah' %>)
        <%= isStmtCorrect ? '✓' : '✗' %>
      </div>
    </div>
    <% }) %>
    <div class="text-xs text-slate-500 mt-1">
      Poin diperoleh: <strong><%= r.partial_points || 0 %></strong> dari <%= r.points %> 
      (<%= stmts.filter(s => { const sb = selectedIds.includes(Number(s.option_id)); return sb === !!s.is_correct; }).length %>/<%= stmts.length %> pernyataan benar)
    </div>
  </div>
<% } else { %>
  <%# ... existing chosen/correct_text display ... %>
<% } %>
```

---

## J. `src/views/teacher/attempt_detail.ejs` — Teacher review

The view receives `answers` with the new fields `question_type`, `selected_option_ids`, `partial_points` (after D7). The existing `optionsMap` query and `options: opts` attachment in the route already supply per-question options. Add a MULTI_TF branch in the answer rendering loop:

```ejs
<% if (a.question_type === 'MULTI_TF') {
     let selectedIds = [];
     try { if (a.selected_option_ids) selectedIds = JSON.parse(a.selected_option_ids).map(Number); }
     catch(_) {}
%>
  <div class="mt-2 space-y-1">
    <% (a.options || []).forEach(opt => {
         const studentSaidBenar = selectedIds.includes(Number(opt.id));
         const isStmtCorrect = (studentSaidBenar === !!opt.is_correct);
    %>
    <div class="flex items-center gap-2 text-xs p-2 rounded-lg
      <%= isStmtCorrect ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200' %>">
      <span class="font-bold text-slate-600"><%= opt.option_label %></span>
      <span class="flex-1 text-slate-600"><%- opt.option_text %></span>
      <span class="font-semibold <%= isStmtCorrect ? 'text-emerald-600' : 'text-rose-600' %>">
        Jawab: <%= studentSaidBenar ? 'B' : 'S' %> / Kunci: <%= opt.is_correct ? 'B' : 'S' %>
      </span>
    </div>
    <% }) %>
    <div class="text-xs text-slate-500 pt-1">
      Poin parsial: <strong><%= a.partial_points || 0 %> / <%= a.points %></strong>
      (<%= a.is_correct ? 'Semua benar' : 'Sebagian benar' %>)
    </div>
  </div>
<% } %>
```

**Admin view (`src/views/admin/attempt_detail.ejs`):** Apply the same MULTI_TF rendering block, now enabled by the admin route query update in D8.

---

## K. Word template update

`generate-word-template.js` exists at the project root and uses the `docx` package. Update it to add a MULTI_TF example question demonstrating:
- `TIPE: MULTI_TF`
- Statements `A.` through `D.`
- `KUNCI_A: B`, `KUNCI_B: S`, `KUNCI_C: B`, `KUNCI_D: B` lines

After editing, run:
```
node generate-word-template.js
```
to regenerate `src/public/templates/import_template_word.docx`. Commit the updated `.docx` binary.

---

## Error handling summary

| Operation | Failure condition | Recovery | Logged | Caller receives |
|---|---|---|---|---|
| Scoring (submission-utils) | DB UPDATE fails inside transaction | Rollback; `finalizeAttemptWithBackup` retries up to 3× | `console.error` | Error thrown, attempt stays SUBMITTING |
| Autosave endpoint | DB UPDATE fails | 500 JSON response | No (matches existing pattern) | `{ ok: false, message: '...' }` |
| Bank POST/PUT | Validation error | Redirect with flash | No | Flash + redirect |
| Import preview | Malformed correct format | Row added to `errors[]` | No | Error row in preview UI |
| Import commit | DB INSERT fails | Transaction rollback, flash error | `console.error` | Flash + redirect to import page |
| Review supplementary query | DB fails | No MULTI_TF details shown; existing review renders normally | `console.error` (wrap in try/catch) | Partial render (graceful degradation) |

---

## Testability

**Unit-testable:**
- `submission-utils.js` MULTI_TF scoring branch: pure logic, testable with mock `correctOptionsMap` and `attempt_answers`. AC-4, AC-5, AC-6 each correspond to one test case.
- Import preview parsing (`buildImportPreview`, `question_bank.js` preview loop): pure data-transform, testable in isolation.

**Integration-testable:**
- Full create/save/score flow via API requests: POST question → take attempt → POST answers → submit → verify `partial_points` in DB.
- Word parser: feed sample `.docx` bytes to the first handler, assert session object.

**Difficult to unit-test (integration only):**
- EJS rendering (requires running Express or view harness).
- `toggleMultiTf` JS and drawer sync (requires browser or jsdom).

---

## Review finding responses (round 2 — from design-review.json)

| # | Severity | Action | Notes |
|---|---|---|---|
| 1 | HIGH | **Addressed** | Section A now explicitly removes the outer `const correctIds` variable and replaces it with `const allOpts`. Each branch (`COMPLEX/CHECKBOX`, `MULTI_TF`, MCQ/TRUE_FALSE) derives only what it needs from `allOpts`. The MCQ/TRUE_FALSE `else` branch uses `aa.is_correct` directly and does not access `allOpts` at all — confirming zero regression. |
| 2 | HIGH | **Addressed** | Section H1 decision: EJS renders buttons with neutral classes only (no server-side pre-render of active state). Section H7 is the sole authority for restoring active state on page load. When `chosen_option_ids = [1001]`, statement A gets Benar-highlighted, all other statements remain neutral. The consequence (Salah answers not visually restored on resume) is documented and accepted. |
| 3 | HIGH | **Addressed** | Section D5 now shows the explicit updated item assignment with `correctMap: q.correctMap || null`. Section D5 also shows `startNew()` updated to initialise `correctMap: null`. |
| 4 | MEDIUM | **Addressed** | Section C2 now derives `qtypeForGuard = req.body.question_type \|\| 'MCQ'` before any guard fires, using it for the type-specific validation. The full DB-fallback `qtype` derivation remains in its current position for use in the update/upsert logic. |
| 5 | MEDIUM | **Addressed** | Section C3 now wraps the existing `correctLabels` validation in an `else` branch (`if (rawQtype === 'MULTI_TF') { ... } else { /* existing */ }`), ensuring the `A:B,B:S` format never reaches the `['A','B','C','D','E']` membership check. |
| 6 | MEDIUM | **Addressed** | Section D3 applies the identical guard to `buildImportPreview`: the `correctLabels.length === 0` rejection is wrapped in `else { ... }` and only fires for non-MULTI_TF types. |
| 7 | MEDIUM | **Addressed** | Section B2 audit confirmed: `attempt_take.ejs` uses `q.chosen_option_ids` in exactly two EJS lines (471, 473), both guarded by `&&`. The `saveBackupToLocalStorage()` function reads from DOM only. The null-change is safe. |
| 8 | MEDIUM | **Addressed** | Section D8 now shows the exact `admin.js` query update with `aa.selected_option_ids`, `aa.partial_points`, `q.question_type` added, mirroring D7. |
| 9 | NIT | **Addressed** | Section H1 decision: EJS does not pre-render active state; H7 JS init is authoritative and sole. No dual initialisation. |
| 10 | NIT | **Addressed** | Section C6 filter changed to `.filter(lbl => opts[lbl] && opts[lbl].text)` to exclude empty-text option rows from the `correct` string. |
