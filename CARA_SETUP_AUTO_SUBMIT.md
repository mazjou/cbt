# Cara Setup Auto-Submit Ujian

Sistem auto-submit akan otomatis mengumpulkan ujian siswa ketika:
1. Waktu ujian sudah habis (melewati durasi yang ditentukan)
2. Melewati waktu akhir ujian (jika ada `end_at`)

## 🚀 Cara Mengaktifkan

### Cukup Restart Aplikasi!
```bash
# Jika menggunakan PM2
pm2 restart all

# Jika menggunakan npm run dev
# Ctrl+C untuk stop, lalu jalankan lagi
npm run dev
```

**Itu saja!** Auto-submit sudah terintegrasi langsung ke server utama.

## 📋 Cara Kerja

### ✅ **Terintegrasi Penuh:**
- **Middleware Real-time**: Cek saat siswa akses web
- **Cron Job Background**: Berjalan setiap 5 menit otomatis
- **Graceful Shutdown**: Stop otomatis saat server di-restart

### 📊 **Log yang Akan Muncul:**
```
LMS SMKN 1 Kras running on http://localhost:3000
⏰ Auto-submit cron job started (every 5 minutes)
[AUTO-SUBMIT] ✅ Auto-submitted 3 expired attempts
```

## 🔧 Testing Manual (Opsional)

Jika ingin test manual tanpa menunggu cron:
```bash
node auto-submit-expired-attempts.js
```

## ⚙️ Konfigurasi (Opsional)

### Mengubah Interval Cron Job
Edit `src/server.js` bagian:
```javascript
// Setiap 5 menit (default)
const autoSubmitJob = cron.schedule('*/5 * * * *', ...

// Setiap 1 menit (lebih agresif)
const autoSubmitJob = cron.schedule('*/1 * * * *', ...

// Setiap 10 menit (lebih hemat resource)
const autoSubmitJob = cron.schedule('*/10 * * * *', ...
```

## 📈 Keuntungan

1. **Satu Perintah**: Cukup `npm run dev` atau `pm2 restart`
2. **Otomatis**: Tidak perlu menjalankan service terpisah
3. **Terintegrasi**: Middleware + cron job dalam satu aplikasi
4. **Graceful**: Auto-stop saat server di-restart
5. **Logging**: Semua aktivitas tercatat di console server

## 🎯 **KESIMPULAN**

**Tidak perlu menjalankan terpisah!** Sistem auto-submit sudah fully integrated ke server utama. Cukup restart aplikasi dan semuanya langsung jalan otomatis.