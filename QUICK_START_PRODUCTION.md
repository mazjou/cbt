# Quick Start: Production dengan PM2 + Redis

## 🚀 Setup Cepat (5 Menit)

### 1. Install Dependencies
```bash
# Install PM2 globally
npm install -g pm2

# Install Redis packages
npm install redis connect-redis

# Install Redis Server (pilih sesuai OS)
```

**Windows:**
```bash
# Download dari: https://github.com/microsoftarchive/redis/releases
# Atau via Chocolatey:
choco install redis-64
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**macOS:**
```bash
brew install redis
brew services start redis
```

---

### 2. Update .env
```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session Secret (GANTI!)
SESSION_SECRET=ganti-dengan-random-string-minimal-32-karakter

# Environment
NODE_ENV=production
PORT=3000
```

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 3. Test Redis
```bash
redis-cli ping
# Harus return: PONG
```

---

### 4. Start Aplikasi
```bash
# Start dengan PM2
pm2 start ecosystem.config.js

# Cek status
pm2 status

# Lihat logs
pm2 logs
```

---

### 5. Setup Auto-Start
```bash
# Generate startup script
pm2 startup

# Jalankan command yang muncul (dengan sudo)

# Save process list
pm2 save
```

---

## ✅ Verifikasi

### Cek PM2
```bash
pm2 status
# Harus ada lms-smkn1kras dengan status "online"
```

### Cek Redis
```bash
redis-cli KEYS "lms:sess:*"
# Akan muncul session keys setelah ada user login
```

### Cek Aplikasi
```bash
# Buka browser
http://localhost:3000

# Login dan cek session tetap ada setelah restart
pm2 restart lms-smkn1kras
# Session tidak hilang!
```

---

## 📋 Perintah Penting

### Management
```bash
# Start
pm2 start ecosystem.config.js

# Restart
pm2 restart lms-smkn1kras

# Reload (zero-downtime)
pm2 reload lms-smkn1kras

# Stop
pm2 stop lms-smkn1kras

# Status
pm2 status

# Logs
pm2 logs

# Monitor
pm2 monit
```

### Update Aplikasi
```bash
# Pull code terbaru
git pull origin main

# Install dependencies
npm install

# Reload (zero-downtime)
pm2 reload lms-smkn1kras
```

---

## 🛠️ Helper Scripts

### Linux/Mac
```bash
# Buat executable
chmod +x pm2-commands.sh

# Gunakan
./pm2-commands.sh start
./pm2-commands.sh status
./pm2-commands.sh logs
./pm2-commands.sh update
```

### Windows
```powershell
# Gunakan PowerShell
.\pm2-commands.ps1 start
.\pm2-commands.ps1 status
.\pm2-commands.ps1 logs
.\pm2-commands.ps1 update
```

---

## 🔧 Troubleshooting

### PM2 tidak bisa start
```bash
# Cek logs error
pm2 logs --err

# Cek port
netstat -ano | findstr :3000  # Windows
lsof -i :3000                  # Linux/Mac

# Kill process di port 3000
# Windows:
taskkill /PID <PID> /F
# Linux/Mac:
kill -9 <PID>
```

### Redis tidak connect
```bash
# Cek Redis
redis-cli ping

# Start Redis (Linux)
sudo systemctl start redis

# Start Redis (Windows)
# Jalankan redis-server.exe

# Start Redis (Mac)
brew services start redis
```

### Session hilang setelah restart
- Pastikan Redis running
- Cek REDIS_HOST dan REDIS_PORT di .env
- Cek logs: `pm2 logs --err`

---

## 📊 Monitoring

### PM2 Monitor
```bash
pm2 monit
```

### Redis Monitor
```bash
redis-cli monitor
```

### Logs Real-time
```bash
pm2 logs lms-smkn1kras --lines 100
```

---

## 🔒 Security Checklist

- [ ] Ganti SESSION_SECRET dengan random string
- [ ] Set Redis password (production)
- [ ] Gunakan HTTPS (production)
- [ ] Set cookie.secure: true (jika HTTPS)
- [ ] Firewall untuk Redis port (6379)
- [ ] Update dependencies secara berkala
- [ ] Backup database & Redis secara berkala

---

## 📦 Backup

### Manual Backup
```bash
# Gunakan helper script
./pm2-commands.sh backup      # Linux/Mac
.\pm2-commands.ps1 backup      # Windows
```

### Auto Backup (Cron - Linux)
```bash
# Edit crontab
crontab -e

# Tambahkan (backup setiap hari jam 2 pagi)
0 2 * * * cd /path/to/app && ./pm2-commands.sh backup
```

---

## 🎯 Next Steps

1. **Setup Nginx** (optional)
   - Reverse proxy
   - SSL/HTTPS
   - Load balancing

2. **Setup Monitoring**
   - PM2 Plus (cloud monitoring)
   - Uptime monitoring
   - Error tracking

3. **Setup CI/CD**
   - Auto deploy
   - Auto testing
   - Auto backup

4. **Optimize Performance**
   - Enable gzip
   - CDN untuk static files
   - Database indexing

---

## 📚 Dokumentasi Lengkap

- `PANDUAN_PRODUCTION_PM2_REDIS.md` - Panduan lengkap
- `UPDATE_SERVER_REDIS.md` - Update server.js
- `ecosystem.config.js` - PM2 configuration
- `pm2-commands.sh` - Helper script (Linux/Mac)
- `pm2-commands.ps1` - Helper script (Windows)

---

## 💡 Tips

1. **Gunakan cluster mode** untuk multi-core CPU
2. **Monitor memory usage** dengan `pm2 monit`
3. **Backup secara berkala** (database + Redis + uploads)
4. **Update dependencies** secara berkala
5. **Monitor logs** untuk detect error early
6. **Use Redis password** di production
7. **Setup alerts** untuk downtime
8. **Test backup restore** secara berkala

---

## ✅ Production Checklist

- [ ] PM2 installed & configured
- [ ] Redis installed & running
- [ ] .env configured (SESSION_SECRET, REDIS_*)
- [ ] Application started with PM2
- [ ] Auto-start on boot configured
- [ ] Logs directory created
- [ ] Backup script configured
- [ ] Monitoring setup
- [ ] Security hardening done
- [ ] Performance optimization done
- [ ] Documentation updated

---

## 🆘 Support

Jika ada masalah:
1. Cek logs: `pm2 logs --err`
2. Cek Redis: `redis-cli ping`
3. Cek status: `pm2 status`
4. Restart: `pm2 restart lms-smkn1kras`
5. Baca dokumentasi lengkap

---

## Status
✅ Ready for Production!
