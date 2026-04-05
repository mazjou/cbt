# Fitur Tugas Upload untuk Siswa

## Deskripsi
Fitur ini memungkinkan siswa untuk melihat tugas yang diberikan guru, mengupload file jawaban, dan melihat nilai serta feedback dari guru.

## Fitur Utama

### 1. Melihat Daftar Tugas
Siswa dapat melihat semua tugas yang tersedia dengan informasi:
- Judul tugas
- Deskripsi singkat
- Mata pelajaran
- Nama guru
- Deadline (dengan highlight merah jika terlambat)
- Nilai maksimal
- Status pengumpulan (Belum Dikumpulkan / Sudah Dikumpulkan / Dinilai / Terlambat)
- Waktu pengumpulan (jika sudah dikumpulkan)
- Nilai (jika sudah dinilai)

### 2. Filter Tugas
Tugas ditampilkan dengan visual yang berbeda:
- **Border Merah**: Tugas yang belum dikumpulkan dan sudah melewati deadline
- **Border Hijau**: Tugas yang sudah dikumpulkan
- **Border Abu-abu**: Tugas yang belum dikumpulkan dan masih dalam deadline

### 3. Detail Tugas
Siswa dapat melihat detail lengkap tugas:
- Informasi lengkap (mapel, guru, deadline, nilai maks)
- Deskripsi/instruksi lengkap dari guru
- Status pengumpulan
- File yang sudah diupload (jika ada)
- Nilai dan feedback dari guru (jika sudah dinilai)

### 4. Upload File Jawaban
Siswa dapat mengupload file dengan fitur:
- Upload file (maksimal 50MB)
- Semua format file diizinkan
- Tambahkan catatan opsional
- Validasi deadline
- Peringatan jika mengumpulkan terlambat
- Download file yang sudah diupload

### 5. Perbarui Pengumpulan
Siswa dapat memperbarui file yang sudah dikumpulkan:
- Upload file baru menggantikan file lama
- Nilai sebelumnya akan dihapus (perlu dinilai ulang)
- Hanya bisa jika deadline belum lewat atau pengumpulan terlambat diizinkan

### 6. Melihat Nilai & Feedback
Setelah guru memberikan nilai:
- Melihat nilai yang diperoleh
- Membaca feedback dari guru
- Badge khusus untuk tugas yang sudah dinilai

## Routes API

### GET `/student/assignments`
Menampilkan daftar semua tugas yang tersedia untuk siswa

**Filter:**
- Hanya tugas yang dipublikasi (`is_published = 1`)
- Hanya tugas untuk kelas siswa atau tugas untuk semua kelas
- Diurutkan berdasarkan deadline (ASC) dan tanggal dibuat (DESC)

**Response Data:**
- Informasi tugas lengkap
- Status submission (sudah dikumpulkan atau belum)
- Nilai (jika sudah dinilai)
- Feedback (jika ada)

### GET `/student/assignments/:id`
Melihat detail tugas dan form upload

**Validasi:**
- Tugas harus dipublikasi
- Tugas harus tersedia untuk kelas siswa

**Response Data:**
- Detail tugas lengkap
- Submission siswa (jika ada)
- Form upload (jika belum submit atau bisa update)

### POST `/student/assignments/:id/submit`
Mengupload file jawaban tugas

**Body Parameters:**
- `file` - File yang diupload (multipart/form-data, required)
- `notes` - Catatan tambahan (optional)

**Validasi:**
- Tugas harus dipublikasi dan tersedia
- Cek deadline:
  - Jika deadline lewat dan `allow_late_submission = 0`, reject
  - Jika deadline lewat dan `allow_late_submission = 1`, allow dengan warning
- File maksimal 50MB

**Behavior:**
- Jika belum pernah submit: INSERT submission baru
- Jika sudah pernah submit: UPDATE submission (nilai dan feedback dihapus)

## UI/UX

### List Tugas
- Card untuk setiap tugas dengan warna border berbeda berdasarkan status
- Badge status yang jelas (Belum Dikumpulkan, Sudah Dikumpulkan, Dinilai, Terlambat)
- Highlight deadline dengan warna merah jika terlambat
- Button "Kumpulkan" atau "Lihat Detail" tergantung status
- Informasi nilai langsung terlihat jika sudah dinilai

### Detail Tugas
- Info lengkap di bagian atas
- Deskripsi/instruksi dalam box dengan background
- Status submission dengan icon dan warna berbeda:
  - Biru: Sudah dikumpulkan, belum dinilai
  - Hijau: Sudah dinilai
- Download link untuk file yang sudah diupload
- Nilai ditampilkan dengan font besar dan warna hijau
- Feedback dari guru dalam box hijau khusus

### Form Upload
- File input dengan validasi
- Textarea untuk catatan
- Warning box jika mengumpulkan terlambat (orange)
- Error box jika deadline lewat dan tidak diizinkan (red)
- Button "Perbarui Pengumpulan" jika sudah pernah submit

### Responsive Design
- Grid layout yang adaptif
- Mobile-friendly
- Touch-friendly buttons

## Validasi & Keamanan

### Validasi Deadline
```javascript
const now = new Date();
const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
const isOverdue = dueDate && dueDate < now;
const canSubmit = !isOverdue || assignment.allow_late_submission;
```

### Validasi Akses
- Siswa hanya bisa melihat tugas yang dipublikasi
- Siswa hanya bisa melihat tugas untuk kelasnya
- Siswa hanya bisa submit untuk tugasnya sendiri

### File Upload Security
- Filename di-sanitize (remove special characters)
- File size limit 50MB
- Unique filename dengan timestamp
- File disimpan di folder terpisah

## Integrasi dengan Fitur Lain

### Menu Navigasi
- Link "Tugas" ditambahkan di menu student
- Warna hijau untuk konsistensi dengan tema tugas

### Notifikasi
- Siswa menerima notifikasi saat tugas baru dipublikasi
- Notifikasi mencantumkan deadline

## Database Query

### Get Assignments for Student
```sql
SELECT 
  a.id, a.title, a.description, a.due_date, a.max_score, a.created_at,
  s.name AS subject_name,
  u.full_name AS teacher_name,
  sub.id AS submission_id,
  sub.submitted_at,
  sub.score,
  sub.feedback
FROM assignments a
JOIN subjects s ON s.id = a.subject_id
JOIN users u ON u.id = a.teacher_id
LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = :studentId
WHERE a.is_published = 1
  AND (a.class_id IS NULL OR a.class_id = :classId)
ORDER BY a.due_date ASC, a.created_at DESC;
```

### Submit Assignment
```sql
-- Insert new submission
INSERT INTO assignment_submissions 
(assignment_id, student_id, file_path, file_name, notes, submitted_at)
VALUES (:assignmentId, :studentId, :filePath, :fileName, :notes, NOW());

-- Update existing submission
UPDATE assignment_submissions 
SET file_path = :filePath,
    file_name = :fileName,
    notes = :notes,
    submitted_at = NOW(),
    score = NULL,
    feedback = NULL,
    graded_at = NULL,
    graded_by = NULL
WHERE assignment_id = :assignmentId AND student_id = :studentId;
```

## File yang Dibuat/Dimodifikasi

### File Baru:
- `src/views/student/assignments.ejs` - List tugas
- `src/views/student/assignment_detail.ejs` - Detail & form upload
- `FITUR_TUGAS_UPLOAD_SISWA.md` - Dokumentasi ini

### File Dimodifikasi:
- `src/routes/student.js` - Menambahkan routes assignments
- `src/views/student/exams.ejs` - Menambahkan menu "Tugas"

## Testing

### Test Case 1: Melihat Daftar Tugas
1. Login sebagai siswa
2. Klik menu "Tugas"
3. Verifikasi semua tugas untuk kelas siswa muncul
4. Verifikasi status dan badge sesuai

### Test Case 2: Upload File
1. Klik tugas yang belum dikumpulkan
2. Pilih file (< 50MB)
3. Tambahkan catatan (optional)
4. Klik "Kumpulkan Tugas"
5. Verifikasi redirect ke detail dengan status "Sudah Dikumpulkan"
6. Verifikasi file bisa didownload

### Test Case 3: Upload Terlambat
1. Pilih tugas dengan deadline lewat
2. Jika `allow_late_submission = 0`: Form disabled dengan pesan error
3. Jika `allow_late_submission = 1`: Form aktif dengan warning orange
4. Upload file dan verifikasi berhasil

### Test Case 4: Perbarui Pengumpulan
1. Klik tugas yang sudah dikumpulkan
2. Klik "Perbarui Pengumpulan"
3. Upload file baru
4. Verifikasi file lama terganti
5. Verifikasi nilai dihapus (jika ada)

### Test Case 5: Melihat Nilai
1. Guru memberikan nilai untuk submission
2. Siswa refresh halaman tugas
3. Verifikasi badge "Dinilai" muncul
4. Klik detail tugas
5. Verifikasi nilai dan feedback tampil

## Troubleshooting

### Tugas tidak muncul
- Pastikan tugas sudah dipublikasi (`is_published = 1`)
- Pastikan tugas untuk kelas siswa atau untuk semua kelas
- Check query di route `/student/assignments`

### Upload file gagal
- Check file size tidak melebihi 50MB
- Check folder `src/public/uploads/assignments/` writable
- Check multer configuration
- Lihat console log untuk error

### File tidak bisa didownload
- Check path file di database
- Check file exists di folder uploads
- Check URL path: `/public/uploads/assignments/{filename}`

### Deadline tidak akurat
- Check timezone server
- Check format datetime di database
- Verifikasi `due_date` tidak NULL

### Nilai tidak muncul
- Pastikan guru sudah memberikan nilai
- Check field `score` di tabel `assignment_submissions`
- Refresh halaman

## Pengembangan Selanjutnya

Fitur yang bisa ditambahkan:
- Multiple file upload (zip atau multiple files)
- Preview file (PDF, image) tanpa download
- History revisi (track semua file yang pernah diupload)
- Reminder notification sebelum deadline
- Progress bar saat upload file besar
- Drag & drop file upload
- Copy-paste image langsung
- Rich text editor untuk catatan
- Attachment dari guru (template, contoh)
- Discussion/comment thread per tugas
- Peer review feature
- Self-assessment rubric

## Kesimpulan

Fitur tugas upload untuk siswa telah berhasil diimplementasi dengan lengkap. Siswa sekarang dapat:
- Melihat semua tugas yang tersedia
- Upload file jawaban dengan mudah
- Melihat status pengumpulan real-time
- Melihat nilai dan feedback dari guru
- Perbarui pengumpulan jika diperlukan
- Mendapat notifikasi tugas baru

Fitur ini terintegrasi penuh dengan fitur guru, membentuk sistem manajemen tugas yang lengkap dan user-friendly.
