# Cara Install Cloudflared Tanpa Chocolatey

## Metode Termudah (Recommended)

### Step 1: Download File

1. Buka browser, kunjungi:
   ```
   https://github.com/cloudflare/cloudflared/releases/latest
   ```

2. Scroll ke bawah sampai ketemu bagian "Assets"

3. Klik file: **cloudflared-windows-amd64.exe** untuk download

4. Tunggu download selesai (~50MB)

---

### Step 2: Install ke Project

Buka PowerShell di folder project Anda, lalu jalankan:

```powershell
# Buat folder bin
mkdir bin

# Pindahkan file dari Downloads ke bin
Move-Item "$env:USERPROFILE\Downloads\cloudflared-windows-amd64.exe" ".\bin\cloudflared.exe"
```

---

### Step 3: Test Instalasi

```powershell
.\bin\cloudflared.exe --version
```

Jika muncul versi (contoh: `cloudflared version 2024.x.x`), berarti berhasil! ✅

---

## Cara Pakai

Setelah terinstall, gunakan command dengan prefix `.\bin\`:

```powershell
# Login
.\bin\cloudflared.exe tunnel login

# Create tunnel
.\bin\cloudflared.exe tunnel create cbt-liveclass

# List tunnels
.\bin\cloudflared.exe tunnel list

# Route DNS
.\bin\cloudflared.exe tunnel route dns cbt-liveclass liveclass.tam.web.id

# Run tunnel
.\bin\cloudflared.exe tunnel run cbt-liveclass
```

---

## Alternatif: Pakai Script Otomatis

Kami sudah buatkan script untuk memudahkan:

1. Klik kanan file: **install-cloudflared.ps1**
2. Pilih: **Run with PowerShell**
3. Ikuti instruksi di layar

Script akan:
- Buat folder bin
- Buka browser untuk download
- Pindahkan file otomatis
- Test instalasi

---

## Troubleshooting

### Problem: "File tidak ditemukan"

Jika file download ada di lokasi lain, cari manual:

```powershell
# Cari file
Get-ChildItem -Path "$env:USERPROFILE\Downloads" -Filter "cloudflared*.exe"

# Pindahkan manual (ganti PATH_FILE dengan path yang benar)
Move-Item "PATH_FILE" ".\bin\cloudflared.exe"
```

### Problem: "Execution policy"

Jika muncul error execution policy:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Lalu jalankan lagi command-nya.

---

## Next Steps

Setelah cloudflared terinstall, lanjut ke:

📖 **SETUP_CLOUDFLARE_TUNNEL_WINDOWS.md**

Mulai dari **Step 3: Login ke Cloudflare**

---

**Status**: ✅ Ready
**Updated**: 2026-03-08
