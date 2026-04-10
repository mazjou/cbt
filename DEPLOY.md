# Panduan Deploy CBT SMKN 1 Kras ke Server Baru

> Panduan ini berlaku untuk **Ubuntu 20.04/22.04/24.04** dan **Debian 11/12**.  
> Semua perintah dijalankan sebagai **root** atau dengan `sudo`.

---

## Daftar Isi

1. [Persiapan Server](#1-persiapan-server)
2. [Install Dependencies](#2-install-dependencies)
3. [Setup PostgreSQL](#3-setup-postgresql)
4. [Setup Redis](#4-setup-redis)
5. [Clone & Setup Aplikasi](#5-clone--setup-aplikasi)
6. [Konfigurasi .env](#6-konfigurasi-env)
7. [Setup Database Schema](#7-setup-database-schema)
8. [Jalankan Aplikasi (PM2)](#8-jalankan-aplikasi-pm2)
9. [Setup Caddy (HTTPS + Domain)](#9-setup-caddy-https--domain)
10. [Optimasi untuk Ujian Massal](#10-optimasi-untuk-ujian-massal)
11. [Update Aplikasi](#11-update-aplikasi)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Persiapan Server

### Spesifikasi Minimum
| Komponen | Minimum | Rekomendasi (500 siswa) |
|---|---|---|
| CPU | 1 core | 2 core |
| RAM | 2 GB | 4–8 GB |
| Disk | 20 GB | 50 GB+ |
| OS | Ubuntu 20.04 / Debian 11 | Ubuntu 22.04 / Debian 12 |

### Update sistem
```bash
apt update && apt upgrade -y
apt install -y curl wget git nano ufw
```

### Konfigurasi firewall
```bash
ufw allow 22      # SSH
ufw allow 80      # HTTP
ufw allow 443     # HTTPS
ufw enable
```

---

## 2. Install Dependencies

### Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # Harus v20.x.x
npm -v    # Harus v10.x.x
```

### PM2 (Process Manager)
```bash
npm install -g pm2
pm2 -v
```

### Build tools (untuk beberapa npm package)
```bash
apt install -y build-essential python3
```

---

## 3. Setup PostgreSQL

### Install
```bash
# Ubuntu/Debian
apt install -y postgresql postgresql-contrib

# Cek versi
psql --version

# Pastikan service berjalan
systemctl enable postgresql
systemctl start postgresql
systemctl status postgresql
```

### Buat user dan database
```bash
sudo -u postgres psql
```

Di dalam psql, jalankan:
```sql
-- Buat user aplikasi
CREATE USER lmsuser WITH PASSWORD 'GantiPasswordIni!';

-- Buat database
CREATE DATABASE cbt_smk OWNER lmsuser;

-- Beri akses penuh
GRANT ALL PRIVILEGES ON DATABASE cbt_smk TO lmsuser;

-- Keluar
\q
```

### Konfigurasi PostgreSQL untuk production
```bash
# Cari lokasi postgresql.conf
sudo -u postgres psql -c "SHOW config_file;"

# Edit konfigurasi (sesuaikan path versi PostgreSQL)
nano /etc/postgresql/*/main/postgresql.conf
```

Ubah/tambahkan nilai berikut:
```ini
max_connections = 200
shared_buffers = 256MB          # 25% dari RAM (misal RAM 4GB → 1GB)
effective_cache_size = 2GB      # 50-75% dari RAM
work_mem = 8MB
maintenance_work_mem = 128MB
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
```

```bash
# Restart PostgreSQL
systemctl restart postgresql

# Verifikasi
sudo -u postgres psql -c "SHOW max_connections;"
```

### Izinkan koneksi dengan password (pg_hba.conf)
```bash
nano /etc/postgresql/*/main/pg_hba.conf
```

Pastikan ada baris ini (tambahkan jika belum ada):
```
# IPv4 local connections:
host    all             all             127.0.0.1/32            md5
```

```bash
systemctl restart postgresql
```

---

## 4. Setup Redis

### Install
```bash
apt install -y redis-server

systemctl enable redis-server
systemctl start redis-server
```

### Konfigurasi Redis dengan password
```bash
nano /etc/redis/redis.conf
```

Cari dan ubah/tambahkan:
```ini
# Set password (wajib untuk production)
requirepass GantiPasswordRedisIni!

# Bind hanya localhost (keamanan)
bind 127.0.0.1

# Simpan data ke disk
save 900 1
save 300 10
save 60 10000

# Max memory (sesuaikan dengan RAM server)
maxmemory 256mb
maxmemory-policy allkeys-lru
```

```bash
systemctl restart redis-server

# Test koneksi
redis-cli -a 'GantiPasswordRedisIni!' ping
# Harus muncul: PONG
```

---

## 5. Clone & Setup Aplikasi

### Clone repository
```bash
git clone https://github.com/mazjou/cbt.git /cbt
cd /cbt
```

### Install npm packages
```bash
npm install --production
```

### Buat folder yang diperlukan
```bash
mkdir -p /cbt/src/public/uploads/{questions,materials,imports}
mkdir -p /cbt/logs

# Set permission
chmod -R 755 /cbt/src/public/uploads
chown -R www-data:www-data /cbt/src/public/uploads 2>/dev/null || true
```

### Tambah Swap (jika RAM < 4GB atau sebagai safety net)
```bash
# Cek apakah sudah ada swap
free -h

# Jika belum ada, tambahkan 2GB swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Agar permanen setelah reboot
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Verifikasi
free -h
```

---

## 6. Konfigurasi .env

### Copy template
```bash
cp /cbt/.env.example /cbt/.env
nano /cbt/.env
```

### Isi nilai berikut (yang bertanda `<GANTI>`):

```env
################################
# APPLICATION
################################
APP_NAME=lms-smkn1kras
NODE_ENV=production
PORT=3000
APP_URL=https://domain-kamu.sch.id        # <GANTI dengan domain kamu>
CLIENT_URL=https://domain-kamu.sch.id     # <GANTI sama dengan APP_URL>
TRUST_PROXY=1
RUN_SCHEDULER=1

################################
# SECURITY
################################
# Generate SESSION_SECRET dengan perintah:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<GANTI_DENGAN_STRING_RANDOM_64_KARAKTER>
SESSION_NAME=connect.sid

################################
# DATABASE
################################
DB_HOST=localhost
DB_PORT=5432
DB_USER=lmsuser
DB_PASSWORD=GantiPasswordIni!            # <GANTI sesuai password DB yang dibuat>
DB_NAME=cbt_smk
DB_CONNECTION_LIMIT=50
DB_IDLE_TIMEOUT_MS=30000

################################
# REDIS
################################
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=GantiPasswordRedisIni!    # <GANTI sesuai password Redis>
REDIS_SESSION_PREFIX=lms:sess:
REDIS_SESSION_TTL=28800

################################
# TIMEZONE
################################
TZ=Asia/Jakarta
UPLOAD_ROOT=

################################
# INFORMASI SEKOLAH
################################
SCHOOL_NAME=SMK Negeri 1 Kras            # <GANTI nama sekolah>
SCHOOL_ADDRESS=Kediri, Jawa Timur        # <GANTI alamat sekolah>
PRINCIPAL_NAME=Nama Kepala Sekolah       # <GANTI nama kepala sekolah>
PRINCIPAL_NIP=19XXXXXXXXXX               # <GANTI NIP kepala sekolah>
```

### Generate SESSION_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output dan paste ke SESSION_SECRET di .env
```

---

## 7. Setup Database Schema

```bash
# Jalankan schema (buat semua tabel)
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -f /cbt/sql/schema_pg.sql

# Jalankan indexes
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -f /cbt/sql/add_indexes.sql

# Verifikasi tabel berhasil dibuat
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -c "\dt"
```

Harus muncul daftar tabel: `users`, `exams`, `questions`, `options`, `attempts`, dll.

---

## 8. Jalankan Aplikasi (PM2)

### Start aplikasi
```bash
cd /cbt
pm2 start ecosystem.config.js --env production
```

### Simpan konfigurasi PM2 (agar auto-start setelah reboot)
```bash
pm2 save
pm2 startup
# Jalankan perintah yang muncul dari output pm2 startup
```

### Cek status
```bash
pm2 status
pm2 logs lms-smkn1kras --lines 20
```

### Test aplikasi berjalan
```bash
curl http://localhost:3000
# Harus muncul HTML halaman login
```

---

## 9. Setup Caddy (HTTPS + Domain)

### Install Caddy
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

systemctl enable caddy
```

### Buat folder log Caddy
```bash
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
```

### Konfigurasi Caddyfile
```bash
nano /etc/caddy/Caddyfile
```

Isi dengan:
```caddy
{
    email admin@domain-kamu.sch.id
}

domain-kamu.sch.id {
    reverse_proxy localhost:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up Host {host}

        transport http {
            dial_timeout 10s
            response_header_timeout 60s
            read_timeout 120s
        }
    }

    encode gzip zstd

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        -Server
    }

    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}

# Redirect www ke non-www (opsional)
www.domain-kamu.sch.id {
    redir https://domain-kamu.sch.id{uri} permanent
}
```

```bash
# Validasi konfigurasi
caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
systemctl restart caddy
systemctl status caddy
```

> **Catatan:** Caddy otomatis mengurus SSL/HTTPS dari Let's Encrypt. Pastikan domain sudah diarahkan ke IP server sebelum menjalankan Caddy.

---

## 10. Optimasi untuk Ujian Massal

### Cek kesiapan server
```bash
# CPU cores
nproc

# RAM tersedia
free -h

# Disk
df -h /

# Koneksi DB
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -c "SHOW max_connections;"
```

### Sebelum ujian massal (500+ siswa)
```bash
# 1. Reload app untuk bersihkan memory
pm2 reload lms-smkn1kras

# 2. Cek tidak ada error
pm2 logs lms-smkn1kras --lines 30 --err

# 3. Monitor real-time
# Buka browser: https://domain-kamu.sch.id/admin/monitoring
```

### Jika server lambat saat ujian
```bash
# Cek proses yang berat
top

# Cek koneksi DB aktif
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Restart jika perlu (zero downtime)
pm2 reload lms-smkn1kras
```

---

## 11. Update Aplikasi

### Cara update (dari VPS)
```bash
bash /cbt/update.sh
```

Script ini otomatis:
- Pull kode terbaru dari GitHub
- Install npm package baru (jika ada)
- Jalankan migrasi database (jika schema berubah)
- Reload PM2 (zero downtime)
- Rollback otomatis jika gagal

### Update manual
```bash
cd /cbt
git pull origin main
npm install --production
pm2 reload lms-smkn1kras
```

---

## 12. Troubleshooting

### Aplikasi tidak bisa start
```bash
# Cek log error
pm2 logs lms-smkn1kras --lines 50 --err

# Cek .env sudah benar
cat /cbt/.env

# Test koneksi database
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -c "SELECT 1;"

# Test koneksi Redis
redis-cli -a 'GantiPasswordRedisIni!' ping
```

### Error "Peer authentication failed"
```bash
# Selalu gunakan -h 127.0.0.1 untuk koneksi dengan password
psql -h 127.0.0.1 -U lmsuser -d cbt_smk
```

### Port 3000 tidak bisa diakses
```bash
# Cek app berjalan
pm2 status
curl http://localhost:3000

# Cek firewall
ufw status
```

### HTTPS tidak jalan / SSL error
```bash
# Cek Caddy berjalan
systemctl status caddy

# Cek log Caddy
journalctl -u caddy -n 50

# Pastikan domain sudah pointing ke IP server
dig domain-kamu.sch.id
```

### Database error saat import soal
```bash
# Cek tabel ada
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -c "\dt"

# Jalankan ulang schema jika perlu
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk -f /cbt/sql/schema_pg.sql
```

### PM2 tidak auto-start setelah reboot
```bash
pm2 save
pm2 startup
# Jalankan perintah yang muncul
```

### Reset password admin
```bash
# Generate hash password baru
node -e "const b=require('bcryptjs');b.hash('password_baru',10).then(h=>console.log(h))"

# Update di database
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk \
  -c "UPDATE users SET password='\$HASH_DARI_ATAS' WHERE username='admin';"
```

---

## Ringkasan Perintah Penting

```bash
# Status aplikasi
pm2 status

# Log real-time
pm2 logs lms-smkn1kras

# Restart aplikasi (zero downtime)
pm2 reload lms-smkn1kras

# Update dari GitHub
bash /cbt/update.sh

# Monitoring sistem
# Buka: https://domain-kamu.sch.id/admin/monitoring

# Backup database
PGPASSWORD="GantiPasswordIni!" pg_dump -h 127.0.0.1 -U lmsuser cbt_smk > backup_$(date +%Y%m%d).sql

# Restore database
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk < backup_YYYYMMDD.sql
```

---

## Backup & Restore Database

### Cara 1: Download via Halaman Monitoring (Termudah)

1. Login sebagai Admin
2. Buka menu **Monitoring** → `/admin/monitoring`
3. Klik tombol **"⬇️ Download Backup DB"**
4. File SQL otomatis terdownload ke komputer kamu
5. Simpan file di tempat aman (Google Drive, flashdisk, dll)

> File backup bernama: `backup_cbt_smk_YYYY-MM-DDTHH-MM-SS.sql`

---

### Cara 2: Backup Manual via Terminal VPS

```bash
# Backup lengkap (semua tabel + data)
PGPASSWORD="GantiPasswordIni!" pg_dump \
  -h 127.0.0.1 \
  -U lmsuser \
  -d cbt_smk \
  --no-owner \
  --no-acl \
  -f /cbt/backup_$(date +%Y%m%d_%H%M%S).sql

# Verifikasi file backup berhasil dibuat
ls -lh /cbt/backup_*.sql
```

### Backup Otomatis Setiap Hari (Cron Job)

```bash
# Buka crontab
crontab -e

# Tambahkan baris ini (backup setiap hari jam 02:00 dini hari)
0 2 * * * PGPASSWORD="GantiPasswordIni!" pg_dump -h 127.0.0.1 -U lmsuser -d cbt_smk --no-owner --no-acl -f /cbt/backup/backup_$(date +\%Y\%m\%d).sql

# Buat folder backup
mkdir -p /cbt/backup
```

Hapus backup lama otomatis (simpan 7 hari terakhir):
```bash
# Tambahkan juga di crontab (hapus backup > 7 hari)
0 3 * * * find /cbt/backup -name "backup_*.sql" -mtime +7 -delete
```

---

### Restore Database

> **PERHATIAN:** Restore akan **menimpa semua data** yang ada. Pastikan sudah backup data terbaru sebelum restore.

#### Restore ke Server yang Sama

```bash
# 1. Stop aplikasi dulu (opsional tapi disarankan)
pm2 stop lms-smkn1kras

# 2. Restore database
PGPASSWORD="GantiPasswordIni!" psql \
  -h 127.0.0.1 \
  -U lmsuser \
  -d cbt_smk \
  -f /path/ke/backup_cbt_smk_20260410.sql

# 3. Start aplikasi kembali
pm2 start lms-smkn1kras
```

#### Restore ke Server Baru (Pindah Server)

```bash
# ── Di SERVER LAMA ──────────────────────────────────────
# 1. Download backup via monitoring ATAU buat manual:
PGPASSWORD="GantiPasswordIni!" pg_dump \
  -h 127.0.0.1 -U lmsuser -d cbt_smk \
  --no-owner --no-acl \
  -f /tmp/backup_pindah_$(date +%Y%m%d).sql

# 2. Copy file backup ke server baru
scp /tmp/backup_pindah_*.sql root@IP_SERVER_BARU:/tmp/

# ── Di SERVER BARU ──────────────────────────────────────
# 3. Pastikan PostgreSQL sudah terinstall dan database sudah dibuat
#    (ikuti langkah di bagian "Setup PostgreSQL" di atas)

# 4. Restore data
PGPASSWORD="GantiPasswordIni!" psql \
  -h 127.0.0.1 \
  -U lmsuser \
  -d cbt_smk \
  -f /tmp/backup_pindah_20260410.sql

# 5. Verifikasi data berhasil masuk
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM exams; SELECT COUNT(*) FROM attempts;"

# 6. Copy folder uploads (gambar soal) dari server lama
#    Di SERVER LAMA:
scp -r /cbt/src/public/uploads root@IP_SERVER_BARU:/cbt/src/public/

# 7. Start aplikasi
pm2 start /cbt/ecosystem.config.js --env production
pm2 save
```

#### Restore dari File yang Didownload via Browser

```bash
# 1. Upload file SQL ke VPS via SCP (dari laptop/komputer)
scp backup_cbt_smk_2026-04-10T14-00-00.sql root@IP_SERVER:/tmp/

# 2. Restore
PGPASSWORD="GantiPasswordIni!" psql \
  -h 127.0.0.1 \
  -U lmsuser \
  -d cbt_smk \
  -f /tmp/backup_cbt_smk_2026-04-10T14-00-00.sql

# 3. Verifikasi
PGPASSWORD="GantiPasswordIni!" psql -h 127.0.0.1 -U lmsuser -d cbt_smk \
  -c "\dt" -c "SELECT COUNT(*) AS total_users FROM users;"
```

---

### Checklist Pindah Server

- [ ] Download backup DB via monitoring atau `pg_dump`
- [ ] Copy folder `/cbt/src/public/uploads/` (gambar soal)
- [ ] Simpan file `.env` (berisi semua konfigurasi)
- [ ] Deploy ke server baru: `bash /cbt/setup-server.sh`
- [ ] Restore database
- [ ] Copy folder uploads
- [ ] Edit `.env` sesuai konfigurasi server baru
- [ ] `pm2 reload lms-smkn1kras`
- [ ] Test login dan cek data

---

## Informasi Kontak & Repository

- **GitHub:** https://github.com/mazjou/cbt
- **Domain Produksi:** https://psaj.smkn1kras.sch.id
- **Monitoring:** https://psaj.smkn1kras.sch.id/admin/monitoring
