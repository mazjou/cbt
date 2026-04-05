# 🎓 LMS CBT SMKN 1 Kras

Sistem Ujian Online (Computer Based Test) berbasis Node.js + PostgreSQL + Redis.  
Fitur lengkap: ujian PG, bank soal, materi, tugas, live class, notifikasi, anti-cheat, cetak kartu peserta.

---

## 📋 Daftar Isi

- [Spesifikasi VPS](#spesifikasi-vps)
- [Instalasi Lengkap](#instalasi-lengkap)
- [Konfigurasi](#konfigurasi)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Optimasi Performa](#optimasi-performa)
- [Update Aplikasi](#update-aplikasi)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)

---

## 🖥️ Spesifikasi VPS

| Jumlah Siswa | CPU | RAM | Storage | Rekomendasi |
|---|---|---|---|---|
| < 50 siswa | 1 core | 1 GB | 20 GB SSD | VPS Basic |
| 50–150 siswa | 2 core | 2 GB | 40 GB SSD | ✅ Disarankan |
| 150–300 siswa | 4 core | 4 GB | 60 GB SSD | VPS Medium |
| > 300 siswa | 4+ core | 8 GB | 80 GB SSD | VPS Large |

**OS:** Ubuntu 22.04 LTS (disarankan)

---

## 🚀 Instalasi Lengkap

### Step 1 — Login ke VPS

```bash
ssh root@IP_VPS_ANDA
```

### Step 2 — Update Sistem

```bash
apt update && apt upgrade -y
apt install -y curl wget git nano unzip build-essential
```

### Step 3 — Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # Harus tampil v20.x.x
npm -v    # Harus tampil 10.x.x
```

### Step 4 — Install PM2 (Process Manager)

```bash
npm install -g pm2
pm2 -v    # Cek versi PM2
```

### Step 5 — Install PostgreSQL 16

```bash
# Tambah repository PostgreSQL
sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-16

# Start dan enable
systemctl start postgresql
systemctl enable postgresql

# Cek status
systemctl status postgresql
```

### Step 6 — Setup Database PostgreSQL

```bash
# Masuk ke PostgreSQL
sudo -u postgres psql

# Jalankan perintah berikut di dalam psql:
CREATE USER lmsuser WITH PASSWORD 'GantiPasswordKuat123!';
CREATE DATABASE cbt_smk OWNER lmsuser ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE cbt_smk TO lmsuser;
\q
```

### Step 7 — Optimasi PostgreSQL

```bash
nano /etc/postgresql/16/main/postgresql.conf
```

Cari dan ubah nilai berikut (sesuaikan dengan RAM VPS):

```ini
# Untuk VPS 2GB RAM:
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
random_page_cost = 1.1
effective_io_concurrency = 200
```

```bash
# Restart PostgreSQL
systemctl restart postgresql
```

### Step 8 — Install Redis

```bash
apt install -y redis-server

# Konfigurasi Redis
nano /etc/redis/redis.conf
```

Ubah/tambahkan baris berikut:

```ini
# Set password (wajib untuk produksi)
requirepass GantiRedisPassword123!

# Batasi memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Simpan ke disk setiap 60 detik jika ada 1000 perubahan
save 60 1000

# Bind hanya localhost
bind 127.0.0.1
```

```bash
systemctl restart redis-server
systemctl enable redis-server

# Test Redis
redis-cli -a GantiRedisPassword123! ping
# Harus jawab: PONG
```

### Step 9 — Install Nginx

```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### Step 10 — Konfigurasi Nginx

```bash
nano /etc/nginx/sites-available/lms
```

Paste konfigurasi berikut:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=lms_general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=lms_answer:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=lms_conn:10m;

upstream lms_backend {
    least_conn;
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name DOMAIN_ATAU_IP_ANDA;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # Limit koneksi per IP
    limit_conn lms_conn 50;

    # Upload file max 50MB
    client_max_body_size 50M;

    # Static files langsung dari disk (bypass Node.js = lebih cepat)
    location /public/uploads/ {
        alias /cbt/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /public/ {
        alias /cbt/src/public/;
        expires 1d;
        add_header Cache-Control "public";
    }

    # Rate limit endpoint jawaban ujian
    location ~ ^/student/attempts/[0-9]+/answer {
        limit_req zone=lms_answer burst=5 nodelay;
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # Socket.io (untuk live class)
    location /socket.io/ {
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    # Semua request lain
    location / {
        limit_req zone=lms_general burst=50 nodelay;
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

```bash
# Aktifkan konfigurasi
ln -sf /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test konfigurasi
nginx -t

# Reload Nginx
systemctl reload nginx
```

### Step 11 — Clone Aplikasi dari GitHub

```bash
# Buat direktori aplikasi
mkdir -p /cbt
cd /cbt

# Clone dari GitHub
git clone https://github.com/mazjou/cbt.git .

# Buat direktori upload
mkdir -p /cbt/uploads/{questions,materials,profiles,assignments,imports}
```

### Step 12 — Konfigurasi .env

```bash
cp .env.production.example .env
nano .env
```

Isi semua variabel:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://ujian.sekolah.sch.id

SESSION_SECRET=GENERATE_DENGAN_PERINTAH_DI_BAWAH
SESSION_NAME=lms.sid
TRUST_PROXY=1

DB_HOST=localhost
DB_PORT=5432
DB_USER=lmsuser
DB_PASSWORD=GantiPasswordKuat123!
DB_NAME=cbt_smk
DB_CONNECTION_LIMIT=30

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=GantiRedisPassword123!
REDIS_SESSION_TTL=28800

SCHOOL_NAME=SMK Negeri 1 Kras
SCHOOL_ADDRESS=Kediri, Jawa Timur
PRINCIPAL_NAME=Nama Kepala Sekolah
PRINCIPAL_NIP=NIP_KEPALA_SEKOLAH

TZ=Asia/Jakarta
UPLOAD_ROOT=/cbt/uploads
RUN_SCHEDULER=1
```

Generate SESSION_SECRET:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Step 13 — Install Dependency & Setup Database

```bash
cd /cbt
npm install --production
npm run db:setup
```

Output yang diharapkan:
```
✓ Database "cbt_smk" sudah ada
✓ Schema berhasil dijalankan
✓ Akun default: admin/admin123, guru/guru123, siswa/siswa123
```

### Step 14 — Jalankan Aplikasi dengan PM2

```bash
cd /cbt
pm2 start ecosystem.config.js --env production

# Cek status
pm2 status

# Simpan konfigurasi (auto-start saat reboot)
pm2 save
pm2 startup systemd
# Jalankan perintah yang muncul dari output pm2 startup
```

### Step 15 — Install SSL Certificate (HTTPS Gratis)

```bash
apt install -y certbot python3-certbot-nginx

# Ganti server_name di Nginx dulu
nano /etc/nginx/sites-available/lms
# Ubah: server_name DOMAIN_ATAU_IP_ANDA;
# Jadi:  server_name ujian.sekolah.sch.id;

nginx -t && systemctl reload nginx

# Dapatkan SSL
certbot --nginx -d ujian.sekolah.sch.id

# Test auto-renewal
certbot renew --dry-run
```

### Step 16 — Setup Firewall

```bash
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

### Step 17 — Buat Direktori Log

```bash
mkdir -p /cbt/logs
```

---

## ⚙️ Konfigurasi

### File .env Penting

| Variabel | Keterangan |
|---|---|
| `DB_CONNECTION_LIMIT` | Max koneksi DB (default 30) |
| `REDIS_SESSION_TTL` | Durasi session detik (28800 = 8 jam) |
| `RUN_SCHEDULER` | Auto-submit expired (1=aktif) |
| `ANTI_CHEAT_MAX_VIOLATIONS` | Max pelanggaran sebelum auto-submit |
| `UPLOAD_ROOT` | Folder upload file |

---

## ▶️ Menjalankan Aplikasi

```bash
# Start
pm2 start ecosystem.config.js --env production

# Stop
pm2 stop lms-smkn1kras

# Restart (ada downtime sebentar)
pm2 restart lms-smkn1kras

# Reload (ZERO DOWNTIME - gunakan ini untuk update)
pm2 reload lms-smkn1kras

# Lihat log real-time
pm2 logs lms-smkn1kras

# Monitor CPU/RAM
pm2 monit

# Status semua proses
pm2 status
```

---

## ⚡ Optimasi Performa

### 1. PM2 Cluster Mode (sudah dikonfigurasi di ecosystem.config.js)

Otomatis pakai semua CPU core. VPS 2 core = 2 instance Node.js berjalan paralel.

### 2. Cek Jumlah Instance Berjalan

```bash
pm2 status
# Kolom "instances" harus sesuai jumlah CPU core
nproc  # Cek jumlah CPU core
```

### 3. Optimasi Kernel Linux untuk Banyak Koneksi

```bash
nano /etc/sysctl.conf
```

Tambahkan di akhir file:

```ini
# Optimasi untuk web server banyak koneksi
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.netdev_max_backlog = 65535
fs.file-max = 200000
```

```bash
sysctl -p  # Terapkan perubahan
```

### 4. Optimasi Limit File

```bash
nano /etc/security/limits.conf
```

Tambahkan:

```
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
```

### 5. Cek Performa Real-time

Buka browser: `https://domain-anda/admin/monitoring`

---

## 🔄 Update Aplikasi

### Dari Laptop (push ke GitHub):

```bash
# Di Git Bash laptop
bash push.sh "deskripsi perubahan"
```

### Di VPS (pull dari GitHub):

```bash
bash /cbt/update.sh
```

### Atau 1 Perintah dari Laptop:

```bash
bash push.sh "fix bug" && ssh root@IP_VPS 'bash /cbt/update.sh'
```

---

## 📊 Monitoring

### Cek Status Semua Service

```bash
# Aplikasi Node.js
pm2 status
pm2 logs lms-smkn1kras --lines 50

# PostgreSQL
systemctl status postgresql
psql -U lmsuser -d cbt_smk -c "SELECT count(*) FROM pg_stat_activity;"

# Redis
systemctl status redis-server
redis-cli -a PASSWORD ping

# Nginx
systemctl status nginx
nginx -t
```

### Monitoring via Browser

Buka: `https://domain-anda/admin/monitoring`

Menampilkan: CPU, RAM, koneksi DB, uptime, statistik ujian.

---

## 💾 Backup & Recovery

### Backup Manual

```bash
# Backup database
pg_dump -U lmsuser cbt_smk | gzip > /cbt/backups_smk_$(date +%Y%m%d_%H%M).sql.gz

# Backup file upload
tar -czf /var/backups/uploads_$(date +%Y%m%d).tar.gz /cbt/uploads/
```

### Backup Otomatis Setiap Hari

```bash
nano /etc/cron.daily/backup-lms
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/lms"
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U lmsuser cbt_smk | gzip > $BACKUP_DIR/db_$(date +%Y%m%d).sql.gz

# Hapus backup lebih dari 7 hari
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Backup selesai: $(date)" >> /cbt/logs/backup.log
```

```bash
chmod +x /etc/cron.daily/backup-lms
```

### Restore Database

```bash
gunzip -c /var/backups/lms/db_20240101.sql.gz | psql -U lmsuser cbt_smk
```

---

## 🔧 Troubleshooting

### Aplikasi tidak bisa diakses

```bash
pm2 status                    # Cek PM2
pm2 logs lms-smkn1kras        # Lihat error
systemctl status nginx        # Cek Nginx
curl http://localhost:3000    # Test langsung ke Node.js
```

### Error database

```bash
systemctl status postgresql
# Cek koneksi
psql -U lmsuser -h localhost -d cbt_smk -c "SELECT 1;"
```

### Redis error / session hilang

```bash
systemctl status redis-server
redis-cli -a PASSWORD ping
# Restart Redis
systemctl restart redis-server
pm2 reload lms-smkn1kras
```

### Disk penuh

```bash
df -h                              # Cek disk
du -sh /cbt/uploads/*          # Cek folder upload
du -sh /cbt/logs/*              # Cek log
pm2 flush                          # Hapus log PM2 lama
journalctl --vacuum-time=7d        # Hapus system log lama
```

### Performa lambat saat ujian

```bash
pm2 monit                          # Monitor CPU/RAM per instance
htop                               # Monitor sistem
# Cek query lambat PostgreSQL:
psql -U lmsuser -d cbt_smk -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

## 📁 Struktur Direktori di VPS

```
/cbt/              ← Kode aplikasi
├── src/
│   ├── routes/
│   ├── views/
│   ├── db/
│   └── server.js
├── sql/
├── .env               ← Konfigurasi (JANGAN di-commit ke GitHub)
├── ecosystem.config.js
├── update.sh
└── package.json

/cbt/uploads/      ← File upload siswa/guru
/cbt/logs/          ← Log aplikasi
/var/backups/lms/      ← Backup database
```

---

## 🔐 Akun Default (Ganti Setelah Install!)

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Administrator |
| guru | guru123 | Guru |
| siswa | siswa123 | Siswa |
| kepsek | kepsek123 | Kepala Sekolah |

> ⚠️ **WAJIB ganti password default setelah instalasi!**

---

## 📞 Checklist Sebelum Ujian Massal

- [ ] Buka `/admin/monitoring` - semua indikator hijau
- [ ] Redis connected (session persistent)
- [ ] Test login siswa berhasil
- [ ] Test mulai ujian dan submit jawaban
- [ ] Backup database sudah dilakukan
- [ ] Disk space cukup (`df -h` > 20% free)
- [ ] `pm2 status` semua instance `online`
- [ ] Koneksi jaringan stabil (LAN > WiFi)

---

## 🛠️ Tech Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js
- **Database:** PostgreSQL 16
- **Session Store:** Redis
- **Process Manager:** PM2 (cluster mode)
- **Reverse Proxy:** Nginx
- **Template Engine:** EJS
- **Real-time:** Socket.io
