
# Fitur Notifikasi Modal dari Guru/Admin 📢

## Status: COMPLETED ✅

Guru dan admin dapat mengirim peringatan/pengumuman ke siswa yang akan muncul sebagai modal popup yang bisa di-close.

---

## Fitur Utama

### 1. Kirim Notifikasi
Guru/Admin dapat:
- Membuat notifikasi dengan judul dan pesan
- Memilih tipe notifikasi (Info, Warning, Success, Error)
- Menentukan target penerima:
  * Semua siswa
  * Kelas tertentu
  * Siswa tertentu
- Mengatur waktu kadaluarsa (opsional)

### 2. Modal Popup di Siswa
Siswa akan melihat:
- Modal popup otomatis saat login/refresh
- Design colorful sesuai tipe notifikasi
- Tombol "Mengerti" untuk menutup
- Hanya muncul sekali per notifikasi

### 3. Kelola Notifikasi
Guru/Admin dapat:
- Melihat semua notifikasi yang dibuat
- Melihat jumlah siswa yang sudah membaca
- Mengaktifkan/menonaktifkan notifikasi
- Menghapus notifikasi

---

## Database Schema

### Tabel `notifications`
```sql
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
  sender_id INT NOT NULL,
  sender_role ENUM('admin', 'teacher') NOT NULL,
  target_type ENUM('all', 'class', 'student') DEFAULT 'all',
  target_id INT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Tabel `notification_reads`
```sql
CREATE TABLE notification_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  student_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_read (notification_id, student_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Routes

### Teacher/Admin Routes
- `GET /notifications` - Halaman kelola notifikasi
- `GET /notifications/new` - Form buat notifikasi baru
- `POST /notifications/new` - Create notifikasi
- `POST /notifications/:id/toggle` - Toggle active/inactive
- `POST /notifications/:id/delete` - Hapus notifikasi

### Student Routes (API)
- `GET /notifications/active` - Get notifikasi aktif yang belum dibaca
- `POST /notifications/:id/read` - Mark notifikasi as read

---

## Cara Menggunakan

### Untuk Guru/Admin:

1. **Buka Menu Notifikasi**
   - Login sebagai guru/admin
   - Klik menu "Notifikasi" di dashboard
   - Atau akses `/notifications`

2. **Buat Notifikasi Baru**
   - Klik tombol "➕ Buat Notifikasi"
   - Isi form:
     * Judul: Judul singkat notifikasi
     * Pesan: Isi pesan lengkap
     * Tipe: Pilih warna (Info/Warning/Success/Error)
     * Target: Pilih penerima (Semua/Kelas/Siswa)
     * Kadaluarsa: Opsional, notifikasi auto-nonaktif setelah waktu ini
   - Klik "📢 Kirim Notifikasi"

3. **Kelola Notifikasi**
   - Lihat daftar notifikasi yang sudah dibuat
   - Lihat jumlah siswa yang sudah membaca
   - Klik "🔒 Nonaktifkan" untuk menonaktifkan
   - Klik "🗑️ Hapus" untuk menghapus

### Untuk Siswa:

1. **Menerima Notifikasi**
   - Login ke sistem
   - Modal popup akan muncul otomatis jika ada notifikasi baru
   - Baca pesan notifikasi

2. **Menutup Notifikasi**
   - Klik tombol "✓ Mengerti"
   - Atau klik tombol X di pojok kanan atas
   - Notifikasi tidak akan muncul lagi

---

## Tipe Notifikasi

### 1. Info (Biru) ℹ️
- Untuk informasi umum
- Pengumuman biasa
- Update sistem

### 2. Warning (Oranye) ⚠️
- Untuk peringatan
- Reminder deadline
- Perubahan jadwal

### 3. Success (Hijau) ✅
- Untuk kabar baik
- Pengumuman prestasi
- Konfirmasi kegiatan

### 4. Error (Merah) ❌
- Untuk peringatan penting
- Pembatalan kegiatan
- Masalah teknis

---

## Contoh Penggunaan

### Contoh 1: Pengumuman Ujian Ditunda
```
Judul: Ujian Matematika Ditunda
Pesan: Ujian Matematika yang dijadwalkan hari Senin, 10 Maret 2026 ditunda menjadi Rabu, 12 Maret 2026. Mohon persiapkan diri dengan baik.
Tipe: Warning
Target: Kelas 10 IPA 1
Kadaluarsa: 3 hari
```

### Contoh 2: Reminder Tugas
```
Judul: Reminder: Tugas Bahasa Indonesia
Pesan: Jangan lupa kumpulkan tugas Bahasa Indonesia sebelum jam 23:59 malam ini. Terlambat tidak akan diterima.
Tipe: Warning
Target: Semua Siswa
Kadaluarsa: 12 jam
```

### Contoh 3: Pengumuman Libur
```
Judul: Libur Nasional
Pesan: Besok, 17 Agustus 2026 adalah hari libur nasional. Tidak ada kegiatan belajar mengajar. Selamat Hari Kemerdekaan!
Tipe: Info
Target: Semua Siswa
Kadaluarsa: 1 hari
```

### Contoh 4: Selamat Juara
```
Judul: Selamat! Juara Olimpiade
Pesan: Selamat kepada Ahmad Rizki yang berhasil meraih Juara 1 Olimpiade Matematika tingkat Kabupaten! Kamu membanggakan sekolah!
Tipe: Success
Target: Siswa (Ahmad Rizki)
Kadaluarsa: 1 minggu
```

---

## Teknologi

### Frontend
- Tailwind CSS untuk styling
- Vanilla JavaScript untuk modal
- LocalStorage untuk tracking notifikasi yang sudah ditutup
- Fetch API untuk komunikasi dengan server

### Backend
- Express.js routes
- MySQL database
- Session-based authentication

### Features
- Auto-check setiap 60 detik untuk notifikasi baru
- Animasi fade in/out dan scale
- Responsive design
- Colorful gradient backgrounds

---

## File yang Dibuat/Dimodifikasi

### Database
- `sql/create_notifications.sql` - Schema database
- `run-migration-notifications.js` - Script migrasi

### Routes
- `src/routes/notifications.js` - Route handler

### Views
- `src/views/notifications/index.ejs` - Halaman kelola notifikasi
- `src/views/notifications/new.ejs` - Form buat notifikasi

### Layout
- `src/views/layout.ejs` - Tambah script modal notifikasi

### Dashboard
- `src/views/teacher/index.ejs` - Tambah link menu notifikasi

### Server
- `src/server.js` - Register route notifikasi

---

## Instalasi

### 1. Jalankan Migrasi Database
```bash
node run-migration-notifications.js
```

### 2. Restart Server
```bash
# Development
npm run dev

# Production dengan PM2
pm2 restart cbt-app
```

### 3. Test Fitur
1. Login sebagai guru/admin
2. Buka `/notifications`
3. Buat notifikasi test
4. Login sebagai siswa
5. Lihat modal popup muncul

---

## Troubleshooting

### Problem: Modal tidak muncul di siswa
**Solution**:
- Pastikan notifikasi status `is_active = TRUE`
- Cek `expires_at` belum lewat
- Cek target sesuai (all/class/student)
- Clear localStorage browser siswa
- Cek console browser untuk error

### Problem: Notifikasi muncul terus-menerus
**Solution**:
- Pastikan localStorage berfungsi
- Cek fungsi `closeModalNotification` dipanggil
- Cek API `/notifications/:id/read` berhasil

### Problem: Guru tidak bisa buat notifikasi
**Solution**:
- Pastikan user role = 'teacher' atau 'admin'
- Cek middleware `requireTeacherOrAdmin`
- Cek form validation

### Problem: Target kelas/siswa tidak berfungsi
**Solution**:
- Pastikan `class_id` di tabel users terisi
- Cek query SQL di route `/notifications/active`
- Cek dropdown kelas dan siswa terisi

---

## Keamanan

### Authorization
- Hanya teacher dan admin yang bisa buat/kelola notifikasi
- Siswa hanya bisa read dan mark as read
- Middleware `requireTeacherOrAdmin` untuk proteksi

### Data Validation
- Title max 255 karakter
- Message required
- Type enum validation
- Target type enum validation

### XSS Prevention
- `escapeHtml()` function untuk escape user input
- Tailwind CSS classes tidak injectable

---

## Future Improvements (Opsional)

### 1. Rich Text Editor
Tambahkan WYSIWYG editor untuk pesan:
```javascript
// Gunakan library seperti TinyMCE atau Quill
<textarea id="message" name="message"></textarea>
<script src="https://cdn.tiny.cloud/1/YOUR_API_KEY/tinymce/6/tinymce.min.js"></script>
<script>
  tinymce.init({ selector: '#message' });
</script>
```

### 2. Attachment File
Tambahkan upload file ke notifikasi:
```sql
ALTER TABLE notifications ADD COLUMN attachment_path VARCHAR(500) NULL;
```

### 3. Push Notification
Integrasikan dengan Firebase Cloud Messaging:
```javascript
// Service worker untuk push notification
self.addEventListener('push', function(event) {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.message,
    icon: '/public/images/logo.png'
  });
});
```

### 4. Email Notification
Kirim email ke siswa yang tidak login:
```javascript
const nodemailer = require('nodemailer');
// Send email to students who haven't read notification
```

### 5. Scheduled Notification
Jadwalkan notifikasi untuk dikirim di waktu tertentu:
```sql
ALTER TABLE notifications ADD COLUMN scheduled_at TIMESTAMP NULL;
```

### 6. Notification Templates
Buat template notifikasi yang sering digunakan:
```sql
CREATE TABLE notification_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info'
);
```

---

## Dokumentasi Terkait

- `FITUR_AUTO_SUBMIT_WAKTU_HABIS.md` - Auto-submit ujian
- `UPDATE_COLORFUL_STUDENT_PAGES.md` - UI colorful
- `PROPOSAL_LOMBA_INOVASI.md` - Proposal aplikasi

---

**Status**: ✅ Fitur Notifikasi Modal Sudah Aktif!
**Updated**: 2026-03-07
**Impact**: Komunikasi lebih efektif antara guru dan siswa

Guru dan admin sekarang bisa mengirim peringatan penting langsung ke siswa dengan tampilan yang menarik! 📢✨
