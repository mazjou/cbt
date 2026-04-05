# Setup SSH Key di Windows untuk VPS

## Cara Cepat (Otomatis)

### Jalankan Script PowerShell
```powershell
.\setup-ssh-key.ps1
```

Script akan:
1. Generate SSH key (jika belum ada)
2. Kirim public key ke VPS
3. Test koneksi tanpa password

**Catatan:** Anda akan diminta password VPS sekali saja saat setup.

## Cara Manual (Jika Script Gagal)

### 1. Generate SSH Key
```powershell
# Buat folder .ssh jika belum ada
mkdir $env:USERPROFILE\.ssh

# Generate key
ssh-keygen -t rsa -b 4096
```

Tekan Enter 3x (default location, no passphrase)

### 2. Copy Public Key ke VPS

**Opsi A: Menggunakan PowerShell**
```powershell
# Baca public key
$pubKey = Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"

# Kirim ke VPS (akan minta password)
ssh root@10.10.102.15 "mkdir -p ~/.ssh && echo '$pubKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

**Opsi B: Manual Copy-Paste**
```powershell
# 1. Tampilkan public key
Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"

# 2. Copy output di atas

# 3. Login ke VPS
ssh root@10.10.102.15

# 4. Di VPS, jalankan:
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys

# 5. Paste public key, save (Ctrl+O, Enter, Ctrl+X)

# 6. Set permission
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 3. Test Koneksi
```powershell
# Seharusnya tidak minta password lagi
ssh root@10.10.102.15 "echo 'Berhasil!'"
```

## Troubleshooting

### Error: ssh-keygen not found
```powershell
# Cek apakah OpenSSH Client terinstall
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Client*'

# Jika belum, install:
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

### Masih Minta Password Setelah Setup
```powershell
# Cek permission file private key
icacls "$env:USERPROFILE\.ssh\id_rsa"

# Set permission yang benar (hanya user Anda yang bisa akses)
icacls "$env:USERPROFILE\.ssh\id_rsa" /inheritance:r
icacls "$env:USERPROFILE\.ssh\id_rsa" /grant:r "$env:USERNAME:(R)"
```

### Connection Refused
```bash
# Cek apakah VPS bisa di-ping
ping 10.10.102.15

# Cek apakah SSH service running di VPS
# Login ke VPS dan jalankan:
sudo systemctl status sshd
```

### Permission Denied (publickey)
Di VPS, cek permission:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown -R $USER:$USER ~/.ssh
```

## Setelah Setup Berhasil

### Edit Script Sync
```powershell
# Edit file sync-to-vps.ps1
notepad sync-to-vps.ps1

# Sesuaikan:
# - VPS_USER (username VPS Anda)
# - VPS_PATH (path aplikasi di VPS)
```

### Jalankan Sync
```powershell
.\sync-to-vps.ps1
```

## Alternatif: Gunakan Password (Tidak Recommended)

Jika tidak ingin setup SSH key, Anda bisa tetap menggunakan password:

```powershell
# Edit sync-to-vps.ps1
# Tambahkan parameter -o PreferredAuthentications=password

# Atau gunakan scp dengan password
scp -r . root@10.10.102.15:/var/www/lms-smkn1kras/
```

Tapi ini akan minta password setiap kali sync.

## Quick Reference

```powershell
# Setup SSH key (sekali saja)
.\setup-ssh-key.ps1

# Edit config sync
notepad sync-to-vps.ps1

# Sync ke VPS
.\sync-to-vps.ps1

# Test koneksi
ssh root@10.10.102.15 "echo 'OK'"
```

## Lokasi File Penting

- **Private Key:** `C:\Users\YourUsername\.ssh\id_rsa`
- **Public Key:** `C:\Users\YourUsername\.ssh\id_rsa.pub`
- **Known Hosts:** `C:\Users\YourUsername\.ssh\known_hosts`

**⚠️ JANGAN SHARE PRIVATE KEY (id_rsa) KE SIAPAPUN!**
