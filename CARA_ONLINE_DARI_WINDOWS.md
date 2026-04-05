# Cara Mengonlinekan Aplikasi dari Windows 11

## Opsi yang Tersedia

Ada beberapa cara untuk mengonlinekan aplikasi dari laptop Windows 11:

1. **Port Forwarding** (Gratis, butuh akses router)
2. **Ngrok** (Gratis/Berbayar, paling mudah)
3. **Cloudflare Tunnel** (Gratis, recommended)
4. **Tailscale** (Gratis, untuk private network)
5. **Deploy ke VPS** (Berbayar, paling stabil)

---

## Opsi 1: Ngrok (Paling Mudah) ⭐

### Kelebihan:
- ✅ Setup sangat mudah (5 menit)
- ✅ Tidak perlu konfigurasi router
- ✅ Dapat domain otomatis
- ✅ HTTPS otomatis

### Kekurangan:
- ❌ Free tier: domain random setiap restart
- ❌ Free tier: limited bandwidth
- ❌ Laptop harus tetap nyala

### Langkah Setup:

#### 1. Install Ngrok

Download dari: https://ngrok.com/download

Atau via Chocolatey:
```powershell
choco install ngrok
```

#### 2. Daftar Akun (Gratis)

https://dashboard.ngrok.com/signup

#### 3. Get Auth Token

Setelah login, copy auth token dari dashboard.

#### 4. Setup Auth Token

```powershell
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

#### 5. Jalankan Aplikasi

```powershell
# Start aplikasi Node.js
npm run dev
# Atau
node src/server.js
```

#### 6. Expose dengan Ngrok

```powershell
# Expose port 3000
ngrok http 3000
```

Output:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

#### 7. Akses Aplikasi

Buka browser: `https://abc123.ngrok.io`

### Ngrok dengan Custom Domain (Berbayar)

Jika punya domain sendiri:

```powershell
ngrok http 3000 --domain=liveclass.tam.web.id
```

---

## Opsi 2: Cloudflare Tunnel (Recommended) ⭐⭐⭐

### Kelebihan:
- ✅ Gratis selamanya
- ✅ Custom domain (jika punya)
- ✅ HTTPS otomatis
- ✅ DDoS protection
- ✅ Tidak perlu konfigurasi router

### Kekurangan:
- ❌ Setup sedikit lebih kompleks
- ❌ Laptop harus tetap nyala

### Langkah Setup:

#### 1. Install Cloudflared

Download dari: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

Atau via Chocolatey:
```powershell
choco install cloudflared
```

#### 2. Login ke Cloudflare

```powershell
cloudflared tunnel login
```

Browser akan terbuka, pilih domain Anda.

#### 3. Create Tunnel

```powershell
cloudflared tunnel create cbt-app
```

Output akan memberikan Tunnel ID.

#### 4. Create Config File

Buat file `C:\Users\YourUsername\.cloudflared\config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\YourUsername\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: liveclass.tam.web.id
    service: http://localhost:3000
  - service: http_status:404
```

#### 5. Route DNS

```powershell
cloudflared tunnel route dns cbt-app liveclass.tam.web.id
```

#### 6. Run Tunnel

```powershell
cloudflared tunnel run cbt-app
```

#### 7. Akses Aplikasi

Buka browser: `https://liveclass.tam.web.id`

### Run as Windows Service (Auto-start)

```powershell
# Install as service
cloudflared service install

# Start service
cloudflared service start

# Check status
cloudflared service status
```

---

## Opsi 3: Port Forwarding (Gratis)

### Kelebihan:
- ✅ Gratis
- ✅ Full control
- ✅ Bisa pakai domain sendiri

### Kekurangan:
- ❌ Butuh akses router
- ❌ IP publik dinamis (bisa berubah)
- ❌ Harus setup SSL manual
- ❌ Security risk jika tidak dikonfigurasi dengan benar

### Langkah Setup:

#### 1. Cek IP Lokal Laptop

```powershell
ipconfig
```

Catat IP Address (contoh: 192.168.1.100)

#### 2. Setup Port Forwarding di Router

1. Buka browser, akses router (biasanya 192.168.1.1)
2. Login dengan username/password router
3. Cari menu "Port Forwarding" atau "Virtual Server"
4. Tambah rule:
   - External Port: 80
   - Internal IP: 192.168.1.100 (IP laptop)
   - Internal Port: 3000
   - Protocol: TCP

5. Tambah rule untuk HTTPS:
   - External Port: 443
   - Internal IP: 192.168.1.100
   - Internal Port: 3000
   - Protocol: TCP

#### 3. Cek IP Publik

```powershell
curl ifconfig.me
```

Atau buka: https://whatismyipaddress.com/

#### 4. Setup Dynamic DNS (Optional)

Jika IP publik berubah-ubah, gunakan Dynamic DNS:
- No-IP: https://www.noip.com/
- DuckDNS: https://www.duckdns.org/
- Dynu: https://www.dynu.com/

#### 5. Update DNS Domain

Pointing domain ke IP publik:
```
Type: A
Name: liveclass
Value: YOUR_PUBLIC_IP
TTL: 3600
```

#### 6. Setup SSL dengan Caddy (Windows)

Download Caddy: https://caddyserver.com/download

Buat `Caddyfile`:
```caddy
liveclass.tam.web.id {
    reverse_proxy localhost:3000
}
```

Run Caddy:
```powershell
caddy run
```

---

## Opsi 4: Tailscale (Private Network)

### Kelebihan:
- ✅ Gratis
- ✅ Sangat aman (VPN)
- ✅ Mudah setup

### Kekurangan:
- ❌ Hanya bisa diakses oleh yang install Tailscale
- ❌ Tidak cocok untuk public access

### Langkah Setup:

#### 1. Install Tailscale

Download: https://tailscale.com/download/windows

#### 2. Login & Connect

Ikuti wizard setup.

#### 3. Get Tailscale IP

```powershell
tailscale ip
```

Contoh output: `100.64.1.2`

#### 4. Share dengan User Lain

User lain harus:
1. Install Tailscale
2. Login dengan akun yang sama
3. Akses: `http://100.64.1.2:3000`

---

## Opsi 5: Deploy ke VPS (Production)

### Kelebihan:
- ✅ Paling stabil
- ✅ 24/7 online
- ✅ Performa lebih baik
- ✅ Tidak tergantung laptop

### Kekurangan:
- ❌ Berbayar (mulai $5/bulan)
- ❌ Butuh maintenance

### Provider VPS:

1. **DigitalOcean** - $6/bulan
2. **Vultr** - $5/bulan
3. **Linode** - $5/bulan
4. **AWS Lightsail** - $3.5/bulan
5. **Contabo** - €4/bulan

### Langkah Deploy:

Lihat file: `CARA_INSTALL_BANK_SOAL_PRODUCTION.md`

---

## Perbandingan Opsi

| Opsi | Biaya | Kemudahan | Stabilitas | Keamanan | Recommended |
|------|-------|-----------|------------|----------|-------------|
| Ngrok | Gratis/Berbayar | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Testing |
| Cloudflare Tunnel | Gratis | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **Best** |
| Port Forwarding | Gratis | ⭐⭐ | ⭐⭐ | ⭐⭐ | Not Recommended |
| Tailscale | Gratis | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Private Only |
| VPS | $5-10/bulan | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Production |

---

## Rekomendasi Berdasarkan Kebutuhan

### Untuk Testing/Demo (1-2 hari)
**Gunakan: Ngrok**
```powershell
ngrok http 3000
```

### Untuk Development/Testing (1-2 minggu)
**Gunakan: Cloudflare Tunnel**
- Gratis selamanya
- Custom domain
- Stabil

### Untuk Production (Sekolah)
**Gunakan: VPS**
- 24/7 online
- Tidak tergantung laptop
- Lebih cepat dan stabil

### Untuk Private Access (Internal Team)
**Gunakan: Tailscale**
- Aman
- Mudah setup
- Gratis

---

## Setup Lengkap: Cloudflare Tunnel (Recommended)

### Prerequisites

1. Domain (contoh: tam.web.id)
2. Akun Cloudflare (gratis)
3. Aplikasi sudah running di laptop

### Step-by-Step

#### 1. Install Cloudflared

```powershell
# Via Chocolatey
choco install cloudflared

# Atau download manual dari:
# https://github.com/cloudflare/cloudflared/releases
```

#### 2. Login

```powershell
cloudflared tunnel login
```

Browser akan terbuka, pilih domain `tam.web.id`.

#### 3. Create Tunnel

```powershell
cloudflared tunnel create cbt-liveclass
```

Output:
```
Created tunnel cbt-liveclass with id abc123-def456-ghi789
```

#### 4. Create Config

Buat file `config.yml` di `C:\Users\YourUsername\.cloudflared\`:

```yaml
tunnel: abc123-def456-ghi789
credentials-file: C:\Users\YourUsername\.cloudflared\abc123-def456-ghi789.json

ingress:
  - hostname: liveclass.tam.web.id
    service: http://localhost:3000
  - service: http_status:404
```

#### 5. Route DNS

```powershell
cloudflared tunnel route dns cbt-liveclass liveclass.tam.web.id
```

#### 6. Start Aplikasi

```powershell
# Terminal 1: Start aplikasi
npm run dev
```

#### 7. Start Tunnel

```powershell
# Terminal 2: Start tunnel
cloudflared tunnel run cbt-liveclass
```

#### 8. Test Akses

Buka browser: `https://liveclass.tam.web.id`

#### 9. Install as Service (Optional)

Agar auto-start saat Windows boot:

```powershell
# Install service
cloudflared service install

# Start service
net start cloudflared
```

---

## Troubleshooting

### Problem: Ngrok "Too many connections"

**Solution:**
Upgrade ke paid plan atau gunakan Cloudflare Tunnel.

### Problem: Port Forwarding tidak bisa diakses

**Solution:**
1. Check firewall Windows
2. Check router firewall
3. Check ISP blocking port 80/443

### Problem: Cloudflare Tunnel error

**Solution:**
```powershell
# Check tunnel status
cloudflared tunnel list

# Check logs
cloudflared tunnel run cbt-liveclass --loglevel debug
```

### Problem: Laptop sleep, aplikasi offline

**Solution:**
```powershell
# Disable sleep
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
```

---

## Keamanan

### 1. Firewall

```powershell
# Allow Node.js
netsh advfirewall firewall add rule name="Node.js" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes
```

### 2. Antivirus

Whitelist folder aplikasi di Windows Defender.

### 3. Update .env

```env
NODE_ENV=production
SESSION_SECRET=your-very-long-random-secret
```

### 4. Rate Limiting

Sudah ada di aplikasi, tapi bisa tambahkan di Cloudflare dashboard.

---

## Monitoring

### Check Aplikasi

```powershell
# Check if running
netstat -ano | findstr :3000

# Check logs
npm run dev
```

### Check Tunnel (Cloudflare)

```powershell
cloudflared tunnel list
cloudflared tunnel info cbt-liveclass
```

### Check Ngrok

Dashboard: https://dashboard.ngrok.com/

---

## Kesimpulan

**Untuk Anda, saya rekomendasikan:**

### Jangka Pendek (Testing):
```powershell
# Install Ngrok
choco install ngrok

# Run aplikasi
npm run dev

# Expose
ngrok http 3000
```

### Jangka Panjang (Production):
1. **Deploy ke VPS** (paling stabil)
2. Atau **Cloudflare Tunnel** (gratis, stabil)

---

**Status**: ✅ Panduan Lengkap!
**Updated**: 2026-03-07

Aplikasi bisa online dari Windows 11 dengan berbagai cara! 🚀
