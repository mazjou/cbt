# 🔧 Troubleshooting WebRTC Error

## ❌ Error: "WebRTC is not available in your browser"

Error ini muncul karena browser tidak mendukung WebRTC atau ada pengaturan yang memblokir akses.

## ✅ Solusi

### 1. Gunakan Browser yang Didukung

**Browser yang Direkomendasikan:**
- ✅ Google Chrome (versi 74+)
- ✅ Mozilla Firefox (versi 66+)
- ✅ Microsoft Edge (versi 79+)
- ✅ Safari (versi 12.1+)

**Browser yang TIDAK Didukung:**
- ❌ Internet Explorer
- ❌ Opera Mini
- ❌ Browser lama (versi lawas)

### 2. Gunakan HTTPS (Bukan HTTP)

WebRTC memerlukan koneksi HTTPS untuk keamanan.

**Jika Testing di Localhost:**
```
✅ BENAR: https://localhost:3000
❌ SALAH: http://localhost:3000
```

**Cara Enable HTTPS di Development:**

#### Option A: Gunakan ngrok (Recommended)
```bash
# Install ngrok
npm install -g ngrok

# Jalankan server
npm run dev

# Di terminal baru, jalankan ngrok
ngrok http 3000

# Gunakan URL HTTPS yang diberikan ngrok
# Contoh: https://abc123.ngrok.io
```

#### Option B: Self-Signed Certificate
```bash
# Generate certificate
openssl req -nodes -new -x509 -keyout server.key -out server.cert

# Update server.js untuk gunakan HTTPS
```

### 3. Allow Camera & Microphone Permission

Browser akan meminta permission untuk akses camera dan microphone.

**Cara Allow Permission:**

**Chrome:**
1. Klik icon 🔒 di address bar
2. Pilih "Site settings"
3. Allow Camera dan Microphone
4. Refresh page

**Firefox:**
1. Klik icon 🔒 di address bar
2. Klik "Connection secure"
3. Klik "More information"
4. Tab "Permissions"
5. Allow Camera dan Microphone
6. Refresh page

**Edge:**
1. Klik icon 🔒 di address bar
2. Pilih "Permissions for this site"
3. Allow Camera dan Microphone
4. Refresh page

### 4. Nonaktifkan VPN/Proxy

VPN atau Proxy dapat memblokir koneksi WebRTC.

**Cara Nonaktifkan:**
- Matikan VPN software
- Nonaktifkan proxy di browser settings
- Gunakan koneksi internet langsung

### 5. Check Browser Settings

**Chrome:**
```
1. Buka chrome://settings/content
2. Cari "Camera" dan "Microphone"
3. Pastikan tidak di-block
4. Tambahkan site ke "Allow" list
```

**Firefox:**
```
1. Buka about:preferences#privacy
2. Scroll ke "Permissions"
3. Check Camera dan Microphone settings
4. Pastikan site tidak di-block
```

### 6. Disable Browser Extensions

Extension seperti ad-blocker dapat memblokir WebRTC.

**Cara Test:**
1. Buka browser dalam Incognito/Private mode
2. Test live class lagi
3. Jika berhasil, disable extensions satu per satu untuk cari yang bermasalah

### 7. Clear Browser Cache

Cache lama dapat menyebabkan masalah.

**Cara Clear Cache:**
1. Tekan `Ctrl + Shift + Delete` (Windows) atau `Cmd + Shift + Delete` (Mac)
2. Pilih "Cached images and files"
3. Pilih "All time"
4. Klik "Clear data"
5. Restart browser

### 8. Update Browser

Pastikan browser Anda versi terbaru.

**Cara Check Update:**

**Chrome:**
```
chrome://settings/help
```

**Firefox:**
```
about:preferences#general
Scroll ke "Firefox Updates"
```

**Edge:**
```
edge://settings/help
```

### 9. Test WebRTC Support

Cek apakah browser Anda support WebRTC:

**Test di:**
```
https://test.webrtc.org/
```

Jika test gagal, browser Anda tidak support WebRTC.

### 10. Firewall/Antivirus

Firewall atau antivirus dapat memblokir WebRTC.

**Cara Test:**
1. Temporary disable firewall/antivirus
2. Test live class lagi
3. Jika berhasil, tambahkan exception untuk browser

## 🔍 Diagnostic Tools

### Check Browser Console

1. Tekan `F12` untuk buka Developer Tools
2. Tab "Console"
3. Lihat error messages
4. Screenshot dan kirim ke developer jika perlu

### Check Network Tab

1. Tekan `F12`
2. Tab "Network"
3. Refresh page
4. Cek apakah ada request yang failed
5. Cek apakah Jitsi Meet script loaded

## 🎯 Quick Fix Checklist

- [ ] Gunakan Chrome/Firefox/Edge terbaru
- [ ] Gunakan HTTPS (bukan HTTP)
- [ ] Allow camera & microphone permission
- [ ] Nonaktifkan VPN/Proxy
- [ ] Test di Incognito mode
- [ ] Clear browser cache
- [ ] Update browser ke versi terbaru
- [ ] Test di https://test.webrtc.org/
- [ ] Disable firewall/antivirus temporary
- [ ] Restart browser dan computer

## 💡 Alternative Solutions

### Jika WebRTC Tetap Tidak Berfungsi:

1. **Gunakan Browser Lain**
   - Install Chrome jika belum ada
   - Test di browser berbeda

2. **Gunakan Device Lain**
   - Test di laptop/PC lain
   - Test di smartphone

3. **Gunakan Fitur Lain**
   - Chat tetap berfungsi tanpa video
   - Quiz tetap berfungsi tanpa video
   - Participant list tetap berfungsi

## 📞 Bantuan Lebih Lanjut

Jika masih error setelah semua solusi di atas:

1. Screenshot error message
2. Screenshot browser console (F12)
3. Catat browser & versi yang digunakan
4. Catat OS & versi yang digunakan
5. Hubungi administrator

## 🚀 Production Deployment

Untuk production, pastikan:

1. ✅ Server menggunakan HTTPS dengan SSL certificate valid
2. ✅ Domain sudah terdaftar dan DNS configured
3. ✅ Firewall configured untuk allow WebRTC ports
4. ✅ STUN/TURN server configured (optional, untuk koneksi yang lebih stabil)

### STUN/TURN Server (Optional)

Untuk koneksi yang lebih stabil, gunakan STUN/TURN server:

```javascript
configOverwrite: {
  // ... other configs
  p2p: {
    enabled: true,
    stunServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
}
```

---

**Semoga membantu! 🎉**

Jika masih ada masalah, silakan hubungi administrator atau developer.
