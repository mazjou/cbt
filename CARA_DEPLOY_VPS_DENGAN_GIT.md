# Cara Deploy ke VPS dengan Git

## 📋 Persiapan

### 1. Repository GitHub
- ✅ Repository: https://github.com/tinoguntech-max/cbt-smk-premium
- ✅ Sudah terhubung dari local

### 2. VPS
- IP: 10.10.102.15
- User: root
- Path aplikasi: `/var/www/lms-smkn1kras` (sesuaikan jika berbeda)

---

## 🚀 Cara 1: Deploy Manual (Step by Step)

### Step 1: Push ke GitHub dari Windows

```powershell
# 1. Cek status perubahan
git status

# 2. Add semua perubahan
git add .

# 3. Commit dengan pesan
git commit -m "Update: tambah fitur admin tugas & bank soal + bulk delete"

# 4. Push ke GitHub
git push origin main
```

**Jika branch Anda bukan `main`, ganti dengan nama branch Anda (misal: `master`)**

### Step 2: Pull di VPS

```bash
# 1. Login ke VPS
ssh root@10.10.102.15

# 2. Masuk ke folder aplikasi
cd /var/www/lms-smkn1kras

# 3. Pull perubahan dari GitHub
git pull origin main

# 4. Install dependencies baru (jika ada)
npm install

# 5. Restart aplikasi
pm2 restart lms-smkn1kras

# 6. Cek status
pm2 status
```

### Step 3: Update Database (Jika Ada Perubahan)

```bash
# Jika ada perubahan database, jalankan migration
mysql -u root -p lms_smk < sql/update_vps_database.sql
```

---

## 🚀 Cara 2: Deploy Otomatis dengan Script

### Script untuk Windows (deploy-to-vps.ps1)

Saya akan buatkan script otomatis untuk Anda.

---

## 📝 Setup Awal (Sekali Saja)

### 1. Setup Git di VPS

```bash
# Login ke VPS
ssh root@10.10.102.15

# Cek apakah git sudah terinstall
git --version

# Jika belum, install git
apt update
apt install git -y

# Clone repository (jika belum ada)
cd /var/www
git clone https://github.com/tinoguntech-max/cbt-smk-premium.git lms-smkn1kras

# Atau jika sudah ada, pastikan terhubung ke GitHub
cd /var/www/lms-smkn1kras
git remote -v

# Jika belum terhubung, tambahkan remote
git remote add origin https://github.com/tinoguntech-max/cbt-smk-premium.git
```

### 2. Setup .env di VPS

```bash
# Copy .env.example ke .env
cd /var/www/lms-smkn1kras
cp .env.example .env

# Edit .env sesuai konfigurasi VPS
nano .env
```

**Isi .env untuk VPS:**
```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=lms_smk

SESSION_SECRET=your_secret_key_here
REDIS_HOST=localhost
REDIS_PORT=6379

JITSI_DOMAIN=meet.jit.si
TZ=Asia/Jakarta
```

### 3. Install Dependencies di VPS

```bash
cd /var/www/lms-smkn1kras
npm install
```

### 4. Setup PM2 di VPS

```bash
# Install PM2 global (jika belum)
npm install -g pm2

# Start aplikasi dengan PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup PM2 startup
pm2 startup
```

---

## 🔄 Workflow Deploy Sehari-hari

### Dari Windows:

```powershell
# 1. Commit & Push perubahan
git add .
git commit -m "Deskripsi perubahan"
git push origin main
```

### Di VPS:

```bash
# 2. Pull & Restart
ssh root@10.10.102.15 "cd /var/www/lms-smkn1kras && git pull origin main && npm install && pm2 restart lms-smkn1kras"
```

**Atau lebih simple dengan script yang akan saya buatkan.**

---

## 🎯 Quick Commands

### Push dari Windows:
```powershell
git add .
git commit -m "Update fitur"
git push
```

### Deploy ke VPS (One Command):
```powershell
ssh root@10.10.102.15 "cd /var/www/lms-smkn1kras && git pull && npm install && pm2 restart lms-smkn1kras"
```

### Cek Status di VPS:
```powershell
ssh root@10.10.102.15 "pm2 status && pm2 logs lms-smkn1kras --lines 20"
```

---

## 🔧 Troubleshooting

### Error: "Permission denied (publickey)"

**Solusi 1: Gunakan HTTPS (Recommended)**
```bash
# Di VPS, ubah remote ke HTTPS
cd /var/www/lms-smkn1kras
git remote set-url origin https://github.com/tinoguntech-max/cbt-smk-premium.git
```

**Solusi 2: Setup SSH Key**
```bash
# Di VPS, generate SSH key
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_rsa.pub

# Tambahkan ke GitHub:
# 1. Buka https://github.com/settings/keys
# 2. Klik "New SSH key"
# 3. Paste public key
```

### Error: "Your local changes would be overwritten"

```bash
# Di VPS, stash perubahan lokal
cd /var/www/lms-smkn1kras
git stash
git pull
git stash pop
```

### Error: "npm install failed"

```bash
# Di VPS, clear cache dan install ulang
cd /var/www/lms-smkn1kras
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Aplikasi Tidak Restart

```bash
# Di VPS, restart manual
ssh root@10.10.102.15
pm2 restart lms-smkn1kras

# Atau kill dan start ulang
pm2 delete lms-smkn1kras
pm2 start ecosystem.config.js
```

---

## 📊 Perbandingan: Git vs Rsync

| Fitur | Git | Rsync/SCP |
|-------|-----|-----------|
| Version Control | ✅ Ya | ❌ Tidak |
| Rollback | ✅ Mudah | ❌ Sulit |
| Collaboration | ✅ Ya | ❌ Tidak |
| Selective Sync | ✅ Ya | ⚠️ Manual |
| Speed | ⚠️ Sedang | ✅ Cepat |
| Setup | ⚠️ Perlu setup | ✅ Simple |

**Rekomendasi: Gunakan Git untuk production!**

---

## 🔐 Keamanan

### 1. Jangan Commit File Sensitif

Pastikan `.gitignore` sudah benar:
```
node_modules/
.env
*.log
src/public/uploads/
.kiro/
*.sql
backup_*.sql
```

### 2. Gunakan Environment Variables

Jangan hardcode password/secret di code. Gunakan `.env`.

### 3. Gunakan Branch untuk Development

```bash
# Buat branch development
git checkout -b development

# Push ke branch development
git push origin development

# Di VPS, pull dari branch development
git pull origin development
```

---

## 📝 Checklist Deploy

- [ ] Commit semua perubahan di local
- [ ] Push ke GitHub
- [ ] Login ke VPS
- [ ] Pull perubahan dari GitHub
- [ ] Install dependencies baru (jika ada)
- [ ] Update database (jika ada perubahan)
- [ ] Restart aplikasi dengan PM2
- [ ] Cek status aplikasi
- [ ] Test di browser
- [ ] Cek log jika ada error

---

## 🎯 Best Practices

1. **Commit Sering**: Commit setiap fitur selesai
2. **Pesan Commit Jelas**: Gunakan pesan yang deskriptif
3. **Test di Local**: Test dulu sebelum push
4. **Backup Database**: Backup sebelum update besar
5. **Monitor Log**: Cek log setelah deploy
6. **Rollback Plan**: Siapkan cara rollback jika error

---

## 📞 Bantuan

Jika ada masalah:
1. Cek log aplikasi: `pm2 logs lms-smkn1kras`
2. Cek status PM2: `pm2 status`
3. Cek git status: `git status`
4. Atau tanya saya lagi 😊
