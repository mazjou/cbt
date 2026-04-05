# Fitur Profil Pengguna dengan Foto Terkompres

## Deskripsi
Fitur profil pengguna yang lengkap dengan:
- Dropdown hamburger profil menggantikan tombol keluar
- Upload foto profil dengan kompresi otomatis
- Edit informasi profil (nama lengkap, password)
- Tampilan foto profil di navbar
- Foto otomatis dikompres ke format WebP untuk efisiensi

## Fitur yang Ditambahkan

### 1. Dropdown Profil di Navbar
- Menggantikan tombol "Keluar" dengan dropdown profil
- Menampilkan foto profil pengguna (atau avatar default)
- Menu dropdown berisi:
  - Profil Saya
  - Dashboard
  - Keluar
- Tersedia untuk desktop dan mobile

### 2. Halaman Profil
- Tampilan foto profil besar
- Form edit nama lengkap
- Form ubah password
- Upload foto profil dengan preview
- Hapus foto profil
- Informasi akun (status, tanggal terdaftar)

### 3. Kompresi Foto Otomatis
- Menggunakan library `sharp` untuk kompresi
- Resize otomatis ke 400x400 px
- Konversi ke format WebP (quality 80%)
- Maksimal ukuran upload: 5MB
- Format yang didukung: JPG, PNG, GIF, WebP

### 4. Database
- Tambah kolom `profile_photo` di tabel `users`
- Menyimpan path foto profil

## File yang Dibuat/Dimodifikasi

### Database Migration
1. **sql/add_profile_photo.sql**
   - Menambahkan kolom `profile_photo` ke tabel `users`
   - Menambahkan index untuk performa

2. **run-migration-profile-photo.js**
   - Script untuk menjalankan migration

### Routes
3. **src/routes/profile.js**
   - GET `/profile` - Tampilkan halaman profil
   - POST `/profile/update` - Update profil dan foto
   - POST `/profile/delete-photo` - Hapus foto profil
   - Menggunakan multer untuk upload
   - Menggunakan sharp untuk kompresi

### Views
4. **src/views/profile/index.ejs**
   - Halaman profil lengkap
   - Form edit profil
   - Upload foto dengan preview
   - Responsive design

### Modified Files
5. **src/views/partials/navbar.ejs**
   - Ganti tombol keluar dengan dropdown profil
   - Tampilkan foto profil di navbar
   - JavaScript untuk toggle dropdown
   - Versi desktop dan mobile

6. **src/server.js**
   - Tambah route `/profile`

## Instalasi

### 1. Install Dependencies
```bash
npm install sharp
```

Sharp adalah library untuk image processing yang sangat cepat dan efisien.

### 2. Jalankan Migration
```bash
node run-migration-profile-photo.js
```

Ini akan menambahkan kolom `profile_photo` ke tabel `users`.

### 3. Buat Folder Upload
Folder akan dibuat otomatis, tapi bisa juga manual:
```bash
mkdir -p src/public/uploads/profiles
```

### 4. Restart Server
```bash
npm run dev
# atau
pm2 restart cbt-app
```

## Cara Menggunakan

### Upload Foto Profil
1. Login ke aplikasi
2. Klik foto profil/avatar di navbar (pojok kanan atas)
3. Pilih "Profil Saya" dari dropdown
4. Klik tombol "Pilih Foto"
5. Pilih file gambar (JPG, PNG, GIF, WebP)
6. Preview akan muncul
7. Klik "Upload Foto"
8. Foto akan otomatis dikompres dan disimpan

### Edit Profil
1. Buka halaman profil
2. Edit nama lengkap jika perlu
3. Isi password baru jika ingin mengubah password
4. Klik "Simpan Perubahan"

### Hapus Foto Profil
1. Buka halaman profil
2. Klik tombol "Hapus Foto" (merah)
3. Konfirmasi penghapusan
4. Foto akan dihapus dan kembali ke avatar default

## Kompresi Foto

### Proses Kompresi
1. **Upload**: User upload foto (max 5MB)
2. **Resize**: Foto diresize ke 400x400 px (cover, center)
3. **Konversi**: Foto dikonversi ke format WebP
4. **Quality**: Quality diset ke 80% (balance antara ukuran dan kualitas)
5. **Save**: Foto disimpan dengan nama unik

### Keuntungan WebP
- Ukuran file 25-35% lebih kecil dari JPEG
- Kualitas visual tetap bagus
- Didukung semua browser modern
- Loading lebih cepat

### Contoh Ukuran File
- Original JPG (1920x1080, 2MB) → WebP (400x400, ~50KB)
- Original PNG (1024x1024, 1.5MB) → WebP (400x400, ~40KB)
- Penghematan: ~95-97%

## Keamanan

### Validasi File
- Hanya menerima file gambar (JPEG, PNG, GIF, WebP)
- Maksimal ukuran 5MB
- Validasi MIME type dan extension
- Error handling untuk file invalid

### Storage
- Foto disimpan dengan nama unik (user_id + timestamp)
- Foto lama otomatis dihapus saat upload baru
- Path foto disimpan di database

### Authentication
- Semua route profil memerlukan login
- User hanya bisa edit profil sendiri
- Middleware `requireAuth` untuk proteksi

## Struktur Folder

```
src/
├── public/
│   └── uploads/
│       └── profiles/          # Folder foto profil
│           ├── profile_1_1234567890.webp
│           ├── profile_2_1234567891.webp
│           └── ...
├── routes/
│   └── profile.js             # Route profil
└── views/
    └── profile/
        └── index.ejs          # View profil

sql/
└── add_profile_photo.sql      # Migration SQL

run-migration-profile-photo.js # Script migration
```

## API Endpoints

### GET /profile
Tampilkan halaman profil pengguna yang sedang login.

**Response**: HTML page

### POST /profile/update
Update profil pengguna (nama, foto, password).

**Parameters**:
- `full_name` (string, required): Nama lengkap
- `profile_photo` (file, optional): File foto profil
- `new_password` (string, optional): Password baru
- `confirm_password` (string, optional): Konfirmasi password

**Response**: Redirect ke `/profile` dengan flash message

### POST /profile/delete-photo
Hapus foto profil pengguna.

**Response**: Redirect ke `/profile` dengan flash message

## Troubleshooting

### Error: Cannot find module 'sharp'
**Solusi**: Install sharp
```bash
npm install sharp
```

### Error: ENOENT: no such file or directory
**Solusi**: Buat folder uploads
```bash
mkdir -p src/public/uploads/profiles
```

### Foto tidak muncul
**Solusi**: 
1. Cek path foto di database
2. Cek file ada di folder `src/public/uploads/profiles/`
3. Cek permission folder (harus writable)

### Foto terlalu besar
**Solusi**: 
- Kompresi otomatis sudah aktif
- Jika masih besar, turunkan quality di `profile.js`:
```javascript
.webp({ quality: 60 }) // dari 80 ke 60
```

### Error saat upload
**Solusi**:
1. Cek format file (harus gambar)
2. Cek ukuran file (max 5MB)
3. Cek log error di console

## Customization

### Ubah Ukuran Foto
Edit `src/routes/profile.js`:
```javascript
await sharp(req.file.buffer)
  .resize(600, 600, {  // Ubah dari 400x400 ke 600x600
    fit: 'cover',
    position: 'center'
  })
  .webp({ quality: 80 })
  .toFile(filepath);
```

### Ubah Quality Kompresi
Edit `src/routes/profile.js`:
```javascript
.webp({ quality: 90 })  // Ubah dari 80 ke 90 (lebih bagus, lebih besar)
```

### Ubah Max Upload Size
Edit `src/routes/profile.js`:
```javascript
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Ubah dari 5MB ke 10MB
  ...
});
```

### Ubah Format Output
Edit `src/routes/profile.js`:
```javascript
// Dari WebP ke JPEG
const filename = `profile_${req.session.userId}_${Date.now()}.jpg`;
await sharp(req.file.buffer)
  .resize(400, 400, { fit: 'cover', position: 'center' })
  .jpeg({ quality: 80 })  // Ganti webp dengan jpeg
  .toFile(filepath);
```

## Performance

### Optimasi
- Foto dikompres otomatis (WebP, 400x400, quality 80%)
- Lazy loading bisa ditambahkan untuk foto profil
- CDN bisa digunakan untuk serve foto

### Monitoring
- Cek ukuran folder `uploads/profiles/` secara berkala
- Hapus foto orphan (foto yang tidak ada di database)
- Backup foto profil secara berkala

## Fitur Tambahan yang Bisa Dikembangkan

1. **Crop Tool**
   - Tambahkan cropper.js untuk crop foto sebelum upload
   - User bisa pilih area foto yang diinginkan

2. **Multiple Photos**
   - Gallery foto profil
   - User bisa upload beberapa foto dan pilih yang aktif

3. **Avatar Generator**
   - Generate avatar otomatis dari inisial nama
   - Warna random berdasarkan user ID

4. **Social Login**
   - Import foto dari Google/Facebook saat login
   - Sync foto profil dengan social media

5. **Foto Cover**
   - Tambahkan foto cover/banner di profil
   - Seperti Facebook/Twitter

6. **Watermark**
   - Tambahkan watermark otomatis pada foto
   - Untuk proteksi copyright

## Kesimpulan

Fitur profil dengan foto terkompres berhasil diimplementasikan dengan:
- UI modern dengan dropdown profil
- Upload foto dengan kompresi otomatis (WebP)
- Edit profil lengkap (nama, password)
- Responsive design untuk mobile dan desktop
- Keamanan dan validasi yang baik
- Performance optimal dengan kompresi

Pengguna sekarang dapat:
- Upload foto profil dengan mudah
- Foto otomatis dikompres untuk efisiensi
- Edit profil dan password
- Akses profil dari dropdown navbar

Sistem lebih efisien dengan:
- Ukuran foto 95-97% lebih kecil
- Loading lebih cepat
- Bandwidth lebih hemat
- Storage lebih efisien

Siap digunakan! 🎉
