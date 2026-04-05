# Fitur Cetak Kartu Login

## Deskripsi
Fitur untuk mencetak kartu login yang berisi username dan password pengguna. Kartu ini dapat dibagikan kepada guru dan siswa untuk memudahkan mereka login ke sistem LMS.

## Fitur Utama

### 1. Cetak Semua Pengguna
- Tombol "Cetak Kartu" di header halaman users
- Mencetak kartu untuk semua pengguna yang ada
- Dapat difilter berdasarkan role atau kelas

### 2. Cetak Pengguna Terpilih
- Checkbox untuk memilih pengguna tertentu
- Tombol "Cetak Kartu" muncul di bulk action bar
- Hanya mencetak kartu untuk pengguna yang dipilih

### 3. Desain Kartu
- Format kartu ukuran 90mm x 55mm (standar kartu nama)
- 4 kartu per halaman A4
- Desain gradient purple yang menarik
- Informasi lengkap: nama, role, kelas, username, password
- Logo sekolah dan nama sekolah
- Peringatan keamanan di footer

## Cara Penggunaan

### Cetak Semua Pengguna
1. Buka halaman "Kelola Pengguna" (`/admin/users`)
2. Klik tombol "Cetak Kartu" (warna pink) di header
3. Halaman cetak akan terbuka di tab baru
4. Klik tombol "Cetak Kartu" atau tekan Ctrl+P
5. Pilih printer dan cetak

### Cetak Pengguna Tertentu
1. Buka halaman "Kelola Pengguna"
2. Centang checkbox pengguna yang ingin dicetak kartunya
3. Tombol "Cetak Kartu" akan muncul di bulk action bar
4. Klik tombol tersebut
5. Halaman cetak akan terbuka dengan kartu yang dipilih
6. Cetak kartu

### Filter Sebelum Cetak
Anda bisa menambahkan parameter URL untuk filter:
- `/admin/users/print-cards?role=STUDENT` - Hanya siswa
- `/admin/users/print-cards?role=TEACHER` - Hanya guru
- `/admin/users/print-cards?class_id=5` - Hanya kelas tertentu
- `/admin/users/print-cards?ids=1,2,3` - ID spesifik

## Spesifikasi Teknis

### Route
**File**: `src/routes/admin.js`
```javascript
router.get('/users/print-cards', async (req, res) => {
  // Query users based on filters
  // Render print template
});
```

### Template
**File**: `src/views/admin/print_login_cards.ejs`
- Layout: No layout (standalone page)
- Print-friendly CSS
- Responsive grid (2 columns)
- Page break setiap 4 kartu

### Ukuran Kartu
- Lebar: 90mm
- Tinggi: 55mm
- Per halaman: 4 kartu (2x2 grid)
- Margin: 8mm antar kartu

### Informasi di Kartu
1. **Header**:
   - Logo sekolah (emoji 🎓)
   - Nama sekolah
   - Alamat sekolah

2. **Body**:
   - Nama lengkap pengguna
   - Badge role (GURU/SISWA)
   - Kelas (jika siswa)
   - Username
   - Password (default sama dengan username)

3. **Footer**:
   - Peringatan keamanan

## Konfigurasi

### Informasi Sekolah
Edit file `.env` untuk mengubah info sekolah:
```env
SCHOOL_NAME=SMK Negeri 1 Kras
SCHOOL_ADDRESS=Kediri, Jawa Timur
```

### Warna Kartu
Edit file `print_login_cards.ejs` bagian CSS:
```css
.login-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

## Tips Penggunaan

### 1. Cetak Awal Tahun Ajaran
- Cetak kartu untuk semua siswa baru
- Bagikan saat orientasi atau masa pengenalan

### 2. Cetak Per Kelas
- Filter berdasarkan kelas
- Cetak dan bagikan ke wali kelas

### 3. Cetak Pengguna Baru
- Pilih pengguna yang baru ditambahkan
- Cetak hanya kartu mereka

### 4. Rekomendasi Kertas
- Gunakan kertas HVS 80-100 gsm
- Atau kertas kartu (card stock) untuk hasil lebih bagus
- Bisa dilaminasi untuk ketahanan lebih lama

### 5. Keamanan
- Ingatkan pengguna untuk mengganti password setelah login pertama
- Jangan bagikan kartu ke orang yang tidak berhak
- Simpan kartu dengan aman

## Troubleshooting

### Kartu tidak muat di halaman
**Solusi**: Pastikan setting printer:
- Paper size: A4
- Margins: Default atau Minimum
- Scale: 100%

### Warna tidak keluar
**Solusi**: 
- Aktifkan "Print background graphics" di browser
- Chrome: More settings → Background graphics
- Firefox: Print → Options → Print backgrounds

### Kartu terpotong
**Solusi**:
- Cek margin printer
- Gunakan margin 10mm di CSS jika perlu
- Test print 1 halaman dulu

### Password tidak muncul
**Solusi**:
- Password default sama dengan username
- Jika user sudah ganti password, kartu akan tetap tampilkan username
- Admin perlu reset password jika perlu

## Pengembangan Selanjutnya

Fitur yang bisa ditambahkan:
1. QR Code untuk login cepat
2. Barcode untuk absensi
3. Foto profil pengguna
4. Nomor induk siswa/guru
5. Masa berlaku kartu
6. Custom template per sekolah
7. Export ke PDF
8. Watermark sekolah

## File yang Terlibat

1. `src/routes/admin.js` - Route cetak kartu
2. `src/views/admin/print_login_cards.ejs` - Template kartu
3. `src/views/admin/users.ejs` - Tombol cetak
4. `.env` - Konfigurasi sekolah

## Keamanan

⚠️ **Penting**:
- Kartu berisi password default (username)
- Ingatkan pengguna untuk segera mengganti password
- Jangan tinggalkan kartu di tempat umum
- Simpan master print dengan aman
- Pertimbangkan untuk tidak mencetak password jika keamanan sangat penting

---
**Status**: ✅ Siap Digunakan
**Versi**: 1.0
**Dibuat**: 2024
