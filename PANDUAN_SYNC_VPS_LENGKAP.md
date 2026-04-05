# Panduan Lengkap: Sinkronisasi Otomatis ke VPS

## 📋 Langkah-Langkah (Step by Step)

### LANGKAH 1: Setup SSH Key (Sekali Saja)

#### 1.1 Buka PowerShell di Folder Project
```
Klik kanan di folder project → "Open in Terminal" atau "Open PowerShell window here"
```

Atau:
```powershell
# Navigasi ke folder project
cd "E:\nodejs\cbt-smk-premium_wysiwyg-materi1_with-modal-masterdata-and-xlsx-templates_fix-classes-ejs\cbt-smk-premium"
```

#### 1.2 Jalankan Script Setup SSH Key
```powershell
.\setup-ssh-key.ps1
```

**Jika muncul error "cannot be loaded because running scripts is disabled":**
```powershell
# Jalankan ini dulu (sekali saja):
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Lalu jalankan lagi:
.\setup-ssh-key.ps1
```

#### 1.3 Masukkan Password VPS
Script akan minta password VPS Anda. Masukkan password root VPS (10.10.102.15).

**Hasil yang diharapkan:**
```
✅ SSH key berhasil di-setup!
🎉 Setup selesai! Sekarang Anda bisa SSH tanpa password.
```

---

### LANGKAH 2: Edit Konfigurasi Sync

#### 2.1 Buka File sync-to-vps.ps1
```powershell
notepad sync-to-vps.ps1
```

#### 2.2 Sesuaikan Konfigurasi
Cari baris ini di bagian atas file:
```powershell
$VPS_HOST = "10.10.102.15"
$VPS_USER = "root"  # Ganti jika username VPS Anda bukan root
$VPS_PATH = "/var/www/lms-smkn1kras"  # Ganti dengan path aplikasi di VPS
```

**Contoh jika path di VPS berbeda:**
```powershell
$VPS_PATH = "/home/user/aplikasi"  # Sesuaikan dengan path Anda
```

#### 2.3 Save File
Tekan `Ctrl+S` lalu tutup Notepad.

---

### LANGKAH 3: Jalankan Sync Pertama Kali

#### 3.1 Jalankan Script Sync
```powershell
.\sync-to-vps.ps1
```

**Proses yang terjadi:**
1. 📦 Membuat archive file (exclude node_modules, .git, dll)
2. 📤 Upload ke VPS
3. 📂 Extract di VPS
4. 🔄 Restart aplikasi dengan PM2

**Hasil yang diharapkan:**
```
✅ Upload berhasil!
✅ Aplikasi berhasil di-update dan restart!
```

---

### LANGKAH 4: Sync Berikutnya (Setiap Ada Perubahan)

Setiap kali Anda ubah code dan ingin sync ke VPS:

```powershell
.\sync-to-vps.ps1
```

**Selesai!** File akan otomatis ter-upload dan aplikasi restart.

---

## 🚀 Cara Cepat (Setelah Setup)

### Sync Manual (Sekali Klik)
```powershell
.\sync-to-vps.ps1
```

### Atau Buat Shortcut
1. Klik kanan `sync-to-vps.ps1` → "Create shortcut"
2. Rename shortcut jadi "Sync ke VPS"
3. Double-click shortcut untuk sync

---

## ⚡ Opsi Auto-Sync (Advanced)

### Opsi A: Sync Otomatis Saat Save File (VS Code)

#### 1. Install Extension SFTP
- Buka VS Code
- Tekan `Ctrl+Shift+X`
- Cari "SFTP"
- Install extension "SFTP" by Natizyskunk

#### 2. Buat File Konfigurasi
Buat folder `.vscode` (jika belum ada), lalu buat file `.vscode/sftp.json`:

```json
{
  "name": "VPS SMKN 1 Kras",
  "host": "10.10.102.15",
  "protocol": "sftp",
  "port": 22,
  "username": "root",
  "privateKeyPath": "C:\\Users\\YourUsername\\.ssh\\id_rsa",
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

**Ganti:**
- `YourUsername` dengan username Windows Anda
- `remotePath` dengan path di VPS

#### 3. Selesai!
Sekarang setiap kali Anda save file (Ctrl+S), otomatis upload ke VPS.

---

### Opsi B: File Watcher (Auto Sync Saat Ada Perubahan)

#### 1. Install nodemon
```powershell
npm install -g nodemon
```

#### 2. Tambahkan Script ke package.json
Buka `package.json`, tambahkan di bagian `scripts`:

```json
{
  "scripts": {
    "sync": "powershell -File sync-to-vps.ps1",
    "sync:watch": "nodemon --watch src --watch package.json --exec \"npm run sync\""
  }
}
```

#### 3. Jalankan Watch Mode
```powershell
npm run sync:watch
```

Biarkan terminal terbuka. Setiap ada perubahan file di folder `src`, otomatis sync ke VPS.

---

## 🔧 Troubleshooting

### Error: "running scripts is disabled"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Error: "ssh: connect to host 10.10.102.15 port 22: Connection refused"
```powershell
# Cek apakah VPS bisa di-ping
ping 10.10.102.15

# Jika tidak bisa ping, cek koneksi jaringan
```

### Error: "Permission denied (publickey)"
```powershell
# Jalankan ulang setup SSH key
.\setup-ssh-key.ps1
```

### Sync Terlalu Lama
Pastikan `node_modules` sudah di-exclude. Cek file `sync-to-vps.ps1`, seharusnya ada:
```powershell
--exclude=node_modules
```

### Aplikasi Tidak Restart Setelah Sync
Login ke VPS dan restart manual:
```bash
ssh root@10.10.102.15
pm2 restart lms-smkn1kras
```

---

## 📝 Checklist Setup

- [ ] Jalankan `.\setup-ssh-key.ps1` (masukkan password VPS)
- [ ] Edit `sync-to-vps.ps1` (sesuaikan VPS_USER dan VPS_PATH)
- [ ] Test sync pertama: `.\sync-to-vps.ps1`
- [ ] Cek aplikasi di VPS: buka browser ke IP VPS
- [ ] (Opsional) Setup auto-sync dengan VS Code SFTP atau nodemon

---

## 🎯 Quick Commands

```powershell
# Setup SSH key (sekali saja)
.\setup-ssh-key.ps1

# Sync ke VPS
.\sync-to-vps.ps1

# Test koneksi SSH
ssh root@10.10.102.15 "echo 'OK'"

# Restart aplikasi di VPS
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"

# Cek status aplikasi di VPS
ssh root@10.10.102.15 "pm2 status"

# Cek log aplikasi di VPS
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"
```

---

## ⚠️ Catatan Penting

1. **Jangan sync file `.env`** - Sudah di-exclude otomatis
2. **Jangan sync folder `node_modules`** - Install di VPS dengan `npm install`
3. **Jangan sync folder `uploads`** - Berisi data user
4. **Backup database** sebelum update besar
5. **Test di local** sebelum sync ke production

---

## 📞 Bantuan

Jika masih ada masalah:

1. Cek file `SETUP_SSH_KEY_WINDOWS.md` untuk troubleshooting SSH
2. Cek file `CARA_SINKRON_OTOMATIS_VPS.md` untuk opsi lain
3. Atau tanya saya lagi 😊
