# Fix Internal Server Error - Fitur Profil

## Masalah
Setelah migrasi database berhasil, muncul "internal server error" saat mengakses halaman profil.

## Penyebab
Session user tidak menyimpan `profile_photo` saat login, sehingga navbar dan halaman profil error ketika mencoba mengakses `user.profile_photo`.

## Solusi yang Diterapkan

### 1. Update Login Route (`src/routes/auth.js`)
- Menambahkan `profile_photo` ke query SELECT saat login
- Menyimpan `profile_photo` ke session user

### 2. Update Profile Route (`src/routes/profile.js`)
- Menambahkan safety check untuk update session jika `profile_photo` belum ada
- Menambahkan error logging yang lebih detail
- Memperbaiki passing messages ke view

## Cara Testing

### 1. Restart Server
```bash
# Jika menggunakan nodemon (development)
# Server akan restart otomatis

# Jika menggunakan node biasa
# Tekan Ctrl+C lalu jalankan lagi:
npm start

# Jika menggunakan PM2 (production)
pm2 restart lms-smkn1kras
```

### 2. Logout dan Login Ulang
Penting! User yang sudah login sebelum fix ini harus logout dan login ulang agar session ter-update dengan `profile_photo`.

1. Klik dropdown profil di navbar
2. Klik "Keluar"
3. Login kembali dengan username dan password

### 3. Akses Halaman Profil
1. Setelah login, klik dropdown profil di navbar
2. Klik "Profil Saya"
3. Halaman profil seharusnya muncul tanpa error

### 4. Test Upload Foto
1. Di halaman profil, klik "Pilih Foto"
2. Pilih gambar (JPG, PNG, GIF, atau WebP)
3. Klik "Upload Foto"
4. Foto akan dikompres otomatis dan muncul di profil

## Verifikasi

### Cek Session Structure
Setelah login, session user seharusnya memiliki struktur:
```javascript
req.session.user = {
  id: 1,
  username: "admin",
  full_name: "Administrator",
  role: "ADMIN",
  class_id: null,
  class_name: null,
  class_code: null,
  profile_photo: null // atau "/public/uploads/profiles/profile_1_123456.webp"
}
```

### Cek Navbar
- Dropdown profil di navbar seharusnya menampilkan foto profil (jika ada)
- Atau menampilkan icon default (jika belum upload foto)

### Cek Upload Directory
```bash
# Cek apakah folder uploads/profiles ada
ls src/public/uploads/profiles/

# Setelah upload, cek apakah file foto tersimpan
ls src/public/uploads/profiles/
```

## Troubleshooting

### Error: "Pengguna tidak ditemukan"
- Pastikan user sudah login
- Coba logout dan login ulang

### Error: "Gagal memproses foto profil"
- Pastikan package `sharp` terinstall: `npm list sharp`
- Jika belum: `npm install sharp`
- Pastikan folder `src/public/uploads/profiles/` ada dan writable

### Foto tidak muncul setelah upload
- Cek console browser untuk error 404
- Pastikan path foto benar: `/public/uploads/profiles/filename.webp`
- Cek apakah file benar-benar tersimpan di folder

### Session tidak ter-update
- Logout dan login ulang
- Atau restart server dan login ulang

## File yang Diubah
1. `src/routes/auth.js` - Menambahkan profile_photo ke session
2. `src/routes/profile.js` - Menambahkan safety check dan error handling

## Catatan
- User yang sudah login sebelum fix ini HARUS logout dan login ulang
- Foto akan otomatis dikompres ke 400x400 WebP dengan quality 80%
- Maksimal ukuran upload: 5MB
- Format yang didukung: JPG, PNG, GIF, WebP
