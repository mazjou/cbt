# ⚡ Quick Start: Deploy ke VPS Ubuntu 24

## 🚀 Cara Tercepat (5 Menit)

### **1. Koneksi ke VPS**
```bash
ssh root@your-vps-ip
```

### **2. Download & Run Auto Deploy Script**
```bash
# Download script
wget https://raw.githubusercontent.com/your-repo/cbt-smk-premium/main/deploy-vps.sh

# Atau jika sudah clone repo:
cd /path/to/cbt-smk-premium
chmod +x deploy-vps.sh

# Run script
bash deploy-vps.sh
```

Script akan otomatis:
- ✅ Update system
- ✅ Install Node.js 20
- ✅ Install MySQL 8
- ✅ Setup firewall
- ✅ Clone repository
- ✅ Install dependencies
- ✅ Setup PM2
- ✅ Install & configure Nginx
- ✅ Setup SSL (optional)
- ✅ Setup backup (optional)

### **3. Edit Konfigurasi**
```bash
cd /var/www/cbt-smk-premium
nano .env

# Isi:
DB_USER=cbt_user
DB_PASSWORD=your_password
DB_NAME=cbt_smk
SESSION_SECRET=your_random_secret
```

### **4. Restart & Test**
```bash
pm2 restart cbt-smk
pm2 logs cbt-smk

# Buka browser:
# http://your-domain.com
```

---

## 📋 Manual Install (Step by Step)

Jika prefer manual, ikuti: **DEPLOY_VPS_UBUNTU_24.md**

---

## 🔧 Troubleshooting Cepat

### Port 3000 sudah digunakan
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
pm2 restart cbt-smk
```

### Database error
```bash
mysql -u cbt_user -p cbt_smk
# Test connection
```

### Nginx 502
```bash
pm2 restart cbt-smk
sudo systemctl restart nginx
```

---

## 📞 Need Help?

Baca dokumentasi lengkap: **DEPLOY_VPS_UBUNTU_24.md**

---

**Selesai! Aplikasi sudah online! 🎉**
