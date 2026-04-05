# Fitur Filter Keterangan pada Nilai

## Deskripsi
Menambahkan filter **Status** dan **Keterangan** pada halaman daftar nilai untuk guru dan admin, memungkinkan filtering berdasarkan status ujian dan hasil kelulusan siswa.

## Filter Baru yang Ditambahkan

### 1. Filter Status
**Lokasi**: Halaman Daftar Nilai (Guru & Admin)
**Opsi**:
- **Semua Status** - Menampilkan semua status
- **Selesai** - Hanya attempt dengan status `SUBMITTED`
- **Sedang Dikerjakan** - Hanya attempt dengan status `IN_PROGRESS`
- **Ditinggalkan** - Hanya attempt dengan status `ABANDONED`

### 2. Filter Keterangan (Hasil Kelulusan)
**Lokasi**: Halaman Daftar Nilai (Guru & Admin)
**Opsi**:
- **Semua** - Menampilkan semua hasil
- **Lulus** - Hanya siswa yang lulus (score >= pass_score)
- **Tidak Lulus** - Hanya siswa yang tidak lulus (score < pass_score)

**Catatan**: Filter keterangan hanya berlaku untuk attempt dengan status `SUBMITTED`

## Implementasi Teknis

### 1. Database Query Logic

#### Filter Status:
```sql
-- Jika status dipilih
WHERE a.status = 'SUBMITTED'
```

#### Filter Keterangan:
```sql
-- Untuk "Lulus"
WHERE a.status = "SUBMITTED" AND a.score >= e.pass_score

-- Untuk "Tidak Lulus"  
WHERE a.status = "SUBMITTED" AND a.score < e.pass_score
```

### 2. Routes yang Dimodifikasi

#### Teacher Routes (`src/routes/teacher.js`)
```javascript
router.get('/grades', async (req, res) => {
  // Parameter baru
  const status = (req.query.status || '').trim();
  const result = (req.query.result || '').trim();
  
  // Logic filtering
  if (status) {
    where.push('a.status=:status');
    params.status = status;
  }
  if (result && result === 'LULUS') {
    where.push('a.status="SUBMITTED" AND a.score >= e.pass_score');
  }
  if (result && result === 'TIDAK_LULUS') {
    where.push('a.status="SUBMITTED" AND a.score < e.pass_score');
  }
  
  // Pass ke template
  filters: { exam_id, class_id, status, result, q }
});
```

#### Admin Routes (`src/routes/admin.js`)
```javascript
router.get('/grades', async (req, res) => {
  // Parameter baru
  const status = (req.query.status || '').trim();
  const result = (req.query.result || '').trim();
  
  // Logic filtering sama seperti teacher
  // Pass ke template
  filters: { exam_id, class_id, teacher_id, status, result, q }
});
```

### 3. Views yang Dimodifikasi

#### Teacher Grades (`src/views/teacher/grades.ejs`)
- Grid layout diubah dari `lg:grid-cols-5` menjadi `lg:grid-cols-6`
- Menambahkan 2 dropdown filter baru:
  - Filter Status (setelah filter Kelas)
  - Filter Keterangan (setelah filter Status)
- Update pagination links untuk menyertakan parameter baru

#### Admin Grades (`src/views/admin/grades.ejs`)
- Grid layout diubah dari `lg:grid-cols-5` menjadi `lg:grid-cols-6`
- Menambahkan 2 dropdown filter baru:
  - Filter Status (setelah filter Guru)
  - Filter Keterangan (setelah filter Status)
- Update pagination links untuk menyertakan parameter baru

## UI/UX Improvements

### 1. Layout Responsif
- **Desktop**: 6 kolom grid untuk semua filter
- **Mobile**: Tetap responsive dengan stacking vertikal
- **Button area**: `lg:col-span-6` untuk tombol Filter dan Reset

### 2. Color Coding
- **Filter Status**: Indigo color scheme
- **Filter Keterangan**: Emerald color scheme (admin)
- **Konsistensi**: Mengikuti pola warna yang sudah ada

### 3. User Experience
- **Persistent Filters**: Filter tetap aktif saat pagination
- **URL Parameters**: Filter tersimpan di URL untuk bookmarking
- **Reset Function**: Tombol reset menghapus semua filter

## Cara Penggunaan

### Untuk Guru:
1. Buka halaman **Daftar Nilai** (`/teacher/grades`)
2. Pilih filter yang diinginkan:
   - **Ujian**: Pilih ujian tertentu
   - **Kelas**: Pilih kelas tertentu
   - **Status**: Pilih status attempt
   - **Keterangan**: Pilih hasil kelulusan
   - **Pencarian**: Ketik nama/username siswa
3. Klik **"Terapkan"** untuk menerapkan filter
4. Klik **"Reset"** untuk menghapus semua filter

### Untuk Admin:
1. Buka **Panel Admin** → **Nilai** (`/admin/grades`)
2. Pilih filter yang diinginkan:
   - **Ujian**: Pilih ujian tertentu
   - **Kelas**: Pilih kelas tertentu
   - **Guru**: Pilih guru tertentu
   - **Status**: Pilih status attempt
   - **Keterangan**: Pilih hasil kelulusan
   - **Pencarian**: Ketik nama siswa/ujian
3. Klik **"Filter"** untuk menerapkan filter
4. Klik **"Reset"** untuk menghapus semua filter

## Kombinasi Filter

### Contoh Penggunaan:
1. **Melihat siswa yang lulus ujian tertentu**:
   - Ujian: "Matematika Kelas X"
   - Keterangan: "Lulus"

2. **Melihat siswa yang sedang mengerjakan ujian**:
   - Status: "Sedang Dikerjakan"
   - Kelas: "X-A"

3. **Melihat semua siswa yang tidak lulus dari guru tertentu** (Admin):
   - Guru: "Pak Budi"
   - Keterangan: "Tidak Lulus"

4. **Mencari siswa tertentu yang sudah selesai ujian**:
   - Status: "Selesai"
   - Pencarian: "Ahmad"

## Keuntungan Fitur

### 1. **Analisis yang Lebih Baik**
✅ Guru dapat melihat tingkat kelulusan per ujian  
✅ Admin dapat menganalisis performa across teachers  
✅ Identifikasi siswa yang perlu bantuan tambahan  

### 2. **Efisiensi Waktu**
✅ Filter cepat tanpa perlu scroll manual  
✅ Kombinasi filter untuk targeting yang spesifik  
✅ Pagination yang tetap mempertahankan filter  

### 3. **Monitoring Real-time**
✅ Lihat siswa yang sedang mengerjakan ujian  
✅ Track progress ujian secara live  
✅ Identifikasi ujian yang ditinggalkan  

### 4. **Reporting & Analytics**
✅ Data terfilter untuk laporan  
✅ Export Excel dengan filter yang diterapkan  
✅ Bulk operations pada data yang sudah difilter  

## File yang Dimodifikasi

### Routes:
- `src/routes/teacher.js` - Tambah parameter status & result
- `src/routes/admin.js` - Tambah parameter status & result

### Views:
- `src/views/teacher/grades.ejs` - Tambah 2 filter dropdown
- `src/views/admin/grades.ejs` - Tambah 2 filter dropdown

### Parameters Baru:
- `status` - Filter berdasarkan status attempt
- `result` - Filter berdasarkan hasil kelulusan

## Testing

### Test Cases:
1. **Filter Status**: Test semua opsi status
2. **Filter Keterangan**: Test Lulus/Tidak Lulus
3. **Kombinasi Filter**: Test multiple filters bersamaan
4. **Pagination**: Test filter persist saat paging
5. **URL Parameters**: Test bookmark dengan filter
6. **Reset Function**: Test reset menghapus semua filter

### Test Data:
- Buat attempts dengan berbagai status
- Buat attempts dengan score di atas dan di bawah pass_score
- Test dengan berbagai kombinasi filter

## Catatan Penting

⚠️ **Filter Keterangan**: Hanya berlaku untuk attempt dengan status "SUBMITTED"  
⚠️ **Performance**: Filter yang kompleks mungkin memerlukan indexing database  
⚠️ **Consistency**: Pastikan logic filtering konsisten antara teacher dan admin  

## Future Enhancements

🔮 **Filter Tanggal**: Filter berdasarkan tanggal attempt  
🔮 **Filter Score Range**: Filter berdasarkan rentang nilai  
🔮 **Save Filter Presets**: Simpan kombinasi filter favorit  
🔮 **Export Filtered Data**: Export hanya data yang difilter  