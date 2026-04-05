# Update: Filter dan Logo Kartu Login

## Perubahan yang Dilakukan

### 1. Tambah Filter di Halaman Cetak
**Fitur Baru**:
- Dropdown filter "Role" (Semua/Guru/Siswa)
- Dropdown filter "Kelas" (Semua/Kelas tertentu)
- Tombol "Reset Filter" untuk clear semua filter
- Auto-submit saat filter berubah

**Cara Pakai**:
1. Buka halaman cetak kartu
2. Pilih filter role atau kelas
3. Filter otomatis apply dan kartu ter-update
4. Klik "Reset Filter" untuk kembali ke semua pengguna

### 2. Ganti Logo Kartu
**Sebelum**: Emoji 🎓
**Sesudah**: Logo SMKN 1 Kras dari `/images/logo.png`

**Fallback**: Jika logo tidak ditemukan, akan kembali ke emoji 🎓

### 3. Styling Filter
- Dropdown dengan border dan hover effect
- Focus state dengan shadow
- Responsive dan print-friendly
- Hidden saat print

## File yang Diubah

### 1. Template Kartu
**File**: `src/views/admin/print_login_cards.ejs`

**Perubahan**:
- Tambah form filter dengan 2 dropdown
- Update CSS untuk filter select
- Ganti emoji logo dengan `<img>` tag
- Tambah error handling untuk logo

### 2. Route
**File**: `src/routes/admin.js`

**Perubahan**:
- Query classes dari database
- Pass `classes`, `role`, `class_id` ke template
- Filter tetap berfungsi dengan parameter URL

## Cara Menggunakan Filter

### Filter by Role
```
/admin/users/print-cards?role=STUDENT  # Hanya siswa
/admin/users/print-cards?role=TEACHER  # Hanya guru
```

### Filter by Class
```
/admin/users/print-cards?class_id=5  # Hanya kelas dengan ID 5
```

### Kombinasi Filter
```
/admin/users/print-cards?role=STUDENT&class_id=5  # Siswa di kelas tertentu
```

### Filter + Selected IDs
```
/admin/users/print-cards?ids=1,2,3&role=STUDENT  # ID tertentu yang siswa
```

## Setup Logo

### 1. Siapkan File Logo
- Format: PNG atau JPG
- Ukuran rekomendasi: 200x200px atau 512x512px
- Background: Transparan (PNG) lebih baik

### 2. Simpan Logo
Letakkan file logo di:
```
src/public/images/logo.png
```

### 3. Alternatif Path
Jika logo di tempat lain, edit di template:
```html
<img src="/path/to/your/logo.png" alt="Logo">
```

### 4. Konfigurasi di .env
```env
SCHOOL_NAME=SMK Negeri 1 Kras
SCHOOL_ADDRESS=Kediri, Jawa Timur
```

## Tips Logo

### Ukuran Optimal
- Minimal: 100x100px
- Optimal: 200x200px - 512x512px
- Maksimal: 1024x1024px

### Format
- PNG dengan background transparan (terbaik)
- JPG dengan background putih
- SVG (perlu adjust CSS)

### Jika Logo Tidak Muncul
1. Cek path file: `src/public/images/logo.png`
2. Cek permission file (readable)
3. Cek console browser untuk error
4. Fallback emoji akan muncul otomatis

## Contoh Penggunaan

### Cetak Kartu Semua Siswa
1. Buka `/admin/users/print-cards`
2. Pilih filter "Role" → "Siswa"
3. Klik "Cetak Kartu"

### Cetak Kartu Kelas XII TKJ 1
1. Buka `/admin/users/print-cards`
2. Pilih filter "Kelas" → "XII TKJ 1"
3. Klik "Cetak Kartu"

### Cetak Kartu Guru Saja
1. Buka `/admin/users/print-cards`
2. Pilih filter "Role" → "Guru"
3. Klik "Cetak Kartu"

## Troubleshooting

### Filter tidak berfungsi
**Solusi**: 
- Pastikan JavaScript enabled
- Cek console browser untuk error
- Refresh halaman

### Logo tidak muncul
**Solusi**:
- Cek file ada di `src/public/images/logo.png`
- Cek permission file
- Emoji fallback akan muncul otomatis

### Dropdown kelas kosong
**Solusi**:
- Pastikan ada data kelas di database
- Cek query classes di route

## Keuntungan Update Ini

1. **Lebih Efisien**: Tidak perlu cetak semua, bisa filter dulu
2. **Hemat Kertas**: Cetak hanya yang diperlukan
3. **Lebih Profesional**: Logo sekolah asli di kartu
4. **Fleksibel**: Kombinasi filter sesuai kebutuhan
5. **User Friendly**: Auto-submit, tidak perlu klik tombol filter

---
**Status**: ✅ Selesai
**Versi**: 1.1
**Update**: Filter + Logo Real
