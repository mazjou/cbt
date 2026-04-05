# Cara Restart Aplikasi Setelah Update Live Class

## Masalah
Tombol "Kembali" tidak muncul di halaman live class room setelah update kode.

## Penyebab
File `.ejs` sudah diupdate, tapi server belum di-restart sehingga masih menggunakan versi lama.

## Solusi

### Jika Menggunakan PM2 (Production)

#### 1. Restart Aplikasi
```bash
pm2 restart cbt-app
```

#### 2. Atau Restart Semua
```bash
pm2 restart all
```

#### 3. Cek Status
```bash
pm2 status
pm2 logs cbt-app --lines 50
```

### Jika Menggunakan Nodemon (Development)

Nodemon seharusnya auto-restart, tapi jika tidak:

#### 1. Stop Server
```bash
Ctrl + C
```

#### 2. Start Lagi
```bash
npm start
```

### Jika Manual dengan Node

#### 1. Stop Server
```bash
Ctrl + C
```

#### 2. Start Lagi
```bash
node src/server.js
```

## Setelah Restart

### 1. Clear Browser Cache
- Tekan `Ctrl + Shift + Delete` (Windows/Linux)
- Tekan `Cmd + Shift + Delete` (Mac)
- Pilih "Cached images and files"
- Klik "Clear data"

### 2. Hard Refresh
- Tekan `Ctrl + F5` (Windows/Linux)
- Tekan `Cmd + Shift + R` (Mac)

### 3. Atau Buka Incognito/Private Mode
- `Ctrl + Shift + N` (Chrome)
- `Ctrl + Shift + P` (Firefox)

## Verifikasi

Setelah restart dan clear cache, buka halaman live class room:

### Teacher
```
https://liveclass.tam.web.id/teacher/live-classes
```
1. Klik "▶️ Mulai" pada live class
2. Seharusnya muncul tombol "← Kembali" di kiri atas
3. Di sebelahnya ada judul live class
4. Di kanan ada "Peserta: X" dan tombol "Akhiri Live Class"

### Student
```
https://liveclass.tam.web.id/student/live-classes
```
1. Klik "🎥 Join Live Class" pada live class yang LIVE
2. Seharusnya muncul tombol "← Kembali" di kiri atas
3. Di sebelahnya ada judul live class
4. Di kanan ada "Peserta: X"

## Jika Masih Tidak Muncul

### 1. Cek File Sudah Tersimpan
```bash
# Cek timestamp file
ls -la src/views/teacher/live_class_room.ejs
ls -la src/views/student/live_class_room.ejs
```

### 2. Cek Isi File
```bash
# Cek apakah ada tombol kembali
grep -n "Kembali" src/views/teacher/live_class_room.ejs
grep -n "Kembali" src/views/student/live_class_room.ejs
```

Seharusnya muncul di line ~5-10:
```html
<a href="/teacher/live-classes" 
   class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
  <span>←</span>
  <span>Kembali</span>
</a>
```

### 3. Cek Console Browser
1. Buka Developer Tools (F12)
2. Tab "Console"
3. Lihat apakah ada error JavaScript
4. Tab "Network"
5. Refresh halaman
6. Cek apakah file `.ejs` di-load dengan status 200

### 4. Cek View Engine
Pastikan di `src/server.js` ada:
```javascript
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
```

## Troubleshooting Lanjutan

### Jika PM2 Tidak Restart
```bash
# Stop dulu
pm2 stop cbt-app

# Delete dari PM2
pm2 delete cbt-app

# Start lagi dari ecosystem.config.js
pm2 start ecosystem.config.js

# Save
pm2 save
```

### Jika File Tidak Berubah
Kemungkinan edit di folder yang salah. Cek path:
```bash
pwd
# Seharusnya: /var/cbt-smk-premium

ls -la src/views/teacher/live_class_room.ejs
# Seharusnya ada file ini
```

### Jika Masih Gagal
Restart server Linux:
```bash
# Jika punya akses root
sudo systemctl restart nginx  # Jika pakai nginx
pm2 restart all
```

## Quick Command (Copy-Paste)

```bash
# Restart PM2
pm2 restart cbt-app && pm2 logs cbt-app --lines 20

# Atau restart semua
pm2 restart all && pm2 status

# Cek file
grep -A 5 "Kembali" src/views/teacher/live_class_room.ejs
```

---

**Catatan**: Setelah restart, pastikan clear browser cache atau buka incognito mode untuk melihat perubahan.
