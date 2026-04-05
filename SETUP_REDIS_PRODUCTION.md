# Setup Redis Production - SMKN1 Kramatwatu

## Konfigurasi Redis Server

Server Redis sudah dikonfigurasi dengan detail berikut:

```
Host: 10.10.102.8
Port: 6379
Password: redisCBT2026
```

---

## Langkah Setup

### 1. Install Dependencies

```bash
npm install redis connect-redis
```

### 2. Verifikasi .env

File `.env` sudah dikonfigurasi dengan:

```env
NODE_ENV=production
PORT=3000

# Redis Configuration
REDIS_HOST=10.10.102.8
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026
```

### 3. Test Koneksi Redis

```bash
node test-redis-connection.js
```

Output yang diharapkan:
```
✅ Connected to Redis successfully!
✅ PING response: PONG
✅ All tests passed!
```

### 4. Update server.js

Ikuti panduan di `UPDATE_SERVER_REDIS.md` untuk mengintegrasikan Redis ke dalam aplikasi.

Tambahkan kode berikut di `src/server.js`:

```javascript
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Redis Client Configuration
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  password: process.env.REDIS_PASSWORD || undefined
});

// Connect to Redis
redisClient.connect().catch((err) => {
  console.error('❌ Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected: ' + process.env.REDIS_HOST);
});

// Session dengan Redis Store
app.use(session({
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'lms:sess:',
    ttl: 60 * 60 * 24 * 7 // 7 hari
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 hari
  }
}));
```

### 5. Start dengan PM2

```bash
# Start aplikasi
pm2 start ecosystem.config.js

# Cek status
pm2 status

# Lihat logs
pm2 logs lms-smkn1kras

# Monitor
pm2 monit
```

---

## Verifikasi Session di Redis

### Menggunakan redis-cli

```bash
# Connect ke Redis server
redis-cli -h 10.10.102.8 -a redisCBT2026

# Test PING
PING
# Output: PONG

# Lihat semua session keys
KEYS lms:sess:*

# Lihat detail session
GET lms:sess:xxxxx

# Lihat berapa banyak session aktif
DBSIZE

# Monitor real-time
MONITOR
```

### Menggunakan Node.js Script

Buat file `check-redis-sessions.js`:

```javascript
require('dotenv').config();
const { createClient } = require('redis');

async function checkSessions() {
  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    },
    password: process.env.REDIS_PASSWORD
  });
  
  await client.connect();
  
  const keys = await client.keys('lms:sess:*');
  console.log(`Total active sessions: ${keys.length}`);
  
  for (const key of keys) {
    const ttl = await client.ttl(key);
    console.log(`${key} - TTL: ${ttl}s`);
  }
  
  await client.quit();
}

checkSessions();
```

---

## Troubleshooting

### 1. Tidak bisa connect ke Redis

```bash
# Test koneksi manual
redis-cli -h 10.10.102.8 -a redisCBT2026 ping

# Jika gagal, cek:
# - Firewall di server Redis (port 6379 harus terbuka)
# - Network connectivity
# - Password benar
```

### 2. Connection timeout

```bash
# Cek apakah port 6379 terbuka
telnet 10.10.102.8 6379

# Atau gunakan nc (netcat)
nc -zv 10.10.102.8 6379
```

### 3. Authentication failed

Pastikan password di `.env` sama dengan password Redis server:
```env
REDIS_PASSWORD=redisCBT2026
```

### 4. Session tidak tersimpan

Cek logs aplikasi:
```bash
pm2 logs lms-smkn1kras --err
```

Cek Redis logs di server Redis.

---

## Monitoring

### 1. Cek Memory Usage

```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 info memory | grep used_memory_human
```

### 2. Cek Connected Clients

```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 info clients
```

### 3. Cek Stats

```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 info stats
```

### 4. Monitor Commands Real-time

```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 monitor
```

---

## Maintenance

### Clear All Sessions (Jika Diperlukan)

```bash
# HATI-HATI: Ini akan logout semua user!
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*" | xargs redis-cli -h 10.10.102.8 -a redisCBT2026 DEL
```

### Clear Expired Sessions

Redis akan otomatis menghapus session yang expired (TTL habis).

---

## Security Notes

1. **Password Protection**: Redis sudah menggunakan password `redisCBT2026`
2. **Network**: Pastikan hanya server aplikasi yang bisa akses Redis (firewall)
3. **Bind Address**: Redis sebaiknya hanya listen di internal network
4. **SSL/TLS**: Pertimbangkan menggunakan SSL untuk koneksi Redis (optional)

---

## Performance Tips

1. **Connection Pooling**: Redis client sudah handle connection pooling otomatis
2. **TTL**: Session TTL sudah diset 7 hari, sesuaikan jika perlu
3. **Memory**: Monitor memory usage Redis secara berkala
4. **Persistence**: Pastikan Redis persistence (RDB/AOF) aktif untuk backup

---

## Checklist

- [x] Redis server running di 10.10.102.8:6379
- [x] Password configured: redisCBT2026
- [x] .env updated dengan Redis config
- [ ] Dependencies installed: `npm install redis connect-redis`
- [ ] Test connection: `node test-redis-connection.js`
- [ ] server.js updated dengan Redis integration
- [ ] Application started dengan PM2
- [ ] Session verified di Redis
- [ ] Monitoring setup

---

## Quick Commands

```bash
# Test Redis connection
node test-redis-connection.js

# Start app dengan PM2
pm2 start ecosystem.config.js

# Check sessions
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*"

# Monitor Redis
redis-cli -h 10.10.102.8 -a redisCBT2026 monitor

# Check app logs
pm2 logs lms-smkn1kras

# Restart app
pm2 restart lms-smkn1kras
```

---

## Status
✅ Redis configuration ready for production!

Server: 10.10.102.8:6379
Password: redisCBT2026
