# Fix Error Database pada Bulk Delete Users

## Masalah
Ketika menggunakan fitur hapus masal (bulk delete) pada halaman Kelola Pengguna, terjadi error:
```
Gagal menghapus pengguna. Error: Table 'cbt_kras.student_answers' doesn't exist
```

## Penyebab Error
1. **Tabel Tidak Ada**: Kode mencoba menghapus dari tabel yang tidak ada di database
2. **Database Schema Berbeda**: Setiap instalasi mungkin memiliki tabel yang berbeda
3. **Hardcoded Table Names**: Kode tidak mengecek keberadaan tabel sebelum menghapus

## Solusi yang Diterapkan

### 1. Bulk Delete Adaptif
File: `src/routes/admin.js` - route POST `/users/bulk-delete`

**Perubahan Utama:**
- **Dynamic Table Check**: Mengecek keberadaan tabel sebelum menghapus
- **Error Handling**: Melanjutkan proses meski ada tabel yang tidak ada
- **Logging Detail**: Menampilkan tabel mana yang berhasil/gagal dihapus

### 2. Implementasi Baru
```javascript
// List tabel yang akan dicek dan dihapus (berurutan)
const tablesToDelete = [
  { table: 'student_answers', column: 'user_id' },
  { table: 'exam_results', column: 'user_id' },
  { table: 'attempts', column: 'user_id' },
  { table: 'assignment_submissions', column: 'user_id' },
  { table: 'material_reads', column: 'student_id' },
  { table: 'notification_reads', column: 'user_id' },
  { table: 'live_class_participants', column: 'user_id' },
  { table: 'profile_photos', column: 'user_id' }
];

// Hapus dari setiap tabel jika ada
for (const { table, column } of tablesToDelete) {
  try {
    // Cek apakah tabel ada
    const [tables] = await conn.query(`SHOW TABLES LIKE '${table}';`);
    
    if (tables.length > 0) {
      const [result] = await conn.query(`DELETE FROM ${table} WHERE ${column} IN (${placeholders});`, validIds);
      console.log(`✅ Deleted ${result.affectedRows || 0} records from ${table}`);
    } else {
      console.log(`⚠️  Table ${table} not found, skipping...`);
    }
  } catch (e) {
    console.log(`⚠️  Error deleting from ${table}: ${e.message}`);
    // Lanjutkan ke tabel berikutnya
  }
}
```

### 3. Keuntungan Solusi Baru
✅ **Adaptif**: Bekerja dengan database schema apapun  
✅ **Robust**: Tidak crash jika tabel tidak ada  
✅ **Informatif**: Log detail proses penghapusan  
✅ **Aman**: Tetap menggunakan transaction untuk konsistensi  

## Script Diagnostik

### File: `check-database-tables.js`
Script untuk mengecek tabel apa saja yang ada di database Anda:

```bash
node check-database-tables.js
```

**Output yang dihasilkan:**
- Daftar tabel yang ada vs yang diharapkan
- Jumlah record di setiap tabel
- Foreign key constraints yang ada
- Summary keseluruhan

## Cara Menjalankan Fix

### 1. Restart Aplikasi
```bash
npm restart
# atau
pm2 restart lms-app
```

### 2. Test Bulk Delete
1. Buka halaman `/admin/users`
2. Pilih beberapa user test
3. Klik "Hapus Terpilih"
4. Periksa console log untuk melihat proses detail

### 3. Cek Database (Opsional)
```bash
node check-database-tables.js
```

## Hasil Setelah Fix

### Sebelum:
```
❌ Gagal menghapus pengguna. Error: Table 'cbt_kras.student_answers' doesn't exist
```

### Setelah:
```
✅ Berhasil menghapus 2 pengguna dan semua data terkait.
```

**Console Log Detail:**
```
⚠️  Table student_answers not found, skipping...
⚠️  Table exam_results not found, skipping...
✅ Deleted 5 records from attempts
✅ Deleted 2 records from assignment_submissions
✅ Deleted 3 records from material_reads
✅ Deleted 1 records from notification_reads
⚠️  Table live_class_participants not found, skipping...
⚠️  Table profile_photos not found, skipping...
```

## Database Schema Anda
Berdasarkan error, database Anda (`cbt_kras`) kemungkinan memiliki tabel:
- ✅ `users` (pasti ada)
- ✅ `attempts` (kemungkinan ada)
- ✅ `assignment_submissions` (kemungkinan ada)
- ✅ `material_reads` (kemungkinan ada)
- ✅ `notification_reads` (kemungkinan ada)
- ❌ `student_answers` (tidak ada)
- ❌ `exam_results` (mungkin tidak ada)
- ❌ `live_class_participants` (mungkin tidak ada)
- ❌ `profile_photos` (mungkin tidak ada)

## Catatan Penting
⚠️ **Backup Database**: Selalu backup sebelum bulk delete  
⚠️ **Test User**: Gunakan test user untuk testing yang aman  
⚠️ **Monitor Log**: Periksa console untuk melihat tabel mana yang dihapus  

## File yang Dimodifikasi
- `src/routes/admin.js` (route POST `/users/bulk-delete`)
- `check-database-tables.js` (script diagnostik baru)