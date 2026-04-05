# Fitur Admin: Kelola Materi

## Deskripsi
Admin dapat melihat dan mengelola semua materi yang dibuat oleh guru di sistem LMS.

## Fitur yang Ditambahkan

### 1. Menu Kelola Materi di Dashboard Admin
- Card baru "Materi" dengan warna cyan di dashboard admin
- Link ke `/admin/materials`

### 2. Halaman List Materi (`/admin/materials`)
Menampilkan semua materi dengan fitur:

#### Filter & Pencarian
- **Search**: Cari berdasarkan judul atau deskripsi
- **Mata Pelajaran**: Filter berdasarkan mapel
- **Guru**: Filter berdasarkan guru pembuat
- **Kelas**: Filter berdasarkan kelas target
- **Status**: Filter Published/Draft

#### Statistik Cards
1. **Total Materi** - Jumlah semua materi di sistem
2. **Dipublikasi** - Materi yang sudah published
3. **Draft** - Materi yang belum published
4. **Pembaca** - Total pembaca dari semua materi

#### Tabel Materi
Kolom yang ditampilkan:
- **Materi**: Judul, deskripsi (80 karakter), tanggal dibuat
- **Tipe**: TEXT, PDF, VIDEO, LINK (dengan badge warna)
- **Mapel**: Kode mata pelajaran
- **Guru**: Nama guru pembuat
- **Kelas**: Kelas target atau "Semua"
- **Pembaca**: Jumlah siswa yang membaca
- **Status**: Published/Draft
- **Aksi**: Detail, Publish/Unpublish, Hapus

#### Pagination
- 10 materi per halaman (default)
- Navigasi halaman dengan nomor
- Info: "Menampilkan X - Y dari Z materi"

### 3. Modal Detail Materi
Menampilkan informasi lengkap:
- Judul & Deskripsi
- Tipe Materi
- Mata Pelajaran
- Guru Pembuat
- Kelas Target
- Total Pembaca
- Selesai Dibaca
- Status Publikasi

### 4. Aksi Admin
- **Detail**: Lihat informasi lengkap materi
- **Publish/Unpublish**: Toggle status publikasi
- **Hapus**: Hapus materi (dengan konfirmasi)

## Routes yang Ditambahkan

```javascript
// List materi dengan filter & pagination
GET /admin/materials

// Get detail materi (JSON untuk modal)
GET /admin/materials/:id/json

// Toggle publish status
POST /admin/materials/:id/toggle-publish

// Delete materi
DELETE /admin/materials/:id
```

## Database Query

### List Materi
```sql
SELECT 
  m.id, m.title, m.description, m.type, m.is_published, m.created_at,
  s.code AS subject_code, s.name AS subject_name,
  u.full_name AS teacher_name,
  c.name AS class_name,
  (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id) AS read_count
FROM materials m
LEFT JOIN subjects s ON s.id = m.subject_id
LEFT JOIN users u ON u.id = m.teacher_id
LEFT JOIN classes c ON c.id = m.class_id
WHERE [filters]
ORDER BY m.created_at DESC
LIMIT :limit OFFSET :offset;
```

### Detail Materi
```sql
SELECT 
  m.*, s.name AS subject_name, u.full_name AS teacher_name, c.name AS class_name,
  (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id) AS read_count,
  (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id AND completed_at IS NOT NULL) AS completed_count
FROM materials m
LEFT JOIN subjects s ON s.id = m.subject_id
LEFT JOIN users u ON u.id = m.teacher_id
LEFT JOIN classes c ON c.id = m.class_id
WHERE m.id = :id;
```

## Design System

### Warna Tema
- **Primary**: Cyan-Blue gradient
- **Cards**: Cyan (Total), Green (Published), Orange (Draft), Blue-Purple (Pembaca)
- **Tipe Badge**:
  - TEXT: Blue
  - PDF: Red
  - VIDEO: Purple
  - LINK: Green

### Komponen UI
- Header dengan gradient cyan-blue-indigo
- Filter section dengan border cyan
- Stats cards dengan gradient & hover effect
- Table dengan alternating row colors
- Modal dengan gradient header
- Buttons dengan gradient & hover scale effect

## Files yang Dimodifikasi/Dibuat

### Modified
1. `src/views/admin/index.ejs` - Tambah card "Kelola Materi"
2. `src/routes/admin.js` - Tambah routes materials

### Created
1. `src/views/admin/materials.ejs` - Halaman list materi

## Testing

### Test 1: Akses Halaman
1. Login sebagai admin
2. Klik card "Materi" di dashboard
3. Halaman list materi muncul ✅

### Test 2: Filter & Search
1. Coba search dengan keyword
2. Filter berdasarkan mapel
3. Filter berdasarkan guru
4. Filter berdasarkan kelas
5. Filter berdasarkan status
6. Kombinasi filter
7. Reset filter ✅

### Test 3: Pagination
1. Jika materi > 10, pagination muncul
2. Klik halaman berikutnya
3. Klik halaman sebelumnya
4. Klik nomor halaman langsung ✅

### Test 4: Detail Materi
1. Klik tombol "Detail"
2. Modal muncul dengan loading
3. Data materi ditampilkan lengkap
4. Klik X atau klik di luar modal untuk tutup ✅

### Test 5: Publish/Unpublish
1. Klik "Publish" pada materi draft
2. Status berubah jadi "Dipublikasi"
3. Klik "Unpublish" pada materi published
4. Status berubah jadi "Draft" ✅

### Test 6: Hapus Materi
1. Klik tombol "Hapus"
2. Konfirmasi muncul
3. Klik OK
4. Materi terhapus dari list ✅

## Statistik Dashboard

Admin dapat melihat:
- Total materi di sistem
- Berapa yang sudah published
- Berapa yang masih draft
- Total pembaca dari semua materi

## Keamanan

- Hanya admin yang bisa akses (`requireRole('ADMIN')`)
- Konfirmasi sebelum hapus materi
- Validasi ID materi sebelum operasi
- SQL injection protection dengan parameterized queries

## Status
✅ Selesai - Fitur admin kelola materi sudah lengkap dan siap digunakan
