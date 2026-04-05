# Fitur Embed PDF di Soal Ujian

## Deskripsi
Fitur ini memungkinkan guru untuk meng-upload file PDF yang akan ditampilkan (embed) di dalam soal ujian. PDF akan ditampilkan menggunakan iframe sehingga siswa dapat melihat konten PDF langsung di halaman ujian tanpa perlu download.

## Cara Menggunakan

### 1. Menambah Soal dengan PDF

Saat membuat soal baru di halaman detail ujian:

1. Isi pertanyaan seperti biasa
2. Di bagian **"PDF Soal (opsional - embed PDF)"**, klik tombol "Choose File"
3. Pilih file PDF yang ingin di-upload (maksimal 10MB)
4. Isi opsi jawaban A-E
5. Klik "Simpan Soal"

### 2. Mengedit Soal dengan PDF

Saat mengedit soal yang sudah ada:

1. Klik tombol "✏️ Edit" pada soal yang ingin diedit
2. Jika soal sudah memiliki PDF, akan ditampilkan preview PDF saat ini
3. Untuk mengganti PDF:
   - Upload PDF baru di field "PDF Soal (opsional)"
   - PDF lama akan otomatis diganti
4. Untuk menghapus PDF:
   - Centang checkbox "Hapus PDF (set kosong)"
   - Jangan upload PDF baru
5. Klik "Simpan Perubahan"

### 3. Melihat PDF di Preview Soal (Guru)

Setelah soal disimpan, PDF akan ditampilkan di bagian preview soal dengan:
- Label "📄 PDF Soal:"
- Iframe yang menampilkan konten PDF
- Tinggi iframe: 384px (h-96)
- Border dan shadow sesuai warna tema soal

### 4. Melihat PDF Saat Ujian (Siswa)

Saat siswa mengerjakan ujian:
- PDF akan ditampilkan di bawah teks pertanyaan
- Siswa dapat scroll di dalam iframe untuk melihat seluruh konten PDF
- PDF tidak dapat di-download (tergantung browser)

## Spesifikasi Teknis

### Database
- Tabel: `questions`
- Kolom baru: `question_pdf VARCHAR(255) NULL`
- Posisi: Setelah kolom `question_image`

### File Upload
- Lokasi: `src/public/uploads/questions/`
- Format: PDF only (`accept="application/pdf"`)
- Ukuran maksimal: 10MB
- Nama file: `timestamp_sanitized_filename.pdf`

### Route Handler
- Route: `POST /teacher/exams/:id/questions`
- Multer config: `upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }])`
- Field database: `question_pdf`

### View Files Updated
1. `src/views/teacher/exam_detail.ejs` - Form upload & preview PDF
2. `src/views/student/attempt_take.ejs` - Display PDF saat ujian
3. `src/routes/teacher.js` - Handler upload PDF
4. `src/routes/student.js` - Fetch question_pdf field

## Migrasi Database

Jalankan SQL berikut untuk menambahkan kolom `question_pdf`:

```sql
ALTER TABLE questions 
ADD COLUMN question_pdf VARCHAR(255) NULL AFTER question_image;
```

File SQL: `sql/add_question_pdf.sql`

## Catatan Penting

1. **Ukuran File**: Maksimal 10MB per PDF. Untuk file lebih besar, compress terlebih dahulu.

2. **Browser Compatibility**: 
   - Chrome/Edge: Full support
   - Firefox: Full support
   - Safari: Full support
   - Mobile browsers: Mungkin perlu download PDF

3. **Security**: 
   - PDF disimpan di folder public, dapat diakses langsung via URL
   - Tidak ada validasi konten PDF (pastikan PDF aman)
   - Siswa tidak dapat copy/paste dari PDF (tergantung browser)

4. **Performance**:
   - PDF di-load via iframe, tidak di-embed langsung
   - Untuk PDF besar, loading mungkin lambat
   - Pertimbangkan compress PDF sebelum upload

5. **Kombinasi dengan Gambar**:
   - Soal dapat memiliki gambar DAN PDF sekaligus
   - Gambar ditampilkan terlebih dahulu, kemudian PDF

## Troubleshooting

### PDF tidak muncul
- Cek apakah file ter-upload di `src/public/uploads/questions/`
- Cek permission folder (harus writable)
- Cek browser console untuk error

### PDF tidak bisa di-scroll
- Pastikan iframe memiliki height yang cukup (default: h-96 = 384px)
- Adjust height di view file jika perlu

### Upload gagal
- Cek ukuran file (max 10MB)
- Cek format file (harus .pdf)
- Cek disk space server

## Update Log

**2026-03-06**: Fitur PDF embed ditambahkan
- Database migration: `question_pdf` column
- Upload handler: Support PDF upload
- View updates: Display PDF in teacher preview & student exam
- Directory created: `src/public/uploads/questions/pdf/`
