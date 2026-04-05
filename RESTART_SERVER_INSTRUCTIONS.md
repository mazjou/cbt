# 🔄 Instruksi Restart Server

## ⚠️ PENTING: Server Harus Di-Restart!

Setelah database migration selesai, server HARUS di-restart agar:
- ✅ Auto-submit tidak error lagi
- ✅ Submission system menggunakan kolom baru
- ✅ Recovery system berfungsi dengan baik

---

## 🔍 Cek Status Server Saat Ini

Ada beberapa process Node.js yang running:
```
Process ID: 10068, 12628, 13900, 16252
```

---

## 🛑 Cara Restart Server

### **Metode 1: Restart Manual (Recommended untuk Development)**

#### **Step 1: Stop Server**

**Cara A - Jika server running di terminal:**
```
1. Buka terminal yang menjalankan server
2. Tekan Ctrl+C untuk stop
3. Tunggu sampai process berhenti
```

**Cara B - Jika tidak tahu terminal mana:**
```powershell
# Stop semua process node (HATI-HATI!)
Get-Process node | Stop-Process -Force

# Atau stop satu per satu (lebih aman)
Stop-Process -Id 10068 -Force
Stop-Process -Id 12628 -Force
Stop-Process -Id 13900 -Force
Stop-Process -Id 16252 -Force
```

#### **Step 2: Start Server Lagi**

```bash
# Masuk ke folder project
cd E:\nodejs\lms-smkn1kras\cbt-smk-premium

# Start server
npm start

# Atau jika ada script khusus
node src/server.js
```

---

### **Metode 2: Setup PM2 (Recommended untuk Production)**

PM2 adalah process manager yang lebih baik untuk production.

#### **Step 1: Install PM2 (jika belum)**
```bash
npm install -g pm2
```

#### **Step 2: Start dengan PM2**
```bash
# Masuk ke folder project
cd E:\nodejs\lms-smkn1kras\cbt-smk-premium

# Stop process manual dulu
Get-Process node | Stop-Process -Force

# Start dengan PM2
pm2 start src/server.js --name bank-soal

# Save PM2 config
pm2 save

# Setup auto-start (opsional)
pm2 startup
```

#### **Step 3: Manage dengan PM2**
```bash
# Restart
pm2 restart bank-soal

# Stop
pm2 stop bank-soal

# Logs
pm2 logs bank-soal

# Monitor
pm2 monit

# Status
pm2 status
```

---

## ✅ Verifikasi Setelah Restart

### **1. Cek Logs**

**Jika manual:**
```
Lihat output di terminal
Cari pesan:
✅ "Server running on port..."
✅ "Database connected"
❌ Tidak ada error merah
```

**Jika PM2:**
```bash
pm2 logs bank-soal --lines 50

# Cari pesan yang sama
```

### **2. Cek Auto-Submit**

Tunggu 5 menit (auto-submit runs every 5 minutes), lalu cek logs:

**Expected:**
```
[AUTO-SUBMIT] Checking for expired attempts...
[AUTO-SUBMIT] Found 0 expired attempts
✅ No error "Unknown column 'submission_status'"
```

**Jika masih error:**
```
❌ Unknown column 'submission_status'
→ Migration belum berhasil, jalankan lagi: node run-migration.js
```

### **3. Test Submission**

1. Buka browser: `http://localhost:3000`
2. Login sebagai siswa
3. Kerjakan ujian test
4. Submit jawaban
5. Cek logs: harus ada "✅ Attempt X submitted successfully"
6. Cek nilai muncul

### **4. Test Admin Interface**

1. Login sebagai admin
2. Buka: `http://localhost:3000/admin/failed-submissions`
3. Halaman harus load tanpa error
4. Jika ada submission gagal, test tombol "Pulihkan"

---

## 🔧 Troubleshooting

### **Problem: Port sudah digunakan**

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solusi:**
```powershell
# Cari process yang menggunakan port 3000
netstat -ano | findstr :3000

# Kill process tersebut
Stop-Process -Id <PID> -Force

# Start server lagi
npm start
```

### **Problem: Auto-submit masih error**

```
[AUTO-SUBMIT] Error: Unknown column 'submission_status'
```

**Solusi:**
```bash
# 1. Stop server
Ctrl+C atau pm2 stop bank-soal

# 2. Jalankan migration lagi
node run-migration.js

# 3. Verifikasi kolom ada
node -e "require('./src/db/pool').query('SHOW COLUMNS FROM attempts LIKE \"submission_status\"').then(([r])=>console.log(r)).then(()=>process.exit())"

# 4. Start server lagi
npm start atau pm2 restart bank-soal
```

### **Problem: Database connection error**

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solusi:**
```bash
# Cek MySQL running
# Windows: Services → MySQL → Start

# Atau via command
net start MySQL80

# Test connection
mysql -u root -p cbt_smk -e "SELECT 1"
```

---

## 📊 Monitoring Setelah Restart

### **Cek setiap 5 menit (selama 1 jam pertama):**

```bash
# Cek logs
pm2 logs bank-soal --lines 20

# Atau jika manual, lihat terminal output
```

**Yang perlu diperhatikan:**
- ✅ Tidak ada error "Unknown column"
- ✅ Auto-submit berjalan tanpa error
- ✅ Submission berhasil
- ✅ Memory usage normal

### **Cek database:**

```sql
-- Cek submission status
SELECT submission_status, COUNT(*) 
FROM attempts 
GROUP BY submission_status;

-- Cek backup
SELECT COUNT(*) FROM submission_backups;

-- Cek failed submissions
SELECT COUNT(*) FROM attempts WHERE submission_status = 'FAILED';
```

---

## 📝 Checklist Restart

- [ ] Stop server (Ctrl+C atau Stop-Process)
- [ ] Verifikasi semua process node stopped
- [ ] Start server lagi (npm start atau pm2 start)
- [ ] Cek logs: tidak ada error
- [ ] Tunggu 5 menit, cek auto-submit
- [ ] Test submission manual
- [ ] Test admin interface
- [ ] Monitor selama 1 jam
- [ ] Dokumentasi hasil

---

## 🎯 Expected Results

Setelah restart berhasil:

### **Logs:**
```
✅ Server running on port 3000
✅ Database connected
✅ Auto-submit middleware initialized
✅ Cron job scheduled: */5 * * * *
```

### **Auto-Submit (setiap 5 menit):**
```
[AUTO-SUBMIT] Checking for expired attempts...
[AUTO-SUBMIT] Found 0 expired attempts
[AUTO-SUBMIT] Completed in 123ms
```

### **Submission:**
```
📥 Submission received for attempt 123, retry: 0
✅ Attempt 123 submitted successfully
```

### **Admin Interface:**
```
GET /admin/failed-submissions 200 45ms
✅ Page loaded successfully
```

---

## 🚀 Quick Commands

**Stop Server:**
```powershell
Get-Process node | Stop-Process -Force
```

**Start Server:**
```bash
npm start
```

**Check Logs:**
```bash
# Jika PM2
pm2 logs bank-soal -f

# Jika manual
# Lihat terminal output
```

**Test Migration:**
```bash
node run-migration.js
```

**Test Connection:**
```bash
node test-peak-load-solution.js
```

---

## ✅ Summary

1. **Stop server** (Ctrl+C atau Stop-Process)
2. **Start server** (npm start atau pm2 start)
3. **Verify** (cek logs, test submission)
4. **Monitor** (1 jam pertama)

**Status:** Ready to restart! 🚀

---

*Last Updated: 14 Maret 2026*
