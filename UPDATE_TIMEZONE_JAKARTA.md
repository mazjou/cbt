# Update Timezone ke Asia/Jakarta (WIB)

## Perubahan yang Dilakukan

### 1. File `src/server.js`
Menambahkan konfigurasi timezone di awal file:
```javascript
require('dotenv').config();

// Set timezone to Asia/Jakarta (WIB)
process.env.TZ = 'Asia/Jakarta';
```

### 2. File `src/db/pool.js`
Mengubah timezone MySQL connection dari UTC (`'Z'`) ke WIB (`'+07:00'`):
```javascript
const pool = mysql.createPool({
  // ... config lainnya
  timezone: '+07:00' // Asia/Jakarta (WIB)
});
```

### 3. File `scripts/test_assignments_query.js`
Mengubah timezone MySQL connection:
```javascript
const pool = mysql.createPool({
  // ... config lainnya
  timezone: '+07:00' // Asia/Jakarta (WIB)
});
```

## Penjelasan

### Timezone Node.js (process.env.TZ)
- Mengatur timezone untuk seluruh aplikasi Node.js
- Mempengaruhi `new Date()`, `Date.now()`, dll
- Format: `'Asia/Jakarta'`

### Timezone MySQL (timezone config)
- Mengatur timezone untuk koneksi database
- Mempengaruhi fungsi MySQL seperti `NOW()`, `CURDATE()`, dll
- Format: `'+07:00'` (offset dari UTC)

## Dampak Perubahan

### Sebelum (UTC / Z):
```javascript
// Server time: 2026-03-07 10:00:00 UTC
// Database NOW(): 2026-03-07 10:00:00
// Display: 10:00 (UTC)
```

### Sesudah (WIB / +07:00):
```javascript
// Server time: 2026-03-07 17:00:00 WIB
// Database NOW(): 2026-03-07 17:00:00
// Display: 17:00 (WIB)
```

## Fitur yang Terpengaruh

### ✅ Timestamp yang Sudah Benar:
- Created_at / updated_at otomatis
- Jadwal ujian (scheduled_at, start_time, end_time)
- Deadline tugas (due_date)
- Jadwal live class (scheduled_at, started_at, ended_at)
- Notifikasi (created_at)
- Chat messages (created_at)
- Attempt timestamps (started_at, submitted_at)

### ✅ Display yang Sudah Benar:
- Semua tampilan tanggal/waktu di UI
- Format `toLocaleString('id-ID')` sudah otomatis WIB
- Format `toLocaleDateString('id-ID')` sudah otomatis WIB
- Format `toLocaleTimeString('id-ID')` sudah otomatis WIB

## Testing

### 1. Test Server Timezone
```javascript
// Di Node.js console atau route test
console.log('Current timezone:', process.env.TZ);
console.log('Current time:', new Date().toString());
console.log('ISO time:', new Date().toISOString());
console.log('Locale time:', new Date().toLocaleString('id-ID'));
```

Expected output:
```
Current timezone: Asia/Jakarta
Current time: Fri Mar 07 2026 17:00:00 GMT+0700 (Western Indonesia Time)
ISO time: 2026-03-07T10:00:00.000Z
Locale time: 07/03/2026 17.00.00
```

### 2. Test Database Timezone
```sql
-- Di MySQL console
SELECT NOW() AS current_time;
SELECT CURDATE() AS current_date;
SELECT CURTIME() AS current_time_only;
```

Expected output (jika jam 17:00 WIB):
```
current_time: 2026-03-07 17:00:00
current_date: 2026-03-07
current_time_only: 17:00:00
```

### 3. Test Insert Data
```javascript
// Test insert dengan NOW()
await pool.query(
  'INSERT INTO test_table (name, created_at) VALUES (?, NOW())',
  ['test']
);

// Check hasil
const [[result]] = await pool.query(
  'SELECT created_at FROM test_table WHERE name = ?',
  ['test']
);
console.log('Created at:', result.created_at);
// Expected: 2026-03-07 17:00:00 (WIB)
```

### 4. Test UI Display
1. Buat ujian baru dengan jadwal
2. Cek tampilan jadwal di halaman ujian
3. Buat tugas dengan deadline
4. Cek tampilan deadline di halaman tugas
5. Buat live class dengan jadwal
6. Cek tampilan jadwal di halaman live class

## Restart Aplikasi

Setelah perubahan, restart aplikasi:

### Development (Nodemon):
```bash
# Nodemon akan auto-restart
# Atau manual:
Ctrl + C
npm start
```

### Production (PM2):
```bash
pm2 restart cbt-app
pm2 logs cbt-app --lines 20
```

## Verifikasi

### 1. Cek Log Startup
```bash
pm2 logs cbt-app --lines 50
```

Pastikan tidak ada error terkait timezone.

### 2. Cek Database Connection
```bash
# Test query
mysql -u [user] -p -e "SELECT NOW();"
```

Hasilnya harus menunjukkan waktu WIB.

### 3. Cek UI
- Buka aplikasi di browser
- Cek timestamp di berbagai halaman
- Pastikan semua waktu sudah WIB

## Troubleshooting

### Waktu Masih UTC
**Penyebab**: PM2 belum restart atau cache browser

**Solusi**:
```bash
# Restart PM2
pm2 restart cbt-app

# Clear browser cache
Ctrl + Shift + Delete
```

### Database Timezone Tidak Berubah
**Penyebab**: MySQL server timezone berbeda

**Solusi**:
```sql
-- Set global timezone di MySQL
SET GLOBAL time_zone = '+07:00';

-- Atau di my.cnf / my.ini
[mysqld]
default-time-zone = '+07:00'
```

### Waktu Berbeda 7 Jam
**Penyebab**: Salah satu timezone tidak diset

**Solusi**:
- Pastikan `process.env.TZ = 'Asia/Jakarta'` di server.js
- Pastikan `timezone: '+07:00'` di pool.js
- Restart aplikasi

## Catatan Penting

### 1. Data Lama
Data yang sudah ada di database tetap dalam format UTC. Untuk migrasi:

```sql
-- Jika perlu convert data lama (HATI-HATI!)
-- Backup dulu sebelum jalankan!

-- Convert created_at
UPDATE users 
SET created_at = DATE_ADD(created_at, INTERVAL 7 HOUR);

-- Convert scheduled_at
UPDATE exams 
SET scheduled_at = DATE_ADD(scheduled_at, INTERVAL 7 HOUR);

-- Dan seterusnya untuk tabel lain
```

**PERINGATAN**: Hanya lakukan jika data lama benar-benar dalam UTC dan perlu dikonversi!

### 2. Konsistensi
- Semua timestamp di database sekarang WIB
- Semua display di UI sekarang WIB
- Semua input datetime dari user dianggap WIB

### 3. API Response
Jika ada API yang return timestamp, pastikan client tahu timezone-nya WIB.

## Referensi

- Node.js TZ: https://nodejs.org/api/process.html#process_process_env
- MySQL Timezone: https://dev.mysql.com/doc/refman/8.0/en/time-zone-support.html
- JavaScript Date: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

---

**Status**: ✅ Completed
**Date**: 2026-03-07
**Timezone**: Asia/Jakarta (WIB / UTC+7)
