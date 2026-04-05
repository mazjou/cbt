# Cara Setup Caddy dengan Domain

## Status: GUIDE ✅

Panduan lengkap setup Caddy sebagai reverse proxy untuk aplikasi CBT dengan domain dan SSL otomatis.

---

## Apa itu Caddy?

Caddy adalah web server modern yang:
- Auto SSL/HTTPS dari Let's Encrypt
- Konfigurasi sangat simple
- Built-in reverse proxy
- Auto redirect HTTP ke HTTPS

---

## Instalasi Caddy

### Ubuntu/Debian

```bash
# Install dependencies
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https

# Add Caddy repository
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Install Caddy
sudo apt update
sudo apt install caddy

# Check version
caddy version
```

### CentOS/RHEL

```bash
# Add Caddy repository
sudo yum install yum-plugin-copr
sudo yum copr enable @caddy/caddy

# Install Caddy
sudo yum install caddy

# Check version
caddy version
```

### Windows

Download dari: https://caddyserver.com/download

---

## Konfigurasi Caddy

### 1. Konfigurasi Dasar (Tanpa SSL)

File: `/etc/caddy/Caddyfile`

```caddy
# Aplikasi CBT
liveclass.tam.web.id {
    reverse_proxy localhost:3000
}
```

### 2. Konfigurasi dengan SSL Otomatis (Recommended)

File: `/etc/caddy/Caddyfile`

```caddy
# Aplikasi CBT dengan SSL otomatis
liveclass.tam.web.id {
    # Reverse proxy ke aplikasi Node.js
    reverse_proxy localhost:3000 {
        # Header forwarding
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    
    # Logging
    log {
        output file /var/log/caddy/liveclass.log
        format json
    }
    
    # Gzip compression
    encode gzip
    
    # Security headers
    header {
        # Enable HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        # Prevent clickjacking
        X-Frame-Options "SAMEORIGIN"
        # Prevent MIME sniffing
        X-Content-Type-Options "nosniff"
        # XSS Protection
        X-XSS-Protection "1; mode=block"
        # Referrer Policy
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

### 3. Konfigurasi Multiple Domain

```caddy
# Domain utama
liveclass.tam.web.id {
    reverse_proxy localhost:3000
}

# Domain alternatif (redirect ke utama)
www.liveclass.tam.web.id {
    redir https://liveclass.tam.web.id{uri} permanent
}

# Subdomain admin
admin.liveclass.tam.web.id {
    reverse_proxy localhost:3000
    
    # Basic auth untuk admin
    basicauth /admin/* {
        admin $2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx7wHe0jCa.dG
    }
}
```

### 4. Konfigurasi dengan WebSocket Support (untuk Live Class)

```caddy
liveclass.tam.web.id {
    reverse_proxy localhost:3000 {
        # WebSocket support
        header_up Upgrade {http.request.header.Upgrade}
        header_up Connection {http.request.header.Connection}
        
        # Standard headers
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
    }
    
    encode gzip
}
```

### 5. Konfigurasi dengan Rate Limiting

```caddy
liveclass.tam.web.id {
    # Rate limiting
    rate_limit {
        zone dynamic {
            key {remote_host}
            events 100
            window 1m
        }
    }
    
    reverse_proxy localhost:3000
}
```

---

## Setup DNS

Sebelum Caddy bisa generate SSL, domain harus pointing ke server:

### A Record

```
Type: A
Name: liveclass
Value: YOUR_SERVER_IP
TTL: 3600
```

### CNAME Record (untuk www)

```
Type: CNAME
Name: www
Value: liveclass.tam.web.id
TTL: 3600
```

### Cek DNS Propagation

```bash
# Check A record
nslookup liveclass.tam.web.id

# Check dengan dig
dig liveclass.tam.web.id

# Check dari berbagai lokasi
# https://www.whatsmydns.net/
```

---

## Menjalankan Caddy

### Start Caddy

```bash
# Reload konfigurasi
sudo caddy reload --config /etc/caddy/Caddyfile

# Start service
sudo systemctl start caddy

# Enable auto-start
sudo systemctl enable caddy

# Check status
sudo systemctl status caddy
```

### Test Konfigurasi

```bash
# Validate Caddyfile
caddy validate --config /etc/caddy/Caddyfile

# Format Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
```

### View Logs

```bash
# System logs
sudo journalctl -u caddy -f

# Access logs
sudo tail -f /var/log/caddy/liveclass.log

# Error logs
sudo tail -f /var/log/caddy/error.log
```

---

## Update Aplikasi untuk Domain

### 1. Update .env

```env
# Domain configuration
APP_URL=https://liveclass.tam.web.id
SESSION_DOMAIN=liveclass.tam.web.id

# Port (tetap 3000, Caddy yang handle 80/443)
PORT=3000

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=cbt_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# Session
SESSION_SECRET=your-secret-key-here
SESSION_NAME=cbt_session
```

### 2. Update Session Config (jika perlu)

File: `src/server.js`

```javascript
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  name: process.env.SESSION_NAME || 'cbt_session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true untuk HTTPS
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    domain: process.env.SESSION_DOMAIN || undefined, // Set domain untuk cookie
    sameSite: 'lax'
  }
}));
```

### 3. Restart Aplikasi

```bash
pm2 restart cbt-app
```

---

## Firewall Configuration

### UFW (Ubuntu)

```bash
# Allow HTTP
sudo ufw allow 80/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Allow SSH (jangan lupa!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Firewalld (CentOS)

```bash
# Allow HTTP
sudo firewall-cmd --permanent --add-service=http

# Allow HTTPS
sudo firewall-cmd --permanent --add-service=https

# Reload
sudo firewall-cmd --reload

# Check
sudo firewall-cmd --list-all
```

---

## SSL Certificate

### Auto SSL (Let's Encrypt)

Caddy otomatis generate SSL certificate dari Let's Encrypt jika:
1. Domain sudah pointing ke server (A record)
2. Port 80 dan 443 terbuka
3. Caddy bisa akses internet

### Manual SSL Certificate

Jika punya SSL certificate sendiri:

```caddy
liveclass.tam.web.id {
    tls /path/to/cert.pem /path/to/key.pem
    
    reverse_proxy localhost:3000
}
```

### Wildcard SSL

```caddy
*.tam.web.id {
    tls {
        dns cloudflare YOUR_CLOUDFLARE_API_TOKEN
    }
    
    @liveclass host liveclass.tam.web.id
    handle @liveclass {
        reverse_proxy localhost:3000
    }
}
```

---

## Monitoring & Maintenance

### Check Certificate Status

```bash
# List certificates
sudo caddy list-certificates

# Certificate info
openssl s_client -connect liveclass.tam.web.id:443 -servername liveclass.tam.web.id < /dev/null | openssl x509 -noout -dates
```

### Auto Renewal

Caddy otomatis renew certificate sebelum expire. Tidak perlu cron job!

### Performance Monitoring

```bash
# Check Caddy process
ps aux | grep caddy

# Check memory usage
free -h

# Check disk usage
df -h

# Check network
netstat -tulpn | grep caddy
```

---

## Troubleshooting

### Problem: SSL Certificate Failed

**Penyebab:**
- Domain belum pointing ke server
- Port 80/443 blocked
- DNS belum propagate

**Solution:**
```bash
# Check DNS
nslookup liveclass.tam.web.id

# Check port
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :443

# Check Caddy logs
sudo journalctl -u caddy -n 100

# Force SSL renewal
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Problem: 502 Bad Gateway

**Penyebab:**
- Aplikasi Node.js tidak running
- Port salah

**Solution:**
```bash
# Check aplikasi
pm2 status

# Check port
netstat -tulpn | grep :3000

# Restart aplikasi
pm2 restart cbt-app

# Restart Caddy
sudo systemctl restart caddy
```

### Problem: WebSocket Connection Failed

**Penyebab:**
- Header Upgrade tidak di-forward

**Solution:**
Update Caddyfile:
```caddy
liveclass.tam.web.id {
    reverse_proxy localhost:3000 {
        header_up Upgrade {http.request.header.Upgrade}
        header_up Connection {http.request.header.Connection}
    }
}
```

---

## Backup Configuration

### Backup Caddyfile

```bash
# Backup
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup

# Restore
sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Backup SSL Certificates

```bash
# Certificates location
/var/lib/caddy/.local/share/caddy/certificates/

# Backup
sudo tar -czf caddy-certs-backup.tar.gz /var/lib/caddy/.local/share/caddy/

# Restore
sudo tar -xzf caddy-certs-backup.tar.gz -C /
```

---

## Complete Example: Production Setup

### Caddyfile

```caddy
# Global options
{
    email admin@tam.web.id
    admin off
}

# Main application
liveclass.tam.web.id {
    # Reverse proxy
    reverse_proxy localhost:3000 {
        # Headers
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}
        
        # WebSocket support
        header_up Upgrade {http.request.header.Upgrade}
        header_up Connection {http.request.header.Connection}
        
        # Timeouts
        transport http {
            dial_timeout 10s
            response_header_timeout 30s
        }
    }
    
    # Compression
    encode gzip zstd
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    
    # Logging
    log {
        output file /var/log/caddy/liveclass.log {
            roll_size 100mb
            roll_keep 10
            roll_keep_for 720h
        }
        format json
        level INFO
    }
    
    # Error handling
    handle_errors {
        @502 expression {http.error.status_code} == 502
        handle @502 {
            respond "Service temporarily unavailable. Please try again later." 502
        }
    }
}

# Redirect www to non-www
www.liveclass.tam.web.id {
    redir https://liveclass.tam.web.id{uri} permanent
}
```

### .env

```env
# Application
NODE_ENV=production
PORT=3000
APP_URL=https://liveclass.tam.web.id
SESSION_DOMAIN=liveclass.tam.web.id

# Database
DB_HOST=localhost
DB_USER=cbt_user
DB_PASSWORD=secure-password-here
DB_NAME=cbt_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026

# Session
SESSION_SECRET=your-very-long-random-secret-key-here
SESSION_NAME=cbt_session

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

---

## Testing

### 1. Test HTTP to HTTPS Redirect

```bash
curl -I http://liveclass.tam.web.id
# Should return 301/302 redirect to https://
```

### 2. Test SSL Certificate

```bash
# Check SSL
curl -I https://liveclass.tam.web.id

# Detailed SSL info
openssl s_client -connect liveclass.tam.web.id:443 -servername liveclass.tam.web.id
```

### 3. Test Application

```bash
# Test homepage
curl https://liveclass.tam.web.id

# Test login
curl -X POST https://liveclass.tam.web.id/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

### 4. Load Testing

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Test
ab -n 1000 -c 10 https://liveclass.tam.web.id/
```

---

## Checklist Deployment

- [ ] Domain sudah pointing ke server
- [ ] DNS sudah propagate (cek dengan nslookup)
- [ ] Caddy sudah terinstall
- [ ] Caddyfile sudah dikonfigurasi
- [ ] Firewall allow port 80 dan 443
- [ ] Aplikasi Node.js running di port 3000
- [ ] PM2 sudah setup dan auto-start
- [ ] Redis running
- [ ] MySQL running
- [ ] .env sudah update dengan domain
- [ ] Test akses https://domain.com
- [ ] SSL certificate valid
- [ ] Login berfungsi
- [ ] Session berfungsi
- [ ] Upload file berfungsi
- [ ] Live class berfungsi

---

**Status**: ✅ Panduan Caddy Setup Lengkap!
**Updated**: 2026-03-07
**Impact**: Aplikasi bisa diakses dengan domain dan SSL otomatis

Caddy akan otomatis handle SSL certificate dan renewal! 🚀🔒
