# Fitur Hapus Masal Pengguna

## Deskripsi
Fitur untuk menghapus banyak pengguna sekaligus di halaman admin kelola pengguna. Admin dapat memilih beberapa pengguna dengan checkbox dan menghapusnya dalam satu aksi.

## Fitur yang Ditambahkan

### 1. Checkbox Selection
- Checkbox di setiap baris pengguna untuk memilih pengguna yang akan dihapus
- Checkbox "Select All" di header tabel untuk memilih/membatalkan semua pengguna
- Indeterminate state untuk checkbox "Select All" ketika sebagian pengguna dipilih

### 2. Bulk Action Bar
- Bar aksi yang muncul ketika ada pengguna yang dipilih
- Menampilkan jumlah pengguna yang dipilih
- Tombol "Hapus X Pengguna" dengan gradient merah
- Icon trash untuk visual yang jelas

### 3. Konfirmasi Hapus
- Dialog konfirmasi sebelum menghapus
- Menampilkan jumlah pengguna yang akan dihapus
- Peringatan bahwa data terkait juga akan dihapus

### 4. Cascade Delete
Backend menghapus data terkait secara otomatis:
- Attempts (hasil ujian siswa)
- Assignment submissions (pengumpulan tugas)
- Notification reads (status baca notifikasi)
- Live class participants (partisipasi kelas live)
- Users (data pengguna)

## File yang Dimodifikasi

### 1. `src/views/admin/users.ejs`
**Perubahan:**
- Menambahkan checkbox column di header tabel
- Menambahkan checkbox di setiap baris pengguna
- Menambahkan bulk action bar dengan form hapus masal
- Menambahkan JavaScript untuk handle checkbox selection
- Menambahkan fungsi konfirmasi hapus

**Kode yang Ditambahkan:**
```html
<!-- Bulk Action Bar -->
<div id="bulkActionBar" class="hidden">
  <form action="/admin/users/bulk-delete" method="POST" onsubmit="return confirmBulkDelete()">
    <button type="submit" class="...">
      Hapus <span id="selectedCount">0</span> Pengguna
    </button>
    <input type="hidden" name="user_ids" id="bulkDeleteIds" value="[]" />
  </form>
</div>

<!-- Checkbox di header -->
<th class="text-left py-2 w-12">
  <input type="checkbox" id="selectAll" class="..." />
</th>

<!-- Checkbox di setiap baris -->
<td class="py-2">
  <input type="checkbox" class="user-checkbox ..." data-user-id="<%= u.id %>" />
</td>
```

**JavaScript:**
```javascript
// Bulk delete functionality
function updateBulkActionBar() {
  const selectedIds = Array.from(userCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.getAttribute('data-user-id'));
  
  if (selectedIds.length > 0) {
    bulkActionBar.classList.remove('hidden');
    selectedCountSpan.textContent = selectedIds.length;
    bulkDeleteIdsInput.value = JSON.stringify(selectedIds);
  } else {
    bulkActionBar.classList.add('hidden');
  }
}

window.confirmBulkDelete = function() {
  const count = selectedCountSpan.textContent;
  return confirm(`Anda yakin ingin menghapus ${count} pengguna?\n\nPeringatan: Data terkait (ujian, tugas, notifikasi) juga akan dihapus!`);
};
```

### 2. `src/routes/admin.js`
**Perubahan:**
- Menambahkan route POST `/admin/users/bulk-delete`
- Implementasi cascade delete untuk data terkait
- Validasi input dan error handling
- Transaction untuk memastikan data consistency

**Kode yang Ditambahkan:**
```javascript
router.post('/users/bulk-delete', async (req, res) => {
  let user_ids = req.body.user_ids;
  
  // Parse JSON string if needed
  if (typeof user_ids === 'string') {
    try {
      user_ids = JSON.parse(user_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/users');
    }
  }
  
  // Validation
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    req.flash('error', 'Tidak ada pengguna yang dipilih untuk dihapus.');
    return res.redirect('/admin/users');
  }

  // Convert to integers and filter valid IDs
  const validIds = user_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data first (cascade)
    await conn.query(`DELETE FROM attempts WHERE user_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM assignment_submissions WHERE user_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM notification_reads WHERE user_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM live_class_participants WHERE user_id IN (${placeholders});`, validIds);
    
    // Finally delete users
    const [result] = await conn.query(`DELETE FROM users WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} pengguna dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus pengguna. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/users');
});
```

## Cara Menggunakan

1. **Buka halaman Kelola Pengguna**
   - Login sebagai admin
   - Navigasi ke menu "Kelola Pengguna"

2. **Pilih Pengguna yang Akan Dihapus**
   - Centang checkbox di setiap pengguna yang ingin dihapus
   - Atau gunakan checkbox "Select All" di header untuk memilih semua pengguna di halaman

3. **Hapus Pengguna**
   - Setelah memilih pengguna, bulk action bar akan muncul
   - Klik tombol "Hapus X Pengguna"
   - Konfirmasi dialog akan muncul
   - Klik OK untuk menghapus

4. **Hasil**
   - Flash message akan menampilkan jumlah pengguna yang berhasil dihapus
   - Halaman akan refresh dan menampilkan daftar pengguna yang tersisa

## Keamanan

### Validasi Input
- Validasi format JSON dari form
- Validasi array user_ids tidak kosong
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
- Semua data terkait pengguna akan ikut terhapus:
  - Hasil ujian (attempts)
  - Pengumpulan tugas (assignment_submissions)
  - Status baca notifikasi (notification_reads)
  - Partisipasi kelas live (live_class_participants)
- Pastikan backup database sebelum melakukan bulk delete
- Gunakan fitur ini dengan hati-hati

## Testing

### Test Case 1: Hapus 1 Pengguna
1. Pilih 1 pengguna dengan checkbox
2. Klik tombol "Hapus 1 Pengguna"
3. Konfirmasi dialog
4. Verifikasi pengguna terhapus

### Test Case 2: Hapus Multiple Pengguna
1. Pilih beberapa pengguna (misal 5)
2. Klik tombol "Hapus 5 Pengguna"
3. Konfirmasi dialog
4. Verifikasi semua pengguna terhapus

### Test Case 3: Select All
1. Klik checkbox "Select All"
2. Verifikasi semua checkbox tercentang
3. Klik tombol hapus
4. Konfirmasi dan verifikasi

### Test Case 4: Partial Selection
1. Pilih beberapa pengguna (tidak semua)
2. Verifikasi checkbox "Select All" dalam state indeterminate
3. Klik checkbox "Select All" untuk select semua
4. Klik lagi untuk unselect semua

### Test Case 5: Cancel Delete
1. Pilih beberapa pengguna
2. Klik tombol hapus
3. Klik Cancel di dialog konfirmasi
4. Verifikasi tidak ada pengguna yang terhapus

## Troubleshooting

### Bulk Action Bar Tidak Muncul
- Pastikan JavaScript tidak error (cek console browser)
- Pastikan checkbox memiliki class `user-checkbox`
- Pastikan checkbox memiliki attribute `data-user-id`

### Error "Format data tidak valid"
- Pastikan hidden input `bulkDeleteIds` berisi JSON array yang valid
- Cek JavaScript function `updateBulkActionBar()` berjalan dengan benar

### Error Database
- Cek foreign key constraints di database
- Pastikan semua tabel terkait sudah ditambahkan di cascade delete
- Cek log error di console server

### Pengguna Tidak Terhapus
- Cek apakah ID valid (integer > 0)
- Cek apakah ada error di transaction
- Cek log error di console server

## Fitur Tambahan yang Bisa Dikembangkan

1. **Soft Delete**
   - Tambahkan column `deleted_at` di tabel users
   - Ubah DELETE menjadi UPDATE dengan timestamp
   - Tambahkan fitur restore pengguna

2. **Export Before Delete**
   - Download data pengguna yang akan dihapus sebagai backup
   - Format Excel atau CSV

3. **Bulk Actions Lainnya**
   - Bulk activate/deactivate
   - Bulk change role
   - Bulk change class
   - Bulk reset password

4. **Audit Log**
   - Catat siapa yang melakukan bulk delete
   - Catat kapan dan berapa pengguna yang dihapus
   - Simpan di tabel audit_logs

5. **Pagination Aware**
   - Select all across all pages
   - Deselect specific items from "select all"

## Kesimpulan

Fitur hapus masal pengguna berhasil diimplementasikan dengan:
- UI yang user-friendly dengan checkbox selection
- Bulk action bar yang muncul dinamis
- Konfirmasi sebelum hapus untuk mencegah kesalahan
- Cascade delete untuk menjaga data consistency
- Transaction untuk memastikan atomicity
- Validasi input yang ketat
- Error handling yang baik

Fitur ini memudahkan admin untuk mengelola pengguna dalam jumlah besar, terutama saat:
- Membersihkan data siswa lulus
- Menghapus akun testing
- Maintenance database
- Migrasi data
