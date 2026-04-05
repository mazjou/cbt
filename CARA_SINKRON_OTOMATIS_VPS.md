# Cara Sinkronisasi Otomatis ke VPS

## Informasi VPS
- **IP Address:** 10.10.102.15
- **User:** root (atau user lain yang Anda gunakan)
- **Path:** /var/www/lms-smkn1kras (sesuaikan dengan path di VPS)

## Prasyarat

### 1. Setup SSH Key (Agar Tidak Perlu Password)
```bash
# Di Windows (PowerShell atau Git Bash)
ssh-keygen -t rsa -b 4096

# Copy public key ke VPS
ssh-copy-id root@10.10.102.15

# Atau manual:
# 1. Buka file: C:\Users\YourUsername\.ssh\id_rsa.pub
# 2. Copy isinya
# 3. Login ke VPS dan paste ke: ~/.ssh/authorized_keys
```

### 2. Install Tools yang Diperlukan

**Windows:**
- OpenSSH Client (sudah built-in di Windows 10+)
- Git Bash (untuk rsync) - Download dari https://git-scm.com/

**Atau gunakan WSL (Windows Subsystem for Linux):**
```powershell
wsl --install
```

## Opsi 1: Manual Sync dengan Script

### Menggunakan PowerShell (Windows Native)
```powershell
# Edit file sync-to-vps.ps1 terlebih dahulu
# Sesuaikan VPS_USER dan VPS_PATH

# Jalankan script
.\sync-to-vps.ps1
```

### Menggunakan Bash (Git Bash / WSL)
```bash
# Edit file sync-to-vps.sh terlebih dahulu
# Sesuaikan VPS_USER dan VPS_PATH

# Beri permission execute
chmod +x sync-to-vps.sh

# Jalankan script
./sync-to-vps.sh
```

## Opsi 2: Auto Sync dengan File Watcher

### Menggunakan nodemon untuk Auto Sync
```bash
# Install nodemon global
npm install -g nodemon

# Buat script package.json
npm run sync:watch
```

Tambahkan ke `package.json`:
```json
{
  "scripts": {
    "sync": "bash sync-to-vps.sh",
    "sync:watch": "nodemon --watch src --watch package.json --exec 'npm run sync'"
  }
}
```

## Opsi 3: Sync Saat Git Push (Recommended)

### Setup Git Hook
Buat file `.git/hooks/post-commit`:

```bash
#!/bin/bash
echo "🔄 Auto-syncing to VPS after commit..."
bash sync-to-vps.sh
```

Beri permission:
```bash
chmod +x .git/hooks/post-commit
```

Sekarang setiap kali Anda commit, otomatis sync ke VPS.

## Opsi 4: Menggunakan VS Code Extension

### Install Extension: SFTP
1. Install extension "SFTP" by Natizyskunk
2. Buat file `.vscode/sftp.json`:

```json
{
  "name": "VPS SMKN 1 Kras",
  "host": "10.10.102.15",
  "protocol": "sftp",
  "port": 22,
  "username": "root",
  "remotePath": "/var/www/lms-smkn1kras",
  "uploadOnSave": true,
  "ignore": [
    ".vscode",
    ".git",
    "node_modules",
    ".env",
    "*.log",
    "src/public/uploads"
  ]
}
```

3. Setiap kali save file, otomatis upload ke VPS

## Opsi 5: Continuous Deployment dengan GitHub Actions

Jika menggunakan GitHub:

Buat file `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Deploy to VPS
      uses: appleboy/ssh-action@master
      with:
        host: 10.10.102.15
        username: root
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /var/www/lms-smkn1kras
          git pull origin main
          npm install
          pm2 restart lms-smkn1kras
```

## Cara Penggunaan Cepat

### Sync Manual (Sekali Klik)
```bash
# Windows PowerShell
.\sync-to-vps.ps1

# Git Bash / WSL
./sync-to-vps.sh
```

### Sync Otomatis (File Watcher)
```bash
npm run sync:watch
```

Biarkan terminal terbuka, setiap ada perubahan file otomatis sync.

## Troubleshooting

### Error: Permission Denied
```bash
# Pastikan SSH key sudah di-setup
ssh-copy-id root@10.10.102.15

# Atau cek permission
chmod 600 ~/.ssh/id_rsa
```

### Error: rsync command not found (Windows)
```bash
# Install Git Bash atau gunakan WSL
# Atau gunakan script PowerShell (sync-to-vps.ps1)
```

### Error: Connection Refused
```bash
# Cek apakah VPS bisa di-ping
ping 10.10.102.15

# Cek apakah SSH port terbuka
telnet 10.10.102.15 22
```

### Sync Terlalu Lama
```bash
# Pastikan exclude node_modules dan folder besar lainnya
# Edit script dan tambahkan --exclude
```

## File yang Perlu Disesuaikan

Sebelum menjalankan sync, edit file berikut:

1. **sync-to-vps.sh** atau **sync-to-vps.ps1**
   - `VPS_USER`: Username VPS Anda
   - `VPS_PATH`: Path aplikasi di VPS

2. **.vscode/sftp.json** (jika pakai VS Code)
   - `username`: Username VPS
   - `remotePath`: Path aplikasi di VPS

## Rekomendasi

Untuk development yang nyaman:

1. **Gunakan VS Code SFTP Extension** - Upload otomatis saat save
2. **Atau gunakan File Watcher** - `npm run sync:watch`
3. **Untuk production** - Gunakan Git + GitHub Actions

## Catatan Penting

- ⚠️ Jangan sync file `.env` (sudah di-exclude)
- ⚠️ Jangan sync folder `node_modules` (install di VPS)
- ⚠️ Jangan sync folder `uploads` (data user)
- ✅ Setelah sync, aplikasi otomatis restart dengan PM2
- ✅ Backup database sebelum update besar

## Quick Reference

```bash
# Sync sekali
./sync-to-vps.sh

# Sync otomatis (watch mode)
npm run sync:watch

# Sync + commit
git add .
git commit -m "Update"
# Auto sync via git hook

# Manual restart di VPS
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"
```
