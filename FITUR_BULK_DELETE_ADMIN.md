# Fitur Bulk Delete untuk Admin

## Deskripsi
Fitur hapus masal (bulk delete) untuk admin pada halaman:
1. Kelola Mata Pelajaran (Subjects)
2. Kelola Kelas (Classes)
3. Kelola Ujian (Exams)
4. Kelola Materi (Materials)

Admin dapat memilih beberapa item dengan checkbox dan menghapusnya dalam satu aksi.

## Fitur yang Ditambahkan

### 1. Checkbox Selection System
- Checkbox di setiap baris item untuk memilih item yang akan dihapus
- Checkbox "Select All" di header tabel untuk memilih/membatalkan semua item
- Indeterminate state untuk checkbox "Select All" ketika sebagian item dipilih
- Counter jumlah item terpilih

### 2. Bulk Action Bar
- Bar aksi yang muncul otomatis saat ada item dipilih
- Menampilkan jumlah item yang dipilih
- Tombol "Hapus X Item" dengan gradient merah dan icon trash
- Hidden input untuk menyimpan array ID item

### 3. Konfirmasi Hapus
- Dialog konfirmasi sebelum menghapus
- Menampilkan jumlah item yang akan dihapus
- Peringatan bahwa data terkait juga akan dihapus

### 4. Cascade Delete
Backend menghapus data terkait secara otomatis untuk setiap entitas.

## File yang Dimodifikasi

### Views (Frontend)

#### 1. `src/views/admin/subjects.ejs`
- Tambah checkbox column di header tabel
- Tambah checkbox di setiap baris mata pelajaran
- Tambah bulk action bar dengan form hapus masal
- Tambah JavaScript untuk handle checkbox selection

#### 2. `src/views/admin/classes.ejs`
- Tambah checkbox column di header tabel
- Tambah checkbox di setiap baris kelas
- Tambah bulk action bar dengan form hapus masal
- Tambah JavaScript untuk handle checkbox selection

#### 3. `src/views/admin/exams.ejs`
- Tambah checkbox column di header tabel
- Tambah checkbox di setiap baris ujian
- Tambah bulk action bar dengan form hapus masal
- Tambah JavaScript untuk handle checkbox selection

#### 4. `src/views/admin/materials.ejs`
- Tambah checkbox column di header tabel
- Tambah checkbox di setiap baris materi
- Tambah bulk action bar dengan form hapus masal
- Tambah JavaScript untuk handle checkbox selection

### Routes (Backend)

#### `src/routes/admin.js`

**1. POST `/admin/subjects/bulk-delete`**
- Validasi input (parse JSON, filter valid IDs)
- Database transaction untuk atomicity
- Cascade delete:
  - exams (ujian dengan mata pelajaran ini)
  - materials (materi dengan mata pelajaran ini)
  - question_bank (bank soal dengan mata pelajaran ini)
  - subjects (data mata pelajaran)

**2. POST `/admin/classes/bulk-delete`**
- Validasi input (parse JSON, filter valid IDs)
- Database transaction untuk atomicity
- Cascade delete:
  - users.class_id = NULL (siswa di kelas ini)
  - exam_classes (relasi ujian-kelas)
  - material_classes (relasi materi-kelas)
  - classes (data kelas)

**3. POST `/admin/exams/bulk-delete`**
- Validasi input (parse JSON, filter valid IDs)
- Database transaction untuk atomicity
- Cascade delete:
  - attempts (percobaan siswa)
  - questions (soal ujian)
  - exam_classes (relasi ujian-kelas)
  - exams (data ujian)

**4. POST `/admin/materials/bulk-delete`**
- Validasi input (parse JSON, filter valid IDs)
- Database transaction untuk atomicity
- Cascade delete:
  - material_reads (pembaca materi)
  - material_classes (relasi materi-kelas)
  - materials (data materi)

## Cara Menggunakan

### Mata Pelajaran
1. Buka halaman "Kelola Mata Pelajaran" sebagai admin
2. Centang checkbox mata pelajaran yang ingin dihapus
3. Klik tombol "Hapus X Mapel" yang muncul
4. Konfirmasi dialog
5. Mata pelajaran dan data terkait akan terhapus

### Kelas
1. Buka halaman "Kelola Kelas" sebagai admin
2. Centang checkbox kelas yang ingin dihapus
3. Klik tombol "Hapus X Kelas" yang muncul
4. Konfirmasi dialog
5. Kelas dan data terkait akan terhapus

### Ujian
1. Buka halaman "Kelola Ujian" sebagai admin
2. Centang checkbox ujian yang ingin dihapus
3. Klik tombol "Hapus X Ujian" yang muncul
4. Konfirmasi dialog
5. Ujian dan data terkait akan terhapus

### Materi
1. Buka halaman "Kelola Materi" sebagai admin
2. Centang checkbox materi yang ingin dihapus
3. Klik tombol "Hapus X Materi" yang muncul
4. Konfirmasi dialog
5. Materi dan data terkait akan terhapus

## Cascade Delete Details

### Subjects (Mata Pelajaran)
Menghapus mata pelajaran akan menghapus:
- Semua ujian dengan mata pelajaran ini
- Semua materi dengan mata pelajaran ini
- Semua bank soal dengan mata pelajaran ini

### Classes (Kelas)
Menghapus kelas akan:
- Set `class_id = NULL` untuk semua siswa di kelas ini
- Hapus relasi ujian-kelas
- Hapus relasi materi-kelas

### Exams (Ujian)
Menghapus ujian akan menghapus:
- Semua percobaan siswa (attempts)
- Semua soal ujian (questions)
- Relasi ujian-kelas (exam_classes)

### Materials (Materi)
Menghapus materi akan menghapus:
- Semua data pembaca (material_reads)
- Relasi materi-kelas (material_classes)

## Keamanan

### Validasi Input
- Validasi format JSON dari form
- Validasi array IDs tidak kosong
- Konversi ke integer dan filter ID yang valid
- Cek ID > 0 untuk mencegah invalid ID

### Transaction
- Menggunakan database transaction
- Rollback otomatis jika terjadi error
- Memastikan data consistency

### Cascade Delete
- Menghapus data terkait terlebih dahulu
- Mencegah foreign key constraint error
- Memastikan tidak ada orphaned data

## Peringatan

⚠️ **PERHATIAN:**
- Penghapusan bersifat permanen dan tidak dapat dibatalkan
- Semua data terkait akan ikut terhapus
- Pastikan backup database sebelum melakukan bulk delete
- Gunakan fitur ini dengan hati-hati

### Subjects
- Menghapus mata pelajaran akan menghapus SEMUA ujian dan materi terkait
- Bisa berdampak besar pada sistem

### Classes
- Menghapus kelas akan membuat siswa kehilangan kelas mereka
- Siswa akan menjadi tanpa kelas (class_id = NULL)

### Exams
- Menghapus ujian akan menghapus SEMUA hasil ujian siswa
- Data nilai siswa akan hilang permanen

### Materials
- Menghapus materi akan menghapus progress pembaca
- Data pembaca akan hilang permanen

## Testing Checklist

### Subjects
- [ ] Hapus 1 mata pelajaran
- [ ] Hapus multiple mata pelajaran (3-5)
- [ ] Select all mata pelajaran di halaman
- [ ] Verifikasi cascade delete (ujian, materi, bank soal)

### Classes
- [ ] Hapus 1 kelas
- [ ] Hapus multiple kelas (3-5)
- [ ] Select all kelas di halaman
- [ ] Verifikasi siswa menjadi tanpa kelas

### Exams
- [ ] Hapus 1 ujian
- [ ] Hapus multiple ujian (3-5)
- [ ] Select all ujian di halaman
- [ ] Verifikasi cascade delete (attempts, questions)

### Materials
- [ ] Hapus 1 materi
- [ ] Hapus multiple materi (3-5)
- [ ] Select all materi di halaman
- [ ] Verifikasi cascade delete (reads, classes)

### General
- [ ] Partial selection (indeterminate state)
- [ ] Cancel delete (klik Cancel di dialog)
- [ ] Test dengan pagination
- [ ] Test error handling

## Troubleshooting

### Bulk Action Bar Tidak Muncul
- Pastikan JavaScript tidak error (cek console browser)
- Pastikan checkbox memiliki class `item-checkbox`
- Pastikan checkbox memiliki attribute `data-item-id`

### Error "Format data tidak valid"
- Pastikan hidden input berisi JSON array yang valid
- Cek JavaScript function `updateBulkActionBar()` berjalan dengan benar

### Error Database
- Cek foreign key constraints di database
- Pastikan semua tabel terkait sudah ditambahkan di cascade delete
- Cek log error di console server

### Item Tidak Terhapus
- Cek apakah ID valid (integer > 0)
- Cek apakah ada error di transaction
- Cek log error di console server

## Fitur Tambahan yang Bisa Dikembangkan

1. **Soft Delete**
   - Tambahkan column `deleted_at`
   - Ubah DELETE menjadi UPDATE dengan timestamp
   - Tambahkan fitur restore

2. **Export Before Delete**
   - Download data yang akan dihapus sebagai backup
   - Format Excel atau CSV

3. **Bulk Actions Lainnya**
   - Bulk publish/unpublish (untuk exams dan materials)
   - Bulk change subject (untuk exams dan materials)
   - Bulk change class

4. **Audit Log**
   - Catat siapa yang melakukan bulk delete
   - Catat kapan dan berapa item yang dihapus
   - Simpan di tabel audit_logs

5. **Pagination Aware**
   - Select all across all pages
   - Deselect specific items from "select all"

6. **Confirmation with Details**
   - Show list of items to be deleted
   - Show cascade delete impact
   - Require typing confirmation text

## Kesimpulan

Fitur bulk delete berhasil diimplementasikan untuk 4 entitas admin:
- Mata Pelajaran (Subjects)
- Kelas (Classes)
- Ujian (Exams)
- Materi (Materials)

Setiap implementasi memiliki:
- UI intuitif dengan checkbox selection
- Backend robust dengan transaction dan cascade delete
- Validasi dan error handling yang baik
- Dokumentasi lengkap

Fitur ini memudahkan admin untuk mengelola data dalam jumlah besar, terutama saat:
- Membersihkan data lama
- Maintenance database
- Migrasi data
- Reorganisasi sistem

Siap digunakan untuk mengelola data secara efisien! 🎉
