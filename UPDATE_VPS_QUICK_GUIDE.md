# 🚀 Quick Guide: Update VPS

## ✅ JAWABAN SINGKAT: **YA, AMAN!**

Update ini aman untuk production karena:
- ✅ Tidak mengubah data yang sudah ada
- ✅ Hanya menambah tabel dan kolom baru
- ✅ Backward compatible
- ✅ Bisa di-rollback

---

## 📋 Cara Update (Manual - 5 Langkah)

### 1. **BACKUP (WAJIB!)**
```bash
# Backup database
mysqldump -u root -p lms_database > backup_$(date +%Y%m%d).sql

# Backup aplikasi
tar -czf lms_backup_$(date +%Y%m%d).tar.gz /path/to/lms-folder/
```

### 2. **STOP & UPDATE**
```bash
# Stop aplikasi
pm2 stop lms-app

# Pull update
cd /path/to/lms-folder
git pull origin main

# Install dependencies
npm install
```

### 3. **DATABASE MIGRATION**
```bash
# Jalankan SQL
mysql -u root -p lms_database < create-submission-backup-table.sql
```

### 4. **START APLIKASI**
```bash
pm2 start lms-app
pm2 save
```

### 5. **TEST**
```bash
# Cek log
pm2 logs lms-app

# Test di browser
# Akses: /admin/failed-submissions
```

---

## 🤖 Cara Update (Otomatis - 1 Perintah)

### **Persiapan (Sekali Saja):**
```bash
# Edit konfigurasi di script
nano update-vps-safe.sh

# Ubah:
DB_USER="root"
DB_NAME="lms_database"
APP_NAME="lms-app"
APP_DIR="/path/to/lms-folder"
BACKUP_DIR="/backup"

# Beri permission
chmod +x update-vps-safe.sh
chmod +x rollback-vps.sh
```

### **Jalankan Update:**
```bash
./update-vps-safe.sh
```

Script akan otomatis:
- ✅ Backup database & aplikasi
- ✅ Stop aplikasi
- ✅ Pull update dari Git
- ✅ Install dependencies
- ✅ Jalankan migration
- ✅ Test syntax
- ✅ Start aplikasi
- ✅ Verifikasi

---

## 🔙 Rollback (Jika Ada Masalah)

### **Manual:**
```bash
# Stop aplikasi
pm2 stop lms-app

# Restore database
mysql -u root -p lms_database < backup_20260313.sql

# Restore aplikasi
cd /path/to/parent/
rm -rf lms-folder/
tar -xzf lms_backup_20260313.tar.gz

# Start aplikasi
pm2 start lms-app
```

### **Otomatis:**
```bash
./rollback-vps.sh
```

---

## ⏱️ Estimasi Waktu

| Tahap | Waktu |
|-------|-------|
| Backup | 5-10 menit |
| Update | 5-10 menit |
| Testing | 5 menit |
| **Total** | **15-25 menit** |
| **Downtime** | **1-2 menit** |

---

## ⚠️ Hal yang Perlu Diperhatikan

### **SEBELUM Update:**
- [ ] Pastikan tidak ada ujian yang sedang berlangsung
- [ ] Informasikan ke guru/siswa akan ada maintenance
- [ ] Backup database dan aplikasi
- [ ] Catat waktu backup untuk rollback

### **SAAT Update:**
- [ ] Ikuti urutan langkah dengan benar
- [ ] Jangan skip backup!
- [ ] Cek error di setiap langkah

### **SETELAH Update:**
- [ ] Test login admin
- [ ] Akses /admin/failed-submissions
- [ ] Test submission ujian
- [ ] Monitor log 1 jam pertama

---

## 🆘 Emergency Contact

### **Jika Aplikasi Error:**
```bash
# Cek log
pm2 logs lms-app --err

# Restart
pm2 restart lms-app

# Jika masih error, rollback!
./rollback-vps.sh
```

### **Jika Database Error:**
```bash
# Restore database saja
mysql -u root -p lms_database < backup_file.sql
pm2 restart lms-app
```

---

## 📊 Verifikasi Update Berhasil

### **Cek Database:**
```sql
-- Cek tabel baru
SHOW TABLES LIKE 'submission_backups';

-- Cek kolom baru
SHOW COLUMNS FROM attempts LIKE 'submission_status';
```

### **Cek Aplikasi:**
```bash
# Cek status
pm2 status

# Cek log (tidak ada error)
pm2 logs lms-app --lines 50

# Test route
curl http://localhost:3000/admin/failed-submissions
```

### **Cek Browser:**
1. Login sebagai admin
2. Dashboard admin → Card "Submission Gagal" (merah)
3. Klik card → Harus muncul halaman "Submission Gagal"
4. Jika muncul "Tidak ada submission yang gagal" → **BERHASIL!**

---

## 💡 Tips

### **Waktu Terbaik untuk Update:**
- ✅ Malam hari (setelah jam sekolah)
- ✅ Akhir pekan
- ✅ Saat tidak ada ujian
- ❌ Jangan saat jam sekolah
- ❌ Jangan saat ada ujian penting

### **Persiapan:**
- Informasikan maintenance 1 hari sebelumnya
- Siapkan akses SSH dan database
- Pastikan koneksi internet stabil
- Siapkan nomor kontak darurat

### **Monitoring:**
```bash
# Monitor real-time
pm2 monit

# Log real-time
pm2 logs lms-app -f

# Cek memory & CPU
pm2 status
```

---

## ✅ Checklist Lengkap

```
SEBELUM UPDATE:
[ ] Backup database
[ ] Backup aplikasi
[ ] Tidak ada ujian berlangsung
[ ] Informasi maintenance sudah disampaikan

SAAT UPDATE:
[ ] Stop aplikasi
[ ] Pull update dari Git
[ ] Install dependencies
[ ] Jalankan migration
[ ] Test syntax
[ ] Start aplikasi

SETELAH UPDATE:
[ ] Aplikasi running
[ ] Tidak ada error di log
[ ] Dashboard admin bisa diakses
[ ] Route /admin/failed-submissions berfungsi
[ ] Test submission ujian
[ ] Monitor 1 jam pertama

BACKUP TERSIMPAN:
[ ] File backup database ada
[ ] File backup aplikasi ada
[ ] Catat nama file backup
[ ] Simpan di tempat aman
```

---

## 🎯 Kesimpulan

**Update ini AMAN jika:**
1. ✅ Sudah backup
2. ✅ Ikuti langkah dengan benar
3. ✅ Test setelah update
4. ✅ Punya rollback plan

**Risk Level: LOW** (dengan backup)

**Downtime: 1-2 menit**

**Benefit: Jawaban siswa tidak akan hilang lagi!**

---

## 📞 Butuh Bantuan?

Jika ada masalah:
1. Jangan panik
2. Cek log: `pm2 logs lms-app --err`
3. Jika perlu, rollback: `./rollback-vps.sh`
4. Hubungi developer/support

**INGAT: Selalu backup sebelum update!** 🔐