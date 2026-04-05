# Instalasi Fitur Tugas Upload

## Ringkasan Fitur

Fitur tugas upload memungkinkan:
- **Guru**: Membuat tugas, melihat submissions, memberikan nilai & feedback
- **Siswa**: Melihat tugas, upload file jawaban, melihat nilai & feedback
- **Admin**: (Opsional) Melihat semua tugas di sistem

## Prasyarat

- Node.js dan npm terinstal
- MySQL database berjalan
- Server LMS sudah berjalan
- File `.env` sudah dikonfigurasi dengan benar

## Langkah Instalasi

### 1. Jalankan Script Setup Database

```bash
node scripts/create_assignments_tables.js
```

Script ini akan:
- Membuat tabel `assignments`
- Membuat tabel `assignment_submissions`
- Verifikasi tabel dan kolom
- Menampilkan struktur tabel

**Output yang diharapkan:**
```
✓ Connected to database
✓ Tables created successfully

✓ Verified tables:
  - assignments
  - assignment_submissions

✓ Assignments table columns:
  - id (int)
  - subject_id (int)
  - teacher_id (int)
  - title (varchar)
  - description (text)
  - class_id (int)
  - due_date (datetime)
  - max_score (int)
  - allow_late_submission (tinyint)
  - is_published (tinyint)
  - created_at (timestamp)
  - updated_at (timestamp)

✓ Assignment_submissions table columns:
  - id (int)
  - assignment_id (int)
  - student_id (int)
  - file_path (varchar)
  - file_name (varchar)
  - notes (text)
  - submitted_at (datetime)
  - score (int)
  - feedback (text)
  - graded_at (datetime)
  - graded_by (int)
  - created_at (timestamp)
  - updated_at (timestamp)

✅ Setup completed successfully!
```

### 2. Restart Server

**PENTING**: Setelah membuat tabel, WAJIB restart server Node.js!

```bash
# Tekan Ctrl+C untuk stop server
# Kemudian jalankan lagi:
npm run dev
```

**Mengapa harus restart?**
- MySQL connection pool di Node.js cache schema database saat pertama kali connect
- Jika tabel dibuat setelah server running, pool tidak tahu tabel baru ada
- Restart server akan membuat connection pool baru yang bisa detect tabel baru

**Catatan**: Nodemon hanya auto-restart saat file JavaScript berubah, tidak saat database berubah.

### 3. Verifikasi Instalasi

#### Untuk Guru:
1. Login sebagai guru
2. Buka dashboard guru
3. Verifikasi card "Tugas Anda" muncul di statistik
4. Verifikasi menu "Tugas Saya" muncul di navigasi
5. Klik "Buat Tugas" dan coba buat tugas baru

#### Untuk Siswa:
1. Login sebagai siswa
2. Buka halaman ujian/dashboard
3. Verifikasi menu "Tugas" muncul di navigasi
4. Klik menu "Tugas" dan verifikasi halaman terbuka

## Struktur File yang Ditambahkan

```
project/
├── sql/
│   └── add_assignments.sql                    # Schema database
├── scripts/
│   └── create_assignments_tables.js           # Script setup
├── src/
│   ├── routes/
│   │   ├── teacher.js                         # (Modified) Routes guru
│   │   └── student.js                         # (Modified) Routes siswa
│   ├── views/
│   │   ├── teacher/
│   │   │   ├── index.ejs                      # (Modified) Dashboard guru
│   │   │   ├── assignments.ejs                # List tugas guru
│   │   │   ├── assignment_new.ejs             # Form buat tugas
│   │   │   └── assignment_detail.ejs          # Detail & submissions
│   │   └── student/
│   │       ├── exams.ejs                      # (Modified) Menu siswa
│   │       ├── assignments.ejs                # List tugas siswa
│   │       └── assignment_detail.ejs          # Detail & upload
│   └── public/
│       └── uploads/
│           └── assignments/                   # Folder upload (auto-created)
├── FITUR_TUGAS_UPLOAD.md                      # Dokumentasi guru
├── FITUR_TUGAS_UPLOAD_SISWA.md                # Dokumentasi siswa
└── INSTALASI_FITUR_TUGAS.md                   # Dokumentasi ini
```

## Konfigurasi

### Upload Folder

Folder upload akan dibuat otomatis di:
```
src/public/uploads/assignments/
```

Pastikan folder ini memiliki permission write:
```bash
chmod 755 src/public/uploads/assignments/
```

### File Size Limit

Default: 50MB

Untuk mengubah, edit di `src/routes/teacher.js` dan `src/routes/student.js`:
```javascript
const uploadAssignments = multer({
  storage: storageAssignments,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});
```

### Notifikasi

Fitur notifikasi terintegrasi otomatis. Siswa akan menerima notifikasi saat:
- Tugas baru dipublikasi
- Tugas yang draft di-publish

Pastikan tabel `notifications` sudah ada dan fungsi `createNotificationForClass()` berfungsi.

## Testing

### Test 1: Guru Membuat Tugas

1. Login sebagai guru
2. Klik "Buat Tugas" di dashboard
3. Isi form:
   - Judul: "Tugas Test"
   - Deskripsi: "Ini adalah tugas test"
   - Mata Pelajaran: Pilih salah satu
   - Kelas: Pilih kelas atau kosongkan
   - Deadline: Set tanggal besok
   - Nilai Maks: 100
   - Centang "Publikasikan sekarang"
4. Klik "Buat Tugas"
5. Verifikasi redirect ke list tugas
6. Verifikasi tugas muncul dengan status "Dipublikasi"

### Test 2: Siswa Melihat & Submit Tugas

1. Login sebagai siswa (dari kelas yang sama)
2. Klik menu "Tugas"
3. Verifikasi tugas test muncul
4. Klik tugas
5. Upload file (< 50MB)
6. Tambahkan catatan (optional)
7. Klik "Kumpulkan Tugas"
8. Verifikasi status berubah "Sudah Dikumpulkan"
9. Verifikasi file bisa didownload

### Test 3: Guru Memberikan Nilai

1. Login sebagai guru
2. Klik "Tugas Saya"
3. Klik tugas test
4. Verifikasi submission siswa muncul
5. Klik "Beri Nilai"
6. Isi nilai: 85
7. Isi feedback: "Bagus, pertahankan!"
8. Klik "Simpan Nilai"
9. Verifikasi nilai tersimpan

### Test 4: Siswa Melihat Nilai

1. Login sebagai siswa
2. Klik menu "Tugas"
3. Verifikasi badge "Dinilai: 85/100" muncul
4. Klik tugas
5. Verifikasi nilai dan feedback tampil

## Troubleshooting

### Error: Table 'cbt_smk.assignments' doesn't exist

**Penyebab:**
Server sudah running sebelum tabel dibuat, sehingga MySQL connection pool tidak detect tabel baru.

**Solusi:**
1. **Verifikasi tabel sudah dibuat:**
   ```bash
   node scripts/check_tables.js
   ```
   
2. **Restart server (WAJIB):**
   ```bash
   # Tekan Ctrl+C untuk stop server
   npm run dev
   ```

3. **Jika masih error**, test query langsung:
   ```bash
   node scripts/test_assignments_query.js
   ```
   
4. **Solusi terakhir**: Restart MySQL service dan restart server Node.js

**Catatan**: Error ini sudah ditangani dengan error handling di kode, jadi server tidak akan crash lagi.

### Error: Cannot find module 'multer'

**Solusi:**
```bash
npm install multer
```

### Error: ENOENT: no such file or directory

**Solusi:**
```bash
# Buat folder uploads manual
mkdir -p src/public/uploads/assignments
chmod 755 src/public/uploads/assignments
```

### Upload file gagal (413 Payload Too Large)

**Solusi:**
Tambahkan di `src/server.js`:
```javascript
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

### Notifikasi tidak terkirim

**Solusi:**
1. Check tabel `notifications` ada
2. Check fungsi `createNotificationForClass()` di `src/utils/notifications.js`
3. Check `class_id` tidak null saat publish tugas

### File tidak bisa didownload (404)

**Solusi:**
1. Check file exists di `src/public/uploads/assignments/`
2. Check path di database benar
3. Check static file serving di `src/server.js`:
```javascript
app.use('/public', express.static(path.join(__dirname, 'public')));
```

### Deadline tidak akurat

**Solusi:**
1. Check timezone server
2. Set timezone di MySQL:
```sql
SET time_zone = '+07:00'; -- WIB
```
3. Atau set di connection pool

## Rollback (Jika Diperlukan)

Untuk menghapus fitur ini:

### 1. Drop Tables
```sql
DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS assignments;
```

### 2. Revert Code Changes
```bash
git checkout src/routes/teacher.js
git checkout src/routes/student.js
git checkout src/views/teacher/index.ejs
git checkout src/views/student/exams.ejs
```

### 3. Delete New Files
```bash
rm -rf src/views/teacher/assignments.ejs
rm -rf src/views/teacher/assignment_new.ejs
rm -rf src/views/teacher/assignment_detail.ejs
rm -rf src/views/student/assignments.ejs
rm -rf src/views/student/assignment_detail.ejs
rm -rf sql/add_assignments.sql
rm -rf scripts/create_assignments_tables.js
```

## FAQ

### Q: Apakah siswa bisa upload multiple files?
A: Saat ini hanya 1 file per submission. Untuk multiple files, siswa bisa zip file-nya terlebih dahulu.

### Q: Apakah ada limit tipe file?
A: Tidak ada limit tipe file. Semua format diizinkan (PDF, DOCX, ZIP, JPG, dll).

### Q: Bagaimana cara mengubah max file size?
A: Edit di routes teacher dan student, ubah nilai `limits: { fileSize: 50 * 1024 * 1024 }`.

### Q: Apakah tugas bisa untuk multiple kelas?
A: Saat ini tugas hanya bisa untuk 1 kelas atau semua kelas. Untuk multiple kelas spesifik, buat tugas terpisah.

### Q: Apakah ada fitur plagiarism checker?
A: Belum ada. Ini bisa ditambahkan sebagai pengembangan selanjutnya.

### Q: Bagaimana cara backup file submissions?
A: Backup folder `src/public/uploads/assignments/` secara berkala.

### Q: Apakah bisa export nilai ke Excel?
A: Belum ada fitur ini. Bisa ditambahkan sebagai pengembangan selanjutnya.

## Support

Jika mengalami masalah:
1. Check console log untuk error
2. Check database connection
3. Verifikasi semua dependencies terinstal
4. Baca dokumentasi lengkap di:
   - `FITUR_TUGAS_UPLOAD.md` (untuk guru)
   - `FITUR_TUGAS_UPLOAD_SISWA.md` (untuk siswa)

## Changelog

### Version 1.0.0 (Initial Release)
- ✅ Guru dapat membuat tugas
- ✅ Guru dapat melihat submissions
- ✅ Guru dapat memberikan nilai & feedback
- ✅ Siswa dapat melihat tugas
- ✅ Siswa dapat upload file
- ✅ Siswa dapat melihat nilai & feedback
- ✅ Notifikasi terintegrasi
- ✅ Validasi deadline
- ✅ Upload file support (50MB)

## Kesimpulan

Fitur tugas upload telah berhasil diimplementasi dengan lengkap untuk guru dan siswa. Sistem ini menyediakan workflow lengkap dari pembuatan tugas hingga penilaian, dengan UI yang user-friendly dan validasi yang ketat.

Selamat menggunakan! 🎉
