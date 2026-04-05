# Fitur Download Data Master ke Excel

## Deskripsi
Admin dapat mengunduh semua data master (Kelas, Mata Pelajaran, Guru, Pengguna) dalam format Excel (.xlsx) untuk backup atau analisis.

## Fitur yang Ditambahkan

### 1. Tombol Download di Setiap Halaman Data Master
Tombol download dengan desain:
- Warna: Green-Emerald gradient
- Icon: Download icon
- Text: "Download Excel"
- Posisi: Di header, sebelah tombol Import

### 2. Routes Download

#### Kelas (`/admin/classes/download`)
Download semua data kelas dengan kolom:
- ID
- Kode
- Nama
- Dibuat (tanggal & waktu)

#### Mata Pelajaran (`/admin/subjects/download`)
Download semua data mata pelajaran dengan kolom:
- ID
- Kode
- Nama
- Dibuat (tanggal & waktu)

#### Guru (`/admin/teachers/download`)
Download semua data guru dengan kolom:
- ID
- Username
- Nama Lengkap
- Status (Aktif/Nonaktif)
- Dibuat (tanggal & waktu)

#### Pengguna (`/admin/users/download`)
Download semua data pengguna dengan kolom:
- ID
- Username
- Nama Lengkap
- Role (ADMIN/TEACHER/STUDENT)
- Kelas
- Status (Aktif/Nonaktif)
- Dibuat (tanggal & waktu)

## Implementasi Teknis

### Library yang Digunakan
- **xlsx** (sudah ada di project) - untuk generate Excel file

### Format File
- **Type**: Excel (.xlsx)
- **Encoding**: UTF-8
- **Sheet Name**: Sesuai data (Kelas, Mata Pelajaran, Guru, Pengguna)
- **Filename**: `data_{nama}_{timestamp}.xlsx`

### Column Width
Setiap kolom sudah diatur lebar optimalnya:
```javascript
ws['!cols'] = [
  { wch: 8 },  // ID
  { wch: 20 }, // Username/Kode
  { wch: 30 }, // Nama
  { wch: 12 }, // Status
  { wch: 20 }  // Tanggal
];
```

### Response Headers
```javascript
res.setHeader('Content-Disposition', `attachment; filename="data_kelas_${Date.now()}.xlsx"`);
res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
```

## Routes yang Ditambahkan

```javascript
// Download Kelas
GET /admin/classes/download

// Download Mata Pelajaran
GET /admin/subjects/download

// Download Guru
GET /admin/teachers/download

// Download Pengguna
GET /admin/users/download
```

## Files yang Dimodifikasi

### Routes
1. `src/routes/admin.js` - Tambah 4 routes download

### Views
1. `src/views/admin/classes.ejs` - Tambah tombol download
2. `src/views/admin/subjects.ejs` - Tambah tombol download
3. `src/views/admin/teachers.ejs` - Tambah tombol download
4. `src/views/admin/users.ejs` - Tambah tombol download

## Design Tombol

```html
<a href="/admin/classes/download" 
   class="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold transition-all shadow-md flex items-center gap-2">
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
  Download Excel
</a>
```

## Kegunaan

### 1. Backup Data
Admin dapat backup data master secara berkala

### 2. Analisis Data
Data dapat dibuka di Excel untuk analisis lebih lanjut

### 3. Reporting
Data dapat digunakan untuk membuat laporan

### 4. Migrasi Data
Data dapat digunakan untuk migrasi ke sistem lain

### 5. Audit
Data dapat digunakan untuk audit dan verifikasi

## Error Handling

Jika terjadi error saat download:
- Error di-log ke console
- Flash message error ditampilkan
- User di-redirect kembali ke halaman list

```javascript
catch (e) {
  console.error(e);
  req.flash('error', 'Gagal mengunduh data kelas.');
  res.redirect('/admin/classes');
}
```

## Testing

### Test 1: Download Kelas
1. Login sebagai admin
2. Pergi ke "Kelola Kelas"
3. Klik tombol "Download Excel"
4. File `data_kelas_[timestamp].xlsx` terdownload ✅
5. Buka file, cek data lengkap ✅

### Test 2: Download Mata Pelajaran
1. Pergi ke "Kelola Mata Pelajaran"
2. Klik "Download Excel"
3. File terdownload dengan data lengkap ✅

### Test 3: Download Guru
1. Pergi ke "Kelola Guru"
2. Klik "Download Excel"
3. File terdownload dengan data lengkap ✅

### Test 4: Download Pengguna
1. Pergi ke "Kelola Pengguna"
2. Klik "Download Excel"
3. File terdownload dengan semua user (admin, guru, siswa) ✅

### Test 5: Data Kosong
1. Jika tidak ada data, file tetap terdownload
2. Excel berisi header saja (tanpa data) ✅

### Test 6: Data Banyak
1. Test dengan 1000+ records
2. File tetap terdownload dengan cepat ✅

## Format Tanggal

Tanggal diformat menggunakan locale Indonesia:
```javascript
new Date(created_at).toLocaleString('id-ID')
// Output: "5/3/2026, 14:30:00"
```

## Keamanan

- Hanya admin yang bisa download (`requireRole('ADMIN')`)
- Tidak ada parameter user input (tidak ada SQL injection risk)
- File langsung di-stream ke browser (tidak disimpan di server)

## Performance

- Query langsung ke database tanpa pagination
- Data di-convert ke Excel di memory
- File di-stream langsung ke browser
- Tidak ada file temporary yang tersimpan

## Status
✅ Selesai - Tombol download sudah ditambahkan di semua halaman data master
