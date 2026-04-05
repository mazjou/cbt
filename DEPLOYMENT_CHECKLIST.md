# ✅ Deployment Checklist - VPS Ubuntu 24

## 📋 Pre-Deployment

- [ ] VPS Ubuntu 24.04 LTS ready
- [ ] SSH access configured (root atau sudo user)
- [ ] Domain name ready (optional)
- [ ] VPS specs: Min 2GB RAM, 2 CPU, 20GB storage
- [ ] Backup existing data (if any)

---

## 🔧 System Setup

- [ ] SSH ke VPS: `ssh root@your-vps-ip`
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Install tools: `sudo apt install -y curl wget git vim nano htop ufw`
- [ ] Install Node.js 20: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`
- [ ] Verify Node: `node --version` (should be v20.x.x)
- [ ] Install PM2: `sudo npm install -g pm2`

---

## 🗄️ Database Setup

- [ ] Install MySQL: `sudo apt install -y mysql-server`
- [ ] Secure MySQL: `sudo mysql_secure_installation`
- [ ] Create database: `CREATE DATABASE cbt_smk;`
- [ ] Create user: `CREATE USER 'cbt_user'@'localhost' IDENTIFIED BY 'password';`
- [ ] Grant privileges: `GRANT ALL PRIVILEGES ON cbt_smk.* TO 'cbt_user'@'localhost';`
- [ ] Test connection: `mysql -u cbt_user -p cbt_smk`

---

## 🔒 Security Setup

- [ ] Enable firewall: `sudo ufw enable`
- [ ] Allow SSH: `sudo ufw allow 22/tcp`
- [ ] Allow HTTP: `sudo ufw allow 80/tcp`
- [ ] Allow HTTPS: `sudo ufw allow 443/tcp`
- [ ] Allow app port: `sudo ufw allow 3000/tcp`
- [ ] Check status: `sudo ufw status`

---

## 📦 Application Setup

- [ ] Create app directory: `sudo mkdir -p /var/www`
- [ ] Clone repository: `git clone <repo-url> /var/www/cbt-smk-premium`
- [ ] Set ownership: `sudo chown -R $USER:$USER /var/www/cbt-smk-premium`
- [ ] Install dependencies: `cd /var/www/cbt-smk-premium && npm install --production`
- [ ] Copy .env: `cp .env.example .env`
- [ ] Edit .env: `nano .env`
- [ ] Generate SESSION_SECRET: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Import database: `mysql -u cbt_user -p cbt_smk < database.sql`
- [ ] Run migration: `mysql -u cbt_user -p cbt_smk < create-submission-backup-table.sql`

---

## 🚀 PM2 Setup

- [ ] Start app: `pm2 start src/server.js --name cbt-smk`
- [ ] Save config: `pm2 save`
- [ ] Setup startup: `pm2 startup systemd`
- [ ] Run startup command (copy from output)
- [ ] Check status: `pm2 status`
- [ ] Test logs: `pm2 logs cbt-smk`

---

## 🌐 Nginx Setup

- [ ] Install Nginx: `sudo apt install -y nginx`
- [ ] Create config: `sudo nano /etc/nginx/sites-available/cbt-smk`
- [ ] Paste Nginx config (see DEPLOY_VPS_UBUNTU_24.md)
- [ ] Enable site: `sudo ln -s /etc/nginx/sites-available/cbt-smk /etc/nginx/sites-enabled/`
- [ ] Remove default: `sudo rm /etc/nginx/sites-enabled/default`
- [ ] Test config: `sudo nginx -t`
- [ ] Restart Nginx: `sudo systemctl restart nginx`
- [ ] Enable on boot: `sudo systemctl enable nginx`

---

## 🔐 SSL Setup (Optional)

- [ ] Install Certbot: `sudo apt install -y certbot python3-certbot-nginx`
- [ ] Get certificate: `sudo certbot --nginx -d your-domain.com`
- [ ] Test auto-renewal: `sudo certbot renew --dry-run`

---

## 💾 Backup Setup

- [ ] Create backup dir: `sudo mkdir -p /var/backups/cbt-smk`
- [ ] Create backup script: `sudo nano /usr/local/bin/backup-cbt.sh`
- [ ] Paste backup script (see DEPLOY_VPS_UBUNTU_24.md)
- [ ] Make executable: `sudo chmod +x /usr/local/bin/backup-cbt.sh`
- [ ] Test backup: `sudo /usr/local/bin/backup-cbt.sh`
- [ ] Setup cron: `sudo crontab -e`
- [ ] Add cron job: `0 2 * * * /usr/local/bin/backup-cbt.sh >> /var/log/cbt-backup.log 2>&1`

---

## ✅ Verification

- [ ] PM2 status: `pm2 status` (should show "online")
- [ ] Port check: `sudo netstat -tulpn | grep :3000`
- [ ] Nginx status: `sudo systemctl status nginx`
- [ ] Open browser: `http://your-domain.com` or `http://your-vps-ip`
- [ ] Test login with admin account
- [ ] Test create exam
- [ ] Test student submission
- [ ] Check logs: `pm2 logs cbt-smk`
- [ ] Check Nginx logs: `sudo tail -f /var/log/nginx/access.log`

---

## 🎯 Post-Deployment

- [ ] Update DNS (if using domain)
- [ ] Test from different devices
- [ ] Setup monitoring alerts
- [ ] Document admin credentials
- [ ] Train admin/teachers
- [ ] Create user documentation
- [ ] Schedule regular backups
- [ ] Plan maintenance windows

---

## 📊 Monitoring Setup

- [ ] Install monitoring tools: `sudo apt install -y htop`
- [ ] Setup PM2 monitoring: `pm2 monit`
- [ ] Check disk space: `df -h`
- [ ] Check memory: `free -h`
- [ ] Setup log rotation (if needed)

---

## 🔧 Optimization (Optional)

- [ ] MySQL optimization (edit /etc/mysql/mysql.conf.d/mysqld.cnf)
- [ ] PM2 cluster mode: `pm2 start src/server.js -i 2 --name cbt-smk`
- [ ] Nginx optimization (edit /etc/nginx/nginx.conf)
- [ ] Setup CDN (if needed)
- [ ] Enable Gzip compression

---

## 📝 Documentation

- [ ] Document server IP/domain
- [ ] Document database credentials
- [ ] Document admin credentials
- [ ] Document backup location
- [ ] Document update procedure
- [ ] Document rollback procedure
- [ ] Create runbook for common issues

---

## 🆘 Emergency Contacts

- [ ] Developer contact: _______________
- [ ] Sysadmin contact: _______________
- [ ] VPS provider support: _______________
- [ ] Domain registrar: _______________

---

## 📅 Maintenance Schedule

- [ ] Daily: Check PM2 status, disk space, logs
- [ ] Weekly: Update system packages, restart app
- [ ] Monthly: Database optimization, backup verification
- [ ] Quarterly: Security audit, performance review

---

## ✅ Deployment Complete!

**Date:** _______________  
**Deployed by:** _______________  
**Server IP:** _______________  
**Domain:** _______________  
**Notes:** _______________

---

**Signature:** _______________

---

*Print this checklist and check off items as you complete them!*
