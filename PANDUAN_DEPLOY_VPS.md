# Panduan Deploy LMS ke VPS

## Spesifikasi VPS yang Disarankan

| Siswa | CPU | RAM | Storage | Bandwidth |
|-------|-----|-----|---------|-----------|
| < 100 | 2 core | 2 GB | 20 GB SSD | 100 Mbps |
| 100-300 | 4 core | 4 GB | 40 GB SSD | 200 Mbps |
| 300-500 | 4 core | 8 GB | 60 GB SSD | 500 Mbps |

**OS yang disarankan:** Ubuntu 22.04 LTS

---

## Langkah 1: Setup VPS Otomatis

```bash
# Login ke VPS sebagai root
ssh root@IP_VPS_ANDA

# Download dan jalankan script setup
bash deploy.sh
```

Script akan otomatis install: Node.js 20, PostgreSQL, Redis, Nginx, PM2, Firewall.

---

## Langkah 2: Upload Kode Aplikasi

**Dari laptop Windows (PowerShell):**
```powershell
# Compress folder (exclude node_modules)
# Lalu upload via SCP atau Git

# Opsi A: Via Git (disarankan)
# Di VPS:
cd /cbt
git clone https://github.com/username/repo.git .

# Opsi B: Via SCP dari Windows
scp -r E:\WEBSITE\cbt\* root@IP_VPS:/cbt/
```

---

## Langkah 3: Konfigurasi .env

```bash
cd /cbt
cp .env.production.example .env
nano .env
```

Isi semua variabel, terutama:
- `APP_URL` = domain/IP VPS Anda
- `DB_PASSWORD` = dari file `/tmp/lms_credentials.txt`
- `REDIS_PASSWORD` = dari file `/tmp/lms_credentials.txt`
- `SESSION_SECRET` = generate dengan perintah di bawah

```bash
# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Langkah 4: Install & Setup Database

```bash
cd /cbt
npm install --production
npm run db:setup
```

---

## Langkah 5: Jalankan Aplikasi

```bash
# Jalankan dengan PM2
pm2 start ecosystem.config.js --env production

# Simpan konfigurasi PM2 (auto-start saat reboot)
pm2 save

# Cek status
pm2 status
pm2 logs lms-smkn1kras
```

---

## Langkah 6: HTTPS dengan SSL (Gratis)

```bash
# Install Certbot
apt install certbot python3-certbot-nginx -y

# Ganti server_name di Nginx dulu
nano /etc/nginx/sites-available/lms
# Ubah: server_name _;
# Jadi:  server_name ujian.sekolah.sch.id;

nginx -t && systemctl reload nginx

# Dapatkan SSL certificate
certbot --nginx -d ujian.sekolah.sch.id

# Auto-renewal
certbot renew --dry-run
```

---

## Perintah Operasional Sehari-hari

```bash
# Cek status aplikasi
pm2 status

# Lihat log real-time
pm2 logs lms-smkn1kras --lines 100

# Restart aplikasi
pm2 restart lms-smkn1kras

# Reload tanpa downtime (saat update kode)
pm2 reload lms-smkn1kras

# Stop aplikasi
pm2 stop lms-smkn1kras

# Monitor CPU/RAM
pm2 monit

# Cek koneksi database
psql -U lmsuser -d cbt_smk -c "SELECT count(*) FROM users;"

# Cek Redis
redis-cli -a PASSWORD_REDIS ping
```

---

## Update Aplikasi (Zero Downtime)

```bash
cd /cbt

# Pull kode terbaru
git pull origin main

# Install dependency baru (jika ada)
npm install --production

# Reload tanpa downtime
pm2 reload lms-smkn1kras

# Cek tidak ada error
pm2 logs lms-smkn1kras --lines 20
```

---

## Checklist Sebelum Ujian Massal

- [ ] Buka `/admin/monitoring` - semua hijau
- [ ] Test login dengan akun siswa
- [ ] Test mulai ujian dan submit jawaban
- [ ] Pastikan Redis connected (session persistent)
- [ ] Backup database: `pg_dump cbt_smk > backup_$(date +%Y%m%d).sql`
- [ ] Cek disk space: `df -h`
- [ ] Cek RAM: `free -h`

---

## Backup Otomatis Database

```bash
# Buat script backup
cat > /etc/cron.daily/backup-lms << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/lms"
mkdir -p $BACKUP_DIR
pg_dump -U lmsuser cbt_smk | gzip > $BACKUP_DIR/cbt_smk_$(date +%Y%m%d_%H%M).sql.gz
# Hapus backup lebih dari 7 hari
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/backup-lms
```

---

## Troubleshooting

**Aplikasi tidak bisa diakses:**
```bash
pm2 status          # Cek status PM2
pm2 logs            # Lihat error
systemctl status nginx  # Cek Nginx
```

**Database error:**
```bash
systemctl status postgresql
journalctl -u postgresql -n 50
```

**Redis error:**
```bash
systemctl status redis-server
redis-cli -a PASSWORD ping
```

**Disk penuh:**
```bash
df -h
du -sh /cbt/uploads/*  # Cek folder upload
pm2 flush  # Hapus log PM2 lama
```
