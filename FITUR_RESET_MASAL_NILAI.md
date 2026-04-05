# Fitur Reset Masal Nilai Siswa

## Deskripsi
Fitur untuk mereset nilai ujian siswa secara masal dengan filter yang fleksibel, tersedia untuk guru dan admin.

## Fitur Utama

### 1. Reset Masal untuk Guru
**Lokasi**: `/teacher/grades`

**Fitur:**
- ✅ Checkbox "Select All" untuk memilih semua nilai
- ✅ Checkbox individual per baris nilai
- ✅ Bulk action bar yang muncul saat ada nilai dipilih
- ✅ Konfirmasi detail sebelum reset
- ✅ Filter berdasarkan ujian, kelas, nama siswa
- ✅ Hanya dapat mereset nilai dari ujian milik guru tersebut

**Keamanan:**
- Verifikasi ownership: guru hanya bisa reset nilai dari ujiannya sendiri
- Konfirmasi dengan detail siswa dan ujian yang akan direset
- Transaction database untuk konsistensi data

### 2. Reset Masal untuk Admin
**Lokasi**: `/admin/grades`

**Fitur:**
- ✅ Checkbox "Select All" untuk memilih semua nilai
- ✅ Checkbox individual per baris nilai
- ✅ Bulk action bar yang muncul saat ada nilai dipilih
- ✅ Konfirmasi detail sebelum reset
- ✅ Filter berdasarkan ujian, kelas, guru, nama siswa
- ✅ Dapat mereset nilai dari semua ujian (semua guru)

**Keamanan:**
- Admin memiliki akses penuh ke semua nilai
- Konfirmasi dengan detail siswa dan ujian yang akan direset
- Transaction database untuk konsistensi data

## Implementasi Teknis

### 1. Database
**Tabel yang Terlibat:**
- `attempts` - Data percobaan ujian siswa (akan dihapus)
- `attempt_answers` - Jawaban siswa (dihapus otomatis via CASCADE)

**Operasi:**
```sql
DELETE FROM attempts WHERE id IN (1, 2, 3, ...);
-- attempt_answers akan terhapus otomatis karena ON DELETE CASCADE
```

### 2. Routes Baru

#### Guru Routes (src/routes/teacher.js)
```javascript
// Bulk reset nilai untuk guru
POST /teacher/attempts/bulk-reset

// Individual reset (sudah ada)
POST /teacher/attempts/:id/reset
```

#### Admin Routes (src/routes/admin.js)
```javascript
// Halaman kelola nilai admin
GET /admin/grades

// Bulk reset nilai untuk admin
POST /admin/attempts/bulk-reset

// Individual reset untuk admin
POST /admin/attempts/:id/reset
```

### 3. Views Baru
- `src/views/admin/grades.ejs` - Halaman kelola nilai untuk admin
- Update `src/views/teacher/grades.ejs` - Tambah fitur bulk reset
- Update `src/views/admin/index.ejs` - Tambah link ke halaman nilai

### 4. JavaScript Functions
```javascript
// Toggle select all checkbox
function toggleSelectAll()

// Update bulk actions bar visibility
function updateBulkActions()

// Clear all selections
function clearSelection()

// Execute bulk reset with confirmation
function bulkReset()
```

## Cara Penggunaan

### Untuk Guru:
1. Buka halaman **Daftar Nilai** (`/teacher/grades`)
2. Gunakan filter untuk mempersempit data (opsional)
3. Pilih nilai yang ingin direset:
   - Centang checkbox individual, atau
   - Centang "Select All" untuk pilih semua
4. Klik tombol **"🗑️ Reset Nilai Terpilih"**
5. Konfirmasi dengan melihat detail yang akan direset
6. Klik "OK" untuk melanjutkan

### Untuk Admin:
1. Buka **Panel Admin** (`/admin`)
2. Klik card **"Nilai"** untuk masuk ke halaman kelola nilai
3. Gunakan filter untuk mempersempit data (ujian, kelas, guru, nama)
4. Pilih nilai yang ingin direset:
   - Centang checkbox individual, atau
   - Centang "Select All" untuk pilih semua
5. Klik tombol **"🗑️ Reset Nilai Terpilih"**
6. Konfirmasi dengan melihat detail yang akan direset
7. Klik "OK" untuk melanjutkan

## Filter yang Tersedia

### Filter Guru:
- **Ujian**: Pilih ujian tertentu atau semua ujian
- **Kelas**: Pilih kelas tertentu atau semua kelas
- **Cari**: Nama siswa atau username
- **Per Halaman**: 10, 20, 50, 100 data per halaman

### Filter Admin:
- **Ujian**: Pilih ujian tertentu atau semua ujian
- **Kelas**: Pilih kelas tertentu atau semua kelas
- **Guru**: Pilih guru tertentu atau semua guru
- **Cari**: Nama siswa, username, atau judul ujian

## Keamanan & Validasi

### 1. Ownership Verification (Guru)
```javascript
// Verifikasi bahwa attempt belongs to exam owned by teacher
const [attempts] = await conn.query(
  `SELECT a.id FROM attempts a
   JOIN exams e ON e.id=a.exam_id
   WHERE a.id IN (${placeholders}) AND e.teacher_id=?;`,
  [...validIds, user.id]
);
```

### 2. Input Validation
- Validasi attempt_ids adalah array integer yang valid
- Cek minimal 1 attempt dipilih
- Verifikasi keberadaan attempt di database

### 3. Transaction Safety
- Menggunakan database transaction
- Rollback jika terjadi error
- Commit hanya jika semua operasi berhasil

### 4. User Confirmation
- Konfirmasi dengan detail siswa dan ujian
- Maksimal 5 item ditampilkan dalam konfirmasi
- Peringatan bahwa siswa dapat mengulang ujian

## Error Handling

### Possible Errors:
1. **"Tidak ada nilai yang dipilih"** - User belum centang checkbox
2. **"Tidak ada ID attempt yang valid"** - Data corrupt atau invalid
3. **"Akses ditolak"** - Guru mencoba reset nilai ujian bukan miliknya
4. **"Gagal reset nilai"** - Database error atau constraint violation

### Success Messages:
- **"Berhasil reset X nilai siswa. Siswa dapat mengulang ujian."**

## Dampak Reset Nilai

### Yang Terjadi Saat Reset:
1. **Data attempts dihapus** - Record percobaan ujian siswa
2. **Data attempt_answers dihapus** - Jawaban siswa (otomatis via CASCADE)
3. **Siswa dapat mengulang ujian** - Sesuai batas max_attempts
4. **History hilang** - Nilai dan jawaban sebelumnya tidak dapat dikembalikan

### Yang TIDAK Terpengaruh:
- Data ujian (questions, options) tetap ada
- Pengaturan ujian (durasi, passing score) tidak berubah
- Data siswa dan kelas tidak berubah
- Ujian tetap published/draft sesuai status sebelumnya

## File yang Dimodifikasi/Ditambah

### Routes:
- `src/routes/teacher.js` - Tambah route bulk reset
- `src/routes/admin.js` - Tambah routes grades dan bulk reset

### Views:
- `src/views/teacher/grades.ejs` - Tambah checkbox dan bulk actions
- `src/views/admin/grades.ejs` - Halaman baru untuk admin
- `src/views/admin/index.ejs` - Tambah link ke halaman nilai

### JavaScript:
- Fungsi bulk selection dan reset di kedua halaman grades

## Testing

### Test Cases:
1. **Bulk reset sebagai guru** - hanya nilai ujian sendiri
2. **Bulk reset sebagai admin** - semua nilai ujian
3. **Filter dan pagination** - pastikan berfungsi dengan bulk actions
4. **Ownership verification** - guru tidak bisa reset ujian guru lain
5. **Error handling** - invalid IDs, database errors
6. **UI responsiveness** - checkbox states, bulk actions bar

### Test Data:
- Buat beberapa ujian dengan nilai siswa
- Test dengan user guru dan admin
- Test dengan berbagai kombinasi filter
- Test error scenarios (invalid IDs, etc.)

## Catatan Penting

⚠️ **PERINGATAN**: Reset nilai bersifat permanen dan tidak dapat dibatalkan  
⚠️ **BACKUP**: Selalu backup database sebelum bulk reset  
⚠️ **TESTING**: Test fitur di environment development terlebih dahulu  
⚠️ **KOMUNIKASI**: Informasikan ke siswa jika nilai mereka akan direset  

## Manfaat Fitur

✅ **Efisiensi**: Reset banyak nilai sekaligus, tidak satu per satu  
✅ **Fleksibilitas**: Filter yang beragam untuk targeting yang tepat  
✅ **Keamanan**: Ownership verification dan konfirmasi detail  
✅ **User Experience**: UI yang intuitif dengan checkbox dan bulk actions  
✅ **Admin Control**: Admin memiliki kontrol penuh atas semua nilai  
✅ **Teacher Autonomy**: Guru dapat mengelola nilai ujiannya sendiri  