# ✅ Auto-Submit Ujian Sudah Siap!

## 🎯 **JAWABAN: Tidak perlu terpisah! Cukup `npm run dev` sekali saja.**

### 🚀 **Cara Mengaktifkan:**
```bash
# Restart aplikasi (pilih salah satu)
npm run dev
# atau
pm2 restart all
```

**Selesai!** Auto-submit sudah terintegrasi penuh ke server utama.

## 📊 **Yang Akan Terjadi:**

### Saat Server Start:
```
LMS SMKN 1 Kras running on http://localhost:3000
⏰ Auto-submit cron job started (every 5 menit)
```

### Saat Ada Attempt Expired:
```
[AUTO-SUBMIT] ✅ Auto-submitted 3 expired attempts
```

## 🔧 **Sistem yang Berjalan Otomatis:**

1. **Middleware Real-time**: 
   - Cek saat siswa login/akses web
   - Auto-submit attempt expired milik siswa tersebut

2. **Cron Job Background**: 
   - Berjalan setiap 5 menit
   - Auto-submit SEMUA attempt expired di sistem

3. **Graceful Shutdown**: 
   - Auto-stop saat server di-restart
   - Tidak ada proses zombie

## 🎯 **Kondisi Auto-Submit:**
- Attempt melewati durasi ujian (contoh: 60 menit)
- Atau melewati waktu akhir ujian (`end_at`)
- Status masih `IN_PROGRESS`

## 🧪 **Test Manual (Opsional):**
```bash
# Cek attempt yang sedang berjalan
node check-ongoing-attempts.js

# Test auto-submit manual
node auto-submit-expired-attempts.js
```

## ✅ **Hasil Test Sebelumnya:**
- ✅ **8 attempt expired** berhasil di-auto submit
- ✅ Nilai tersimpan otomatis
- ✅ Tidak ada data yang hilang

**Siswa yang mengerjakan dari 6 Maret 2026 sudah otomatis dapat nilai 20!**