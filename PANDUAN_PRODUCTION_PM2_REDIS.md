# Panduan Production: PM2 + Redis

## Deskripsi
Panduan lengkap untuk menjalankan aplikasi LMS di production menggunakan PM2 (Process Manager) dan Redis (Session Store).

---

## 1. Instalasi Dependencies

### A. Install PM2 (Global)
```bash
npm install -g pm2
```

### B. Install Redis Packages
```bash
npm install redis connect-redis
```

### C. Install Redis Server

#### Windows:
1. Download Redis dari: https://github.com/microsoftarchive/redis/releases
2. Extract dan jalankan `redis-server.exe`
3. Atau install via Chocolatey:
```bash
choco install redis-64
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

#### macOS:
```bash
brew install redis
brew services start redis
```

---

## 2. Konfigurasi Redis untuk Session

### A. Update `src/server.js`

Tambahkan konfigurasi Redis session:

```javascript
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// ... kode lainnya ...

// Redis Client
const redisClient = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  legacyMode: true
});

redisClient.connect().catch(console.error);

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

// Session dengan Redis Store
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true jika HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 hari
  }
}));
```

### B. Update `.env`

Tambahkan konfigurasi Redis:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=ganti-dengan-random-string-yang-panjang-dan-aman

# Production
NODE_ENV=production
PORT=3000
```

---

## 3. File Konfigurasi PM2

File `ecosystem.config.js` sudah dibuat dengan konfigurasi:

```javascript
module.exports = {
  apps: [{
    name: 'lms-smkn1kras',
    script: './src/server.js',
    instances: 'max', // Gunakan semua CPU cores
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

---

## 4. Menjalankan Aplikasi

### A. Development (Tanpa PM2)
```bash
npm run dev
```

### B. Production dengan PM2

#### Start aplikasi:
```bash
pm2 start ecosystem.config.js
```

#### Start dengan environment tertentu:
```bash
pm2 start ecosystem.config.js --env production
```

#### Start dengan nama custom:
```bash
pm2 start ecosystem.config.js --name lms-app
```

---

## 5. Perintah PM2 Penting

### Monitoring
```bash
# Lihat status semua aplikasi
pm2 status

# Lihat logs real-time
pm2 logs

# Lihat logs aplikasi tertentu
pm2 logs lms-smkn1kras

# Lihat logs error saja
pm2 logs --err

# Monitor CPU & Memory
pm2 monit
```

### Management
```bash
# Restart aplikasi
pm2 restart lms-smkn1kras

# Reload (zero-downtime restart)
pm2 reload lms-smkn1kras

# Stop aplikasi
pm2 stop lms-smkn1kras

# Delete dari PM2
pm2 delete lms-smkn1kras

# Restart semua
pm2 restart all
```

### Informasi
```bash
# Info detail aplikasi
pm2 info lms-smkn1kras

# Lihat environment variables
pm2 env 0

# List semua proses
pm2 list
```

### Logs
```bash
# Flush logs
pm2 flush

# Lihat 100 baris terakhir
pm2 logs --lines 100

# Save logs ke file
pm2 logs > logs/pm2-manual.log
```

---

## 6. Auto-Start saat Server Reboot

### A. Generate startup script
```bash
pm2 startup
```

Jalankan command yang muncul (biasanya dengan sudo).

### B. Save current process list
```bash
pm2 save
```

### C. Test (optional)
```bash
# Reboot server
sudo reboot

# Setelah reboot, cek status
pm2 status
```

---

## 7. Monitoring & Dashboard

### A. PM2 Plus (Cloud Monitoring)
```bash
# Daftar di https://app.pm2.io
pm2 link <secret_key> <public_key>
```

### B. Web Dashboard (Local)
```bash
pm2 web
```
Akses di: http://localhost:9615

---

## 8. Load Balancing dengan Cluster Mode

PM2 sudah dikonfigurasi dengan cluster mode:

```javascript
instances: 'max', // Gunakan semua CPU cores
exec_mode: 'cluster'
```

Ini akan:
- Menjalankan aplikasi di semua CPU cores
- Load balancing otomatis
- Zero-downtime reload
- Meningkatkan performa dan reliability

---

## 9. Graceful Shutdown

Aplikasi sudah dikonfigurasi untuk graceful shutdown:

```javascript
// Di src/server.js, tambahkan:
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  
  // Close server
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  // Close database connections
  await pool.end();
  console.log('✅ Database connections closed');
  
  // Close Redis
  await redisClient.quit();
  console.log('✅ Redis connection closed');
  
  process.exit(0);
});
```

---

## 10. Backup & Restore PM2

### Backup
```bash
pm2 save
```

File disimpan di: `~/.pm2/dump.pm2`

### Restore
```bash
pm2 resurrect
```

---

## 11. Update Aplikasi (Zero-Downtime)

```bash
# 1. Pull kode terbaru
git pull origin main

# 2. Install dependencies baru (jika ada)
npm install

# 3. Reload aplikasi (zero-downtime)
pm2 reload lms-smkn1kras

# Atau reload semua
pm2 reload all
```

---

## 12. Troubleshooting

### A. Aplikasi tidak start
```bash
# Cek logs
pm2 logs lms-smkn1kras --err

# Cek info
pm2 info lms-smkn1kras

# Restart dengan logs
pm2 restart lms-smkn1kras --log
```

### B. Redis connection error
```bash
# Cek Redis status
redis-cli ping
# Harus return: PONG

# Cek Redis service (Linux)
sudo systemctl status redis

# Restart Redis (Linux)
sudo systemctl restart redis
```

### C. Memory leak
```bash
# Monitor memory
pm2 monit

# Set max memory restart
pm2 restart lms-smkn1kras --max-memory-restart 1G
```

### D. Port sudah digunakan
```bash
# Cek port yang digunakan (Linux)
sudo lsof -i :3000

# Kill process di port 3000
sudo kill -9 $(sudo lsof -t -i:3000)

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## 13. Best Practices

### A. Environment Variables
- Jangan commit `.env` ke git
- Gunakan `.env.example` sebagai template
- Ganti `SESSION_SECRET` dengan random string yang kuat

### B. Logs
- Rotate logs secara berkala
- Gunakan `pm2 flush` untuk clear logs lama
- Monitor disk space untuk logs

### C. Monitoring
- Setup PM2 Plus untuk monitoring cloud
- Setup alerts untuk error dan downtime
- Monitor CPU, Memory, dan Response Time

### D. Security
- Gunakan HTTPS di production
- Set `cookie.secure: true` jika HTTPS
- Update dependencies secara berkala
- Gunakan firewall untuk protect Redis port

### E. Performance
- Gunakan cluster mode untuk multi-core
- Set `max_memory_restart` untuk prevent memory leak
- Gunakan Redis untuk session (bukan memory store)
- Enable gzip compression

---

## 14. Struktur Folder Logs

```
project/
├── logs/
│   ├── pm2-error.log
│   ├── pm2-out.log
│   └── app.log
├── ecosystem.config.js
└── .env
```

Buat folder logs:
```bash
mkdir logs
```

---

## 15. Nginx Reverse Proxy (Optional)

Jika menggunakan Nginx sebagai reverse proxy:

```nginx
server {
    listen 80;
    server_name lms.smkn1kras.sch.id;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.io
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 16. Checklist Production

- [ ] Install PM2 globally
- [ ] Install Redis server
- [ ] Install redis & connect-redis packages
- [ ] Update src/server.js dengan Redis config
- [ ] Update .env dengan Redis config
- [ ] Test Redis connection: `redis-cli ping`
- [ ] Start aplikasi: `pm2 start ecosystem.config.js`
- [ ] Cek status: `pm2 status`
- [ ] Cek logs: `pm2 logs`
- [ ] Setup auto-start: `pm2 startup` & `pm2 save`
- [ ] Test restart: `pm2 restart lms-smkn1kras`
- [ ] Monitor: `pm2 monit`
- [ ] Setup Nginx (optional)
- [ ] Setup SSL/HTTPS (optional)
- [ ] Setup backup otomatis
- [ ] Setup monitoring alerts

---

## 17. Quick Commands Cheat Sheet

```bash
# Start
pm2 start ecosystem.config.js

# Status
pm2 status

# Logs
pm2 logs

# Restart
pm2 restart lms-smkn1kras

# Reload (zero-downtime)
pm2 reload lms-smkn1kras

# Stop
pm2 stop lms-smkn1kras

# Monitor
pm2 monit

# Save
pm2 save

# Auto-start
pm2 startup
pm2 save
```

---

## Status
✅ Dokumentasi lengkap untuk production dengan PM2 + Redis
