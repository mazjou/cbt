# Penjelasan Arsitektur Sistem CBT

## Arsitektur Saat Ini

```
Internet
   ↓
[Domain: liveclass.tam.web.id]
   ↓
[Server: 10.10.102.8]
   ├── Caddy (Port 80/443) ← Web Server / Reverse Proxy
   ├── Node.js App (Port 3000) ← Aplikasi CBT
   ├── Redis (Port 6379) ← Session Storage
   └── MySQL (Port 3306) ← Database
```

---

## Fungsi Masing-Masing Komponen

### 1. Caddy (Web Server / Reverse Proxy)

**Fungsi Utama:**
- **Reverse Proxy**: Meneruskan request dari internet ke aplikasi Node.js
- **SSL/HTTPS**: Generate dan manage SSL certificate otomatis
- **Load Balancer**: Bisa distribute traffic ke multiple instances
- **Static File Server**: Serve file static (CSS, JS, images) lebih cepat
- **Security**: Protect aplikasi dari direct access

**Kenapa Perlu Caddy?**

❌ **TANPA Caddy:**
```
User → http://10.10.102.8:3000 (tidak aman, harus ingat IP dan port)
```

✅ **DENGAN Caddy:**
```
User → https://liveclass.tam.web.id (aman, mudah diingat, SSL otomatis)
      ↓
   Caddy (handle SSL, security)
      ↓
   Node.js App (fokus ke business logic)
```

**Analogi:**
Caddy seperti **satpam/resepsionis** di gedung:
- Cek identitas pengunjung (SSL/security)
- Arahkan ke ruangan yang tepat (reverse proxy)
- Jaga keamanan gedung (firewall, rate limiting)
- Aplikasi Node.js fokus ke pekerjaan utama tanpa khawatir keamanan

---

### 2. Node.js Application (Port 3000)

**Fungsi:**
- Business logic aplikasi CBT
- Handle request dari user
- Proses data ujian, tugas, live class
- Komunikasi dengan database dan Redis

**Kenapa Port 3000?**
- Port internal, tidak perlu diakses langsung dari internet
- Caddy yang handle port 80/443 (standard HTTP/HTTPS)
- Lebih aman karena tidak exposed ke public

---

### 3. Redis (Port 6379)

**Fungsi:**
- **Session Storage**: Simpan data login user
- **Cache**: Simpan data temporary untuk performa
- **Real-time Data**: Support untuk live class

**Kenapa Perlu Redis?**
- Session di memory (sangat cepat)
- Bisa share session antar multiple server
- Auto-expire session yang tidak aktif

**Contoh Data di Redis:**
```
sess:abc123 → {userId: 39, username: "siswa1", role: "student"}
sess:def456 → {userId: 4, username: "guru1", role: "teacher"}
```

---

### 4. MySQL (Port 3306)

**Fungsi:**
- **Persistent Storage**: Simpan data permanent
- Database untuk users, exams, questions, assignments, dll

**Kenapa Perlu MySQL?**
- Data tidak hilang saat restart
- Relational database untuk data terstruktur
- Support complex queries

---

## Flow Request User

### Scenario 1: User Login

```
1. User buka browser
   https://liveclass.tam.web.id/login
   
2. Request ke Caddy (Port 443)
   ↓
   Caddy cek SSL certificate
   ↓
   Caddy forward ke Node.js (Port 3000)
   
3. Node.js proses login
   ↓
   Query MySQL: SELECT * FROM users WHERE username = ?
   ↓
   Password match? Yes
   ↓
   Create session di Redis
   ↓
   Return cookie ke user
   
4. Caddy forward response ke user
   ↓
   User redirect ke dashboard
```

### Scenario 2: User Akses Dashboard

```
1. User request dashboard
   https://liveclass.tam.web.id/dashboard
   
2. Caddy forward ke Node.js
   
3. Node.js cek session
   ↓
   Get session dari Redis (super cepat!)
   ↓
   Session valid? Yes
   ↓
   Query MySQL: Get user data, exams, assignments
   ↓
   Render dashboard page
   
4. Caddy forward response ke user
```

### Scenario 3: User Upload File

```
1. User upload file ujian
   https://liveclass.tam.web.id/exam/123/submit
   
2. Caddy forward ke Node.js
   
3. Node.js proses upload
   ↓
   Save file ke disk (/uploads)
   ↓
   Save metadata ke MySQL
   ↓
   Update session di Redis (jika perlu)
   
4. Caddy forward response ke user
```

---

## Keuntungan Arsitektur Ini

### 1. Security

**Dengan Caddy:**
- ✅ SSL/HTTPS otomatis (data encrypted)
- ✅ Hide internal ports (3000, 6379, 3306)
- ✅ Rate limiting (prevent DDoS)
- ✅ Security headers otomatis

**Tanpa Caddy:**
- ❌ Harus setup SSL manual
- ❌ Port 3000 exposed ke internet
- ❌ Tidak ada protection layer

### 2. Performance

**Dengan Caddy:**
- ✅ Gzip compression otomatis
- ✅ Static file caching
- ✅ HTTP/2 support
- ✅ Load balancing (jika multiple instances)

**Dengan Redis:**
- ✅ Session access super cepat (< 1ms)
- ✅ Reduce database load
- ✅ Support concurrent users

### 3. Scalability

**Bisa Scale Horizontal:**
```
Internet
   ↓
Caddy (Load Balancer)
   ├── Node.js Instance 1 (Port 3000)
   ├── Node.js Instance 2 (Port 3001)
   └── Node.js Instance 3 (Port 3002)
        ↓
   Redis (Shared Session)
        ↓
   MySQL (Shared Database)
```

### 4. Maintenance

**Dengan Caddy:**
- ✅ Zero-downtime deployment
- ✅ SSL auto-renewal
- ✅ Easy monitoring

---

## Perbandingan: Dengan vs Tanpa Caddy

### Tanpa Caddy (Direct Access)

```
❌ User → http://10.10.102.8:3000
   - Tidak aman (no SSL)
   - Harus ingat IP dan port
   - Aplikasi handle semua (SSL, security, dll)
   - Sulit scale
```

### Dengan Caddy (Recommended)

```
✅ User → https://liveclass.tam.web.id
   - Aman (SSL otomatis)
   - Domain mudah diingat
   - Caddy handle SSL & security
   - Aplikasi fokus ke business logic
   - Mudah scale
```

---

## Konfigurasi Optimal

### Server Tunggal (Saat Ini)

```
Server: 10.10.102.8
├── Caddy (80, 443)
├── Node.js (3000)
├── Redis (6379)
└── MySQL (3306)
```

**Caddyfile:**
```caddy
liveclass.tam.web.id {
    reverse_proxy localhost:3000
}
```

**Keuntungan:**
- Simple setup
- Biaya rendah (1 server)
- Cukup untuk 100-500 concurrent users

**Keterbatasan:**
- Single point of failure
- Limited resources

---

### Multi-Server (Future Scaling)

```
Load Balancer Server
├── Caddy (80, 443)
    ↓
App Server 1
├── Node.js (3000)
    ↓
App Server 2
├── Node.js (3000)
    ↓
Database Server
├── Redis (6379)
└── MySQL (3306)
```

**Keuntungan:**
- High availability
- Better performance
- Support 1000+ concurrent users

---

## Monitoring

### Check Caddy Status

```bash
# Status
sudo systemctl status caddy

# Logs
sudo journalctl -u caddy -f

# Test config
caddy validate --config /etc/caddy/Caddyfile
```

### Check Node.js Status

```bash
# PM2 status
pm2 status

# Logs
pm2 logs cbt-app

# Restart
pm2 restart cbt-app
```

### Check Redis Status

```bash
# Connect
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026

# Ping
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 ping

# Info
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 INFO
```

### Check MySQL Status

```bash
# Status
sudo systemctl status mysql

# Connect
mysql -u root -p

# Check databases
SHOW DATABASES;
```

---

## Troubleshooting

### Problem: Website tidak bisa diakses

**Check:**
1. Caddy running? `sudo systemctl status caddy`
2. Node.js running? `pm2 status`
3. Port 80/443 open? `sudo netstat -tulpn | grep caddy`
4. DNS pointing? `nslookup liveclass.tam.web.id`

### Problem: Login tidak berfungsi

**Check:**
1. Redis running? `redis-cli ping`
2. Session config correct? Check `.env`
3. Cookie domain correct? Check `SESSION_DOMAIN`

### Problem: Slow performance

**Check:**
1. Redis memory usage: `redis-cli INFO memory`
2. MySQL slow queries: `SHOW PROCESSLIST;`
3. Node.js memory: `pm2 monit`
4. Server resources: `htop`

---

## Kesimpulan

**Caddy berfungsi sebagai:**
1. 🔒 **Security Layer** - SSL, firewall, rate limiting
2. 🚪 **Gateway** - Entry point untuk semua request
3. 🔀 **Traffic Manager** - Reverse proxy, load balancing
4. ⚡ **Performance Booster** - Compression, caching, HTTP/2

**Redis berfungsi sebagai:**
1. 💾 **Session Storage** - Fast session management
2. ⚡ **Cache** - Reduce database load
3. 🔄 **Real-time Data** - Support live features

**Keduanya bekerja sama untuk:**
- Aplikasi lebih aman (SSL, security)
- Performa lebih cepat (caching, compression)
- User experience lebih baik (domain, HTTPS)
- Maintenance lebih mudah (monitoring, scaling)

---

**Analogi Sederhana:**

```
Caddy = Satpam Gedung
- Cek identitas (SSL)
- Arahkan tamu (reverse proxy)
- Jaga keamanan (firewall)

Node.js = Karyawan di Kantor
- Kerja sesuai tugas (business logic)
- Tidak perlu khawatir keamanan (Caddy yang handle)

Redis = Loker Cepat
- Simpan barang sementara (session)
- Akses super cepat (memory)

MySQL = Gudang Permanen
- Simpan barang penting (data)
- Aman dan terorganisir (database)
```

---

**Status**: ✅ Penjelasan Arsitektur Lengkap!
**Updated**: 2026-03-07

Semua komponen bekerja sama untuk aplikasi yang aman, cepat, dan scalable! 🚀
