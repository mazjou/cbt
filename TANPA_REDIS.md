# 🚀 Menjalankan Aplikasi Tanpa Redis

## ✅ Ya, Aplikasi Bisa Berjalan Tanpa Redis!

Redis adalah **opsional** untuk aplikasi ini. Jika Redis tidak tersedia, aplikasi akan otomatis menggunakan **memory store** untuk session.

---

## 🔄 Cara Kerja Fallback

### **Dengan Redis (Recommended untuk Production):**
```
User Login → Session disimpan di Redis
           → Session persistent (tidak hilang saat restart)
           → Bisa di-share antar multiple server instances
           → Performa lebih baik untuk banyak user
```

### **Tanpa Redis (OK untuk Development/Small Scale):**
```
User Login → Session disimpan di Memory (RAM)
           → Session hilang saat server restart
           → Tidak bisa di-share antar server instances
           → Cukup untuk single server dengan user terbatas
```

---

## 🛠️ Cara Disable Redis

### **Metode 1: Hapus/Comment Redis Config di .env**

Edit file `.env`:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=cbt_smk

# Redis Configuration - DISABLED
# REDIS_HOST=redis.smknegeri1kras.sch.id
# REDIS_PORT=6379
# REDIS_PASSWORD=redisCBT2026
```

### **Metode 2: Set REDIS_HOST ke localhost (tanpa Redis server)**

```bash
# Ini akan trigger fallback ke memory store
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

Jika tidak ada Redis server di localhost, aplikasi akan otomatis fallback.

---

## 📊 Perbandingan: Redis vs Memory Store

| Aspek | Redis Store | Memory Store |
|-------|-------------|--------------|
| **Persistence** | ✅ Persistent | ❌ Hilang saat restart |
| **Multi-Server** | ✅ Bisa share session | ❌ Tidak bisa |
| **Performance** | ✅ Sangat cepat | ✅ Cepat (di RAM) |
| **Memory Usage** | ✅ Terpisah dari app | ⚠️ Menggunakan RAM app |
| **Setup** | ⚠️ Perlu install Redis | ✅ Tidak perlu setup |
| **Production** | ✅ Recommended | ⚠️ Not recommended |
| **Development** | ✅ Optional | ✅ OK |
| **Small Scale** | ✅ Optional | ✅ OK (<50 users) |

---

## 🎯 Kapan Menggunakan Memory Store?

### **✅ OK untuk Memory Store:**
- Development/testing lokal
- Server single instance
- User concurrent < 50
- Tidak masalah jika user logout saat restart
- Setup cepat tanpa dependency

### **⚠️ Harus Pakai Redis:**
- Production dengan banyak user (>50 concurrent)
- Multiple server instances (load balancing)
- Perlu session persistence
- High availability requirement

---

## 🚀 Cara Start Aplikasi Tanpa Redis

### **Step 1: Edit .env**

```bash
# Comment atau hapus Redis config
# REDIS_HOST=redis.smknegeri1kras.sch.id
# REDIS_PORT=6379
# REDIS_PASSWORD=redisCBT2026
```

### **Step 2: Start Server**

```bash
npm start
```

### **Step 3: Cek Logs**

Anda akan melihat:
```
⚠️  Redis not configured, using memory session store
💡 To use Redis, set REDIS_HOST in .env file
✅ Session configured with memory store (not recommended for production)
✅ Server running on port 3000
```

### **Step 4: Test**

1. Buka browser: `http://localhost:3000`
2. Login sebagai user
3. Session akan berfungsi normal
4. ⚠️ Jika restart server, user akan logout otomatis

---

## 🔧 Troubleshooting

### **Problem: Session hilang terus**

**Penyebab:** Server restart atau memory store digunakan

**Solusi:**
```bash
# Install dan setup Redis untuk persistence
# Atau: Accept bahwa session hilang saat restart (normal untuk memory store)
```

### **Problem: Error "Redis connection failed"**

**Penyebab:** Redis dikonfigurasi tapi server tidak tersedia

**Solusi:**
```bash
# Metode 1: Disable Redis di .env
# Comment semua REDIS_* variables

# Metode 2: Install Redis lokal
# Windows: Download dari https://github.com/microsoftarchive/redis/releases
# Linux: sudo apt install redis-server
# Mac: brew install redis

# Metode 3: Gunakan Redis Cloud (gratis)
# https://redis.com/try-free/
```

### **Problem: Memory usage tinggi**

**Penyebab:** Banyak session tersimpan di memory

**Solusi:**
```bash
# Gunakan Redis untuk offload session dari app memory
# Atau: Restart server secara berkala untuk clear memory
```

---

## 📝 Cara Install Redis (Opsional)

### **Windows:**

```bash
# Download Redis for Windows
# https://github.com/microsoftarchive/redis/releases

# Extract dan jalankan
redis-server.exe

# Test
redis-cli ping
# Response: PONG
```

### **Linux (Ubuntu/Debian):**

```bash
# Install
sudo apt update
sudo apt install redis-server

# Start
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test
redis-cli ping
# Response: PONG
```

### **Mac:**

```bash
# Install via Homebrew
brew install redis

# Start
brew services start redis

# Test
redis-cli ping
# Response: PONG
```

### **Docker:**

```bash
# Run Redis in Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# Test
docker exec -it redis redis-cli ping
# Response: PONG
```

### **Redis Cloud (Free):**

1. Daftar di https://redis.com/try-free/
2. Create database (free tier: 30MB)
3. Copy connection details
4. Update .env:
   ```bash
   REDIS_HOST=redis-xxxxx.cloud.redislabs.com
   REDIS_PORT=12345
   REDIS_PASSWORD=your-password
   ```

---

## 🎓 Best Practices

### **Development:**
```bash
# Tidak perlu Redis
# Gunakan memory store untuk development cepat
# Comment REDIS_* di .env
```

### **Staging:**
```bash
# Gunakan Redis untuk test production-like environment
# Setup Redis lokal atau cloud
```

### **Production:**
```bash
# WAJIB gunakan Redis
# Setup Redis dengan persistence
# Backup Redis data secara berkala
# Monitor Redis memory usage
```

---

## 📊 Monitoring

### **Cek Session Store yang Digunakan:**

Lihat logs saat server start:

**Dengan Redis:**
```
✅ Redis connected successfully
✅ Session configured with Redis store
```

**Tanpa Redis:**
```
⚠️  Redis not configured, using memory session store
✅ Session configured with memory store
```

### **Cek Memory Usage:**

**Dengan Memory Store:**
```bash
# PM2
pm2 monit

# Manual
node -e "console.log(process.memoryUsage())"
```

**Dengan Redis:**
```bash
# Redis memory usage
redis-cli info memory

# Atau
redis-cli --stat
```

---

## ✅ Summary

### **Tanpa Redis:**
- ✅ Aplikasi tetap berjalan normal
- ✅ Session berfungsi (di memory)
- ⚠️ Session hilang saat restart
- ⚠️ Tidak cocok untuk production scale

### **Dengan Redis:**
- ✅ Session persistent
- ✅ Better performance
- ✅ Cocok untuk production
- ⚠️ Perlu setup Redis server

### **Cara Disable Redis:**
```bash
# Edit .env, comment Redis config:
# REDIS_HOST=...
# REDIS_PORT=...
# REDIS_PASSWORD=...

# Restart server
npm start

# Done! Aplikasi akan gunakan memory store
```

---

## 🚀 Quick Start Tanpa Redis

```bash
# 1. Clone/download project
git clone <repo-url>
cd cbt-smk-premium

# 2. Install dependencies
npm install

# 3. Setup database
mysql -u root -p cbt_smk < database.sql

# 4. Edit .env (comment Redis)
cp .env.example .env
# Edit .env, comment REDIS_* lines

# 5. Start server
npm start

# 6. Open browser
# http://localhost:3000

# Done! Aplikasi berjalan tanpa Redis
```

---

**Kesimpulan:** Aplikasi bisa berjalan tanpa Redis dengan fallback otomatis ke memory store. Cocok untuk development dan small scale deployment! 🎉

---

*Last Updated: 14 Maret 2026*
