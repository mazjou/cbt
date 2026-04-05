# Update Server.js untuk Redis Session

## Langkah-langkah Update

### 1. Install Package Redis
```bash
npm install redis connect-redis
```

### 2. Update src/server.js

Ganti bagian session configuration dengan kode berikut:

```javascript
// ===== REDIS & SESSION CONFIGURATION =====
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Redis Client Configuration
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  password: process.env.REDIS_PASSWORD || undefined,
  legacyMode: true
});

// Connect to Redis
redisClient.connect().catch((err) => {
  console.error('❌ Redis connection error:', err);
  console.log('⚠️  Falling back to memory store (not recommended for production)');
});

// Redis Event Listeners
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisClient.on('ready', () => {
  console.log('✅ Redis ready to use');
});

redisClient.on('end', () => {
  console.log('⚠️  Redis connection closed');
});

// Session Configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true jika HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 hari
    sameSite: 'lax'
  }
};

// Gunakan Redis Store jika Redis connected
if (redisClient.isReady) {
  sessionConfig.store = new RedisStore({ 
    client: redisClient,
    prefix: 'lms:sess:',
    ttl: 60 * 60 * 24 * 7 // 7 hari dalam detik
  });
  console.log('✅ Using Redis for session store');
} else {
  console.log('⚠️  Using memory store for sessions (not recommended for production)');
}

app.use(session(sessionConfig));

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  // Close Socket.io
  io.close(() => {
    console.log('✅ Socket.io closed');
  });
  
  // Close database connections
  try {
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (err) {
    console.error('❌ Error closing database:', err);
  }
  
  // Close Redis connection
  try {
    await redisClient.quit();
    console.log('✅ Redis connection closed');
  } catch (err) {
    console.error('❌ Error closing Redis:', err);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  try {
    await pool.end();
    await redisClient.quit();
    console.log('✅ All connections closed');
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
  }
  
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
```

### 3. Update .env

Tambahkan konfigurasi Redis:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session Secret (GANTI dengan random string yang panjang!)
SESSION_SECRET=ganti-dengan-random-string-minimal-32-karakter-yang-aman

# Environment
NODE_ENV=production
PORT=3000
```

### 4. Generate Session Secret

Gunakan salah satu cara berikut untuk generate random session secret:

#### Node.js:
```javascript
require('crypto').randomBytes(32).toString('hex')
```

#### Online:
https://www.random.org/strings/

#### Command Line (Linux/Mac):
```bash
openssl rand -hex 32
```

### 5. Test Redis Connection

```bash
# Test Redis
redis-cli ping
# Harus return: PONG

# Cek Redis info
redis-cli info

# Monitor Redis commands
redis-cli monitor
```

### 6. Verifikasi Session di Redis

```bash
# Masuk ke Redis CLI
redis-cli

# Lihat semua keys
KEYS *

# Lihat session keys
KEYS lms:sess:*

# Lihat detail session
GET lms:sess:xxxxx

# Lihat TTL (Time To Live)
TTL lms:sess:xxxxx

# Hapus semua session (jika perlu)
FLUSHDB
```

## Keuntungan Menggunakan Redis

### 1. **Persistent Sessions**
- Session tidak hilang saat server restart
- Session tetap ada saat aplikasi di-reload PM2

### 2. **Scalability**
- Bisa digunakan di multiple server instances
- Load balancing dengan shared session

### 3. **Performance**
- Lebih cepat dari database
- In-memory storage

### 4. **Reliability**
- Session tidak hilang saat crash
- Automatic expiration (TTL)

### 5. **Cluster Mode**
- PM2 cluster mode bisa share session
- Semua worker process akses Redis yang sama

## Monitoring Redis

### A. Redis CLI Commands
```bash
# Info server
redis-cli info server

# Info memory
redis-cli info memory

# Info stats
redis-cli info stats

# Monitor real-time
redis-cli monitor

# Slowlog (query lambat)
redis-cli slowlog get 10
```

### B. Check Memory Usage
```bash
redis-cli info memory | grep used_memory_human
```

### C. Check Connected Clients
```bash
redis-cli info clients
```

## Troubleshooting

### Redis tidak bisa connect
```bash
# Cek Redis service
sudo systemctl status redis

# Start Redis
sudo systemctl start redis

# Enable auto-start
sudo systemctl enable redis

# Restart Redis
sudo systemctl restart redis
```

### Port sudah digunakan
```bash
# Cek port 6379
sudo lsof -i :6379

# Atau
sudo netstat -tulpn | grep 6379
```

### Permission denied
```bash
# Cek Redis config
sudo nano /etc/redis/redis.conf

# Pastikan:
# bind 127.0.0.1
# protected-mode yes
```

### Memory penuh
```bash
# Set max memory di redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru

# Restart Redis
sudo systemctl restart redis
```

## Security Best Practices

### 1. Password Protection
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Tambahkan:
requirepass your-strong-password-here

# Restart Redis
sudo systemctl restart redis
```

Update .env:
```env
REDIS_PASSWORD=your-strong-password-here
```

### 2. Bind to Localhost Only
```bash
# Di redis.conf
bind 127.0.0.1
```

### 3. Disable Dangerous Commands
```bash
# Di redis.conf
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

### 4. Use Firewall
```bash
# UFW (Ubuntu)
sudo ufw deny 6379
sudo ufw allow from 127.0.0.1 to any port 6379
```

## Performance Tuning

### 1. Persistence Configuration
```bash
# Di redis.conf

# RDB (snapshot)
save 900 1
save 300 10
save 60 10000

# AOF (append-only file)
appendonly yes
appendfsync everysec
```

### 2. Memory Optimization
```bash
# Di redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. Connection Pool
```javascript
// Di server.js
const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        return new Error('Too many retries');
      }
      return retries * 100; // Reconnect after 100ms, 200ms, 300ms, etc.
    }
  },
  password: process.env.REDIS_PASSWORD || undefined
});
```

## Backup Redis Data

### Manual Backup
```bash
# Save snapshot
redis-cli BGSAVE

# Copy RDB file
sudo cp /var/lib/redis/dump.rdb /backup/redis-backup-$(date +%Y%m%d).rdb
```

### Automatic Backup (Cron)
```bash
# Edit crontab
crontab -e

# Tambahkan (backup setiap hari jam 2 pagi)
0 2 * * * redis-cli BGSAVE && cp /var/lib/redis/dump.rdb /backup/redis-backup-$(date +\%Y\%m\%d).rdb
```

## Status
✅ Dokumentasi lengkap untuk update server.js dengan Redis
