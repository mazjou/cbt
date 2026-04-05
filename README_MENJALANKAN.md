# 🚀 Menjalankan Aplikasi LMS - Quick Start

## Status Aplikasi Saat Ini

```
✅ APLIKASI SUDAH RUNNING!
✅ PM2: 16 instances online
✅ Redis: Connected (10.10.102.8)
✅ URL: http://localhost:3000
```

---

## 🎯 Cara Menjalankan

### Aplikasi Sudah Jalan
Aplikasi sudah running dengan PM2. Tidak perlu start lagi!

Cek status:
```bash
pm2 status
```

### Jika Aplikasi Belum Jalan
```bash
pm2 start ecosystem.config.js
```

### Jika Ingin Restart
```bash
pm2 restart lms-smkn1kras
```

---

## 📋 Perintah Dasar

| Perintah | Fungsi |
|----------|--------|
| `pm2 status` | Cek status aplikasi |
| `pm2 logs` | Lihat logs |
| `pm2 monit` | Monitor CPU/Memory |
| `pm2 restart lms-smkn1kras` | Restart aplikasi |
| `pm2 reload lms-smkn1kras` | Reload (zero-downtime) |
| `pm2 stop lms-smkn1kras` | Stop aplikasi |
| `npm run redis:test` | Test Redis |
| `npm run redis:sessions` | Cek session aktif |

---

## 🔄 Update Aplikasi

```bash
# 1. Pull kode terbaru
git pull

# 2. Install dependencies
npm install

# 3. Reload aplikasi
pm2 reload lms-smkn1kras

# 4. Cek logs
pm2 logs --lines 30
```

---

## 🌐 Akses Aplikasi

### Dari Server
```
http://localhost:3000
```

### Dari Komputer Lain
```
http://[IP-SERVER]:3000
```

---

## 🛠️ Troubleshooting

### Aplikasi Error
```bash
pm2 logs --err
pm2 restart lms-smkn1kras
```

### Redis Error
```bash
npm run redis:test
```

### Cek Info Detail
```bash
pm2 info lms-smkn1kras
```

---

## 📚 Dokumentasi Lengkap

- **CARA_MENJALANKAN_APLIKASI.md** - Panduan lengkap
- **QUICK_COMMANDS.md** - Perintah cepat
- **REDIS_QUICK_REFERENCE.md** - Redis commands
- **SETUP_COMPLETE.md** - Setup overview

---

## 🆘 Butuh Bantuan?

1. Cek status: `pm2 status`
2. Cek logs: `pm2 logs`
3. Restart: `pm2 restart lms-smkn1kras`
4. Baca: `CARA_MENJALANKAN_APLIKASI.md`

---

**Aplikasi Running: http://localhost:3000** ✅
