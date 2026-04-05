# ⚡ Quick Commands - LMS SMKN1 Kramatwatu

## 🎯 Perintah Paling Sering Digunakan

### Cek Status
```bash
pm2 status
```

### Lihat Logs
```bash
pm2 logs
```

### Restart Aplikasi
```bash
pm2 restart lms-smkn1kras
```

### Reload (Zero-Downtime)
```bash
pm2 reload lms-smkn1kras
```

### Monitor
```bash
pm2 monit
```

---

## 🔄 Menjalankan Aplikasi

### Pertama Kali / Setelah Reboot
```bash
pm2 start ecosystem.config.js
```

### Stop Aplikasi
```bash
pm2 stop lms-smkn1kras
```

### Start Lagi
```bash
pm2 start lms-smkn1kras
```

---

## 📝 Update Aplikasi

```bash
git pull
npm install
pm2 reload lms-smkn1kras
```

---

## 🗄️ Redis

### Test Koneksi
```bash
npm run redis:test
```

### Cek Session
```bash
npm run redis:sessions
```

---

## 🌐 Akses Aplikasi

```
http://localhost:3000
```

---

## 🆘 Troubleshooting

### Aplikasi Error
```bash
pm2 logs --err
pm2 restart lms-smkn1kras
```

### Redis Error
```bash
npm run redis:test
```

### Port Sudah Digunakan
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID [PID] /F
```

---

## 💾 Backup

```bash
pm2 save
```

---

## 📊 Info Detail

```bash
pm2 info lms-smkn1kras
```

---

**Aplikasi Running: http://localhost:3000**
