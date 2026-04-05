# Setup Caddy untuk Situasi Saat Ini

## Arsitektur Saat Ini

```
Server: 10.10.102.8
├── Caddy (Port 80, 443) ← Entry point dari internet
├── Node.js (Port 3000) ← Aplikasi CBT
├── Redis (Port 6379) ← Session storage
└── MySQL (Port 3306) ← Database
```

---

## Langkah Setup

### 1. Copy Caddyfile ke Server

Copy file `Caddyfile` yang sudah dibuat ke server:

```bash
# Di server, buat backup Caddyfile lama (jika ada)
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup

# Copy Caddyfile baru
sudo nano /etc/caddy/Caddyfile
```

Paste isi file `Caddyfile` yang sudah dibuat.

---

### 2. Buat Direktori Log

```bash
# Buat direktori untuk log
sudo mkdir -p /var/log/caddy

# Set permission
sudo chown caddy:caddy /var/log/caddy
```

---

### 3. Validasi Konfigurasi

```bash
# Test konfigurasi
sudo caddy validate --config /etc/caddy/Caddyfile

# Format Caddyfile (optional)
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
```

---

### 4. Update .env Aplikasi

Edit file `.env` di aplikasi:

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://liveclass.tam.web.id
SESSION_DOMAIN=liveclass.tam.web.id

# Database (localhost karena 1 server)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=cbt_db

# Redis (localhost karena 1 server)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# Session
SESSION_SECRET=your-very-long-random-secret-key
SESSION_NAME=cbt_session
```

**Catatan Penting:**
- `DB_HOST=localhost` karena MySQL di server yang sama
- `REDIS_HOST=localhost` karena Redis di server yang sama
- Tidak perlu IP `10.10.102.8` karena komunikasi internal

---

### 5. Pastikan DNS Sudah Pointing

Cek DNS sudah pointing ke server:

```bash
# Check DNS
nslookup liveclass.tam.web.id

# Harus return IP: 10.10.102.8
```

Jika belum, update DNS di domain provider:
```
Type: A
Name: liveclass
Value: 10.10.102.8
TTL: 3600
```

---

### 6. Pastikan Firewall Allow Port 80 & 443

```bash
# Check firewall status
sudo ufw status

# Allow HTTP (port 80)
sudo ufw allow 80/tcp

# Allow HTTPS (port 443)
sudo ufw allow 443/tcp

# Allow SSH (jangan lupa!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

---

### 7. Restart Aplikasi

```bash
# Restart aplikasi Node.js
pm2 restart cbt-app

# Check status
pm2 status
pm2 logs cbt-app --lines 50
```

---

### 8. Start/Reload Caddy

```bash
# Reload Caddy dengan config baru
sudo caddy reload --config /etc/caddy/Caddyfile

# Atau restart service
sudo systemctl restart caddy

# Enable auto-start
sudo systemctl enable caddy

# Check status
sudo systemctl status caddy
```

---

### 9. Monitor Logs

```bash
# Caddy logs (system)
sudo journalctl -u caddy -f

# Caddy logs (access)
sudo tail -f /var/log/caddy/liveclass.log

# Aplikasi logs
pm2 logs cbt-app
```

---

### 10. Test Akses

```bash
# Test HTTP (harus redirect ke HTTPS)
curl -I http://liveclass.tam.web.id

# Test HTTPS
curl -I https://liveclass.tam.web.id

# Test dari browser
# Buka: https://liveclass.tam.web.id
```

---

## Verifikasi

### Check SSL Certificate

```bash
# Check certificate
openssl s_client -connect liveclass.tam.web.id:443 -servername liveclass.tam.web.id < /dev/null | openssl x509 -noout -dates

# Harus muncul:
# notBefore: ...
# notAfter: ... (3 bulan dari sekarang)
```

### Check Services

```bash
# Check Caddy
sudo systemctl status caddy

# Check Node.js
pm2 status

# Check Redis
redis-cli -h localhost -p 6379 -a redisCBT2026 ping

# Check MySQL
sudo systemctl status mysql
```

### Check Ports

```bash
# Check port listening
sudo netstat -tulpn | grep -E ':(80|443|3000|6379|3306)'

# Harus muncul:
# :80    → caddy
# :443   → caddy
# :3000  → node
# :6379  → redis
# :3306  → mysqld
```

---

## Troubleshooting

### Problem: SSL Certificate Failed

**Gejala:**
```
Error: failed to obtain certificate
```

**Penyebab:**
- DNS belum pointing
- Port 80/443 blocked
- Domain tidak bisa diakses dari internet

**Solution:**
```bash
# 1. Check DNS
nslookup liveclass.tam.web.id

# 2. Check port
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# 3. Check firewall
sudo ufw status

# 4. Check Caddy logs
sudo journalctl -u caddy -n 100

# 5. Force reload
sudo caddy reload --config /etc/caddy/Caddyfile
```

---

### Problem: 502 Bad Gateway

**Gejala:**
Browser menampilkan "502 Bad Gateway"

**Penyebab:**
- Aplikasi Node.js tidak running
- Port 3000 tidak listening

**Solution:**
```bash
# 1. Check aplikasi
pm2 status

# 2. Check port 3000
sudo netstat -tulpn | grep :3000

# 3. Restart aplikasi
pm2 restart cbt-app

# 4. Check logs
pm2 logs cbt-app --lines 50

# 5. Restart Caddy
sudo systemctl restart caddy
```

---

### Problem: Session Tidak Berfungsi

**Gejala:**
- Login berhasil tapi langsung logout
- Cookie tidak tersimpan

**Penyebab:**
- Redis tidak running
- Session domain salah
- Cookie secure setting

**Solution:**
```bash
# 1. Check Redis
redis-cli -h localhost -p 6379 -a redisCBT2026 ping

# 2. Check .env
cat .env | grep SESSION

# Harus:
# SESSION_DOMAIN=liveclass.tam.web.id

# 3. Restart aplikasi
pm2 restart cbt-app
```

---

### Problem: Upload File Gagal

**Gejala:**
Error saat upload file ujian/tugas

**Penyebab:**
- Folder uploads tidak ada
- Permission salah
- Max file size

**Solution:**
```bash
# 1. Check folder uploads
ls -la uploads/

# 2. Set permission
sudo chown -R $USER:$USER uploads/
chmod -R 755 uploads/

# 3. Check .env
cat .env | grep UPLOAD

# 4. Restart aplikasi
pm2 restart cbt-app
```

---

## Monitoring

### Daily Check

```bash
# Check semua services
sudo systemctl status caddy
pm2 status
redis-cli -h localhost -p 6379 -a redisCBT2026 ping
sudo systemctl status mysql

# Check disk space
df -h

# Check memory
free -h

# Check logs
sudo tail -f /var/log/caddy/liveclass.log
```

### Weekly Check

```bash
# Check SSL certificate expiry
openssl s_client -connect liveclass.tam.web.id:443 -servername liveclass.tam.web.id < /dev/null | openssl x509 -noout -dates

# Check Redis memory
redis-cli -h localhost -p 6379 -a redisCBT2026 INFO memory

# Check MySQL slow queries
mysql -u root -p -e "SHOW PROCESSLIST;"

# Check application logs
pm2 logs cbt-app --lines 100
```

---

## Backup

### Backup Caddyfile

```bash
# Backup
sudo cp /etc/caddy/Caddyfile ~/caddy-backup-$(date +%Y%m%d).txt

# Restore
sudo cp ~/caddy-backup-YYYYMMDD.txt /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Backup SSL Certificates

```bash
# Certificates location
/var/lib/caddy/.local/share/caddy/certificates/

# Backup
sudo tar -czf ~/caddy-certs-backup-$(date +%Y%m%d).tar.gz /var/lib/caddy/.local/share/caddy/

# Restore (jika perlu)
sudo tar -xzf ~/caddy-certs-backup-YYYYMMDD.tar.gz -C /
```

---

## Performance Tips

### 1. Enable HTTP/2

Caddy sudah enable HTTP/2 by default. Tidak perlu konfigurasi tambahan.

### 2. Optimize Compression

Sudah dikonfigurasi di Caddyfile:
```caddy
encode gzip zstd
```

### 3. Static File Caching

Jika ada banyak static files, tambahkan:
```caddy
liveclass.tam.web.id {
    # Cache static files
    @static {
        path *.css *.js *.jpg *.jpeg *.png *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000"
    
    reverse_proxy localhost:3000
}
```

### 4. Rate Limiting

Untuk prevent abuse, tambahkan rate limiting (optional):
```bash
# Install Caddy dengan rate limit module
# Atau gunakan fail2ban
```

---

## Checklist Deployment

- [x] Caddy terinstall
- [ ] Caddyfile sudah dikonfigurasi
- [ ] DNS sudah pointing ke 10.10.102.8
- [ ] Firewall allow port 80, 443
- [ ] .env sudah update dengan domain
- [ ] Aplikasi Node.js running (pm2)
- [ ] Redis running
- [ ] MySQL running
- [ ] Caddy running dan auto-start
- [ ] SSL certificate generated
- [ ] Test akses https://liveclass.tam.web.id
- [ ] Test login
- [ ] Test upload file
- [ ] Test live class

---

## Summary

**Konfigurasi Optimal untuk 1 Server:**

```
Internet
   ↓
https://liveclass.tam.web.id (Port 443)
   ↓
Caddy (SSL, Security, Reverse Proxy)
   ↓
Node.js App (Port 3000)
   ↓
├── Redis (localhost:6379) - Session
└── MySQL (localhost:3306) - Database
```

**Keuntungan:**
- ✅ SSL/HTTPS otomatis
- ✅ Domain mudah diingat
- ✅ Security headers
- ✅ Compression
- ✅ WebSocket support (Live Class)
- ✅ Auto SSL renewal
- ✅ Simple maintenance

**File Penting:**
- `/etc/caddy/Caddyfile` - Konfigurasi Caddy
- `.env` - Konfigurasi aplikasi
- `/var/log/caddy/liveclass.log` - Access logs

---

**Status**: ✅ Ready to Deploy!
**Updated**: 2026-03-07

Aplikasi siap diakses dengan domain dan SSL! 🚀🔒
