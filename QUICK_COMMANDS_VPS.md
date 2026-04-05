# Quick Commands VPS

Kumpulan command yang sering dipakai untuk manage VPS.

---

## 🔐 SSH & Koneksi

```bash
# Login ke VPS
ssh root@10.10.102.15

# Test koneksi
ping 10.10.102.15

# Test SSH tanpa login
ssh root@10.10.102.15 "echo OK"

# Copy file ke VPS
scp file.txt root@10.10.102.15:/root/

# Copy folder ke VPS
scp -r folder root@10.10.102.15:/root/
```

---

## 🗄️ Database

```bash
# Backup database
ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql"

# Restore database
ssh root@10.10.102.15 "mysql -u root -p lms_smk < backup_lms_smk.sql"

# Login MySQL
ssh root@10.10.102.15 "mysql -u root -p"

# Show databases
ssh root@10.10.102.15 "mysql -u root -p -e 'SHOW DATABASES;'"

# Show tables
ssh root@10.10.102.15 "mysql -u root -p lms_smk -e 'SHOW TABLES;'"

# Describe table
ssh root@10.10.102.15 "mysql -u root -p lms_smk -e 'DESCRIBE users;'"

# Count records
ssh root@10.10.102.15 "mysql -u root -p lms_smk -e 'SELECT COUNT(*) FROM users;'"

# Restart MySQL
ssh root@10.10.102.15 "systemctl restart mysql"

# Check MySQL status
ssh root@10.10.102.15 "systemctl status mysql"
```

---

## 🚀 PM2 (Aplikasi)

```bash
# Status aplikasi
ssh root@10.10.102.15 "pm2 status"

# Restart aplikasi
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"

# Stop aplikasi
ssh root@10.10.102.15 "pm2 stop lms-smkn1kras"

# Start aplikasi
ssh root@10.10.102.15 "pm2 start lms-smkn1kras"

# Lihat log (50 baris terakhir)
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"

# Lihat log error saja
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --err --lines 50"

# Clear log
ssh root@10.10.102.15 "pm2 flush lms-smkn1kras"

# Monitor real-time
ssh root@10.10.102.15 "pm2 monit"

# Info detail aplikasi
ssh root@10.10.102.15 "pm2 info lms-smkn1kras"

# Reload aplikasi (zero-downtime)
ssh root@10.10.102.15 "pm2 reload lms-smkn1kras"

# List semua aplikasi
ssh root@10.10.102.15 "pm2 list"
```

---

## 📁 File Management

```bash
# List files
ssh root@10.10.102.15 "ls -lah /var/www/lms-smkn1kras"

# Check disk space
ssh root@10.10.102.15 "df -h"

# Check folder size
ssh root@10.10.102.15 "du -sh /var/www/lms-smkn1kras"

# Find large files
ssh root@10.10.102.15 "find /var/www/lms-smkn1kras -type f -size +10M"

# Delete old backups (older than 7 days)
ssh root@10.10.102.15 "find /root/backup_*.sql -mtime +7 -delete"

# Check file permissions
ssh root@10.10.102.15 "ls -la /var/www/lms-smkn1kras"

# Change permissions
ssh root@10.10.102.15 "chmod -R 755 /var/www/lms-smkn1kras"

# Change owner
ssh root@10.10.102.15 "chown -R www-data:www-data /var/www/lms-smkn1kras"
```

---

## 🔧 System

```bash
# Check memory usage
ssh root@10.10.102.15 "free -h"

# Check CPU usage
ssh root@10.10.102.15 "top -bn1 | head -20"

# Check running processes
ssh root@10.10.102.15 "ps aux | grep node"

# Check port usage
ssh root@10.10.102.15 "netstat -tulpn | grep :3000"

# Check system uptime
ssh root@10.10.102.15 "uptime"

# Reboot VPS (HATI-HATI!)
ssh root@10.10.102.15 "reboot"

# Check system logs
ssh root@10.10.102.15 "tail -50 /var/log/syslog"
```

---

## 🌐 Nginx/Caddy

```bash
# Restart Nginx
ssh root@10.10.102.15 "systemctl restart nginx"

# Check Nginx status
ssh root@10.10.102.15 "systemctl status nginx"

# Test Nginx config
ssh root@10.10.102.15 "nginx -t"

# Restart Caddy
ssh root@10.10.102.15 "systemctl restart caddy"

# Check Caddy status
ssh root@10.10.102.15 "systemctl status caddy"

# View Caddy logs
ssh root@10.10.102.15 "journalctl -u caddy -n 50"
```

---

## 🔥 Redis

```bash
# Check Redis status
ssh root@10.10.102.15 "systemctl status redis"

# Restart Redis
ssh root@10.10.102.15 "systemctl restart redis"

# Redis CLI
ssh root@10.10.102.15 "redis-cli"

# Check Redis keys
ssh root@10.10.102.15 "redis-cli KEYS '*'"

# Clear all Redis data (HATI-HATI!)
ssh root@10.10.102.15 "redis-cli FLUSHALL"

# Check Redis memory
ssh root@10.10.102.15 "redis-cli INFO memory"
```

---

## 📦 Node.js & NPM

```bash
# Check Node version
ssh root@10.10.102.15 "node -v"

# Check NPM version
ssh root@10.10.102.15 "npm -v"

# Install dependencies
ssh root@10.10.102.15 "cd /var/www/lms-smkn1kras && npm install"

# Update dependencies
ssh root@10.10.102.15 "cd /var/www/lms-smkn1kras && npm update"

# Clear NPM cache
ssh root@10.10.102.15 "npm cache clean --force"
```

---

## 🔄 Update Aplikasi (All-in-One)

```bash
# Update database + sync files + restart
.\update-database-vps.ps1 ; .\sync-to-vps.ps1

# Atau manual step-by-step:
# 1. Backup database
ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql"

# 2. Update database
.\update-database-vps.ps1

# 3. Sync files
.\sync-to-vps.ps1

# 4. Check status
ssh root@10.10.102.15 "pm2 status"

# 5. Check logs
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 20"
```

---

## 🆘 Emergency Commands

```bash
# Kill all node processes (HATI-HATI!)
ssh root@10.10.102.15 "pkill -9 node"

# Restart all services
ssh root@10.10.102.15 "systemctl restart mysql && systemctl restart redis && pm2 restart all"

# Check if port 3000 is in use
ssh root@10.10.102.15 "lsof -i :3000"

# Kill process on port 3000
ssh root@10.10.102.15 "kill -9 \$(lsof -t -i:3000)"

# Restore from backup
ssh root@10.10.102.15 "mysql -u root -p lms_smk < backup_lms_smk.sql && pm2 restart lms-smkn1kras"
```

---

## 📊 Monitoring

```bash
# Real-time monitoring (htop)
ssh root@10.10.102.15 "htop"

# Watch PM2 status (refresh every 2 seconds)
watch -n 2 "ssh root@10.10.102.15 'pm2 status'"

# Watch logs real-time
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 0"

# Check last 100 lines of application log
ssh root@10.10.102.15 "tail -100 /var/www/lms-smkn1kras/logs/app.log"
```

---

## 💡 Tips

1. **Gunakan alias** untuk command yang sering dipakai:
   ```bash
   # Tambahkan ke ~/.bashrc atau PowerShell profile
   alias vps="ssh root@10.10.102.15"
   alias vps-logs="ssh root@10.10.102.15 'pm2 logs lms-smkn1kras --lines 50'"
   alias vps-restart="ssh root@10.10.102.15 'pm2 restart lms-smkn1kras'"
   ```

2. **Backup otomatis** dengan cron job di VPS:
   ```bash
   # Edit crontab
   ssh root@10.10.102.15 "crontab -e"
   
   # Tambahkan baris ini (backup setiap hari jam 2 pagi)
   0 2 * * * mysqldump -u root -pPASSWORD lms_smk > /root/backup_lms_smk_$(date +\%Y\%m\%d).sql
   ```

3. **Monitor dengan PM2 Plus** (opsional):
   ```bash
   ssh root@10.10.102.15 "pm2 link [secret] [public]"
   ```

---

## 📞 Bantuan

Jika command tidak bekerja:
1. Cek koneksi: `ping 10.10.102.15`
2. Cek SSH: `ssh root@10.10.102.15 "echo OK"`
3. Cek log: `ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"`
4. Atau tanya developer 😊
