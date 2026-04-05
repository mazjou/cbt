# 🚀 Panduan Deploy: Solusi Peak Load Submission

## ✅ Checklist Pre-Deployment

Sebelum deploy, pastikan:
- [ ] Backup database sudah dibuat
- [ ] Server dalam kondisi maintenance mode (opsional)
- [ ] Tidak ada ujian yang sedang berlangsung
- [ ] Akses SSH/RDP ke server tersedia

---

## 📋 Langkah-Langkah Deployment

### **Step 1: Backup Database** ⚠️ PENTING!

```bash
# Masuk ke server
ssh user@your-server.com

# Backup database
mysqldump -u root -p cbt_smk > backup_$(date +%Y%m%d_%H%M%S).sql

# Verifikasi backup
ls -lh backup_*.sql
```

**Jangan lanjut jika backup gagal!**

---

### **Step 2: Update Code dari Git**

```bash
# Masuk ke folder aplikasi
cd /path/to/bank-soal

# Stash perubahan lokal (jika ada)
git stash

# Pull update terbaru
git pull origin main

# Restore perubahan lokal (jika perlu)
git stash pop
```

---

### **Step 3: Jalankan Database Migration**

```bash
# Jalankan SQL migration
mysql -u root -p cbt_smk < create-submission-backup-table.sql

# Verifikasi tabel baru
mysql -u root -p cbt_smk -e "SHOW TABLES LIKE 'submission_backups';"
mysql -u root -p cbt_smk -e "SHOW COLUMNS FROM attempts LIKE 'submission_status';"
```

**Expected Output:**
```
+---------------------------+
| Tables_in_cbt_smk         |
+---------------------------+
| submission_backups        |
+---------------------------+

+-------------------+------+------+-----+---------+-------+
| Field             | Type | Null | Key | Default | Extra |
+-------------------+------+------+-----+---------+-------+
| submission_status | enum | YES  |     | PENDING |       |
+-------------------+------+------+-----+---------+-------+
```

---

### **Step 4: Install Dependencies (jika ada update)**

```bash
npm install
```

---

### **Step 5: Restart Aplikasi**

#### **Jika menggunakan PM2:**
```bash
pm2 restart bank-soal
pm2 logs bank-soal --lines 50
```

#### **Jika menggunakan systemd:**
```bash
sudo systemctl restart bank-soal
sudo systemctl status bank-soal
```

#### **Jika manual (development):**
```bash
# Stop server (Ctrl+C)
# Start lagi
npm start
```

---

### **Step 6: Verifikasi Deployment**

#### **6.1. Cek Logs**
```bash
# PM2
pm2 logs bank-soal --lines 100

# Systemd
sudo journalctl -u bank-soal -n 100 -f

# Manual
# Lihat output di terminal
```

**Cari pesan:**
- ✅ "Server running on port..."
- ✅ "Database connected"
- ❌ Tidak ada error merah

#### **6.2. Test Connection Pool**
```bash
node test-peak-load-solution.js
```

**Expected Output:**
```
✅ Connection limit is optimized for peak load (50+)
✅ Table submission_backups exists
✅ Column submission_status exists
✅ Function createSubmissionBackup exists
✅ Function finalizeAttemptWithBackup exists
```

#### **6.3. Test Web Interface**

1. **Login sebagai Siswa:**
   - Buka ujian test
   - Jawab beberapa soal
   - Buka Developer Console (F12)
   - Cek LocalStorage: `localStorage.getItem('exam_backup_...')`
   - Harus ada data JSON

2. **Login sebagai Admin:**
   - Buka `/admin`
   - Cek card "Submission Gagal"
   - Klik card, harus buka halaman `/admin/failed-submissions`
   - Jika ada submission gagal, test tombol "Pulihkan"

---

### **Step 7: Monitor Selama 1 Jam Pertama**

```bash
# Monitor logs real-time
pm2 logs bank-soal -f

# Monitor resource usage
pm2 monit

# Cek database connections
mysql -u root -p -e "SHOW PROCESSLIST;"
```

**Yang perlu diperhatikan:**
- ✅ Tidak ada error submission
- ✅ Connection pool tidak penuh
- ✅ Response time normal
- ✅ Memory usage stabil

---

## 🧪 Testing dengan Siswa Real

### **Test 1: Single Submission**
1. Minta 1 siswa test submit ujian
2. Cek logs: harus ada "✅ Attempt X submitted successfully"
3. Cek nilai siswa muncul

### **Test 2: Small Peak Load (5-10 siswa)**
1. Minta 5-10 siswa submit bersamaan
2. Monitor logs
3. Cek semua nilai muncul
4. Cek `/admin/failed-submissions` (harus kosong)

### **Test 3: Medium Peak Load (20-30 siswa)**
1. Koordinasi dengan guru untuk ujian kelas
2. Monitor logs dan database
3. Cek success rate
4. Jika ada yang gagal, test recovery

---

## 🔧 Troubleshooting

### **Problem: Tabel submission_backups tidak ada**

```bash
# Cek apakah SQL sudah dijalankan
mysql -u root -p cbt_smk -e "SHOW TABLES LIKE 'submission_backups';"

# Jika tidak ada, jalankan lagi
mysql -u root -p cbt_smk < create-submission-backup-table.sql
```

### **Problem: Column submission_status tidak ada**

```bash
# Cek column
mysql -u root -p cbt_smk -e "SHOW COLUMNS FROM attempts LIKE 'submission_status';"

# Jika tidak ada, tambah manual
mysql -u root -p cbt_smk -e "
ALTER TABLE attempts 
ADD COLUMN submission_status ENUM('PENDING', 'SUBMITTING', 'SUBMITTED', 'FAILED') 
DEFAULT 'PENDING' AFTER status;
"
```

### **Problem: Error "finalizeAttemptWithBackup is not a function"**

```bash
# Cek file ada
ls -la src/utils/submission-utils.js

# Jika tidak ada, copy dari backup atau git
git checkout src/utils/submission-utils.js

# Restart server
pm2 restart bank-soal
```

### **Problem: Client-side backup tidak jalan**

1. Buka browser Developer Console (F12)
2. Cek error di Console tab
3. Cek Network tab untuk request yang gagal
4. Clear browser cache: Ctrl+Shift+Delete
5. Refresh page: Ctrl+F5

### **Problem: Connection pool penuh**

```bash
# Cek jumlah connections
mysql -u root -p -e "SHOW PROCESSLIST;" | wc -l

# Jika > 45, ada masalah
# Cek connections yang sleep lama
mysql -u root -p -e "
SELECT * FROM information_schema.processlist 
WHERE command = 'Sleep' AND time > 60;
"

# Kill connections yang stuck (hati-hati!)
mysql -u root -p -e "KILL <process_id>;"
```

### **Problem: Submission masih gagal meskipun sudah retry**

1. Cek logs untuk error message
2. Cek database space: `df -h`
3. Cek database max_connections: `SHOW VARIABLES LIKE 'max_connections';`
4. Increase jika perlu:
   ```bash
   # Edit my.cnf
   sudo nano /etc/mysql/my.cnf
   
   # Tambah di [mysqld]
   max_connections = 200
   
   # Restart MySQL
   sudo systemctl restart mysql
   ```

---

## 📊 Monitoring Queries

### **Cek Submission Status Distribution**
```sql
SELECT 
  submission_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM attempts
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
GROUP BY submission_status;
```

### **Cek Failed Submissions**
```sql
SELECT 
  a.id,
  u.full_name,
  e.title,
  a.started_at,
  sb.id as backup_id
FROM attempts a
JOIN users u ON u.id = a.student_id
JOIN exams e ON e.id = a.exam_id
LEFT JOIN submission_backups sb ON sb.attempt_id = a.id
WHERE a.submission_status = 'FAILED'
ORDER BY a.started_at DESC;
```

### **Cek Success Rate**
```sql
SELECT 
  DATE(started_at) as date,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN submission_status = 'SUBMITTED' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN submission_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN submission_status = 'SUBMITTED' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
FROM attempts
WHERE started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY DATE(started_at)
ORDER BY date DESC;
```

### **Cek Connection Pool Usage**
```sql
SHOW PROCESSLIST;
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';
SHOW VARIABLES LIKE 'max_connections';
```

---

## 🎯 Success Criteria

Deployment dianggap sukses jika:

- ✅ Server running tanpa error
- ✅ Database migration berhasil
- ✅ Connection pool = 50
- ✅ Client-side backup berfungsi
- ✅ Test submission berhasil
- ✅ Admin recovery interface accessible
- ✅ Logs tidak ada error
- ✅ Success rate > 95%

---

## 📞 Rollback Plan (Jika Gagal)

### **Jika ada masalah serius:**

```bash
# 1. Stop aplikasi
pm2 stop bank-soal

# 2. Restore database
mysql -u root -p cbt_smk < backup_YYYYMMDD_HHMMSS.sql

# 3. Rollback code
git reset --hard HEAD~1

# 4. Restart aplikasi
pm2 restart bank-soal

# 5. Verifikasi
curl http://localhost:3000/health
```

---

## 📝 Post-Deployment Checklist

- [ ] Deployment berhasil tanpa error
- [ ] Test submission berhasil
- [ ] Admin interface accessible
- [ ] Logs clean (no errors)
- [ ] Database migration verified
- [ ] Connection pool optimized
- [ ] Client-side backup working
- [ ] Monitoring setup
- [ ] Team notified
- [ ] Documentation updated

---

## 🎓 Next Steps

Setelah deployment sukses:

1. **Monitor selama 1 minggu**
   - Cek logs harian
   - Monitor success rate
   - Cek failed submissions

2. **Optimize jika perlu**
   - Adjust connection pool
   - Tune retry delays
   - Update documentation

3. **Train admin**
   - Cara akses failed submissions
   - Cara recovery
   - Cara monitoring

4. **Inform users**
   - Beritahu guru tentang fitur baru
   - Update user guide
   - Siapkan FAQ

---

## ✅ Selesai!

Jika semua langkah sudah dijalankan dan test berhasil, deployment selesai! 🎉

**Dokumentasi lengkap:** `PEAK_LOAD_SUBMISSION_SOLUTION.md`

**Support:** Jika ada masalah, cek logs dan troubleshooting guide di atas.

**Good luck! 🚀**
