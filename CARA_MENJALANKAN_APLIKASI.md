# 🚀 Cara Menjalankan Aplikasi LMS

## Aplikasi Sudah Berjalan!

Aplikasi LMS SMKN 1 Kramatwatu sudah running dengan PM2 dan Redis.

---

## ✅ Status Saat Ini

```
✅ PM2: 16 instances online (cluster mode)
✅ Redis: Connected (10.10.102.8:6379)
✅ Session: Persistent dengan Redis
✅ URL: http://localhost:3000
```

---

## 📋 Perintah Dasar

### 1. Cek Status Aplikasi
```bash
pm2 status
```

Output yang diharapkan:
```
┌────┬───────────────┬─────────┬──────┬──────────┬─────────┬─────────┐
│ id │ name          │ mode    │ ↺    │ status   │ cpu     │ memory  │
├────┼───────────────┼─────────┼──────┼──────────┼─────────┼─────────┤
│ 0  │ lms-smkn1kras │ cluster │ 0    │ online   │ 0%      │ 50.0MB  │
│ 1  │ lms-smkn1kras │ cluster │ 0    │ online   │ 0%      │ 50.0MB  │
│ ... (16 instances total)
└────┴───────────────┴─────────┴──────┴──────────┴─────────┴─────────┘
```

### 2. Lihat Logs
```bash
# Logs real-time
pm2 logs

# Logs aplikasi saja
pm2 logs lms-smkn1kras

# Logs 50 baris terakhir
pm2 logs lms-smkn1kras --lines 50

# Stop logs (tekan Ctrl+C)
```

### 3. Monitor CPU & Memory
```bash
pm2 monit
```

Tekan `Ctrl+C` untuk keluar.

---

## 🔄 Mengelola Aplikasi

### Start (Jika Belum Jalan)
```bash
pm2 start ecosystem.config.js
```

### Stop (Hentikan Aplikasi)
```bash
pm2 stop lms-smkn1kras
```

### Restart (Dengan Downtime)
```bash
pm2 restart lms-smkn1kras
```

### Reload (Zero-Downtime)
```bash
# Recommended untuk production
pm2 reload lms-smkn1kras
```

### Delete (Hapus dari PM2)
```bash
pm2 delete lms-smkn1kras
```

---

## 🔧 Update Aplikasi

Ketika ada perubahan kode:

```bash
# 1. Pull kode terbaru (jika dari git)
git pull origin main

# 2. Install dependencies baru (jika ada)
npm install

# 3. Reload aplikasi (zero-downtime)
pm2 reload lms-smkn1kras

# 4. Cek logs
pm2 logs lms-smkn1kras --lines 30
```

---

## 🗄️ Cek Redis Session

### Cek Koneksi Redis
```bash
npm run redis:test
```

### Cek Session Aktif
```bash
npm run redis:sessions
```

### Manual Redis CLI
```bash
# Connect ke Redis
redis-cli -h 10.10.102.8 -a redisCBT2026

# Lihat semua session
KEYS lms:sess:*

# Hitung session
DBSIZE

# Keluar
exit
```

---

## 🖥️ Akses Aplikasi

### Browser
```
http://localhost:3000
```

### Dari Komputer Lain (Jaringan Lokal)
```
http://[IP-SERVER]:3000
```

Contoh: `http://192.168.1.100:3000`

---

## 🔄 Auto-Start saat Server Reboot

Aplikasi sudah disimpan dengan `pm2 save`, tapi untuk auto-start saat server reboot:

### Windows
```bash
# Generate startup script
pm2 startup

# Ikuti instruksi yang muncul
# Biasanya perlu run command dengan administrator
```

### Linux/Mac
```bash
# Generate startup script
pm2 startup

# Jalankan command yang muncul (dengan sudo)
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username

# Save process list
pm2 save
```

---

## 📊 Monitoring

### Dashboard PM2
```bash
pm2 monit
```

### Info Detail
```bash
pm2 info lms-smkn1kras
```

### Logs Error Saja
```bash
pm2 logs lms-smkn1kras --err
```

---

## 🛠️ Troubleshooting

### Aplikasi Tidak Jalan

**1. Cek status:**
```bash
pm2 status
```

**2. Cek logs error:**
```bash
pm2 logs lms-smkn1kras --err --lines 50
```

**3. Restart:**
```bash
pm2 restart lms-smkn1kras
```

### Redis Tidak Connect

**1. Test koneksi:**
```bash
npm run redis:test
```

**2. Cek Redis server:**
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 ping
```

**3. Cek .env:**
```env
REDIS_HOST=10.10.102.8
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026
```

### Port 3000 Sudah Digunakan

**1. Cek proses di port 3000:**
```bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000
```

**2. Kill proses:**
```bash
# Windows
taskkill /PID [PID] /F

# Linux/Mac
kill -9 [PID]
```

**3. Atau ganti port di .env:**
```env
PORT=3001
```

### Memory Penuh

**1. Cek memory usage:**
```bash
pm2 monit
```

**2. Restart aplikasi:**
```bash
pm2 restart lms-smkn1kras
```

**3. Kurangi instances di ecosystem.config.js:**
```javascript
instances: 4, // Ganti dari 'max' ke angka tertentu
```

---

## 📝 NPM Scripts

Aplikasi juga punya NPM scripts untuk kemudahan:

```bash
# Development (tanpa PM2)
npm run dev

# Production (tanpa PM2)
npm start

# PM2 Commands
npm run pm2:start      # Start dengan PM2
npm run pm2:stop       # Stop aplikasi
npm run pm2:restart    # Restart aplikasi
npm run pm2:reload     # Reload (zero-downtime)
npm run pm2:status     # Cek status
npm run pm2:logs       # Lihat logs
npm run pm2:monit      # Monitor

# Redis Commands
npm run redis:test     # Test koneksi Redis
npm run redis:sessions # Cek session aktif
```

---

## 🎯 Workflow Harian

### Pagi (Cek Status)
```bash
pm2 status
pm2 logs lms-smkn1kras --lines 20
npm run redis:sessions
```

### Update Kode
```bash
git pull
npm install
pm2 reload lms-smkn1kras
pm2 logs --lines 30
```

### Malam (Monitoring)
```bash
pm2 monit
pm2 logs --lines 50
```

---

## 🔐 Keamanan

### Ganti Session Secret

Edit `.env`:
```env
SESSION_SECRET=ganti-dengan-random-string-yang-panjang-minimal-32-karakter
```

Generate random string:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Restart aplikasi:
```bash
pm2 restart lms-smkn1kras
```

---

## 📦 Backup

### Manual Backup
```bash
# Backup database
mysqldump -u root -p cbt_smk > backup_$(date +%Y%m%d).sql

# Backup uploads
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz public/uploads

# Backup PM2 config
pm2 save
```

### Auto Backup (Windows Task Scheduler)
Buat batch file `backup.bat`:
```batch
@echo off
cd E:\nodejs\cbt-smk-premium
mysqldump -u root -p[password] cbt_smk > backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql
pm2 save
```

Jadwalkan di Task Scheduler untuk run setiap hari.

---

## 🚨 Emergency Commands

### Aplikasi Crash
```bash
pm2 restart lms-smkn1kras
pm2 logs --err --lines 100
```

### Clear All Sessions
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*" | xargs redis-cli -h 10.10.102.8 -a redisCBT2026 DEL
```

### Reset PM2
```bash
pm2 delete all
pm2 flush
pm2 start ecosystem.config.js
pm2 save
```

---

## 📚 Dokumentasi Lengkap

- `SETUP_COMPLETE.md` - Overview setup
- `REDIS_QUICK_REFERENCE.md` - Redis commands
- `PANDUAN_PRODUCTION_PM2_REDIS.md` - Panduan lengkap
- `INDEX_DOCUMENTATION.md` - Index semua dokumentasi

---

## ✅ Checklist Harian

- [ ] Cek status: `pm2 status`
- [ ] Cek logs: `pm2 logs --lines 20`
- [ ] Cek sessions: `npm run redis:sessions`
- [ ] Cek memory: `pm2 monit`
- [ ] Backup (jika perlu)

---

## 🆘 Butuh Bantuan?

1. Cek logs: `pm2 logs --err`
2. Cek status: `pm2 status`
3. Test Redis: `npm run redis:test`
4. Restart: `pm2 restart lms-smkn1kras`
5. Baca dokumentasi di folder project

---

## 📞 Quick Reference

```bash
# Status
pm2 status

# Logs
pm2 logs

# Monitor
pm2 monit

# Restart
pm2 restart lms-smkn1kras

# Reload (zero-downtime)
pm2 reload lms-smkn1kras

# Redis sessions
npm run redis:sessions

# Update aplikasi
git pull && npm install && pm2 reload lms-smkn1kras
```

---

**Aplikasi sudah running di: http://localhost:3000**

**Status: ✅ Online dengan PM2 + Redis**
