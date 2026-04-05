# Cara Mengganti Redis ke Domain/Hostname

## Status: READY ✅

Aplikasi sudah support Redis dengan domain/hostname eksternal melalui environment variable.

---

## Konfigurasi Saat Ini

File `.env`:
```env
REDIS_HOST=10.10.102.8
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026
```

---

## Cara Mengganti ke Domain

### 1. Update File .env

Edit file `.env` dan ganti `REDIS_HOST` dengan domain:

```env
# Contoh 1: Domain lengkap
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# Contoh 2: Subdomain
REDIS_HOST=redis.smkn1kras.sch.id
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# Contoh 3: Redis Cloud (managed service)
REDIS_HOST=redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-redis-cloud-password

# Contoh 4: AWS ElastiCache
REDIS_HOST=my-redis-cluster.abc123.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=

# Contoh 5: Azure Cache for Redis
REDIS_HOST=myredis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your-azure-redis-key
```

### 2. Restart Aplikasi

**Development:**
```bash
npm run dev
```

**Production dengan PM2:**
```bash
pm2 restart cbt-app
```

### 3. Test Koneksi

Jalankan script test:
```bash
node test-redis-connection.js
```

Output yang diharapkan:
```
🔌 Connecting to Redis...
   Host: redis.example.com
   Port: 6379
   Password: *** (hidden)

✅ Redis connecting to: redis.example.com
✅ Connected to Redis successfully!

📊 Redis Server Info:
   Version: 7.x.x
   Mode: standalone
   OS: Linux
   ...
```

---

## Opsi Redis Hosting

### 1. Self-Hosted (VPS/Dedicated Server)

**Kelebihan:**
- Full control
- Tidak ada biaya bulanan (selain server)
- Bisa custom konfigurasi

**Kekurangan:**
- Harus maintain sendiri
- Perlu setup security
- Perlu backup manual

**Setup:**
```bash
# Install Redis di server
sudo apt update
sudo apt install redis-server

# Edit konfigurasi
sudo nano /etc/redis/redis.conf

# Set bind address (allow remote connection)
bind 0.0.0.0

# Set password
requirepass redisCBT2026

# Restart Redis
sudo systemctl restart redis-server

# Enable firewall
sudo ufw allow 6379/tcp
```

**Di aplikasi:**
```env
REDIS_HOST=your-server-domain.com
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026
```

---

### 2. Redis Cloud (Managed Service)

**Provider:** https://redis.com/try-free/

**Kelebihan:**
- Fully managed
- Auto backup
- High availability
- Free tier available (30MB)

**Kekurangan:**
- Biaya untuk tier lebih besar
- Tergantung provider

**Setup:**
1. Daftar di Redis Cloud
2. Buat database baru
3. Copy connection details
4. Update `.env`

**Di aplikasi:**
```env
REDIS_HOST=redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-generated-password
```

---

### 3. AWS ElastiCache

**Kelebihan:**
- Terintegrasi dengan AWS
- Auto scaling
- High availability

**Kekurangan:**
- Biaya AWS
- Hanya bisa diakses dari dalam VPC

**Di aplikasi:**
```env
REDIS_HOST=my-redis-cluster.abc123.0001.use1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

### 4. Azure Cache for Redis

**Kelebihan:**
- Terintegrasi dengan Azure
- Managed service
- SSL support

**Di aplikasi:**
```env
REDIS_HOST=myredis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your-azure-redis-key
```

---

### 5. DigitalOcean Managed Redis

**Kelebihan:**
- Simple setup
- Affordable pricing
- Good performance

**Di aplikasi:**
```env
REDIS_HOST=db-redis-nyc1-12345-do-user-123456-0.b.db.ondigitalocean.com
REDIS_PORT=25061
REDIS_PASSWORD=your-do-redis-password
```

---

## Security Best Practices

### 1. Gunakan Password yang Kuat

```env
# BAD
REDIS_PASSWORD=123456

# GOOD
REDIS_PASSWORD=xK9mP2nQ7wR5tY8uI3oL6aS4dF1gH0jZ
```

### 2. Gunakan SSL/TLS (jika tersedia)

Untuk Redis Cloud atau managed service yang support SSL:

```javascript
// src/server.js
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    tls: true, // Enable SSL
    rejectUnauthorized: false // Untuk self-signed cert
  },
  password: process.env.REDIS_PASSWORD
});
```

Update `.env`:
```env
REDIS_USE_TLS=true
```

### 3. Firewall Rules

Hanya allow IP aplikasi untuk akses Redis:

```bash
# UFW (Ubuntu)
sudo ufw allow from YOUR_APP_SERVER_IP to any port 6379

# iptables
sudo iptables -A INPUT -p tcp -s YOUR_APP_SERVER_IP --dport 6379 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 6379 -j DROP
```

### 4. Bind ke Interface Tertentu

Di Redis server (`/etc/redis/redis.conf`):
```conf
# Hanya allow dari IP tertentu
bind 127.0.0.1 YOUR_APP_SERVER_IP
```

---

## Troubleshooting

### Problem: Connection Timeout

**Penyebab:**
- Domain tidak resolve
- Firewall block port
- Redis server down

**Solution:**
```bash
# Test DNS resolve
nslookup redis.example.com

# Test port connectivity
telnet redis.example.com 6379

# Test dengan redis-cli
redis-cli -h redis.example.com -p 6379 -a redisCBT2026 ping
```

### Problem: Authentication Failed

**Penyebab:**
- Password salah
- Redis tidak require password

**Solution:**
```bash
# Test dengan password
redis-cli -h redis.example.com -p 6379 -a redisCBT2026 ping

# Cek Redis config
redis-cli -h redis.example.com -p 6379 CONFIG GET requirepass
```

### Problem: Connection Refused

**Penyebab:**
- Redis tidak listen di 0.0.0.0
- Firewall block

**Solution:**
```bash
# Cek Redis bind address
redis-cli CONFIG GET bind

# Set bind ke 0.0.0.0
redis-cli CONFIG SET bind "0.0.0.0"

# Atau edit /etc/redis/redis.conf
bind 0.0.0.0
```

---

## Migration Checklist

- [ ] Backup data Redis lama (jika ada)
- [ ] Setup Redis baru di domain/server baru
- [ ] Test koneksi dari aplikasi ke Redis baru
- [ ] Update `.env` dengan domain baru
- [ ] Restart aplikasi
- [ ] Test login dan session
- [ ] Monitor logs untuk error
- [ ] Restore data jika perlu

---

## Backup & Restore

### Backup dari Redis Lama

```bash
# Dump data
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --rdb dump.rdb

# Atau gunakan SAVE
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 SAVE
```

### Restore ke Redis Baru

```bash
# Copy dump.rdb ke server baru
scp dump.rdb user@new-server:/var/lib/redis/

# Restart Redis
sudo systemctl restart redis-server
```

---

## Monitoring

### Check Redis Status

```bash
# Via redis-cli
redis-cli -h redis.example.com -p 6379 -a redisCBT2026 INFO

# Check memory usage
redis-cli -h redis.example.com -p 6379 -a redisCBT2026 INFO memory

# Check connected clients
redis-cli -h redis.example.com -p 6379 -a redisCBT2026 CLIENT LIST
```

### Check dari Aplikasi

```bash
# Test connection script
node test-redis-connection.js

# Check sessions
node check-redis-sessions.js
```

---

## Performance Tips

### 1. Gunakan Connection Pooling

Aplikasi sudah menggunakan single Redis client yang di-reuse.

### 2. Set Maxmemory Policy

Di Redis server:
```conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. Enable Persistence

```conf
# RDB (snapshot)
save 900 1
save 300 10
save 60 10000

# AOF (append-only file)
appendonly yes
appendfsync everysec
```

---

## Contoh Lengkap: Migrasi ke Redis Cloud

### Step 1: Daftar Redis Cloud

1. Buka https://redis.com/try-free/
2. Daftar akun baru
3. Buat database baru (pilih region terdekat)
4. Copy connection details

### Step 2: Update .env

```env
# OLD
REDIS_HOST=10.10.102.8
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# NEW
REDIS_HOST=redis-12345.c123.ap-southeast-1-1.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=xK9mP2nQ7wR5tY8uI3oL6aS4dF1gH0jZ
```

### Step 3: Test Connection

```bash
node test-redis-connection.js
```

### Step 4: Restart & Monitor

```bash
pm2 restart cbt-app
pm2 logs cbt-app
```

---

**Status**: ✅ Redis Domain Support Sudah Aktif!
**Updated**: 2026-03-07
**Impact**: Bisa menggunakan Redis eksternal dengan domain

Aplikasi sudah siap menggunakan Redis dengan domain/hostname eksternal! 🚀
