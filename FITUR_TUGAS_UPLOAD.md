# Fitur Tugas Upload untuk Guru

## Deskripsi
Fitur ini memungkinkan guru untuk membuat tugas yang mengharuskan siswa mengupload file sebagai jawaban. Guru dapat memberikan nilai dan feedback untuk setiap submission.

## Fitur Utama

### 1. Membuat Tugas
Guru dapat membuat tugas dengan informasi:
- Judul tugas
- Deskripsi / instruksi lengkap
- Mata pelajaran
- Kelas target (atau semua kelas)
- Deadline pengumpulan
- Nilai maksimal
- Opsi izinkan pengumpulan terlambat
- Status publikasi (draft/published)

### 2. Kelola Tugas
- Melihat daftar semua tugas yang dibuat
- Melihat jumlah submission per tugas
- Toggle publish/unpublish tugas
- Hapus tugas
- Lihat detail tugas dan submissions

### 3. Penilaian Submission
- Melihat semua submission siswa
- Download file yang diupload siswa
- Memberikan nilai (0 - max_score)
- Memberikan feedback/catatan untuk siswa
- Melihat status keterlambatan submission
- Edit nilai yang sudah diberikan

### 4. Notifikasi
- Siswa mendapat notifikasi saat tugas baru dipublikasi
- Notifikasi mencantumkan deadline tugas

## Database Schema

### Tabel `assignments`
```sql
CREATE TABLE assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  class_id INT NULL,
  due_date DATETIME NULL,
  max_score INT NOT NULL DEFAULT 100,
  allow_late_submission TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
```

### Tabel `assignment_submissions`
```sql
CREATE TABLE assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  submitted_at DATETIME NOT NULL,
  score INT NULL,
  feedback TEXT NULL,
  graded_at DATETIME NULL,
  graded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
);
```

## Routes API

### GET `/teacher/assignments`
Menampilkan daftar semua tugas guru

### GET `/teacher/assignments/new`
Form untuk membuat tugas baru

### POST `/teacher/assignments`
Membuat tugas baru

**Body Parameters:**
- `subject_id` - ID mata pelajaran (required)
- `title` - Judul tugas (required)
- `description` - Deskripsi/instruksi
- `class_id` - ID kelas target (optional)
- `due_date` - Deadline (datetime-local format)
- `max_score` - Nilai maksimal (default: 100)
- `allow_late_submission` - Izinkan terlambat (checkbox)
- `is_published` - Publikasi langsung (checkbox)

### GET `/teacher/assignments/:id`
Melihat detail tugas dan semua submissions

### POST `/teacher/assignments/:id/submissions/:submissionId/grade`
Memberikan nilai untuk submission siswa

**Body Parameters:**
- `score` - Nilai (0 - max_score)
- `feedback` - Feedback/catatan untuk siswa

### POST `/teacher/assignments/:id/toggle-publish`
Toggle status publikasi tugas

### DELETE `/teacher/assignments/:id`
Menghapus tugas

## File Upload

### Lokasi Upload
- Folder: `src/public/uploads/assignments/`
- Format nama file: `{timestamp}_{sanitized_filename}`
- Max size: 50MB
- Semua tipe file diizinkan

### Akses File
File dapat diakses melalui URL:
```
/public/uploads/assignments/{filename}
```

## UI/UX

### Dashboard Guru
- Card statistik "Tugas Anda" menampilkan jumlah tugas
- Quick action "Buat Tugas" untuk membuat tugas baru
- Menu navigasi "Tugas Saya" untuk melihat semua tugas

### List Tugas
- Card untuk setiap tugas dengan informasi lengkap
- Badge status (Published/Draft)
- Informasi mapel, kelas, deadline, jumlah submission
- Button: Lihat Detail, Publish/Unpublish, Hapus

### Form Buat Tugas
- Form lengkap dengan validasi
- Datetime picker untuk deadline
- Checkbox untuk opsi tambahan
- Preview sebelum submit

### Detail Tugas
- Info lengkap tugas di bagian atas
- Tabel submissions dengan kolom:
  - Nama siswa & username
  - Kelas
  - File yang diupload (link download)
  - Waktu submit (dengan badge "Terlambat" jika lewat deadline)
  - Nilai (badge hijau jika sudah dinilai)
  - Button "Beri Nilai" / "Edit Nilai"

### Modal Penilaian
- Form untuk input nilai dan feedback
- Validasi nilai (0 - max_score)
- Textarea untuk feedback
- Button Simpan dan Batal

## Integrasi dengan Fitur Lain

### Notifikasi
- Menggunakan `createNotificationForClass()` dari `utils/notifications.js`
- Notifikasi dikirim saat tugas dipublikasi
- Tipe notifikasi: `ASSIGNMENT`
- Reference ID: assignment_id

### Dashboard Stats
- Menambahkan query count assignments di route dashboard
- Menampilkan card "Tugas Anda" di statistik

### Menu Navigasi
- Menambahkan link "Tugas Saya" di menu guru
- Menambahkan quick action "Buat Tugas" di dashboard

## Instalasi

### 1. Jalankan SQL Schema
```bash
mysql -u root -p nama_database < sql/add_assignments.sql
```

### 2. Restart Server
```bash
npm start
```

### 3. Test Fitur
1. Login sebagai guru
2. Klik "Buat Tugas" di dashboard
3. Isi form dan publish
4. Siswa akan menerima notifikasi (jika fitur notifikasi aktif)

## Fitur untuk Siswa (Belum Diimplementasi)

Untuk melengkapi fitur ini, perlu ditambahkan di sisi siswa:

### Routes Student
- `GET /student/assignments` - List tugas yang tersedia
- `GET /student/assignments/:id` - Detail tugas
- `POST /student/assignments/:id/submit` - Upload file submission

### View Student
- `src/views/student/assignments.ejs` - List tugas
- `src/views/student/assignment_detail.ejs` - Detail & form upload

### Upload Handler
- Multer config untuk upload file dari siswa
- Validasi file size dan type
- Save ke database dengan status submitted

## Keamanan

### Validasi
- Hanya guru yang bisa membuat dan menilai tugas
- Siswa hanya bisa submit untuk tugas yang published
- File upload dibatasi 50MB
- Filename di-sanitize untuk keamanan

### Authorization
- Middleware `requireRole('TEACHER')` untuk semua routes guru
- Query menggunakan `teacher_id` untuk memastikan guru hanya akses tugasnya sendiri

## Pengembangan Selanjutnya

Fitur yang bisa ditambahkan:
- Export nilai ke Excel/CSV
- Bulk grading (nilai banyak submission sekaligus)
- Template feedback yang bisa disimpan
- Rubrik penilaian
- Plagiarism checker
- Auto-grading untuk file tertentu (PDF, DOCX)
- Revision request (guru minta siswa revisi)
- Peer review (siswa review pekerjaan teman)
- Group assignment (tugas kelompok)
- Multiple file upload
- Rich text editor untuk deskripsi tugas
- Attachment files dari guru (contoh, template, dll)

## Troubleshooting

### Tugas tidak muncul di list
- Pastikan tabel `assignments` sudah dibuat
- Check query di route `/teacher/assignments`
- Lihat console log untuk error

### Upload file gagal
- Check folder `src/public/uploads/assignments/` ada dan writable
- Check file size tidak melebihi 50MB
- Check multer configuration

### Notifikasi tidak terkirim
- Pastikan tabel `notifications` sudah ada
- Check fungsi `createNotificationForClass()` di utils
- Pastikan class_id tidak null saat publish

### Nilai tidak tersimpan
- Check form submission di modal
- Lihat console log untuk error
- Pastikan score dalam range 0 - max_score

## File yang Dibuat/Dimodifikasi

### File Baru:
- `sql/add_assignments.sql` - Schema database
- `src/views/teacher/assignments.ejs` - List tugas
- `src/views/teacher/assignment_new.ejs` - Form buat tugas
- `src/views/teacher/assignment_detail.ejs` - Detail & submissions
- `FITUR_TUGAS_UPLOAD.md` - Dokumentasi ini

### File Dimodifikasi:
- `src/routes/teacher.js` - Menambahkan routes assignments
- `src/views/teacher/index.ejs` - Menambahkan card & menu tugas

## Kesimpulan

Fitur tugas upload telah berhasil diimplementasi untuk guru. Guru sekarang dapat:
- Membuat tugas dengan instruksi lengkap
- Melihat dan mengelola submissions siswa
- Memberikan nilai dan feedback
- Mengelola publikasi tugas

Untuk melengkapi fitur ini, perlu ditambahkan implementasi di sisi siswa agar mereka dapat melihat tugas dan mengupload file jawaban.
