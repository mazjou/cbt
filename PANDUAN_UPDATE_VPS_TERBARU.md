# 🚀 PANDUAN UPDATE APLIKASI VPS TERBARU

## 📋 Fitur Baru yang Akan Di-Update

### 1. Fitur Rekap Penggunaan LMS Admin
- Dashboard card "📊 Rekap Penggunaan LMS"
- Halaman laporan `/admin/reports`
- Export Excel dengan 5 sheets
- Filter periode dan quick selection

### 2. Fitur Rekap Penggunaan LMS Kepala Sekolah
- Dashboard button "📊 Rekap LMS" 
- Halaman laporan `/principal/reports`
- Export Excel khusus kepala sekolah
- Interface khusus untuk kepala sekolah

### 3. Perbaikan Bug
- Fix reports error (toFixed pada string values)
- Improved error handling
- Better data type conversion

## 🔄 LANGKAH UPDATE VPS

### STEP 1: Commit & Push dari Local ke GitHub

```bash
# 1. Add semua perubahan
git add .

# 2. Commit dengan pesan yang jelas
git commit -m "feat: Add LMS usage reports for admin and principal

- Add comprehensive LMS usage reports dashboard
- Add Excel export functionality with 5 sheets
- Add period filtering and quick selection
- Add principal-specific reports interface
- Fix data type conversion issues
- Add activity scoring system for teachers and students"

# 3. Push ke GitHub
git push origin main
```

### STEP 2: Update di VPS

```bash
# 1. SSH ke VPS
ssh root@10.10.102.15

# 2. Masuk ke direktori aplikasi
cd /var/www/lms-smkn1kras

# 3. Pull perubahan terbaru dari GitHub
git pull origin main

# 4. Install dependencies baru (jika ada)
npm install

# 5. Restart aplikasi dengan PM2
pm2 restart lms-app
```

### STEP 3: Verifikasi Update

```bash
# 1. Cek status PM2
pm2 status

# 2. Cek log aplikasi
pm2 logs lms-app --lines 50

# 3. Test akses aplikasi
curl -I http://10.10.102.15:3000
```

## 🗄️ UPDATE DATABASE

### Apakah Perlu Update Database?

**JAWABAN: TIDAK PERLU** untuk fitur rekap LMS ini karena:

✅ **Tidak ada perubahan skema database**
- Fitur rekap hanya membaca data yang sudah ada
- Tidak menambah tabel baru
- Tidak mengubah struktur tabel existing

✅ **Menggunakan tabel yang sudah ada:**
- `users` (untuk data guru, siswa, admin, kepala sekolah)
- `exams`, `materials`, `assignments` (konten pembelajaran)
- `attempts`, `material_reads`, `assignment_submissions` (aktivitas)
- `classes`, `subjects` (master data)

✅ **Role PRINCIPAL sudah ada:**
- User kepala sekolah sudah dibuat: `kepsek` / `kepsek123`
- Role PRINCIPAL sudah ada di enum

### Jika Ingin Memastikan Database Siap

```bash
# Di VPS, jalankan script cek database
cd /var/www/lms-smkn1kras
node check-database-tables.js
```

## 🧪 TESTING SETELAH UPDATE

### 1. Test Fitur Admin
```bash
# Login sebagai admin dan test:
# - http://10.10.102.15:3000/admin
# - Klik "📊 Rekap Penggunaan LMS"
# - Test filter periode
# - Test export Excel
```

### 2. Test Fitur Kepala Sekolah
```bash
# Login sebagai kepala sekolah:
# Username: kepsek
# Password: kepsek123
# - http://10.10.102.15:3000/principal
# - Klik "📊 Rekap LMS"
# - Test semua fitur
```

### 3. Test Script di VPS
```bash
# Upload dan jalankan test script
scp test-reports-feature.js root@10.10.102.15:/var/www/lms-smkn1kras/
scp test-principal-reports.js root@10.10.102.15:/var/www/lms-smkn1kras/

# Di VPS
ssh root@10.10.102.15
cd /var/www/lms-smkn1kras
node test-reports-feature.js
node test-principal-reports.js
```

## 🚨 TROUBLESHOOTING

### Jika Ada Error Setelah Update

1. **Cek PM2 Logs**
```bash
pm2 logs lms-app --lines 100
```

2. **Restart PM2**
```bash
pm2 restart lms-app
```

3. **Cek Dependencies**
```bash
npm install
```

4. **Rollback Jika Perlu**
```bash
git log --oneline -5
git reset --hard <commit-hash-sebelumnya>
pm2 restart lms-app
```

## 📦 DEPENDENCIES BARU

Fitur ini menggunakan library yang sudah ada:
- ✅ `XLSX` - sudah terinstall untuk export Excel
- ✅ `express` - sudah ada
- ✅ `mysql2` - sudah ada
- ✅ `ejs` - sudah ada

**Tidak perlu install dependencies tambahan!**

## 🔐 AKSES TESTING

### Admin
- URL: `http://10.10.102.15:3000/admin`
- Login dengan akun admin existing
- Klik "📊 Rekap Penggunaan LMS"

### Kepala Sekolah
- URL: `http://10.10.102.15:3000/principal`
- Username: `kepsek`
- Password: `kepsek123`
- Klik "📊 Rekap LMS"

## ⚡ QUICK COMMANDS

### Update Cepat (All-in-One)
```bash
# Local
git add . && git commit -m "Update LMS reports features" && git push origin main

# VPS
ssh root@10.10.102.15 "cd /var/www/lms-smkn1kras && git pull origin main && npm install && pm2 restart lms-app"
```

### Cek Status Cepat
```bash
ssh root@10.10.102.15 "pm2 status && curl -I http://10.10.102.15:3000"
```

## ✅ CHECKLIST UPDATE

- [ ] Commit & push dari local ke GitHub
- [ ] SSH ke VPS dan pull perubahan
- [ ] Install dependencies (npm install)
- [ ] Restart PM2 (pm2 restart lms-app)
- [ ] Cek PM2 status dan logs
- [ ] Test login admin dan akses /admin/reports
- [ ] Test login kepala sekolah dan akses /principal/reports
- [ ] Test export Excel di kedua role
- [ ] Test responsive design di mobile
- [ ] Verifikasi tidak ada error di console browser

## 🎉 SELESAI!

Setelah mengikuti panduan ini, aplikasi VPS akan ter-update dengan fitur rekap LMS terbaru untuk admin dan kepala sekolah. Tidak perlu update database karena fitur ini hanya membaca data existing.