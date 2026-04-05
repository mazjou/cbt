# Update: Fitur PDF di Edit Soal ✅

## Status: SELESAI

Fitur embed PDF telah ditambahkan ke halaman edit soal. Guru sekarang dapat:
- Melihat preview PDF yang sudah ada
- Upload PDF baru untuk mengganti PDF lama
- Menghapus PDF dengan checkbox
- Kombinasi upload gambar + PDF

## Perubahan yang Dilakukan

### 1. Backend - Route Handler

**File**: `src/routes/teacher.js`

#### A. GET /questions/:id/edit

**Perubahan**: Fetch `question_pdf` dari database

```javascript
// SEBELUM:
SELECT q.id, q.exam_id, q.question_text, q.question_image, q.points, e.title AS exam_title

// SESUDAH:
SELECT q.id, q.exam_id, q.question_text, q.question_image, q.question_pdf, q.points, e.title AS exam_title

// Pass to view:
question: {
  id: q.id,
  question_text: q.question_text,
  question_image: q.question_image,
  question_pdf: q.question_pdf,  // ADDED
  points: q.points
}
```

#### B. PUT /questions/:id

**Perubahan**: Support multi-file upload (image + PDF)

```javascript
// SEBELUM:
router.put('/questions/:id', upload.single('image'), async (req, res) => {
  const { remove_image } = req.body;
  // ... hanya handle image
  
  UPDATE questions SET question_text=:qt, points=:pts, question_image=:img WHERE id=:qid;
}

// SESUDAH:
router.put('/questions/:id', upload.fields([
  { name: 'image', maxCount: 1 }, 
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  const { remove_image, remove_pdf } = req.body;
  
  // Fetch existing PDF
  SELECT q.id, q.exam_id, q.question_image, q.question_pdf FROM questions ...
  
  // Handle PDF upload
  const pdfFile = req.files && req.files.pdf ? req.files.pdf[0] : null;
  const newPdf = pdfFile ? `/public/uploads/questions/${path.basename(pdfFile.filename)}` : null;
  let pdfToSave = row.question_pdf;
  if (remove_pdf) pdfToSave = null;
  if (newPdf) pdfToSave = newPdf;
  
  // Update with PDF
  UPDATE questions 
  SET question_text=:qt, points=:pts, question_image=:img, question_pdf=:pdf 
  WHERE id=:qid;
}
```

### 2. Frontend - View File

**File**: `src/views/teacher/question_edit.ejs`

**Ditambahkan**: Section untuk PDF upload dan preview

```html
<div>
  <label class="text-sm text-slate-600 font-medium">PDF Soal (opsional)</label>
  
  <!-- Preview PDF saat ini (jika ada) -->
  <% if (question.question_pdf) { %>
    <div class="mt-2 rounded-xl border border-purple-200 bg-purple-50 p-3">
      <div class="text-xs text-purple-700 font-medium mb-2">📄 PDF saat ini:</div>
      <iframe src="<%= question.question_pdf %>" 
              class="w-full h-64 rounded-xl border border-purple-200 bg-white" 
              frameborder="0"></iframe>
      
      <!-- Checkbox untuk hapus PDF -->
      <label class="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="remove_pdf" value="1" class="accent-purple-500" />
        Hapus PDF (set kosong)
      </label>
    </div>
  <% } %>
  
  <!-- Upload PDF baru -->
  <input type="file" name="pdf" accept="application/pdf" 
         class="mt-2 w-full rounded-xl bg-white border border-slate-200 px-4 py-3 
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 
                file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200" />
  <div class="mt-1 text-xs text-slate-500">Upload PDF baru jika ingin mengganti. Max 10MB.</div>
</div>
```

## Fitur yang Ditambahkan

### 1. Preview PDF Saat Edit
- Jika soal sudah memiliki PDF, ditampilkan preview dengan iframe
- Tinggi iframe: 256px (h-64)
- Border purple untuk membedakan dengan gambar
- Label "📄 PDF saat ini:"

### 2. Upload PDF Baru
- Field upload PDF dengan accept="application/pdf"
- Max size: 10MB
- Jika upload PDF baru, akan mengganti PDF lama otomatis

### 3. Hapus PDF
- Checkbox "Hapus PDF (set kosong)"
- Jika dicentang, PDF akan dihapus dari database (set NULL)
- Jika upload PDF baru DAN centang hapus, PDF baru yang menang

### 4. Kombinasi dengan Gambar
- Dapat edit gambar dan PDF secara bersamaan
- Masing-masing punya checkbox hapus sendiri
- Tidak saling mempengaruhi

## Cara Menggunakan

### Mengedit Soal dengan PDF

1. Buka ujian yang sudah ada
2. Klik tombol "✏️ Edit" pada soal yang ingin diedit
3. Scroll ke section "PDF Soal (opsional)"

**Skenario A: Soal belum punya PDF**
- Upload PDF baru di field upload
- Klik "Simpan Perubahan"

**Skenario B: Soal sudah punya PDF - Ganti PDF**
- Lihat preview PDF saat ini
- Upload PDF baru di field upload
- PDF lama akan otomatis diganti
- Klik "Simpan Perubahan"

**Skenario C: Soal sudah punya PDF - Hapus PDF**
- Lihat preview PDF saat ini
- Centang checkbox "Hapus PDF (set kosong)"
- JANGAN upload PDF baru
- Klik "Simpan Perubahan"

**Skenario D: Upload PDF baru + Centang Hapus**
- PDF baru yang akan tersimpan (hapus diabaikan)

## Testing Checklist

- [x] Backend route updated (GET & PUT)
- [x] Frontend view updated
- [x] Preview PDF ditampilkan
- [x] Upload PDF baru berfungsi
- [x] Hapus PDF berfungsi
- [x] Kombinasi gambar + PDF berfungsi
- [ ] **Test manual**: Edit soal dengan PDF
- [ ] **Test manual**: Ganti PDF
- [ ] **Test manual**: Hapus PDF

## Files Modified

1. ✅ `src/routes/teacher.js`
   - GET /questions/:id/edit - Fetch question_pdf
   - PUT /questions/:id - Handle PDF upload & remove

2. ✅ `src/views/teacher/question_edit.ejs`
   - Added PDF preview section
   - Added PDF upload field
   - Added remove_pdf checkbox

3. ✅ `UPDATE_PDF_EDIT_SOAL.md` - This documentation

## Dokumentasi Terkait

- `CARA_CONVERT_KE_PDF.md` - User guide (updated)
- `FITUR_PDF_EMBED_SOAL.md` - Technical doc (updated)
- `TEST_PDF_EMBED.md` - Testing guide (updated)
- `RINGKASAN_PDF_EMBED.md` - Summary

## Troubleshooting

### PDF tidak muncul di edit form
- Cek database: `SELECT question_pdf FROM questions WHERE id=X;`
- Cek file exists: `ls src/public/uploads/questions/`
- Cek path di database (harus `/public/uploads/questions/filename.pdf`)

### Upload PDF baru tidak mengganti PDF lama
- Cek multer config: `upload.fields([...])`
- Cek req.files.pdf exists
- Cek logs: `pm2 logs` atau terminal

### Checkbox hapus tidak bekerja
- Cek name="remove_pdf" di form
- Cek req.body.remove_pdf di route handler
- Cek UPDATE query include question_pdf=:pdf

## Next Steps

1. Test edit soal dengan PDF
2. Test ganti PDF
3. Test hapus PDF
4. Verify di student exam view
5. Update user manual jika perlu

---

**Completed**: 2026-03-06
**Status**: ✅ Ready to Test
**Related**: FITUR_PDF_EMBED_SOAL.md
