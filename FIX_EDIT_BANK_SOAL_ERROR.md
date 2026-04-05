# Fix: Error Edit Bank Soal

## Problem
Error 500 saat mengakses `/teacher/question-bank/1/edit`:
```
GET /teacher/question-bank/1/edit 500 80.598 ms - 148
```

## Root Cause
- File template `question_bank_edit.ejs` tidak ada
- Route PUT tidak include field `chapter` yang baru ditambahkan

## Solution

### 1. Membuat File Edit Template
**File**: `src/views/teacher/question_bank_edit.ejs`
- Copy dari `question_bank_new.ejs` dan modifikasi
- Pre-fill semua field dengan data existing
- Include field `chapter` (Bab/Materi)
- Tampilkan gambar dan PDF existing dengan opsi hapus
- Support paste image dari clipboard

### 2. Update Route PUT
**File**: `src/routes/question_bank.js`
- Tambahkan `chapter` ke destructuring req.body
- Update SQL query untuk include kolom `chapter`
- Set chapter ke NULL jika kosong

## Changes Made

### Route Changes
```javascript
// Destructuring dengan chapter
const { subject_id, chapter, question_text, ... } = req.body;

// SQL Update dengan chapter
UPDATE question_bank
SET subject_id = :sid, chapter = :chap, question_text = :qt, ...
WHERE id = :id;
```

### Template Features
- Form edit lengkap dengan semua field
- Pre-filled dengan data existing
- Field chapter (opsional)
- Preview gambar dan PDF existing
- Checkbox untuk hapus gambar/PDF
- Paste image support
- Validasi client-side

## Testing

1. Buka halaman bank soal
2. Klik tombol "Edit" pada soal
3. Form edit harus muncul dengan data ter-fill
4. Update field chapter
5. Submit form
6. Soal harus ter-update dengan chapter baru

## Status
✅ Fixed - Edit bank soal sekarang berfungsi dengan field chapter

## Related Files
- `src/views/teacher/question_bank_edit.ejs` (created)
- `src/routes/question_bank.js` (updated)
- `FITUR_BAB_MATERI_BANK_SOAL.md` (documentation)
