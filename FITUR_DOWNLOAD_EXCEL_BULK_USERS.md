# Fitur Download Excel Bulk Users

## Deskripsi
Fitur untuk mengunduh data pengguna yang dipilih (tertandai) dalam format Excel. Pengguna dapat memilih beberapa user dengan checkbox, kemudian mengunduh data mereka dalam satu file Excel.

## Fitur yang Tersedia

### 1. Download Semua Data Pengguna
- Tombol "Download Excel" di bagian atas halaman
- Mengunduh semua data pengguna sesuai filter yang aktif
- File: `data_pengguna_[timestamp].xlsx`

### 2. Download Data Pengguna Terpilih (Bulk)
- Pilih pengguna dengan checkbox
- Tombol "Download Excel" muncul di bulk action bar
- Hanya mengunduh data pengguna yang dipilih
- File: `data_pengguna_terpilih_[timestamp].xlsx`

## Cara Menggunakan

### Download Semua Data
1. Buka halaman **Kelola Pengguna** (`/admin/users`)
2. (Opsional) Gunakan filter untuk menyaring data
3. Klik tombol **Download Excel** di bagian atas
4. File Excel akan terunduh otomatis

### Download Data Terpilih
1. Buka halaman **Kelola Pengguna** (`/admin/users`)
2. Centang checkbox pada pengguna yang ingin diunduh
3. Bulk action bar akan muncul di atas tabel
4. Klik tombol **Download Excel** di bulk action bar
5. File Excel akan terunduh dengan data pengguna yang dipilih

## Format File Excel

File Excel yang dihasilkan memiliki kolom:
- **ID**: ID pengguna
- **Username**: Username pengguna
- **Nama Lengkap**: Nama lengkap pengguna
- **Role**: Role pengguna (STUDENT, TEACHER, PRINCIPAL, ADMIN)
- **Kelas**: Nama kelas (untuk siswa)
- **Status**: Status aktif/nonaktif
- **Dibuat**: Tanggal pembuatan akun

## Implementasi Teknis

### Frontend (users.ejs)
```javascript
// Fungsi download selected excel
window.downloadSelectedExcel = function() {
  const selectedIds = Array.from(userCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.getAttribute('data-user-id'));
  
  if (selectedIds.length === 0) {
    alert('Pilih pengguna yang ingin didownload terlebih dahulu.');
    return;
  }
  
  // Download excel with selected IDs
  window.location.href = `/admin/users/download?ids=${selectedIds.join(',')}`;
};
```

### Backend (admin.js)
```javascript
router.get('/users/download', async (req, res) => {
  try {
    // Support filter by IDs (bulk download)
    const { ids } = req.query;
    let query = `SELECT u.id, u.username, u.full_name, u.role, u.is_active, 
                        c.name AS class_name, u.created_at
                 FROM users u
                 LEFT JOIN classes c ON c.id=u.class_id`;
    
    const params = [];
    if (ids) {
      const idArray = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (idArray.length > 0) {
        query += ` WHERE u.id IN (${idArray.map(() => '?').join(',')})`;
        params.push(...idArray);
      }
    }
    
    query += ` ORDER BY u.id DESC`;
    
    const [users] = await pool.query(query, params);
    
    // Format data for Excel
    const data = users.map(u => ({
      'ID': u.id,
      'Username': u.username,
      'Nama Lengkap': u.full_name,
      'Role': u.role,
      'Kelas': u.class_name || '-',
      'Status': u.is_active ? 'Aktif' : 'Nonaktif',
      'Dibuat': new Date(u.created_at).toLocaleString('id-ID')
    }));
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // ID
      { wch: 20 }, // Username
      { wch: 30 }, // Nama Lengkap
      { wch: 12 }, // Role
      { wch: 20 }, // Kelas
      { wch: 12 }, // Status
      { wch: 20 }  // Dibuat
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Pengguna');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Send file
    const filename = ids ? `data_pengguna_terpilih_${Date.now()}.xlsx` : 
                           `data_pengguna_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengunduh data pengguna.');
    res.redirect('/admin/users');
  }
});
```

## Fitur Terkait

Fitur bulk lainnya yang tersedia:
1. **Bulk Delete** - Hapus beberapa pengguna sekaligus
2. **Bulk Move Class** - Pindahkan beberapa pengguna ke kelas lain
3. **Bulk Print Cards** - Cetak kartu login untuk pengguna terpilih
4. **Bulk Download Excel** - Download data pengguna terpilih (fitur ini)

## Keamanan

- Hanya admin yang dapat mengakses fitur ini
- Validasi ID pengguna dilakukan di backend
- ID yang tidak valid akan diabaikan
- Error handling untuk mencegah crash

## Catatan

- File Excel menggunakan format `.xlsx`
- Nama file menggunakan timestamp untuk menghindari duplikasi
- Kolom width sudah diatur agar mudah dibaca
- Format tanggal menggunakan locale Indonesia (id-ID)
- Jika tidak ada data yang dipilih, akan muncul alert peringatan

## Update Log

- **2024**: Fitur download Excel bulk users sudah tersedia dan berfungsi dengan baik
