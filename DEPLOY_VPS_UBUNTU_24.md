# 🚀 Panduan Deploy ke VPS Ubuntu 24 (Fresh Install)

## 📋 Prerequisites

- VPS Ubuntu 24.04 LTS (fresh install)
- Akses SSH root atau sudo user
- Domain (opsional, bisa pakai IP)
- Minimal 2GB RAM, 2 CPU cores, 20GB storage

---

## 🎯 Langkah-Langkah Deployment

### **STEP 1: Koneksi ke VPS**

```bash
# Dari komputer lokal
ssh root@your-vps-ip

# Atau jika pakai user biasa
ssh username@your-vps-ip
```

---

### **STEP 2: Update System**

```bash
# Update package list
sudo apt update

# Upgrade packages
sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git vim nano htop ufw
```

---

### **STEP 3: Install Node.js 20 LTS**

```bash
# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install PM2 globally
sudo npm install -g pm2
```

---

### **STEP 4: Install MySQL 8**

```bash
# Install MySQL Server
sudo apt install -y mysql-server

# Secure MySQL installation
sudo mysql_secure_installation

# Jawab pertanyaan:
# - Set root password: YES (buat password kuat)
# - Remove anonymous users: YES
# - Disallow root login remotely: YES
# - Remove test database: YES
# - Reload privilege tables: YES

# Login ke MySQL
sudo mysql -u root -p

# Buat database dan user
CREATE DATABASE cbt_smk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cbt_user'@'localhost' IDENTIFIED BY 'password_kuat_123';
GRANT ALL PRIVILEGES ON cbt_smk.* TO 'cbt_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Test login
mysql -u cbt_user -p cbt_smk
# Jika berhasil, ketik EXIT;
```

---

### **STEP 5: Setup Firewall**

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (PENTING! Jangan lupa ini)
sudo ufw allow 22/tcp

# Allow HTTP dan HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow port aplikasi (3000) - opsional jika pakai Nginx
sudo ufw allow 3000/tcp

# Check status
sudo ufw status
```

---

### **STEP 6: Clone/Upload Aplikasi**

#### **Metode A: Via Git (Recommended)**

```bash
# Buat folder untuk aplikasi
sudo mkdir -p /var/www
cd /var/www

# Clone repository
sudo git clone https://github.com/username/cbt-smk-premium.git
# Atau jika private repo, gunakan SSH key atau token

# Set ownership
sudo chown -R $USER:$USER /var/www/cbt-smk-premium
cd cbt-smk-premium
```

#### **Metode B: Via SCP/SFTP (Upload dari lokal)**

```bash
# Dari komputer lokal (Windows/Mac/Linux)
# Compress folder dulu
tar -czf cbt-smk-premium.tar.gz cbt-smk-premium/

# Upload ke VPS
scp cbt-smk-premium.tar.gz root@your-vps-ip:/var/www/

# Di VPS, extract
cd /var/www
tar -xzf cbt-smk-premium.tar.gz
cd cbt-smk-premium
```

---

### **STEP 7: Install Dependencies**

```bash
cd /var/www/cbt-smk-premium

# Install npm packages
npm install --production

# Jika ada error, coba:
npm install --legacy-peer-deps
```

---

### **STEP 8: Setup Environment Variables**

```bash
# Copy .env.example ke .env
cp .env.example .env

# Edit .env
nano .env

# Isi dengan konfigurasi:
NODE_ENV=production
PORT=3000
SESSION_SECRET=ganti_dengan_random_string_panjang_minimal_32_karakter

DB_HOST=localhost
DB_PORT=3306
DB_USER=cbt_user
DB_PASSWORD=password_kuat_123
DB_NAME=cbt_smk

# Redis (opsional, comment jika tidak pakai)
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=

# Save: Ctrl+O, Enter, Ctrl+X
```

**Generate SESSION_SECRET:**
```bash
# Generate random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy hasilnya ke SESSION_SECRET
```

---

### **STEP 9: Import Database**

```bash
# Jika punya file SQL dump
mysql -u cbt_user -p cbt_smk < database.sql

# Atau jika ada migration
mysql -u cbt_user -p cbt_smk < create-submission-backup-table.sql

# Verify
mysql -u cbt_user -p cbt_smk -e "SHOW TABLES;"
```

---

### **STEP 10: Test Aplikasi**

```bash
# Test run manual
npm start

# Buka browser: http://your-vps-ip:3000
# Jika berfungsi, stop dengan Ctrl+C
```

---

### **STEP 11: Setup PM2 (Process Manager)**

```bash
# Start aplikasi dengan PM2
pm2 start src/server.js --name cbt-smk

# Save PM2 config
pm2 save

# Setup auto-start on boot
pm2 startup systemd
# Copy-paste command yang muncul dan jalankan

# Check status
pm2 status
pm2 logs cbt-smk

# Useful PM2 commands:
# pm2 restart cbt-smk
# pm2 stop cbt-smk
# pm2 delete cbt-smk
# pm2 monit
```

---

### **STEP 12: Install Nginx (Reverse Proxy)**

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/cbt-smk

# Paste konfigurasi ini:
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    # Atau pakai IP: server_name 123.456.789.0;

    # Increase upload size for file uploads
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location /public {
        alias /var/www/cbt-smk-premium/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Save: Ctrl+O, Enter, Ctrl+X

# Enable site
sudo ln -s /etc/nginx/sites-available/cbt-smk /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

---

### **STEP 13: Setup SSL dengan Let's Encrypt (Opsional)**

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Jawab pertanyaan:
# - Email: your-email@example.com
# - Agree to terms: Yes
# - Share email: No (optional)
# - Redirect HTTP to HTTPS: Yes (recommended)

# Test auto-renewal
sudo certbot renew --dry-run

# Certificate akan auto-renew setiap 90 hari
```

---

### **STEP 14: Setup Backup Otomatis**

```bash
# Buat folder backup
sudo mkdir -p /var/backups/cbt-smk

# Buat script backup
sudo nano /usr/local/bin/backup-cbt.sh
```

```bash
#!/bin/bash
# Backup script for CBT SMK

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/cbt-smk"
DB_USER="cbt_user"
DB_PASS="password_kuat_123"
DB_NAME="cbt_smk"

# Backup database
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup uploads folder
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/cbt-smk-premium/public/uploads

# Keep only last 7 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
# Save dan buat executable
sudo chmod +x /usr/local/bin/backup-cbt.sh

# Test backup
sudo /usr/local/bin/backup-cbt.sh

# Setup cron job (backup setiap hari jam 2 pagi)
sudo crontab -e

# Tambahkan baris ini:
0 2 * * * /usr/local/bin/backup-cbt.sh >> /var/log/cbt-backup.log 2>&1

# Save: Ctrl+O, Enter, Ctrl+X
```

---

### **STEP 15: Setup Monitoring**

```bash
# Install htop untuk monitoring
sudo apt install -y htop

# Monitor resources
htop

# Monitor PM2
pm2 monit

# Monitor logs
pm2 logs cbt-smk -f

# Monitor Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

### **STEP 16: Optimasi Performance**

#### **A. MySQL Optimization**

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Tambahkan di [mysqld]:
max_connections = 200
innodb_buffer_pool_size = 512M
innodb_log_file_size = 128M
query_cache_size = 32M
query_cache_limit = 2M

# Restart MySQL
sudo systemctl restart mysql
```

#### **B. Node.js Optimization**

```bash
# Edit PM2 config untuk multiple instances
pm2 delete cbt-smk

# Start dengan cluster mode (2 instances)
pm2 start src/server.js --name cbt-smk -i 2

# Save
pm2 save
```

#### **C. Nginx Optimization**

```bash
sudo nano /etc/nginx/nginx.conf

# Edit:
worker_processes auto;
worker_connections 2048;

# Restart Nginx
sudo systemctl restart nginx
```

---

## ✅ Verifikasi Deployment

### **1. Cek Aplikasi Running**

```bash
# PM2 status
pm2 status
# Should show: cbt-smk | online

# Cek port
sudo netstat -tulpn | grep :3000
# Should show node process

# Cek Nginx
sudo systemctl status nginx
# Should show: active (running)
```

### **2. Test dari Browser**

```
# Tanpa domain
http://your-vps-ip

# Dengan domain
http://your-domain.com

# Dengan SSL
https://your-domain.com
```

### **3. Test Login**

```
1. Buka aplikasi di browser
2. Login dengan user admin/teacher/student
3. Test fitur-fitur utama
4. Cek logs: pm2 logs cbt-smk
```

---

## 🔧 Troubleshooting

### **Problem: Port 3000 sudah digunakan**

```bash
# Cari process yang pakai port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Atau ganti port di .env
nano .env
# PORT=3001
```

### **Problem: Database connection error**

```bash
# Cek MySQL running
sudo systemctl status mysql

# Cek user dan password
mysql -u cbt_user -p cbt_smk

# Cek .env
cat .env | grep DB_
```

### **Problem: Nginx 502 Bad Gateway**

```bash
# Cek aplikasi running
pm2 status

# Cek logs
pm2 logs cbt-smk
sudo tail -f /var/log/nginx/error.log

# Restart aplikasi
pm2 restart cbt-smk
```

### **Problem: Permission denied**

```bash
# Fix ownership
sudo chown -R $USER:$USER /var/www/cbt-smk-premium

# Fix uploads folder
sudo chmod -R 755 /var/www/cbt-smk-premium/public/uploads
```

### **Problem: Out of memory**

```bash
# Cek memory
free -h

# Buat swap file (jika RAM < 2GB)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 📊 Monitoring & Maintenance

### **Daily Checks:**

```bash
# Cek status aplikasi
pm2 status

# Cek disk space
df -h

# Cek memory
free -h

# Cek logs
pm2 logs cbt-smk --lines 50
```

### **Weekly Checks:**

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Cek backup
ls -lh /var/backups/cbt-smk/

# Restart aplikasi (untuk clear memory)
pm2 restart cbt-smk
```

### **Monthly Checks:**

```bash
# Optimize database
mysql -u cbt_user -p cbt_smk -e "OPTIMIZE TABLE attempts, submissions, users;"

# Clean old logs
pm2 flush

# Check SSL certificate
sudo certbot certificates
```

---

## 🚀 Update Aplikasi

```bash
# Masuk ke folder aplikasi
cd /var/www/cbt-smk-premium

# Backup dulu
sudo /usr/local/bin/backup-cbt.sh

# Pull update dari git
git pull origin main

# Install dependencies baru (jika ada)
npm install --production

# Restart aplikasi
pm2 restart cbt-smk

# Monitor logs
pm2 logs cbt-smk -f
```

---

## 📝 Checklist Deployment

- [ ] VPS Ubuntu 24 ready
- [ ] SSH access configured
- [ ] System updated
- [ ] Node.js 20 installed
- [ ] MySQL 8 installed
- [ ] Database created
- [ ] Firewall configured
- [ ] Aplikasi cloned/uploaded
- [ ] Dependencies installed
- [ ] .env configured
- [ ] Database imported
- [ ] PM2 configured
- [ ] Nginx installed & configured
- [ ] SSL certificate installed (optional)
- [ ] Backup script setup
- [ ] Monitoring setup
- [ ] Test aplikasi berfungsi
- [ ] Domain pointing (if using domain)

---

## 🎯 Quick Commands Reference

```bash
# Start/Stop/Restart
pm2 start cbt-smk
pm2 stop cbt-smk
pm2 restart cbt-smk

# Logs
pm2 logs cbt-smk
pm2 logs cbt-smk --lines 100

# Monitor
pm2 monit
htop

# Nginx
sudo systemctl restart nginx
sudo nginx -t

# MySQL
sudo systemctl restart mysql
mysql -u cbt_user -p cbt_smk

# Backup
sudo /usr/local/bin/backup-cbt.sh

# Update
cd /var/www/cbt-smk-premium && git pull && npm install && pm2 restart cbt-smk
```

---

## 🆘 Emergency Contacts

**Jika ada masalah serius:**

1. Cek logs: `pm2 logs cbt-smk`
2. Cek status: `pm2 status`
3. Restart: `pm2 restart cbt-smk`
4. Rollback: Restore dari backup
5. Contact: Developer/Sysadmin

---

## ✅ Deployment Selesai!

Aplikasi sekarang sudah running di VPS Ubuntu 24! 🎉

**Akses:**
- HTTP: `http://your-domain.com` atau `http://your-vps-ip`
- HTTPS: `https://your-domain.com` (jika SSL enabled)

**Next Steps:**
1. Test semua fitur
2. Setup monitoring alerts
3. Train admin/teacher
4. Dokumentasi untuk user

**Good luck! 🚀**

---

*Last Updated: 14 Maret 2026*
