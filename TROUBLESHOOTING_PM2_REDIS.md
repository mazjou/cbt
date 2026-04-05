# 🔧 Troubleshooting PM2 & Redis

## Masalah Umum dan Solusinya

---

## 1. PM2 Command Not Found

### Gejala
```
pm2 : The term 'pm2' is not recognized...
```

### Solusi
```bash
# Install PM2 global
npm install -g pm2

# Verify
pm2 --version
```

---

## 2. Aplikasi Status "Errored"

### Gejala
```bash
pm2 status
# Status: errored
```

### Solusi

**1. Cek logs error:**
```bash
pm2 logs lms-smkn1kras --err --lines 50
```

**2. Delete dan start ulang:**
```bash
pm2 delete lms-smkn1kras
pm2 start ecosystem.config.js
```

**3. Cek dependencies:**
```bash
npm install
```

---

## 3. Redis Connection Failed

### Gejala
```
❌ Redis connection error
```

### Solusi

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

**4. Cek network:**
```bash
ping 10.10.102.8
telnet 10.10.102.8 6379
```

**5. Cek firewall:**
- Pastikan port 6379 terbuka
- Pastikan IP server diizinkan

---

## 4. Port 3000 Already in Use

### Gejala
```
Error: listen EADDRINUSE: address already in use :::3000
```

### Solusi

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

**3. Atau ganti port:**
Edit `.env`:
```env
PORT=3001
```

Restart:
```bash
pm2 restart lms-smkn1kras
```

---

## 5. Session Tidak Tersimpan

### Gejala
- User logout setelah refresh
- Session hilang setelah restart

### Solusi

**1. Cek Redis connection:**
```bash
npm run redis:test
```

**2. Cek session di Redis:**
```bash
npm run redis:sessions
```

**3. Cek logs:**
```bash
pm2 logs lms-smkn1kras | grep -i redis
```

**4. Pastikan RedisStore configured:**
Cek `src/server.js` ada:
```javascript
store: new RedisStore({ 
  client: redisClient,
  prefix: 'lms:sess:',
  ttl: 60 * 60 * 24 * 7
})
```

---

## 6. Memory Leak / High Memory Usage

### Gejala
```bash
pm2 monit
# Memory terus naik
```

### Solusi

**1. Restart aplikasi:**
```bash
pm2 restart lms-smkn1kras
```

**2. Set max memory restart:**
Edit `ecosystem.config.js`:
```javascript
max_memory_restart: '500M', // Ganti dari 1G
```

**3. Kurangi instances:**
```javascript
instances: 4, // Ganti dari 'max'
```

**4. Reload config:**
```bash
pm2 delete lms-smkn1kras
pm2 start ecosystem.config.js
```

---

## 7. Aplikasi Restart Terus (Crash Loop)

### Gejala
```bash
pm2 status
# ↺ restart count terus naik
```

### Solusi

**1. Cek logs error:**
```bash
pm2 logs lms-smkn1kras --err --lines 100
```

**2. Cek database connection:**
```bash
# Test database
mysql -u root -p cbt_smk
```

**3. Cek dependencies:**
```bash
npm install
```

**4. Disable auto-restart sementara:**
```bash
pm2 stop lms-smkn1kras
node src/server.js
# Lihat error langsung
```

---

## 8. Logs Terlalu Besar

### Gejala
- Disk space penuh
- Logs folder besar

### Solusi

**1. Flush logs:**
```bash
pm2 flush
```

**2. Setup log rotation:**
Install PM2 log rotate:
```bash
pm2 install pm2-logrotate
```

Configure:
```bash
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

**3. Manual cleanup:**
```bash
# Windows
del /Q logs\*.log

# Linux/Mac
rm -f logs/*.log
```

---

## 9. PM2 Tidak Auto-Start Setelah Reboot

### Gejala
- Server reboot
- Aplikasi tidak jalan otomatis

### Solusi

**1. Setup startup:**
```bash
pm2 startup
```

**2. Jalankan command yang muncul:**
```bash
# Windows (Run as Administrator)
# Ikuti instruksi

# Linux/Mac
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username
```

**3. Save process list:**
```bash
pm2 save
```

**4. Test:**
```bash
# Reboot server
# Cek setelah reboot
pm2 status
```

---

## 10. Cannot Find Module 'redis'

### Gejala
```
Error: Cannot find module 'redis'
```

### Solusi

**1. Install dependencies:**
```bash
npm install redis connect-redis@6
```

**2. Verify installation:**
```bash
npm list redis
npm list connect-redis
```

**3. Restart:**
```bash
pm2 restart lms-smkn1kras
```

---

## 11. Redis Authentication Failed

### Gejala
```
NOAUTH Authentication required
```

### Solusi

**1. Cek password di .env:**
```env
REDIS_PASSWORD=redisCBT2026
```

**2. Test dengan password:**
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 ping
```

**3. Jika password salah:**
- Hubungi admin Redis server
- Update password di .env
- Restart aplikasi

---

## 12. Cluster Mode Issues

### Gejala
- Beberapa instance error
- Load balancing tidak merata

### Solusi

**1. Cek semua instances:**
```bash
pm2 status
```

**2. Restart semua:**
```bash
pm2 restart all
```

**3. Kurangi instances:**
Edit `ecosystem.config.js`:
```javascript
instances: 4, // Dari 'max'
```

**4. Reload:**
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

---

## 13. Database Connection Error

### Gejala
```
Error: connect ECONNREFUSED
ER_ACCESS_DENIED_ERROR
```

### Solusi

**1. Cek database running:**
```bash
# Windows
net start MySQL

# Linux
sudo systemctl status mysql
```

**2. Cek credentials di .env:**
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=cbt_smk
```

**3. Test connection:**
```bash
mysql -u root -p cbt_smk
```

**4. Restart aplikasi:**
```bash
pm2 restart lms-smkn1kras
```

---

## 14. Socket.io Connection Issues

### Gejala
- Live class tidak connect
- Notifikasi tidak real-time

### Solusi

**1. Cek logs:**
```bash
pm2 logs | grep -i socket
```

**2. Cek port:**
- Socket.io menggunakan port yang sama (3000)
- Pastikan tidak di-block firewall

**3. Restart:**
```bash
pm2 restart lms-smkn1kras
```

---

## 15. Permission Denied

### Gejala
```
Error: EACCES: permission denied
```

### Solusi

**1. Windows:**
- Run PowerShell as Administrator
- Atau ubah permission folder

**2. Linux/Mac:**
```bash
# Fix ownership
sudo chown -R $USER:$USER .

# Fix permissions
chmod -R 755 .
```

---

## 🆘 Emergency Recovery

Jika semua gagal:

```bash
# 1. Stop semua
pm2 delete all

# 2. Clear logs
pm2 flush

# 3. Clear Redis sessions
redis-cli -h 10.10.102.8 -a redisCBT2026 FLUSHDB

# 4. Reinstall dependencies
rm -rf node_modules
npm install

# 5. Start fresh
pm2 start ecosystem.config.js

# 6. Save
pm2 save
```

---

## 📞 Diagnostic Commands

```bash
# System info
pm2 info lms-smkn1kras

# Full logs
pm2 logs --lines 200

# Error logs only
pm2 logs --err --lines 100

# Redis test
npm run redis:test

# Redis sessions
npm run redis:sessions

# Node version
node --version

# NPM version
npm --version

# PM2 version
pm2 --version

# Check port
netstat -ano | findstr :3000
```

---

## 📚 Dokumentasi Terkait

- `CARA_MENJALANKAN_APLIKASI.md` - Cara menjalankan
- `REDIS_QUICK_REFERENCE.md` - Redis commands
- `PANDUAN_PRODUCTION_PM2_REDIS.md` - Panduan lengkap

---

**Jika masalah masih berlanjut, cek logs detail:**
```bash
pm2 logs lms-smkn1kras --err --lines 200 > error_log.txt
```

Kirim `error_log.txt` untuk analisis lebih lanjut.
