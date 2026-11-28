# MULTI_TF support in question bank — input, edit, and import

This commit adds a new question type, MULTI_TF (Multi Benar/Salah), to the question bank subsystem. Each question carries 2–5 labeled statements (A–E), and each statement independently carries a Benar/Salah (true/false) key. Scoring is proportional: students score `floor(correct_statements / total_statements × points)`. The change touches the POST and PUT save handlers, the GET edit route, the Excel/CSV import pipeline (preview + commit), the export/template generators, and both EJS views (`question_bank_new.ejs`, `question_bank_edit.ejs`).

**Watch for:**
- Dead code in the export route (line 141 builds `correctStr` then immediately overwrites it on line 144 — confirmed).
- The MULTI_TF key-panel in `question_bank_new.ejs` and `question_bank_edit.ejs` renders all five key rows (A–E) without hiding C/D/E when those statement fields are empty; a user can set a key for a non-existent statement — confirmed but server-side safe.
- `node --check` on `.ejs` files fails with an `ERR_UNKNOWN_FILE_EXTENSION` error (Node 24 treats `.ejs` as ESM); this is a tooling limitation, not a syntax issue. The route JS passes `node --check` cleanly.

**Verdict**: APPROVED

---

## High-level view

MULTI_TF stores its per-statement keys in `question_bank_options.is_correct` — the same table used by all other question types — with correctness encoded as a boolean per row. The `correct_A` through `correct_E` radio inputs feed a `correctMap` object on the server that is translated to `is_correct` values at insert/upsert time. No new table or schema change is required.

The GET `/:id/edit` route now builds a `correct_map` object (keyed by label, valued as `!!is_correct`) from the existing options rows and passes it to the view. The EJS uses it to pre-check the matching Benar/Salah radio on page load. This roundtrip is correct for existing MULTI_TF questions.

For MCQ, CHECKBOX, and TRUE_FALSE questions opened in the edit form, `correct_map` will contain values for all stored option labels (since all options have `is_correct`). The MULTI_TF key radios are hidden but not disabled, so they will be submitted in the POST body. The PUT handler ignores `correct_A`–`correct_E` when `qtype !== 'MULTI_TF'`, so no data corruption occurs — but it is a latent coupling risk if the server-side check is ever removed.

The import preview correctly validates MULTI_TF rows (minimum 2 key pairs, `A:B,B:S` format), and the commit handler has a fallback parser for cases where `correctMap` is missing from the preview session. The export and template generator both handle MULTI_TF, with the template including a sample row.

---

<details>
<summary>Issues (3)</summary>

1. **Dead code in export (confirmed)** — Line 141 of `question_bank.js` assigns `correctStr` for MULTI_TF then line 144 immediately overwrites it with the correct version. The first assignment is never used. Remove line 141 to eliminate confusion.

2. **Key-panel rows C/D/E always visible (confirmed)** — In both `question_bank_new.ejs` and `question_bank_edit.ejs`, the MULTI_TF key panel renders all five label rows (A–E) regardless of whether statements C/D/E are filled. A user can select Benar/Salah for a statement that has no text. The server skips option insert when text is empty, so no corrupt row is written, but the validation message "MULTI_TF: minimal 2 pernyataan wajib memiliki kunci jawaban" can fire even if the user selected 2 keys for real statements but also left a third key set for an empty statement. The JS validation counts all selected keys without checking if the corresponding option field has content. Fix: in the submit validator, skip labels where the option textarea is empty.

3. **Non-ASCII characters in JS string literals (confirmed)** — Lines 141, 207, and 283 contain UTF-8 arrow/dash characters (→, —, °) inside JavaScript string literals (not just comments). Node's `--check` passes, but depending on how the file is served or transpiled, mojibake could appear in exported Excel cells. The comment-only occurrences are harmless; the string literals at lines 207 (`'- MULTI_TF: kunci format A:B,B:S,C:B — B=Benar S=Salah'`) and 283 (`'Contoh TRUE_FALSE: Air mendidih pada 100°C...'`) should use ASCII equivalents (`-`, `derajat C`) for safety.

</details>

---

<details>
<summary>Details</summary>

## Stale option rows on edit (pre-existing, confirmed unintroduced)

The PUT handler uses `ON CONFLICT … DO UPDATE` (upsert) for all question types. There is no `DELETE FROM question_bank_options WHERE question_bank_id = $1` before the upsert loop. If a MULTI_TF question previously had statement E and the user removes the text during an edit, the old E row stays in `question_bank_options` with its previous `is_correct` value. This pattern was already present for MCQ/CHECKBOX before this commit, so it is out of scope for this review, but it is worth noting now that MULTI_TF makes "adding then removing statements" a realistic edit path.

## Hidden-but-not-disabled correct_X radios in edit form

For MCQ, CHECKBOX, and TRUE_FALSE questions opened in the edit form, `correct_map` is populated from all stored option labels (every row has `is_correct`). The EJS pre-checks the MULTI_TF key radios using those values, even though the question is not MULTI_TF. The MULTI_TF panel is hidden, but the radios are not disabled. On form submit, `correct_A` through `correct_E` are included in the POST body. The PUT handler ignores them when `qtype !== 'MULTI_TF'`, so no corruption occurs today, but the radios effectively carry a shadow form state that could cause silent data issues if the guard is ever removed.

## Key-panel rows C/D/E always visible

The MULTI_TF key panel renders all five label rows in both `question_bank_new.ejs` and `question_bank_edit.ejs`. There is no JS that hides the C/D/E key rows when the corresponding statement textareas are empty. A user who fills only statements A and B but sets a key for C will trigger the "minimal 2 pernyataan" validation even though only A and B have real content. The submit validator counts selected keys across all five labels without checking whether the matching option textarea has content. The server safely skips the insert for empty-text options, so no corrupt row is written, but the UX is misleading.

## Dead code in export correctStr

The export route builds `correctStr` for MULTI_TF twice:

```js
// Line 141 — dead, immediately overwritten
correctStr = correctEntries.map(([lbl, v]) => lbl + ':' + (v.correct ? 'B' : 'S')).join(',');
// Line 144 — the actual value used
correctStr = allLabels.filter(lbl => opts[lbl]).map(lbl => lbl + ':' + (opts[lbl].correct ? 'B' : 'S')).join(',');
```

Line 141 uses `correctEntries` (filtered to only `is_correct=true` rows), which would produce an incomplete string for MULTI_TF (missing Salah-keyed statements). Line 144 iterates all labels and is correct. Line 141 should be removed.

## Non-ASCII characters in XLSX string literals

Two string literals inside XLSX cell data arrays contain non-ASCII characters: line 207 (`'- MULTI_TF: kunci format A:B,B:S,C:B — B=Benar S=Salah'`) uses an em-dash, and line 283 (`'Contoh TRUE_FALSE: Air mendidih pada 100°C...'`) uses a degree sign. XLSX handles UTF-8, so the Excel output is not corrupted, but the commit message's own convention check ("tidak ada emoji di JS string literals") extends to non-ASCII punctuation. These should use ASCII equivalents (`-`, `derajat C`) to match that convention.

</details>

---

<details>
<summary>File map</summary>

| File | Change |
|---|---|
| `src/routes/question_bank.js` | MULTI_TF support in POST, PUT, GET edit, import preview, import commit, export, and template generator |
| `src/views/teacher/question_bank_new.ejs` | MULTI_TF type radio + per-statement key panel + updated submit validator and `updateBankForm` |
| `src/views/teacher/question_bank_edit.ejs` | MULTI_TF badge + key panel with EJS pre-population + updated init IIFE + updated Summernote field list |
| `src/views/teacher/question_bank_import.ejs` | Format documentation updated to mention MULTI_TF and the `A:B,B:S` key format |

Full diff: `git -C d:\WEBSITE\cbt diff HEAD~1...HEAD`

</details>
