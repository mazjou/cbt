# Redis Quick Reference - SMKN1 Kramatwatu

## 🔧 Server Configuration

```
Host: 10.10.102.8
Port: 6379
Password: redisCBT2026
```

---

## ⚡ Quick Commands

### Test Connection
```bash
# NPM script
npm run redis:test

# Manual
node test-redis-connection.js

# Redis CLI
redis-cli -h 10.10.102.8 -a redisCBT2026 ping
```

### Check Sessions
```bash
# NPM script
npm run redis:sessions

# Manual
node check-redis-sessions.js

# Redis CLI
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*"
```

### Start Application
```bash
# With PM2
npm run pm2:start

# Or
pm2 start ecosystem.config.js

# Check status
npm run pm2:status
```

### Monitor
```bash
# PM2 monitor
npm run pm2:monit

# PM2 logs
npm run pm2:logs

# Redis monitor
redis-cli -h 10.10.102.8 -a redisCBT2026 monitor
```

---

## 📋 NPM Scripts

```bash
# Redis
npm run redis:test          # Test Redis connection
npm run redis:sessions      # Check active sessions

# PM2
npm run pm2:start          # Start application
npm run pm2:stop           # Stop application
npm run pm2:restart        # Restart (with downtime)
npm run pm2:reload         # Reload (zero-downtime)
npm run pm2:status         # Check status
npm run pm2:logs           # View logs
npm run pm2:monit          # Monitor CPU/Memory
```

---

## 🔍 Redis CLI Commands

### Connect
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026
```

### Basic Commands
```bash
# Test connection
PING

# List all keys
KEYS *

# List session keys
KEYS lms:sess:*

# Count keys
DBSIZE

# Get session data
GET lms:sess:xxxxx

# Check TTL (time to live)
TTL lms:sess:xxxxx

# Delete key
DEL lms:sess:xxxxx

# Monitor real-time
MONITOR

# Server info
INFO server
INFO memory
INFO stats
```

### Session Management
```bash
# Count active sessions
KEYS lms:sess:* | wc -l

# Clear all sessions (CAREFUL!)
KEYS lms:sess:* | xargs redis-cli -h 10.10.102.8 -a redisCBT2026 DEL

# Clear expired sessions (automatic by Redis)
# No manual action needed
```

---

## 🚀 Deployment Workflow

### 1. First Time Setup
```bash
# Install dependencies
npm install redis connect-redis

# Test Redis connection
npm run redis:test

# Update server.js (follow UPDATE_SERVER_REDIS.md)

# Start with PM2
npm run pm2:start

# Check status
npm run pm2:status

# Check sessions
npm run redis:sessions
```

### 2. Update Application
```bash
# Pull latest code
git pull origin main

# Install new dependencies
npm install

# Reload (zero-downtime)
npm run pm2:reload

# Check logs
npm run pm2:logs
```

### 3. Daily Operations
```bash
# Check status
npm run pm2:status

# Check sessions
npm run redis:sessions

# View logs
npm run pm2:logs

# Monitor
npm run pm2:monit
```

---

## 🐛 Troubleshooting

### Redis Connection Failed
```bash
# Test connection
npm run redis:test

# Check Redis server
redis-cli -h 10.10.102.8 -a redisCBT2026 ping

# Check network
ping 10.10.102.8
telnet 10.10.102.8 6379
```

### Session Not Saved
```bash
# Check Redis connection in app logs
npm run pm2:logs

# Check Redis keys
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*"

# Check Redis memory
redis-cli -h 10.10.102.8 -a redisCBT2026 INFO memory
```

### Application Not Starting
```bash
# Check error logs
npm run pm2:logs --err

# Check PM2 status
npm run pm2:status

# Restart
npm run pm2:restart
```

---

## 📊 Monitoring

### Check Memory Usage
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 INFO memory | grep used_memory_human
```

### Check Connected Clients
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 INFO clients
```

### Check Uptime
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 INFO server | grep uptime_in_days
```

### Real-time Monitoring
```bash
# PM2
npm run pm2:monit

# Redis
redis-cli -h 10.10.102.8 -a redisCBT2026 monitor
```

---

## 🔒 Security Checklist

- [x] Redis password configured
- [ ] Firewall rules (only allow app server)
- [ ] SESSION_SECRET changed from default
- [ ] HTTPS enabled (production)
- [ ] cookie.secure: true (if HTTPS)
- [ ] Regular security updates

---

## 📚 Documentation

- **Quick Start:** `QUICK_START_PRODUCTION.md`
- **Redis Setup:** `SETUP_REDIS_PRODUCTION.md`
- **Complete Guide:** `PANDUAN_PRODUCTION_PM2_REDIS.md`
- **Server Update:** `UPDATE_SERVER_REDIS.md`
- **All Docs:** `INDEX_DOCUMENTATION.md`

---

## 💡 Tips

1. **Always test Redis connection first:** `npm run redis:test`
2. **Use reload instead of restart:** `npm run pm2:reload` (zero-downtime)
3. **Monitor sessions regularly:** `npm run redis:sessions`
4. **Check logs when issues occur:** `npm run pm2:logs --err`
5. **Backup before major updates**

---

## 🆘 Emergency Commands

### Application Down
```bash
npm run pm2:restart
npm run pm2:logs --err
```

### Redis Connection Lost
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 ping
npm run redis:test
```

### Clear All Sessions (Last Resort)
```bash
redis-cli -h 10.10.102.8 -a redisCBT2026 KEYS "lms:sess:*" | xargs redis-cli -h 10.10.102.8 -a redisCBT2026 DEL
npm run pm2:restart
```

---

## ✅ Health Check

Run these commands to verify everything is working:

```bash
# 1. Redis connection
npm run redis:test

# 2. PM2 status
npm run pm2:status

# 3. Active sessions
npm run redis:sessions

# 4. Application logs
npm run pm2:logs --lines 50

# 5. Redis server info
redis-cli -h 10.10.102.8 -a redisCBT2026 INFO server
```

All should return success! ✅

---

**Server:** 10.10.102.8:6379  
**Password:** redisCBT2026  
**Last Updated:** 2026-03-05
