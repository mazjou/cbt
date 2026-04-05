# Fitur: Admin Manajemen Tugas & Bank Soal

## 📋 Deskripsi

Menambahkan 2 menu baru di dashboard admin untuk mengelola tugas dan bank soal dari semua guru.

## ✨ Fitur yang Ditambahkan

### 1. Manajemen Tugas (Admin)

Admin dapat:
- Melihat semua tugas dari semua guru
- Filter berdasarkan mata pelajaran, status (published/draft)
- Search berdasarkan judul tugas atau nama guru
- Lihat statistik: total tugas, published, draft, total submission
- Hapus tugas jika diperlukan

### 2. Manajemen Bank Soal (Admin)

Admin dapat:
- Melihat semua bank soal dari semua guru
- Filter berdasarkan mata pelajaran, tingkat kesulitan (mudah/sedang/sulit)
- Search berdasarkan teks soal atau nama guru
- Lihat statistik: total soal, jumlah per tingkat kesulitan
- Hapus soal jika diperlukan

## 📁 File yang Dibuat/Diubah

### File Baru:

1. **src/views/admin/assignments.ejs**
   - Halaman daftar tugas untuk admin
   - Tabel dengan filter dan search
   - Statistik tugas

2. **src/views/admin/question_bank.ejs**
   - Halaman daftar bank soal untuk admin
   - Tabel dengan filter dan search
   - Statistik bank soal

### File Diubah:

1. **src/views/admin/index.ejs**
   - Tambah 2 card baru:
     - Card "Tugas" (warna amber/orange)
     - Card "Bank Soal" (warna pink/rose)

2. **src/routes/admin.js**
   - Tambah route `GET /admin/assignments`
   - Tambah route `POST /admin/assignments/:id/delete`
   - Tambah route `GET /admin/question-bank`
   - Tambah route `POST /admin/question-bank/:id/delete`

## 🎨 Desain UI

### Card di Dashboard Admin:

**Card Tugas:**
- Warna: Amber/Orange gradient
- Icon: 📝
- Link: `/admin/assignments`

**Card Bank Soal:**
- Warna: Pink/Rose gradient
- Icon: 💡
- Link: `/admin/question-bank`

### Halaman Manajemen Tugas:

**Filter:**
- Search: Judul tugas atau nama guru
- Mata Pelajaran: Dropdown semua mapel
- Status: Published / Draft

**Statistik:**
- Total Tugas
- Published
- Draft
- Total Submission

**Tabel:**
- Judul Tugas
- Guru
- Mata Pelajaran
- Kelas
- Deadline
- Status
- Submission Count
- Aksi (Detail, Hapus)

### Halaman Manajemen Bank Soal:

**Filter:**
- Search: Teks soal atau nama guru
- Mata Pelajaran: Dropdown semua mapel
- Tingkat: Mudah / Sedang / Sulit

**Statistik:**
- Total Soal
- Mudah
- Sedang
- Sulit

**Tabel:**
- Soal (preview 100 karakter)
- Guru
- Mata Pelajaran
- Tingkat Kesulitan
- Tags
- Tanggal Dibuat
- Aksi (Detail, Hapus)

## 🔧 Cara Menggunakan

### Akses Manajemen Tugas:

1. Login sebagai admin
2. Buka dashboard admin
3. Klik card "Tugas"
4. Gunakan filter untuk mencari tugas tertentu
5. Klik "Detail" untuk melihat detail tugas
6. Klik "Hapus" untuk menghapus tugas (dengan konfirmasi)

### Akses Manajemen Bank Soal:

1. Login sebagai admin
2. Buka dashboard admin
3. Klik card "Bank Soal"
4. Gunakan filter untuk mencari soal tertentu
5. Klik "Detail" untuk melihat detail soal
6. Klik "Hapus" untuk menghapus soal (dengan konfirmasi)

## 🧪 Testing

### Test Manajemen Tugas:

1. **Test Akses**
   - Login sebagai admin
   - Buka `/admin/assignments`
   - Seharusnya muncul daftar tugas

2. **Test Filter**
   - Pilih mata pelajaran tertentu
   - Pilih status (published/draft)
   - Klik "Filter"
   - Seharusnya hasil ter-filter

3. **Test Search**
   - Ketik judul tugas atau nama guru
   - Klik "Filter"
   - Seharusnya hasil ter-filter

4. **Test Hapus**
   - Klik "Hapus" pada salah satu tugas
   - Konfirmasi hapus
   - Seharusnya tugas terhapus

### Test Manajemen Bank Soal:

1. **Test Akses**
   - Login sebagai admin
   - Buka `/admin/question-bank`
   - Seharusnya muncul daftar soal

2. **Test Filter**
   - Pilih mata pelajaran tertentu
   - Pilih tingkat kesulitan
   - Klik "Filter"
   - Seharusnya hasil ter-filter

3. **Test Search**
   - Ketik teks soal atau nama guru
   - Klik "Filter"
   - Seharusnya hasil ter-filter

4. **Test Hapus**
   - Klik "Hapus" pada salah satu soal
   - Konfirmasi hapus
   - Seharusnya soal terhapus

## 📊 Query Database

### Query untuk Manajemen Tugas:

```sql
-- Get all assignments with teacher and subject info
SELECT 
  a.*,
  u.full_name as teacher_name,
  s.name as subject_name,
  c.name as class_name,
  (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) as submission_count
FROM assignments a
JOIN users u ON a.teacher_id = u.id
JOIN subjects s ON a.subject_id = s.id
LEFT JOIN classes c ON a.class_id = c.id
ORDER BY a.created_at DESC;

-- Get stats
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) as published,
  SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) as draft,
  (SELECT COUNT(*) FROM assignment_submissions) as submissions
FROM assignments;
```

### Query untuk Manajemen Bank Soal:

```sql
-- Get all questions with teacher and subject info
SELECT 
  qb.*,
  u.full_name as teacher_name,
  s.name as subject_name
FROM question_bank qb
JOIN users u ON qb.teacher_id = u.id
JOIN subjects s ON qb.subject_id = s.id
ORDER BY qb.created_at DESC;

-- Get stats
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN difficulty = 'EASY' THEN 1 ELSE 0 END) as easy,
  SUM(CASE WHEN difficulty = 'MEDIUM' THEN 1 ELSE 0 END) as medium,
  SUM(CASE WHEN difficulty = 'HARD' THEN 1 ELSE 0 END) as hard
FROM question_bank;
```

## 🔒 Keamanan

- Hanya admin yang bisa akses halaman ini (middleware `requireRole('ADMIN')`)
- Konfirmasi sebelum hapus data
- Validasi input untuk filter dan search

## 📝 Catatan

1. **Hapus Tugas**: Akan menghapus semua submission terkait (CASCADE)
2. **Hapus Bank Soal**: Akan menghapus semua opsi jawaban terkait (CASCADE)
3. **Filter**: Bisa dikombinasikan (search + mata pelajaran + status/tingkat)
4. **Statistik**: Dihitung real-time dari database

## 🚀 Fitur Tambahan (Opsional)

Fitur yang bisa ditambahkan di masa depan:

1. **Export Data**
   - Export tugas ke Excel
   - Export bank soal ke Excel

2. **Bulk Actions**
   - Hapus multiple tugas sekaligus
   - Hapus multiple soal sekaligus

3. **Detail View**
   - Halaman detail tugas dengan daftar submission
   - Halaman detail soal dengan opsi jawaban

4. **Edit**
   - Admin bisa edit tugas
   - Admin bisa edit bank soal

## ✅ Checklist

- [x] Tambah card "Tugas" di dashboard admin
- [x] Tambah card "Bank Soal" di dashboard admin
- [x] Buat halaman manajemen tugas
- [x] Buat halaman manajemen bank soal
- [x] Tambah route untuk assignments
- [x] Tambah route untuk question bank
- [x] Tambah filter dan search
- [x] Tambah statistik
- [x] Tambah fitur hapus
- [x] Dokumentasi lengkap

---

**Status:** ✅ Selesai
**Tanggal:** 2024
**File Dibuat:** 3 file baru
**File Diubah:** 2 file
