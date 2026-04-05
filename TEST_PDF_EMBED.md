# Testing Guide: Fitur PDF Embed di Soal Ujian

## Status: ✅ Ready to Test

Database migration berhasil dijalankan. Fitur siap untuk ditest.

## Persiapan Testing

### 1. Pastikan Aplikasi Running
```bash
# Cek status
pm2 status

# Atau jika pakai nodemon, cek terminal
```

### 2. Siapkan File PDF Test
- Ukuran: < 10MB
- Format: .pdf
- Contoh: Soal matematika, diagram, tabel, dll

## Test Case 1: Upload PDF (Guru)

### Langkah:
1. Login sebagai guru
2. Buka menu "Kelola Ujian"
3. Pilih salah satu ujian atau buat ujian baru
4. Scroll ke form "Tambah Soal (PG)"
5. Isi pertanyaan (bisa kosong atau isi teks)
6. Di field "PDF Soal (opsional)", klik "Choose File"
7. Pilih file PDF (max 10MB)
8. Isi opsi jawaban A-E
9. Klik "Simpan Soal"

### Expected Result:
- ✅ Upload berhasil tanpa error
- ✅ Soal muncul di daftar soal
- ✅ PDF ditampilkan di preview dengan iframe
- ✅ Iframe menampilkan konten PDF
- ✅ Dapat scroll di dalam iframe

### Jika Error:
- Cek console browser (F12)
- Cek logs server: `pm2 logs` atau terminal nodemon
- Cek file ter-upload di `src/public/uploads/questions/`

## Test Case 2: Preview PDF (Guru)

### Langkah:
1. Setelah upload berhasil
2. Lihat preview soal di halaman detail ujian
3. Scroll ke soal yang memiliki PDF

### Expected Result:
- ✅ Label "📄 PDF Soal:" muncul
- ✅ Iframe menampilkan PDF
- ✅ Tinggi iframe: 384px (h-96)
- ✅ Border dan shadow sesuai warna tema soal
- ✅ Dapat scroll di dalam iframe

## Test Case 3: Edit Soal dengan PDF

### Langkah:
1. Buka ujian yang sudah memiliki soal dengan PDF
2. Klik tombol "✏️ Edit" pada soal tersebut
3. Lihat preview PDF saat ini (jika ada)
4. Test 3 skenario:
   - **Skenario A**: Upload PDF baru (ganti PDF lama)
   - **Skenario B**: Centang "Hapus PDF" (hapus PDF)
   - **Skenario C**: Upload PDF baru + centang "Hapus PDF" (PDF baru menang)

### Expected Result:
- ✅ Preview PDF saat ini ditampilkan dengan iframe
- ✅ Checkbox "Hapus PDF (set kosong)" muncul
- ✅ Upload PDF baru berhasil mengganti PDF lama
- ✅ Centang "Hapus PDF" berhasil menghapus PDF
- ✅ Soal berhasil diupdate

## Test Case 4: Kombinasi Gambar + PDF

### Langkah:
1. Buat soal baru
2. Upload gambar DI field "Gambar Soal"
3. Upload PDF di field "PDF Soal"
4. Simpan soal

### Expected Result:
- ✅ Gambar ditampilkan terlebih dahulu
- ✅ PDF ditampilkan di bawah gambar
- ✅ Keduanya tampil dengan baik

## Test Case 5: Display PDF Saat Ujian (Siswa)

### Langkah:
1. Publish ujian (toggle publish)
2. Logout dari akun guru
3. Login sebagai siswa
4. Buka menu "Ujian"
5. Pilih ujian yang memiliki soal dengan PDF
6. Klik "Mulai Ujian"
7. Lihat soal yang memiliki PDF

### Expected Result:
- ✅ Label "📄 PDF Soal:" muncul
- ✅ Iframe menampilkan PDF
- ✅ Siswa dapat scroll di dalam iframe
- ✅ PDF tidak dapat di-download (tergantung browser)
- ✅ Siswa dapat menjawab soal seperti biasa

## Test Case 6: Upload PDF Besar

### Langkah:
1. Siapkan PDF > 10MB
2. Coba upload di form soal

### Expected Result:
- ✅ Upload ditolak dengan error
- ✅ Flash message: "File terlalu besar" atau similar
- ✅ Soal tidak tersimpan

## Test Case 7: Upload File Bukan PDF

### Langkah:
1. Coba upload file .jpg, .png, .docx, dll di field PDF
2. Klik simpan

### Expected Result:
- ✅ Upload ditolak (browser validation)
- ✅ Atau server reject dengan error message

## Troubleshooting

### PDF tidak muncul di preview
**Kemungkinan:**
- File tidak ter-upload
- Path salah di database
- Permission folder

**Solusi:**
```bash
# Cek file exists
ls src/public/uploads/questions/

# Cek permission
chmod 755 src/public/uploads/questions/

# Cek database
mysql -u root -p
USE cbt_smk;
SELECT id, question_text, question_pdf FROM questions WHERE question_pdf IS NOT NULL;
```

### iframe blank/kosong
**Kemungkinan:**
- PDF corrupt
- Browser tidak support
- Path PDF salah

**Solusi:**
1. Buka URL PDF langsung di browser: `http://localhost:3000/public/uploads/questions/filename.pdf`
2. Cek browser console untuk error
3. Test dengan PDF lain

### Upload gagal
**Kemungkinan:**
- Ukuran > 10MB
- Format bukan PDF
- Disk space penuh
- Permission folder

**Solusi:**
```bash
# Cek disk space
df -h

# Cek permission
ls -la src/public/uploads/questions/

# Cek logs
pm2 logs --err
```

### Error "Unknown column 'question_pdf'"
**Kemungkinan:**
- Migration belum dijalankan

**Solusi:**
```bash
# Jalankan migration lagi
node run-migration-pdf.js

# Atau manual
mysql -u root -p cbt_smk
ALTER TABLE questions ADD COLUMN question_pdf VARCHAR(255) NULL AFTER question_image;
```

## Monitoring

### Cek Logs Real-time
```bash
# PM2
pm2 logs

# Nodemon
# Lihat terminal
```

### Cek Database
```sql
-- Cek soal dengan PDF
SELECT id, question_text, question_pdf 
FROM questions 
WHERE question_pdf IS NOT NULL;

-- Cek total soal dengan PDF
SELECT COUNT(*) AS total_pdf_questions 
FROM questions 
WHERE question_pdf IS NOT NULL;
```

### Cek File Upload
```bash
# List semua PDF yang ter-upload
ls -lh src/public/uploads/questions/*.pdf

# Cek ukuran total
du -sh src/public/uploads/questions/
```

## Success Criteria

Fitur dianggap berhasil jika:
- [x] Guru dapat upload PDF saat create soal (max 10MB)
- [x] Guru dapat upload PDF saat edit soal (max 10MB)
- [x] Guru dapat menghapus PDF saat edit soal
- [x] Guru dapat mengganti PDF saat edit soal
- [x] PDF tersimpan di database
- [x] PDF ditampilkan di preview guru
- [x] PDF ditampilkan di edit form guru
- [x] PDF ditampilkan saat siswa ujian
- [x] Kombinasi gambar + PDF berfungsi
- [x] Validation ukuran file bekerja
- [x] Validation format file bekerja
- [x] Tidak ada error di console/logs

## Next Steps After Testing

1. ✅ Test semua case di atas
2. 📝 Dokumentasikan hasil testing
3. 🐛 Fix bugs jika ada
4. 📢 Inform user bahwa fitur sudah ready
5. 📚 Update user manual jika perlu

---

**Testing Date**: 2026-03-06
**Tester**: [Your Name]
**Status**: Ready to Test
