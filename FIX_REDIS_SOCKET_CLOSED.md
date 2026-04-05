# Fix: Redis Socket Closed Unexpectedly

## Problem

Error yang muncul:
```
❌ Redis Client Error: Socket closed unexpectedly
✅ Redis connecting to: redis.smknegeri1kras.sch.id
✅ Redis ready to use
❌ Redis Client Error: Socket closed unexpectedly
```

Koneksi Redis terputus tiba-tiba dan terus reconnect.

---

## Penyebab Umum

### 1. Redis Server Timeout
Redis server menutup koneksi idle setelah timeout tertentu.

### 2. Network Issues
Koneksi network tidak stabil antara aplikasi dan Redis server.

### 3. Redis Memory Full
Redis kehabisan memory dan menutup koneksi.

### 4. Redis Server Restart
Redis server restart atau crash.

### 5. Firewall/Security Group
Firewall menutup koneksi idle.

---

## Diagnosis

### Step 1: Jalankan Script Diagnosis

```bash
node diagnose-redis-connection.js
```

Script ini akan:
- Test koneksi ke Redis
- Ping Redis setiap detik selama 30 detik
- Menampilkan info server, memory, clients
- Detect masalah koneksi

### Step 2: Check Redis Server

```bash
# Check Redis status
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 ping

# Check Redis info
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 INFO

# Check connected clients
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CLIENT LIST

# Check Redis config
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG GET timeout
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG GET maxclients
```

### Step 3: Check Network

```bash
# Test DNS
nslookup redis.smknegeri1kras.sch.id

# Test connectivity
telnet redis.smknegeri1kras.sch.id 6379

# Ping test
ping redis.smknegeri1kras.sch.id -c 10
```

---

## Solutions

### Solution 1: Update Redis Timeout (Recommended)

Di Redis server, update timeout setting:

```bash
# Connect to Redis
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026

# Check current timeout
CONFIG GET timeout

# Set timeout to 0 (never timeout)
CONFIG SET timeout 0

# Save config
CONFIG REWRITE
```

Atau edit `/etc/redis/redis.conf`:
```conf
# Set timeout to 0 (never close idle connections)
timeout 0
```

Restart Redis:
```bash
sudo systemctl restart redis-server
```

---

### Solution 2: Enable TCP Keepalive

Di Redis server, enable TCP keepalive:

```bash
# Connect to Redis
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026

# Enable TCP keepalive (300 seconds)
CONFIG SET tcp-keepalive 300

# Save config
CONFIG REWRITE
```

Atau edit `/etc/redis/redis.conf`:
```conf
# Enable TCP keepalive
tcp-keepalive 300
```

---

### Solution 3: Increase Max Clients

Jika terlalu banyak koneksi:

```bash
# Check current maxclients
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG GET maxclients

# Increase maxclients
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG SET maxclients 10000
```

---

### Solution 4: Check Memory

```bash
# Check memory usage
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 INFO memory

# If memory full, increase maxmemory
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG SET maxmemory 512mb

# Set eviction policy
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CONFIG SET maxmemory-policy allkeys-lru
```

---

### Solution 5: Application Side (Already Applied)

File `src/server.js` sudah diupdate dengan:
- Reconnection strategy dengan exponential backoff
- Better error handling
- Connection timeout
- Event listeners untuk monitoring

Restart aplikasi:
```bash
pm2 restart cbt-app
pm2 logs cbt-app
```

---

## Monitoring

### Monitor Redis Logs

Di Redis server:
```bash
# Real-time logs
sudo tail -f /var/log/redis/redis-server.log

# Check for errors
sudo grep -i error /var/log/redis/redis-server.log

# Check for connection issues
sudo grep -i "connection" /var/log/redis/redis-server.log
```

### Monitor Application Logs

```bash
# PM2 logs
pm2 logs cbt-app

# Filter Redis errors
pm2 logs cbt-app | grep Redis
```

### Monitor Redis Connections

```bash
# Watch connected clients
watch -n 1 'redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 CLIENT LIST | wc -l'

# Monitor Redis stats
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 --stat
```

---

## Prevention

### 1. Set Proper Timeout

```conf
# /etc/redis/redis.conf
timeout 0
tcp-keepalive 300
```

### 2. Monitor Memory

```bash
# Set memory limit
maxmemory 512mb
maxmemory-policy allkeys-lru
```

### 3. Enable Persistence

```conf
# RDB snapshots
save 900 1
save 300 10
save 60 10000

# AOF
appendonly yes
appendfsync everysec
```

### 4. Monitor Health

Setup monitoring dengan:
- Redis Exporter + Prometheus + Grafana
- Atau simple cron job:

```bash
# Create monitoring script
cat > /usr/local/bin/check-redis.sh << 'EOF'
#!/bin/bash
if ! redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 ping > /dev/null 2>&1; then
    echo "$(date): Redis is DOWN!" | mail -s "Redis Alert" admin@smknegeri1kras.sch.id
fi
EOF

chmod +x /usr/local/bin/check-redis.sh

# Add to crontab (check every 5 minutes)
crontab -e
*/5 * * * * /usr/local/bin/check-redis.sh
```

---

## Testing

### Test 1: Connection Stability

```bash
# Run diagnosis script
node diagnose-redis-connection.js

# Should show:
# ✅ Connection stable for 30 seconds
# ✅ All tests passed!
```

### Test 2: Application Test

```bash
# Restart application
pm2 restart cbt-app

# Monitor logs (should not see "Socket closed")
pm2 logs cbt-app --lines 100

# Test login
# Login ke aplikasi dan check session berfungsi
```

### Test 3: Load Test

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Test with 100 concurrent users
ab -n 1000 -c 100 https://liveclass.tam.web.id/login

# Monitor Redis during test
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026 --stat
```

---

## Checklist

- [ ] Run `node diagnose-redis-connection.js`
- [ ] Check Redis timeout: `CONFIG GET timeout`
- [ ] Set timeout to 0: `CONFIG SET timeout 0`
- [ ] Enable TCP keepalive: `CONFIG SET tcp-keepalive 300`
- [ ] Check memory: `INFO memory`
- [ ] Increase maxmemory if needed
- [ ] Restart Redis: `sudo systemctl restart redis-server`
- [ ] Restart application: `pm2 restart cbt-app`
- [ ] Monitor logs: `pm2 logs cbt-app`
- [ ] Test login and session
- [ ] Monitor for 1 hour (no "Socket closed" errors)

---

## Quick Fix

Jika ingin quick fix, jalankan ini di Redis server:

```bash
# Connect to Redis
redis-cli -h redis.smknegeri1kras.sch.id -p 6379 -a redisCBT2026

# Apply fixes
CONFIG SET timeout 0
CONFIG SET tcp-keepalive 300
CONFIG SET maxclients 10000
CONFIG REWRITE

# Exit
exit

# Restart Redis
sudo systemctl restart redis-server

# Check status
sudo systemctl status redis-server
```

Lalu restart aplikasi:
```bash
pm2 restart cbt-app
pm2 logs cbt-app
```

---

## Expected Result

Setelah fix, logs seharusnya:

```
✅ Redis connecting to: redis.smknegeri1kras.sch.id
✅ Redis ready to use
✅ Redis connected successfully
```

Tanpa error "Socket closed unexpectedly".

---

**Status**: ✅ Fix Applied!
**Updated**: 2026-03-07

Redis connection sekarang lebih stabil dengan reconnection strategy! 🔄✅
