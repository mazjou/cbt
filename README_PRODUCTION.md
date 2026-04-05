# LMS SMKN 1 Kras - Production Setup

## 📁 File Struktur Production

```
project/
├── ecosystem.config.js          # PM2 configuration
├── pm2-commands.sh              # Helper script (Linux/Mac)
├── pm2-commands.ps1             # Helper script (Windows)
├── .env.example                 # Environment template (with Redis)
├── package.json                 # Updated with PM2 scripts
├── logs/                        # PM2 logs directory
│   ├── pm2-error.log
│   └── pm2-out.log
├── backups/                     # Backup directory
└── docs/
    ├── PANDUAN_PRODUCTION_PM2_REDIS.md
    ├── UPDATE_SERVER_REDIS.md
    └── QUICK_START_PRODUCTION.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# PM2
npm install -g pm2

# Redis packages
npm install redis connect-redis

# Redis Server (sesuai OS)
```

### 2. Setup Environment
```bash
# Copy .env.example
cp .env.example .env

# Edit .env
nano .env  # atau notepad .env

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start Redis
```bash
# Test Redis
redis-cli ping
# Harus return: PONG
```

### 4. Start Application
```bash
# Dengan PM2
npm run pm2:start

# Atau
pm2 start ecosystem.config.js

# Cek status
npm run pm2:status
```

---

## 📚 Dokumentasi

### Panduan Lengkap
1. **QUICK_START_PRODUCTION.md** - Setup cepat 5 menit
2. **PANDUAN_PRODUCTION_PM2_REDIS.md** - Panduan lengkap & detail
3. **UPDATE_SERVER_REDIS.md** - Update server.js untuk Redis

### File Konfigurasi
1. **ecosystem.config.js** - PM2 configuration
2. **.env.example** - Environment variables template
3. **package.json** - NPM scripts untuk PM2

### Helper Scripts
1. **pm2-commands.sh** - Bash script (Linux/Mac)
2. **pm2-commands.ps1** - PowerShell script (Windows)

---

## 🛠️ NPM Scripts

```bash
# Development
npm run dev              # Start dengan nodemon

# Production dengan PM2
npm run pm2:start        # Start aplikasi
npm run pm2:stop         # Stop aplikasi
npm run pm2:restart      # Restart aplikasi
npm run pm2:reload       # Reload (zero-downtime)
npm run pm2:logs         # Lihat logs
npm run pm2:monit        # Monitor CPU & Memory
npm run pm2:status       # Lihat status
```

---

## 🔧 Helper Scripts

### Linux/Mac
```bash
# Buat executable
chmod +x pm2-commands.sh

# Commands
./pm2-commands.sh start
./pm2-commands.sh stop
./pm2-commands.sh restart
./pm2-commands.sh reload
./pm2-commands.sh status
./pm2-commands.sh logs
./pm2-commands.sh monitor
./pm2-commands.sh update
./pm2-commands.sh backup
./pm2-commands.sh health
./pm2-commands.sh redis-status
```

### Windows PowerShell
```powershell
.\pm2-commands.ps1 start
.\pm2-commands.ps1 stop
.\pm2-commands.ps1 restart
.\pm2-commands.ps1 reload
.\pm2-commands.ps1 status
.\pm2-commands.ps1 logs
.\pm2-commands.ps1 monitor
.\pm2-commands.ps1 update
.\pm2-commands.ps1 backup
.\pm2-commands.ps1 health
.\pm2-commands.ps1 redis-status
```

---

## 📊 Monitoring

### PM2 Dashboard
```bash
# Terminal monitoring
pm2 monit

# Web dashboard
pm2 web
# Akses: http://localhost:9615
```

### Redis Monitoring
```bash
# Ping test
redis-cli ping

# Monitor commands
redis-cli monitor

# Check memory
redis-cli info memory

# List session keys
redis-cli KEYS "lms:sess:*"
```

### Logs
```bash
# Real-time logs
pm2 logs

# Error logs only
pm2 logs --err

# Last 100 lines
pm2 logs --lines 100

# Flush logs
pm2 flush
```

---

## 🔄 Update Aplikasi

### Manual Update
```bash
# 1. Pull code
git pull origin main

# 2. Install dependencies
npm install

# 3. Reload (zero-downtime)
pm2 reload lms-smkn1kras
```

### Dengan Helper Script
```bash
# Linux/Mac
./pm2-commands.sh update

# Windows
.\pm2-commands.ps1 update
```

---

## 💾 Backup

### Manual Backup
```bash
# Linux/Mac
./pm2-commands.sh backup

# Windows
.\pm2-commands.ps1 backup
```

### Auto Backup (Cron - Linux)
```bash
# Edit crontab
crontab -e

# Backup setiap hari jam 2 pagi
0 2 * * * cd /path/to/app && ./pm2-commands.sh backup
```

### Backup Includes:
- Database (MySQL dump)
- Redis data (dump.rdb)
- Uploads folder (tar.gz)
- .env file

---

## 🔒 Security

### 1. Session Secret
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env
SESSION_SECRET=hasil-generate-di-atas
```

### 2. Redis Password (Production)
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Tambahkan
requirepass your-strong-password

# Restart Redis
sudo systemctl restart redis

# Update .env
REDIS_PASSWORD=your-strong-password
```

### 3. HTTPS (Production)
```env
# .env
NODE_ENV=production
# Cookie secure akan otomatis true
```

### 4. Firewall
```bash
# Block Redis port dari luar
sudo ufw deny 6379
sudo ufw allow from 127.0.0.1 to any port 6379
```

---

## 🎯 Production Checklist

### Pre-Production
- [ ] Install PM2 globally
- [ ] Install Redis server
- [ ] Install redis & connect-redis packages
- [ ] Update .env dengan Redis config
- [ ] Generate SESSION_SECRET yang kuat
- [ ] Test Redis connection
- [ ] Update server.js dengan Redis config

### Deployment
- [ ] Start aplikasi dengan PM2
- [ ] Verify PM2 status
- [ ] Verify Redis connection
- [ ] Test session persistence
- [ ] Setup auto-start on boot
- [ ] Save PM2 process list

### Post-Deployment
- [ ] Setup monitoring
- [ ] Setup backup automation
- [ ] Setup log rotation
- [ ] Setup alerts
- [ ] Document server credentials
- [ ] Test disaster recovery

### Security
- [ ] Change SESSION_SECRET
- [ ] Set Redis password
- [ ] Enable HTTPS
- [ ] Configure firewall
- [ ] Update dependencies
- [ ] Disable debug mode

---

## 🆘 Troubleshooting

### PM2 Issues
```bash
# Aplikasi crash terus
pm2 logs --err
pm2 info lms-smkn1kras

# Port sudah digunakan
lsof -i :3000  # Linux/Mac
netstat -ano | findstr :3000  # Windows

# Memory leak
pm2 monit
pm2 restart lms-smkn1kras --max-memory-restart 1G
```

### Redis Issues
```bash
# Redis tidak connect
redis-cli ping
sudo systemctl status redis  # Linux
redis-server.exe  # Windows

# Session hilang
redis-cli KEYS "lms:sess:*"
redis-cli monitor
```

### Performance Issues
```bash
# High CPU
pm2 monit
# Consider scaling instances

# High Memory
pm2 monit
# Set max_memory_restart

# Slow response
# Check database queries
# Check Redis latency
# Enable gzip compression
```

---

## 📈 Scaling

### Horizontal Scaling
```javascript
// ecosystem.config.js
instances: 4,  // Atau 'max' untuk semua cores
exec_mode: 'cluster'
```

### Load Balancing
- Nginx reverse proxy
- Multiple server instances
- Shared Redis for sessions
- Database read replicas

---

## 🔗 Resources

### Documentation
- PM2: https://pm2.keymetrics.io/
- Redis: https://redis.io/documentation
- Node.js: https://nodejs.org/docs/

### Tools
- PM2 Plus: https://app.pm2.io/
- Redis Commander: https://github.com/joeferner/redis-commander
- Nginx: https://nginx.org/

---

## 📞 Support

Jika ada masalah:
1. Baca dokumentasi di folder `docs/`
2. Cek logs: `pm2 logs --err`
3. Cek Redis: `redis-cli ping`
4. Cek status: `pm2 status`
5. Run health check: `./pm2-commands.sh health`

---

## ✅ Status

- ✅ PM2 configuration ready
- ✅ Redis integration ready
- ✅ Helper scripts ready
- ✅ Documentation complete
- ✅ Production ready!

---

## 📝 Notes

- Gunakan `pm2 reload` untuk zero-downtime deployment
- Backup secara berkala (database + Redis + uploads)
- Monitor logs untuk detect issues early
- Update dependencies secara berkala
- Test backup restore procedure
- Document all changes

---

**Last Updated:** 2026-03-05
**Version:** 1.0.0
**Status:** Production Ready ✅
