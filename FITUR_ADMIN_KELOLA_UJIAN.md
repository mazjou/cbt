# Fitur Admin: Kelola Ujian

## Deskripsi
Fitur ini memungkinkan admin untuk melihat dan mengelola semua ujian yang dibuat oleh guru di sistem LMS.

## Fitur Utama

### 1. Daftar Ujian
- Menampilkan semua ujian dari semua guru
- Informasi yang ditampilkan:
  - Judul dan deskripsi ujian
  - Mata pelajaran
  - Nama guru pembuat
  - Kelas target
  - Jumlah soal
  - Jumlah percobaan siswa
  - Status publikasi (Published/Draft)
  - Tanggal pembuatan

### 2. Filter & Pencarian
Admin dapat memfilter ujian berdasarkan:
- **Pencarian teks**: Cari berdasarkan judul atau deskripsi
- **Mata Pelajaran**: Filter berdasarkan mapel tertentu
- **Guru**: Filter berdasarkan guru pembuat
- **Kelas**: Filter berdasarkan kelas target
- **Status**: Filter berdasarkan status publikasi (Published/Draft/Semua)

### 3. Statistik Dashboard
Menampilkan ringkasan:
- Total ujian di sistem
- Jumlah ujian yang dipublikasi
- Jumlah ujian draft
- Total percobaan ujian oleh siswa

### 4. Detail Ujian
Admin dapat melihat detail lengkap ujian melalui modal popup:
- Informasi dasar (judul, deskripsi)
- Pengaturan ujian (durasi, nilai lulus, max percobaan)
- Pengaturan acak soal dan opsi
- Kode akses (jika ada)
- Waktu mulai dan selesai
- Status publikasi

### 5. Aksi Manajemen
Admin dapat melakukan:
- **Lihat Detail**: Melihat informasi lengkap ujian
- **Toggle Publish/Unpublish**: Mengubah status publikasi ujian
- **Hapus Ujian**: Menghapus ujian beserta semua data terkait (soal, percobaan, dll)

### 6. Pagination
- Menampilkan 10 ujian per halaman (dapat disesuaikan)
- Navigasi halaman yang mudah
- Informasi jumlah data yang ditampilkan

## Akses Menu

### Dari Dashboard Admin
1. Login sebagai admin
2. Klik menu "Admin" di navbar
3. Klik card "Ujian" di dashboard admin
4. Atau akses langsung: `/admin/exams`

### Link di Dashboard
Menu "Ujian" ditambahkan sebagai card baru di halaman admin index dengan warna merah.

## Keamanan
- Hanya user dengan role `ADMIN` yang dapat mengakses fitur ini
- Middleware `requireRole('ADMIN')` melindungi semua route admin
- Konfirmasi sebelum menghapus ujian

## Teknologi
- **Backend**: Express.js + MySQL
- **Frontend**: EJS + Tailwind CSS
- **AJAX**: Fetch API untuk modal detail

## File yang Ditambahkan/Dimodifikasi

### File Baru:
- `src/views/admin/exams.ejs` - View halaman kelola ujian

### File Dimodifikasi:
- `src/routes/admin.js` - Menambahkan route untuk kelola ujian
- `src/views/admin/index.ejs` - Menambahkan card menu ujian

## Route API

### GET `/admin/exams`
Menampilkan halaman daftar ujian dengan filter dan pagination

**Query Parameters:**
- `page` - Nomor halaman (default: 1)
- `limit` - Jumlah data per halaman (default: 10)
- `search` - Kata kunci pencarian
- `subject` - ID mata pelajaran
- `teacher` - ID guru
- `class` - ID kelas
- `status` - Status publikasi (published/draft)

### GET `/admin/exams/:id/json`
Mendapatkan detail ujian dalam format JSON untuk modal

**Response:**
```json
{
  "ok": true,
  "exam": {
    "id": 1,
    "title": "Ujian Matematika",
    "description": "...",
    "subject_name": "Matematika",
    "teacher_name": "Budi Santoso",
    "class_name": "X RPL 1",
    "question_count": 20,
    "duration_minutes": 90,
    "pass_score": 75,
    "is_published": 1,
    ...
  }
}
```

### POST `/admin/exams/:id/toggle-publish`
Mengubah status publikasi ujian (publish ↔ unpublish)

### DELETE `/admin/exams/:id`
Menghapus ujian beserta semua data terkait

## Catatan Penting

1. **Cascade Delete**: Menghapus ujian akan otomatis menghapus:
   - Semua soal ujian
   - Semua opsi jawaban
   - Semua percobaan siswa
   - Semua jawaban siswa
   (Sesuai dengan foreign key constraint di database)

2. **Tidak Ada Edit**: Admin hanya bisa melihat dan menghapus ujian, tidak bisa mengedit. Edit ujian tetap menjadi hak guru pembuat.

3. **Filter Persisten**: Filter yang dipilih akan tetap aktif saat navigasi pagination.

## Pengembangan Selanjutnya

Fitur yang bisa ditambahkan:
- Export data ujian ke Excel/PDF
- Statistik lebih detail per ujian
- Bulk actions (hapus/publish multiple ujian)
- Log aktivitas admin
- Notifikasi ke guru saat ujian dihapus
- Duplicate ujian
- Transfer ownership ujian ke guru lain
