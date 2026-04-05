# 🚀 Cara Update ke VPS dengan AMAN

## ⚠️ PENTING: Baca Dulu Sebelum Update!

Update ini **AMAN** untuk production, tapi tetap perlu langkah-langkah yang benar untuk menghindari downtime atau kehilangan data.

---

## ✅ Tingkat Keamanan Update Ini

### **Yang AMAN:**
- ✅ Tidak mengubah data yang sudah ada
- ✅ Hanya menambah tabel dan kolom baru
- ✅ Tidak menghapus atau mengubah tabel lama
- ✅ Backward compatible (sistem lama tetap jalan)
- ✅ Bisa di-rollback jika ada masalah

### **Yang Perlu Diperhatikan:**
- ⚠️ Perlu menjalankan SQL migration
- ⚠️ Perlu restart aplikasi
- ⚠️ Akan ada downtime singkat (1-2 menit)

---

## 📋 Checklist Sebelum Update

```
[ ] Backup database lengkap
[ ] Backup folder aplikasi
[ ] Catat versi Node.js yang digunakan
[ ] Pastikan tidak ada ujian yang sedang berlangsung
[ ] Informasikan ke guru/siswa akan ada maintenance
[ ] Siapkan akses SSH ke VPS
[ ] Siapkan akses database (MySQL)
```

---

## 🔄 Langkah-Langkah Update AMAN

### **STEP 1: BACKUP DATABASE (WAJIB!)**

```bash
# Login ke VPS via SSH
ssh user@your-vps-ip

# Backup database
mysqldump -u [username] -p [database_name] > backup_before_recovery_$(date +%Y%m%d_%H%M%S).sql

# Contoh:
mysqldump -u root -p lms_database > backup_before_recovery_20260313_103000.sql

# Verifikasi backup berhasil
ls -lh backup_before_recovery_*.sql
```

**PENTING:** Simpan file backup ini di tempat aman! Jika ada masalah, ini cara restore data Anda.

### **STEP 2: BACKUP FOLDER APLIKASI**

```bash
# Masuk ke parent directory
cd /path/to/parent/

# Backup folder aplikasi
tar -czf lms_backup_$(date +%Y%m%d_%H%M%S).tar.gz lms-folder/

# Contoh:
tar -czf lms_backup_20260313_103000.tar.gz cbt-smk-premium/

# Verifikasi backup
ls -lh lms_backup_*.tar.gz
```

### **STEP 3: STOP APLIKASI**

```bash
# Jika menggunakan PM2
pm2 stop lms-app

# Jika menggunakan systemd
sudo systemctl stop lms-app

# Verifikasi aplikasi sudah stop
pm2 status
# atau
sudo systemctl status lms-app
```

### **STEP 4: PULL UPDATE DARI GIT**

```bash
# Masuk ke folder aplikasi
cd /path/to/lms-folder

# Stash perubahan lokal (jika ada)
git stash

# Pull update terbaru
git pull origin main
# atau
git pull origin master

# Jika ada conflict, resolve dulu
```

### **STEP 5: INSTALL DEPENDENCIES (Jika Ada Baru)**

```bash
# Install/update npm packages
npm install

# Verifikasi tidak ada error
npm list
```

### **STEP 6: JALANKAN DATABASE MIGRATION**

```bash
# Masuk ke folder aplikasi
cd /path/to/lms-folder

# Jalankan SQL migration
mysql -u [username] -p [database_name] < create-submission-backup-table.sql

# Contoh:
mysql -u root -p lms_database < create-submission-backup-table.sql

# Verifikasi tabel dan kolom sudah dibuat
mysql -u root -p lms_database -e "SHOW TABLES LIKE 'submission_backups';"
mysql -u root -p lms_database -e "SHOW COLUMNS FROM attempts LIKE 'submission_status';"
```

**Expected Output:**
```
+---------------------------+
| Tables_in_lms (submission_backups) |
+---------------------------+
| submission_backups        |
+---------------------------+

+-------------------+------+------+-----+---------+-------+
| Field             | Type | Null | Key | Default | Extra |
+-------------------+------+------+-----+---------+-------+
| submission_status | enum | YES  |     | PENDING |       |
+-------------------+------+------+-----+---------+-------+
```

### **STEP 7: TEST SEBELUM START**

```bash
# Test syntax JavaScript
node -c src/routes/admin.js
node -c src/routes/student.js
node -c src/utils/submission-utils.js

# Jika semua OK, tidak ada output error
```

### **STEP 8: START APLIKASI**

```bash
# Jika menggunakan PM2
pm2 start lms-app
pm2 save

# Jika menggunakan systemd
sudo systemctl start lms-app

# Verifikasi aplikasi running
pm2 status
# atau
sudo systemctl status lms-app
```

### **STEP 9: VERIFIKASI APLIKASI BERJALAN**

```bash
# Cek log aplikasi
pm2 logs lms-app --lines 50

# Atau jika systemd
sudo journalctl -u lms-app -n 50 -f

# Cek apakah ada error
```

### **STEP 10: TEST FUNGSIONALITAS**

1. **Buka browser, akses aplikasi**
   ```
   http://your-vps-ip:3000
   atau
   https://your-domain.com
   ```

2. **Login sebagai Admin**
   - Cek dashboard admin
   - Cek apakah card "Submission Gagal" muncul

3. **Test Route Recovery**
   ```
   Akses: /admin/failed-submissions
   Harus muncul halaman "Submission Gagal"
   ```

4. **Test Submission Normal**
   - Login sebagai siswa
   - Coba submit ujian (jika ada ujian test)
   - Pastikan submission berhasil

---

## 🔙 ROLLBACK PLAN (Jika Ada Masalah)

### **Jika Aplikasi Error Setelah Update:**

```bash
# STEP 1: Stop aplikasi
pm2 stop lms-app

# STEP 2: Restore folder aplikasi
cd /path/to/parent/
rm -rf lms-folder/
tar -xzf lms_backup_20260313_103000.tar.gz

# STEP 3: Restore database
mysql -u root -p lms_database < backup_before_recovery_20260313_103000.sql

# STEP 4: Start aplikasi
cd lms-folder/
pm2 start lms-app

# STEP 5: Verifikasi
pm2 logs lms-app
```

### **Jika Hanya Database Bermasalah:**

```bash
# Rollback hanya database
mysql -u root -p lms_database < backup_before_recovery_20260313_103000.sql

# Restart aplikasi
pm2 restart lms-app
```

### **Jika Hanya Ingin Hapus Fitur Baru:**

```bash
# Hapus tabel baru
mysql -u root -p lms_database -e "DROP TABLE IF EXISTS submission_backups;"

# Hapus kolom baru
mysql -u root -p lms_database -e "ALTER TABLE attempts DROP COLUMN IF EXISTS submission_status;"

# Restart aplikasi
pm2 restart lms-app
```

---

## 🧪 Testing di VPS (Opsional tapi Disarankan)

### **Test 1: Cek Tabel dan Kolom**

```bash
node test-submission-recovery.js
```

Expected output:
```
✅ submission_backups table exists
✅ submission_status column exists
📊 Found 0 failed submissions
💾 Found 0 active backups
```

### **Test 2: Cek Route**

```bash
node test-failed-submissions-route.js
```

Expected output:
```
✅ Query executed successfully
📊 Found 0 failed submissions
```

### **Test 3: Simulasi Failed Submission**

```bash
# Buat test failed submission
mysql -u root -p lms_database -e "
UPDATE attempts 
SET submission_status = 'FAILED' 
WHERE id = (SELECT id FROM attempts WHERE status = 'SUBMITTED' LIMIT 1);
"

# Cek di admin panel
# Akses: /admin/failed-submissions
# Harus muncul 1 submission gagal

# Restore kembali
mysql -u root -p lms_database -e "
UPDATE attempts 
SET submission_status = 'SUBMITTED' 
WHERE submission_status = 'FAILED';
"
```

---

## 📊 Monitoring Setelah Update

### **Hari Pertama:**

```bash
# Monitor log setiap 1 jam
pm2 logs lms-app --lines 100

# Cek apakah ada error
grep -i "error" ~/.pm2/logs/lms-app-error.log

# Cek memory usage
pm2 monit
```

### **Minggu Pertama:**

```sql
-- Cek berapa submission yang gagal
SELECT COUNT(*) as failed_count 
FROM attempts 
WHERE submission_status = 'FAILED';

-- Cek berapa backup yang dibuat
SELECT COUNT(*) as backup_count 
FROM submission_backups;

-- Cek performa submission
SELECT 
  DATE(finished_at) as date,
  COUNT(*) as total_submissions,
  SUM(CASE WHEN submission_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN submission_status = 'SUBMITTED' THEN 1 ELSE 0 END) as success
FROM attempts
WHERE finished_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(finished_at);
```

---

## ⚡ Optimasi Performa (Opsional)

### **Jika Database Besar (>10GB):**

```sql
-- Tambah index untuk performa
CREATE INDEX idx_submission_status ON attempts(submission_status);
CREATE INDEX idx_backup_status ON submission_backups(status);
CREATE INDEX idx_backup_created ON submission_backups(created_at);
```

### **Jika Banyak Backup Lama:**

```sql
-- Hapus backup yang sudah di-restore dan lebih dari 30 hari
DELETE FROM submission_backups 
WHERE status = 'RESTORED' 
AND restored_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Atau tandai sebagai expired
UPDATE submission_backups 
SET status = 'EXPIRED' 
WHERE status = 'ACTIVE' 
AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY);
```

---

## 🔒 Keamanan Tambahan

### **Backup Otomatis:**

```bash
# Buat cron job untuk backup harian
crontab -e

# Tambahkan:
0 2 * * * mysqldump -u root -p[password] lms_database > /backup/lms_$(date +\%Y\%m\%d).sql
0 3 * * * find /backup -name "lms_*.sql" -mtime +7 -delete
```

### **Monitoring Disk Space:**

```bash
# Cek disk space
df -h

# Jika disk hampir penuh, hapus backup lama
find /backup -name "*.sql" -mtime +30 -delete
```

---

## 📞 Troubleshooting

### **Problem: Aplikasi tidak mau start**

```bash
# Cek error log
pm2 logs lms-app --err --lines 50

# Cek syntax error
node -c src/server.js

# Cek port sudah digunakan
netstat -tulpn | grep :3000
```

### **Problem: Database migration gagal**

```bash
# Cek apakah user MySQL punya permission
mysql -u root -p -e "SHOW GRANTS;"

# Cek apakah tabel sudah ada
mysql -u root -p lms_database -e "SHOW TABLES;"

# Jalankan ulang migration
mysql -u root -p lms_database < create-submission-backup-table.sql
```

### **Problem: Route /admin/failed-submissions error 500**

```bash
# Cek log error
pm2 logs lms-app --err

# Cek apakah module.exports di akhir file
tail -n 5 src/routes/admin.js

# Restart aplikasi
pm2 restart lms-app
```

---

## ✅ Checklist Setelah Update

```
[ ] Aplikasi running tanpa error
[ ] Dashboard admin bisa diakses
[ ] Card "Submission Gagal" muncul
[ ] Route /admin/failed-submissions bisa diakses
[ ] Siswa bisa login dan lihat ujian
[ ] Submission ujian berfungsi normal
[ ] Tidak ada error di log
[ ] Database backup tersimpan aman
[ ] Monitoring berjalan
```

---

## 🎯 Kesimpulan

### **Update ini AMAN jika:**
1. ✅ Sudah backup database dan aplikasi
2. ✅ Mengikuti langkah-langkah dengan urutan yang benar
3. ✅ Test setelah update
4. ✅ Punya rollback plan

### **Estimasi Waktu:**
- Backup: 5-10 menit
- Update: 5-10 menit
- Testing: 5-10 menit
- **Total: 15-30 menit**

### **Downtime:**
- **1-2 menit** (saat restart aplikasi)

### **Risk Level:**
- **LOW** (jika ikuti panduan)
- **MEDIUM** (jika skip backup)
- **HIGH** (jika tidak backup sama sekali)

---

## 📞 Kontak Darurat

Jika ada masalah serius:
1. Stop aplikasi: `pm2 stop lms-app`
2. Restore backup: `mysql -u root -p lms_database < backup_file.sql`
3. Hubungi developer/support

**INGAT: Selalu backup sebelum update!** 🔐