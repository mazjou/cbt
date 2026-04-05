# Summary: PM2 + Redis Setup

## 📦 Files Created

1. **ecosystem.config.js** - PM2 configuration
2. **pm2-commands.sh** - Helper script (Linux/Mac)
3. **pm2-commands.ps1** - Helper script (Windows)
4. **.env.example** - Updated with Redis config
5. **package.json** - Updated with PM2 scripts

## 📚 Documentation Created

1. **PANDUAN_PRODUCTION_PM2_REDIS.md** - Panduan lengkap (17 sections)
2. **UPDATE_SERVER_REDIS.md** - Update server.js guide
3. **QUICK_START_PRODUCTION.md** - Quick start 5 menit
4. **README_PRODUCTION.md** - Production overview

---

## 🚀 Quick Setup (3 Steps)

### 1. Install
```bash
npm install -g pm2
npm install redis connect-redis
```

### 2. Configure
```bash
# Copy .env.example to .env
cp .env.example .env

# Edit .env - ganti SESSION_SECRET
nano .env
```

### 3. Start
```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## 🎯 Key Features

### PM2
- ✅ Cluster mode (multi-core)
- ✅ Auto-restart on crash
- ✅ Zero-downtime reload
- ✅ Log management
- ✅ Monitoring dashboard
- ✅ Auto-start on boot

### Redis
- ✅ Persistent sessions
- ✅ Shared sessions (cluster mode)
- ✅ Fast in-memory storage
- ✅ Automatic expiration (TTL)
- ✅ Session backup

---

## 📋 Commands Cheat Sheet

### PM2
```bash
pm2 start ecosystem.config.js  # Start
pm2 status                      # Status
pm2 logs                        # Logs
pm2 monit                       # Monitor
pm2 restart lms-smkn1kras      # Restart
pm2 reload lms-smkn1kras       # Reload (zero-downtime)
pm2 stop lms-smkn1kras         # Stop
```

### Redis
```bash
redis-cli ping                  # Test connection
redis-cli KEYS "lms:sess:*"    # List sessions
redis-cli monitor               # Monitor commands
redis-cli info memory           # Memory usage
```

### Helper Scripts
```bash
# Linux/Mac
./pm2-commands.sh start
./pm2-commands.sh status
./pm2-commands.sh logs
./pm2-commands.sh update
./pm2-commands.sh backup

# Windows
.\pm2-commands.ps1 start
.\pm2-commands.ps1 status
.\pm2-commands.ps1 logs
.\pm2-commands.ps1 update
.\pm2-commands.ps1 backup
```

---

## 🔧 Configuration

### ecosystem.config.js
```javascript
{
  name: 'lms-smkn1kras',
  script: './src/server.js',
  instances: 'max',        // All CPU cores
  exec_mode: 'cluster',    // Cluster mode
  max_memory_restart: '1G' // Auto-restart if > 1GB
}
```

### .env
```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session (GANTI!)
SESSION_SECRET=random-32-characters-minimum

# Environment
NODE_ENV=production
PORT=3000
```

---

## 📊 Benefits

### Before (Without PM2 + Redis)
- ❌ Manual restart on crash
- ❌ Session hilang saat restart
- ❌ Single process (1 CPU core)
- ❌ No monitoring
- ❌ Downtime saat update

### After (With PM2 + Redis)
- ✅ Auto-restart on crash
- ✅ Session persistent
- ✅ Multi-process (all CPU cores)
- ✅ Built-in monitoring
- ✅ Zero-downtime updates

---

## 🎓 Learning Path

1. **Beginner**: Read `QUICK_START_PRODUCTION.md`
2. **Intermediate**: Read `PANDUAN_PRODUCTION_PM2_REDIS.md`
3. **Advanced**: Read `UPDATE_SERVER_REDIS.md`
4. **Reference**: Use `README_PRODUCTION.md`

---

## ✅ Production Checklist

- [ ] PM2 installed
- [ ] Redis installed & running
- [ ] .env configured
- [ ] SESSION_SECRET changed
- [ ] Application started
- [ ] Auto-start configured
- [ ] Backup setup
- [ ] Monitoring setup

---

## 🆘 Quick Troubleshooting

### App won't start
```bash
pm2 logs --err
```

### Redis not connecting
```bash
redis-cli ping
sudo systemctl start redis  # Linux
```

### Session lost after restart
```bash
# Check Redis
redis-cli KEYS "lms:sess:*"

# Check .env
cat .env | grep REDIS
```

---

## 📞 Next Steps

1. ✅ Setup PM2 + Redis (Done!)
2. ⏭️ Setup Nginx reverse proxy
3. ⏭️ Setup SSL/HTTPS
4. ⏭️ Setup monitoring alerts
5. ⏭️ Setup auto backup
6. ⏭️ Setup CI/CD

---

## 📖 Documentation Index

| File | Purpose | Audience |
|------|---------|----------|
| QUICK_START_PRODUCTION.md | Quick setup guide | Beginners |
| PANDUAN_PRODUCTION_PM2_REDIS.md | Complete guide | All levels |
| UPDATE_SERVER_REDIS.md | Server.js update | Developers |
| README_PRODUCTION.md | Overview & reference | All levels |
| ecosystem.config.js | PM2 config | DevOps |
| pm2-commands.sh | Helper script | Linux/Mac users |
| pm2-commands.ps1 | Helper script | Windows users |

---

## 🎉 Conclusion

Aplikasi LMS sekarang production-ready dengan:
- ✅ Process management (PM2)
- ✅ Session persistence (Redis)
- ✅ Auto-restart & monitoring
- ✅ Zero-downtime deployment
- ✅ Scalability (cluster mode)
- ✅ Complete documentation

**Status: PRODUCTION READY! 🚀**
