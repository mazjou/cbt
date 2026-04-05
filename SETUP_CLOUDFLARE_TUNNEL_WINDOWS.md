# Setup Cloudflare Tunnel di Windows 11

## Panduan Lengkap Step-by-Step

Cloudflare Tunnel memungkinkan Anda mengonlinekan aplikasi dari laptop Windows tanpa port forwarding, dengan HTTPS otomatis dan gratis selamanya!

---

## Prerequisites

- ✅ Windows 11
- ✅ Node.js terinstall
- ✅ Aplikasi CBT sudah bisa jalan di `localhost:3000`
- ✅ Domain (contoh: `tam.web.id` atau `smknegeri1kras.sch.id`)
- ✅ Akun Cloudflare (gratis)

---

## Step 1: Daftar/Login Cloudflare

### 1.1 Buka Cloudflare

https://dash.cloudflare.com/sign-up

### 1.2 Tambahkan Domain

1. Klik "Add a Site"
2. Masukkan domain: `tam.web.id`
3. Pilih plan "Free"
4. Cloudflare akan scan DNS records
5. Klik "Continue"

### 1.3 Update Nameservers

Cloudflare akan memberikan 2 nameservers:
```
ns1.cloudflare.com
ns2.cloudflare.com
```

Update nameservers di domain provider Anda (tempat beli domain).

**Tunggu 5-30 menit** sampai nameservers aktif.

---

## Step 2: Install Cloudflared

### Opsi A: Download Manual (RECOMMENDED - Paling Mudah)

#### 2.1 Download File

1. Buka browser, kunjungi:
   ```
   https://github.com/cloudflare/cloudflared/releases/latest
   ```

2. Scroll ke bawah, cari file:
   ```
   cloudflared-windows-amd64.exe
   ```

3. Klik untuk download (ukuran ~50MB)

#### 2.2 Install ke Project Folder (Cara Termudah)

```powershell
# Masuk ke folder project
cd "E:\nodejs\cbt-smk-premium_wysiwyg-materi1_with-modal-masterdata-and-xlsx-templates_fix-classes-ejs\cbt-smk-premium"

# Buat folder bin
mkdir bin

# Pindahkan file yang didownload ke folder bin
# Ganti path Downloads sesuai lokasi download Anda
Move-Item "$env:USERPROFILE\Downloads\cloudflared-windows-amd64.exe" ".\bin\cloudflared.exe"
```

#### 2.3 Verifikasi Instalasi

```powershell
# Test run
.\bin\cloudflared.exe --version
```

Output:
```
cloudflared version 2024.x.x
```

**Catatan:** Karena cloudflared ada di folder project, Anda harus menggunakan `.\bin\cloudflared.exe` untuk menjalankannya.

---

### Opsi B: Install ke Program Files (Butuh Admin)

Jika ingin cloudflared bisa diakses dari mana saja:

#### 2.1 Buka PowerShell as Administrator

1. Klik Start
2. Ketik "PowerShell"
3. Klik kanan "Windows PowerShell"
4. Pilih "Run as Administrator"

#### 2.2 Install

```powershell
# Buat folder
New-Item -ItemType Directory -Path "C:\Program Files\cloudflared" -Force

# Pindahkan file (ganti path Downloads sesuai lokasi Anda)
Move-Item "$env:USERPROFILE\Downloads\cloudflared-windows-amd64.exe" "C:\Program Files\cloudflared\cloudflared.exe"

# Tambahkan ke PATH
$oldPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$newPath = $oldPath + ';C:\Program Files\cloudflared'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')
```

#### 2.3 Restart PowerShell

Tutup dan buka PowerShell baru, lalu test:

```powershell
cloudflared --version
```

---

### Opsi C: Via Chocolatey (Jika Sudah Punya Chocolatey)

```powershell
choco install cloudflared
```

---

### Verifikasi Instalasi

**Jika pakai Opsi A (Project Folder):**
```powershell
.\bin\cloudflared.exe --version
```

**Jika pakai Opsi B atau C (Global):**
```powershell
cloudflared --version
```

Output:
```
cloudflared version 2024.x.x
```

---

## Step 3: Login ke Cloudflare

### 3.1 Jalankan Login Command

**Jika pakai Opsi A (Project Folder):**
```powershell
.\bin\cloudflared.exe tunnel login
```

**Jika pakai Opsi B atau C (Global):**
```powershell
cloudflared tunnel login
```

### 3.2 Browser Akan Terbuka

1. Login ke Cloudflare
2. Pilih domain: `tam.web.id`
3. Klik "Authorize"

### 3.3 Verifikasi

Setelah authorize, akan muncul:
```
You have successfully logged in.
```

File certificate tersimpan di:
```
C:\Users\YourUsername\.cloudflared\cert.pem
```

---

## Step 4: Create Tunnel

### 4.1 Create Tunnel

**Jika pakai Opsi A (Project Folder):**
```powershell
.\bin\cloudflared.exe tunnel create cbt-liveclass
```

**Jika pakai Opsi B atau C (Global):**
```powershell
cloudflared tunnel create cbt-liveclass
```

Output:
```
Tunnel credentials written to C:\Users\YourUsername\.cloudflared\abc123-def456-ghi789.json
Created tunnel cbt-liveclass with id abc123-def456-ghi789
```

**Catat Tunnel ID:** `abc123-def456-ghi789`

### 4.2 List Tunnels (Verifikasi)

**Jika pakai Opsi A (Project Folder):**
```powershell
.\bin\cloudflared.exe tunnel list
```

**Jika pakai Opsi B atau C (Global):**
```powershell
cloudflared tunnel list
```

Output:
```
ID                                   NAME            CREATED
abc123-def456-ghi789                 cbt-liveclass   2024-03-07
```

---

## Step 5: Create Config File

### 5.1 Buat Folder Config (jika belum ada)

```powershell
mkdir C:\Users\$env:USERNAME\.cloudflared
```

### 5.2 Buat File config.yml

Buka Notepad dan buat file:
```
C:\Users\YourUsername\.cloudflared\config.yml
```

**Ganti `YourUsername` dengan username Windows Anda!**

### 5.3 Isi Config File

```yaml
tunnel: abc123-def456-ghi789
credentials-file: C:\Users\YourUsername\.cloudflared\abc123-def456-ghi789.json

ingress:
  - hostname: liveclass.tam.web.id
    service: http://localhost:3000
  - service: http_status:404
```

**Penting:**
- Ganti `abc123-def456-ghi789` dengan Tunnel ID Anda
- Ganti `YourUsername` dengan username Windows Anda
- Ganti `liveclass.tam.web.id` dengan subdomain yang Anda inginkan

### 5.4 Contoh Config Lengkap

Jika ingin multiple subdomain:

```yaml
tunnel: abc123-def456-ghi789
credentials-file: C:\Users\YourUsername\.cloudflared\abc123-def456-ghi789.json

ingress:
  # Main app
  - hostname: liveclass.tam.web.id
    service: http://localhost:3000
  
  # Admin panel (optional)
  - hostname: admin.tam.web.id
    service: http://localhost:3000
  
  # Catch-all
  - service: http_status:404
```

---

## Step 6: Route DNS

### 6.1 Create DNS Route

**Jika pakai Opsi A (Project Folder):**
```powershell
.\bin\cloudflared.exe tunnel route dns cbt-liveclass liveclass.tam.web.id
```

**Jika pakai Opsi B atau C (Global):**
```powershell
cloudflared tunnel route dns cbt-liveclass liveclass.tam.web.id
```

Output:
```
Created CNAME record for liveclass.tam.web.id
```

### 6.2 Verifikasi DNS (Optional)

Buka Cloudflare Dashboard → DNS → Records

Akan ada record baru:
```
Type: CNAME
Name: liveclass
Content: abc123-def456-ghi789.cfargotunnel.com
```

---

## Step 7: Start Aplikasi

### 7.1 Buka Terminal/PowerShell Pertama

```powershell
# Masuk ke folder aplikasi
cd E:\nodejs\cbt-smk-premium

# Start aplikasi
npm run dev
```

Aplikasi akan jalan di `http://localhost:3000`

**Jangan tutup terminal ini!**

---

## Step 8: Start Tunnel

### 8.1 Buka Terminal/PowerShell Kedua

**Jika pakai Opsi A (Project Folder):**
```powershell
# Masuk ke folder project
cd "E:\nodejs\cbt-smk-premium_wysiwyg-materi1_with-modal-masterdata-and-xlsx-templates_fix-classes-ejs\cbt-smk-premium"

# Start tunnel
.\bin\cloudflared.exe tunnel run cbt-liveclass
```

**Jika pakai Opsi B atau C (Global):**
```powershell
# Start tunnel
cloudflared tunnel run cbt-liveclass
```

Output:
```
2024-03-07 INF Starting tunnel tunnelID=abc123-def456-ghi789
2024-03-07 INF Connection registered connIndex=0
2024-03-07 INF Connection registered connIndex=1
2024-03-07 INF Connection registered connIndex=2
2024-03-07 INF Connection registered connIndex=3
```

**Jangan tutup terminal ini!**

---

## Step 9: Test Akses

### 9.1 Buka Browser

```
https://liveclass.tam.web.id
```

### 9.2 Verifikasi

- ✅ Aplikasi terbuka
- ✅ HTTPS aktif (gembok hijau)
- ✅ Bisa login
- ✅ Semua fitur berfungsi

---

## Step 10: Install as Windows Service (Optional)

Agar tunnel auto-start saat Windows boot:

### 10.1 Install Service

```powershell
# Run as Administrator
cloudflared service install
```

### 10.2 Start Service

```powershell
# Start
net start cloudflared

# Check status
sc query cloudflared
```

### 10.3 Uninstall Service (jika perlu)

```powershell
# Stop service
net stop cloudflared

# Uninstall
cloudflared service uninstall
```

---

## Troubleshooting

### Problem 1: "tunnel not found"

**Penyebab:** Tunnel ID salah di config.yml

**Solution:**
```powershell
# List tunnels
cloudflared tunnel list

# Copy ID yang benar ke config.yml
```

---

### Problem 2: "credentials file not found"

**Penyebab:** Path credentials file salah

**Solution:**
```powershell
# Check file exists
dir C:\Users\$env:USERNAME\.cloudflared\*.json

# Update path di config.yml dengan path yang benar
```

---

### Problem 3: "connection refused"

**Penyebab:** Aplikasi tidak running di port 3000

**Solution:**
```powershell
# Check aplikasi running
netstat -ano | findstr :3000

# Start aplikasi
npm run dev
```

---

### Problem 4: "DNS not found"

**Penyebab:** DNS belum propagate atau route belum dibuat

**Solution:**
```powershell
# Create DNS route
cloudflared tunnel route dns cbt-liveclass liveclass.tam.web.id

# Check DNS
nslookup liveclass.tam.web.id
```

---

### Problem 5: Tunnel disconnect terus

**Penyebab:** Laptop sleep atau network tidak stabil

**Solution:**
```powershell
# Disable sleep
powercfg /change standby-timeout-ac 0

# Check logs
cloudflared tunnel run cbt-liveclass --loglevel debug
```

---

## Tips & Best Practices

### 1. Keep Laptop Awake

```powershell
# Disable sleep when plugged in
powercfg /change standby-timeout-ac 0

# Disable sleep on battery
powercfg /change standby-timeout-dc 0
```

### 2. Auto-start Aplikasi

Buat file `start-app.bat`:
```batch
@echo off
cd E:\nodejs\cbt-smk-premium
npm run dev
```

Tambahkan ke Windows Startup:
1. Win + R
2. Ketik: `shell:startup`
3. Copy `start-app.bat` ke folder tersebut

### 3. Monitor Tunnel

```powershell
# Check tunnel status
cloudflared tunnel info cbt-liveclass

# Check logs
cloudflared tunnel run cbt-liveclass --loglevel info
```

### 4. Update .env

```env
# Update APP_URL
APP_URL=https://liveclass.tam.web.id
SESSION_DOMAIN=liveclass.tam.web.id
```

Restart aplikasi setelah update .env.

---

## Monitoring

### Check Tunnel Status

```powershell
# List tunnels
cloudflared tunnel list

# Tunnel info
cloudflared tunnel info cbt-liveclass

# Check if running
Get-Process cloudflared
```

### Check Aplikasi

```powershell
# Check port 3000
netstat -ano | findstr :3000

# Check process
Get-Process node
```

### Cloudflare Dashboard

https://dash.cloudflare.com/

- Analytics → Traffic
- Logs → Real-time logs
- Security → Firewall

---

## Keamanan

### 1. Enable Cloudflare Firewall

Dashboard → Security → WAF

- Enable "OWASP Core Ruleset"
- Enable "Cloudflare Managed Ruleset"

### 2. Rate Limiting

Dashboard → Security → Rate Limiting

Buat rule:
- Path: `/login`
- Requests: 5 per minute
- Action: Block

### 3. Access Control (Optional)

Dashboard → Zero Trust → Access

Bisa restrict akses berdasarkan:
- Email domain
- IP address
- Country

---

## Multiple Tunnels (Optional)

Jika ingin tunnel berbeda untuk dev dan production:

```powershell
# Create dev tunnel
cloudflared tunnel create cbt-dev

# Create prod tunnel
cloudflared tunnel create cbt-prod
```

Buat config terpisah:
- `config-dev.yml`
- `config-prod.yml`

Run dengan:
```powershell
cloudflared tunnel --config config-dev.yml run cbt-dev
```

---

## Backup & Restore

### Backup

```powershell
# Backup folder .cloudflared
xcopy C:\Users\$env:USERNAME\.cloudflared C:\Backup\.cloudflared /E /I /H
```

### Restore

```powershell
# Restore
xcopy C:\Backup\.cloudflared C:\Users\$env:USERNAME\.cloudflared /E /I /H
```

---

## Uninstall

Jika ingin uninstall:

```powershell
# Stop service (jika ada)
net stop cloudflared
cloudflared service uninstall

# Delete tunnel
cloudflared tunnel delete cbt-liveclass

# Uninstall cloudflared
choco uninstall cloudflared

# Delete config
rmdir /s C:\Users\$env:USERNAME\.cloudflared
```

---

## Checklist Setup

- [ ] Cloudflare account created
- [ ] Domain added to Cloudflare
- [ ] Nameservers updated
- [ ] Cloudflared installed
- [ ] Logged in: `cloudflared tunnel login`
- [ ] Tunnel created: `cloudflared tunnel create cbt-liveclass`
- [ ] Config file created: `config.yml`
- [ ] DNS routed: `cloudflared tunnel route dns`
- [ ] Aplikasi running: `npm run dev`
- [ ] Tunnel running: `cloudflared tunnel run`
- [ ] Test akses: `https://liveclass.tam.web.id`
- [ ] Service installed (optional)
- [ ] .env updated

---

## Quick Reference

### Start Tunnel (Manual)

```powershell
# Terminal 1: Start app
cd E:\nodejs\cbt-smk-premium
npm run dev

# Terminal 2: Start tunnel
cloudflared tunnel run cbt-liveclass
```

### Start Tunnel (Service)

```powershell
# Start app
cd E:\nodejs\cbt-smk-premium
npm run dev

# Service auto-start tunnel
# (no need to run manually)
```

### Stop Everything

```powershell
# Stop app: Ctrl+C di terminal app

# Stop tunnel: Ctrl+C di terminal tunnel
# Atau
net stop cloudflared
```

---

## Summary

**Arsitektur:**
```
Internet
   ↓
Cloudflare Network (DDoS Protection, SSL)
   ↓
Cloudflare Tunnel (Encrypted)
   ↓
Your Laptop (Windows 11)
   ↓
Node.js App (Port 3000)
```

**Keuntungan:**
- ✅ Gratis selamanya
- ✅ HTTPS otomatis
- ✅ Custom domain
- ✅ DDoS protection
- ✅ Tidak perlu port forwarding
- ✅ Tidak perlu IP publik
- ✅ Aman (encrypted tunnel)

**Kekurangan:**
- ❌ Laptop harus tetap nyala
- ❌ Tergantung koneksi internet laptop

---

**Status**: ✅ Ready to Use!
**Updated**: 2026-03-07

Aplikasi sekarang online dengan Cloudflare Tunnel! 🚀☁️
