# Solusi Cepat: Internal Server Error - Halaman Profil

## Masalah
❌ Internal server error saat akses halaman profil setelah migrasi database

## Penyebab
Session user tidak memiliki field `profile_photo` yang dibutuhkan oleh navbar dan halaman profil.

## Solusi (3 Langkah)

### 1. Restart Server
```bash
# Tekan Ctrl+C untuk stop server
# Lalu jalankan lagi:
npm start

# Atau jika pakai PM2:
pm2 restart lms-smkn1kras
```

### 2. Logout dari Aplikasi
1. Buka aplikasi di browser
2. Klik dropdown profil di pojok kanan atas
3. Klik tombol "Keluar"

### 3. Login Ulang
1. Masukkan username dan password
2. Login
3. Sekarang halaman profil bisa diakses tanpa error

## Kenapa Harus Logout-Login?
Session lama dibuat sebelum ada field `profile_photo`. Dengan logout-login, session baru akan dibuat dengan struktur yang lengkap termasuk `profile_photo`.

## Test Berhasil
✅ Klik dropdown profil → "Profil Saya" → Halaman profil muncul
✅ Upload foto profil → Foto muncul di navbar
✅ Edit nama/password → Berhasil tersimpan

## Jika Masih Error
1. Cek apakah sharp terinstall: `npm list sharp`
2. Jika belum: `npm install sharp`
3. Restart server lagi
4. Logout dan login ulang

## File yang Sudah Diperbaiki
- ✅ `src/routes/auth.js` - Menambahkan profile_photo ke session
- ✅ `src/routes/profile.js` - Menambahkan safety check dan error handling
- ✅ Migration database sudah berhasil

## Dokumentasi Lengkap
- `FIX_PROFIL_INTERNAL_ERROR.md` - Penjelasan detail masalah dan solusi
- `INSTALL_PROFIL_FOTO.md` - Panduan instalasi lengkap
- `FITUR_PROFIL_FOTO.md` - Dokumentasi fitur
