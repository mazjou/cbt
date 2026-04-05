# Instalasi Fitur Profil dengan Foto

## Quick Start

### 1. Install Sharp
```bash
npm install sharp
```

### 2. Jalankan Migration
```bash
node run-migration-profile-photo.js
```

### 3. Restart Server
```bash
npm run dev
# atau untuk production
pm2 restart cbt-app
```

### 4. PENTING: Logout dan Login Ulang
**Semua user yang sedang login HARUS logout dan login ulang!**

Ini penting agar session ter-update dengan field `profile_photo`.

**Cara:**
1. Klik dropdown profil di navbar
2. Klik "Keluar"
3. Login kembali

## Verifikasi

### Cek Migration
```bash
# Login ke MySQL
mysql -u root -p cbt_smk

# Cek kolom baru
DESCRIBE users;
# Harus ada kolom: profile_photo VARCHAR(255)
```

### Cek Folder
```bash
# Cek folder uploads ada
ls -la src/public/uploads/profiles/
# Folder harus ada dan writable
```

### Test Upload
1. Login ke aplikasi
2. Klik foto profil di navbar (pojok kanan atas)
3. Pilih "Profil Saya"
4. Upload foto
5. Cek foto muncul di navbar

## Troubleshooting

### Sharp tidak terinstall
```bash
# Hapus node_modules dan reinstall
rm -rf node_modules package-lock.json
npm install
npm install sharp
```

### Migration error
```bash
# Jalankan manual
mysql -u root -p cbt_smk < sql/add_profile_photo.sql
```

### Folder permission error
```bash
# Set permission
chmod 755 src/public/uploads
chmod 755 src/public/uploads/profiles
```

### Internal Server Error
**Penyebab:** Session lama tidak memiliki field `profile_photo`

**Solusi:** Logout dan login ulang untuk refresh session

## Selesai!

Fitur profil dengan foto terkompres sudah siap digunakan.

Dokumentasi lengkap: `FITUR_PROFIL_FOTO.md`
