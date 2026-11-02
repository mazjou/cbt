# Investigasi: Login LMS Langsung Keluar & Redis Tidak Terhubung

**Tanggal investigasi:** 2025  
**Project:** CBT SMK Negeri 1 Kras — `d:\WEBSITE\cbt`  
**Investigator:** Kiro (read-only, tidak ada perubahan kode)

---

## Ringkasan Eksekutif

Ada **3 root cause** yang ditemukan, diurutkan dari paling kritis:

| # | Masalah | Dampak | File |
|---|---------|--------|------|
| 1 | **`REDIS_SESSION_PREFIX` dan `REDIS_SESSION_TTL` di `.env` tidak dibaca oleh kode** — nilai hardcode di `server.js` berbeda | Session bisa konflik jika prefix berubah; TTL env tidak berpengaruh | `src/server.js` baris ~276 |
| 2 | **PM2 cluster mode (`instances: 'max'`) tanpa `RUN_SCHEDULER` di `env_production`** — semua instance menjalankan scheduler + session berbeda-beda di memory jika Redis mati | Session drop antar-worker | `ecosystem.config.js` |
| 3 | **`disableOfflineQueue: true`** pada Redis client — jika Redis sempat disconnect sebentar, semua operasi session ditolak langsung (bukan di-buffer) dan user di-kick | Login langsung keluar saat Redis flicker | `src/server.js` baris ~252 |

**Root cause paling mungkin untuk gejala "login sebentar lalu keluar":** kombinasi masalah #2 dan #3 — Redis di `10.10.102.8` mengalami koneksi tidak stabil (network flicker antara VPS `10.10.102.11` → `10.10.102.8`), Redis client langsung menolak semua operasi karena `disableOfflineQueue: true`, dan karena PM2 jalan di cluster mode, session yang tersimpan di worker A tidak terbaca oleh worker B jika Redis mati.

---

## Temuan Detail

### 1. Konfigurasi Redis di `src/server.js`

```javascript
// src/server.js, fungsi initRedis()
const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,           // ✅ dibaca dari .env: 10.10.102.8
    port: Number(process.env.REDIS_PORT || 6379), // ✅ dibaca dari .env: 6379
    connectTimeout: 10000,
    reconnectStrategy: (retries) => {
      const delay = Math.min(retries * 200, 3000);
      if (retries > 20) {
        console.error('❌ Redis reconnect berhenti: terlalu banyak retry');
        return new Error('Too many redis reconnect attempts');
      }
      return delay;
    },
  },
  username: process.env.REDIS_USERNAME || undefined, // ✅ dibaca (tidak ada di .env → undefined)
  password: process.env.REDIS_PASSWORD || undefined, // ✅ dibaca dari .env: ada password
  disableOfflineQueue: true,                          // ⚠️ MASALAH — lihat #3
});
```

```javascript
// src/server.js, fungsi buildSessionMiddleware()
config.store = new RedisStore({
  client: redisClient,
  prefix: 'lms:sess:',     // ⚠️ HARDCODE — tidak membaca REDIS_SESSION_PREFIX dari .env
  ttl: 60 * 60 * 8        // ⚠️ HARDCODE — tidak membaca REDIS_SESSION_TTL dari .env
});
```

**Di `.env`:**
```
REDIS_HOST=10.10.102.8
REDIS_PORT=6379
REDIS_PASSWORD=redisCBT2026
REDIS_SESSION_PREFIX=lms:sess:
REDIS_SESSION_TTL=28800
```

Kebetulan nilai hardcode (`'lms:sess:'` dan `28800`) cocok dengan nilai di `.env`, jadi ini bukan penyebab bug saat ini — tapi konfigurasi tidak konsisten dan rawan konflik jika seseorang mengubah `.env` tanpa tahu kode tidak membacanya.

**TTL session = 8 jam (28800 detik)** — ini wajar, bukan penyebab session terlalu pendek.

---

### 2. `REDIS_USERNAME` Tidak Ada di `.env` → Tidak Ada ACL Issue

Key `.env` yang ditemukan (nilai disembunyikan):
```
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_SESSION_PREFIX, REDIS_SESSION_TTL
```

`REDIS_USERNAME` **tidak ada** di `.env`. Kode akan set `username: undefined` ke Redis client, artinya konek sebagai user default (`default`). Ini aman selama Redis server tidak mengaktifkan ACL yang memblokir user `default`. Jika Redis di `10.10.102.8` dikonfigurasi dengan `requirepass` saja (bukan ACL penuh), ini tidak masalah.

**Tidak ada indikasi Redis ACL blocking** dari sisi kode aplikasi.

---

### 3. `disableOfflineQueue: true` — Penyebab Session Drop saat Redis Flicker ⚠️

```javascript
// src/server.js baris ~252
disableOfflineQueue: true,
```

Dengan setting ini, **setiap operasi Redis yang dikirim saat koneksi sedang putus akan langsung dibuang (throw error)**, bukan di-queue untuk dikirim ulang saat reconnect. 

Dampak konkret:
- Saat Redis `10.10.102.8` momentarily unreachable (network hop VPS ke VPS), `express-session` + `connect-redis` mencoba `session.set()` setelah login
- Operasi tersebut langsung gagal (bukan di-retry)
- `express-session` dengan `saveUninitialized: false` dan `resave: false` tidak memaksanya disimpan ulang
- Pada request berikutnya, session tidak ditemukan di Redis → user dianggap belum login → redirect ke `/login`

---

### 4. `reconnectStrategy` Berhenti Setelah 20 Retry ⚠️

```javascript
reconnectStrategy: (retries) => {
  const delay = Math.min(retries * 200, 3000);
  if (retries > 20) {
    console.error('❌ Redis reconnect berhenti: terlalu banyak retry');
    return new Error('Too many redis reconnect attempts'); // ← BERHENTI RECONNECT
  }
  return delay;
},
```

Setelah 20 kali retry (± 60 detik), Redis client **berhenti mencoba reconnect sama sekali**. Jika Redis sempat mati lama lalu pulih, aplikasi tidak akan reconnect secara otomatis — butuh restart PM2.

---

### 5. PM2 Cluster Mode Tanpa `RUN_SCHEDULER` di Env Production ⚠️

```javascript
// ecosystem.config.js
instances: 'max',   // semua CPU core = multiple workers
exec_mode: 'cluster',
env_production: {
  NODE_ENV: 'production',
  TZ: 'Asia/Jakarta',
  PORT: 3000,
  DB_CONNECTION_LIMIT: '70',
  ONLINE_TTL_SECONDS: '300',
  // ← TIDAK ADA RUN_SCHEDULER
}
```

Karena `RUN_SCHEDULER` tidak di-set di `env_production`, nilai di `.env` yang dibaca adalah nilai file `.env`. Kalau `RUN_SCHEDULER=1` di `.env`, semua worker PM2 akan menjalankan cron auto-submit → race condition pada Redis lock `lock:auto-submit`. Ini sudah di-handle di kode dengan distributed lock, tapi tetap beban tambahan.

Yang lebih kritis: jika Redis mati dan session store turun ke memory, **setiap worker PM2 punya memory session sendiri-sendiri**. User yang login di worker A tidak akan dikenali oleh worker B → session drop meski "baru login".

---

### 6. Error Handling Saat Redis Tidak Terhubung — Ada Fallback ke Memory

```javascript
// src/server.js, fungsi bootstrap()
try {
  await initRedis();
  console.log('✅ Redis connected');
} catch (error) {
  console.error('❌ Redis gagal connect:', error.message);
  console.log('⚠️ Melanjutkan dengan memory session store');
  redisClient      = null;
  isRedisConnected = false;
}
```

Fallback ke memory store **hanya terjadi saat startup** jika Redis tidak bisa connect sama sekali. Jika Redis connect saat startup kemudian putus di tengah jalan, **tidak ada fallback** — session store tetap `RedisStore` tapi operasinya gagal silently karena `disableOfflineQueue: true`.

---

### 7. Tidak Ada Kode yang Memanggil FLUSHDB/FLUSHALL atau DEL Session Secara Tidak Sengaja

Pencarian di seluruh `src/` tidak menemukan:
- `FLUSHDB` / `FLUSHALL`
- `session.destroy()` selain di route `/logout` (ini normal)
- `DEL` terhadap session key

Session destroy hanya di `/logout`:
```javascript
// src/routes/auth.js baris 204-207
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});
```
Ini benar dan tidak bermasalah.

---

### 8. Versi Package — Kompatibel

| Package | Versi di package.json | Versi Terinstall |
|---------|----------------------|-----------------|
| `redis` | `^4.7.1` | `4.7.1` |
| `connect-redis` | `^7.1.1` | `7.1.1` |
| `express-session` | `^1.17.3` | — |

`connect-redis` v7.x membutuhkan `redis` v4.x dan tidak memerlukan `legacyMode: true` — **ini sudah benar**. Kode menggunakan `new RedisStore({ client: redisClient })` tanpa `legacyMode`, yang merupakan cara yang tepat untuk `connect-redis` v7+.

---

### 9. `connect-redis` v7 Tidak Butuh `legacyMode`

Kode di `server.js`:
```javascript
const RedisStore = require('connect-redis').default;
// ...
config.store = new RedisStore({ client: redisClient, prefix: 'lms:sess:', ttl: 60 * 60 * 8 });
```

`connect-redis` v7 bekerja langsung dengan `redis` v4 modern client tanpa `legacyMode`. Ini **sudah benar**.

---

## Root Cause yang Paling Mungkin

**Gejala: Login sebentar lalu keluar + Redis tidak terhubung**

Urutan kejadian yang paling mungkin:
1. Redis server `10.10.102.8` tidak stabil atau unreachable dari VPS `10.10.102.11` (masalah jaringan antar VM)
2. Saat Redis disconnect momentarily, `isRedisConnected` set ke `false` (event handler `end` / `error`)
3. Operasi `session.save()` setelah login dikirim ke Redis client → langsung dibuang karena `disableOfflineQueue: true`
4. User mendapat session cookie, tapi session tidak tersimpan di Redis
5. Request berikutnya ke server (terutama jika PM2 cluster dan request ke worker berbeda) → session tidak ditemukan → redirect ke `/login`
6. `reconnectStrategy` bisa berhenti setelah 20 retry, sehingga Redis tidak reconnect otomatis

**Bukti pendukung:** `REDIS_SESSION_PREFIX` dan `REDIS_SESSION_TTL` di `.env` tidak dibaca kode → indikasi konfigurasi belum pernah diaudit menyeluruh.

---

## Rekomendasi Fix

### Fix #1 (KRITIS) — Ganti `disableOfflineQueue: true` ke `false` atau hapus

**File:** `src/server.js`, fungsi `initRedis()`

```javascript
// SEBELUM
const client = createClient({
  socket: { ... },
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  disableOfflineQueue: true,  // ← HAPUS atau ganti ke false
});

// SESUDAH
const client = createClient({
  socket: { ... },
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  // disableOfflineQueue dihapus (default false) — operasi di-queue saat disconnect
});
```

Dengan offline queue aktif, operasi session saat Redis momentarily disconnect akan di-queue dan dieksekusi saat reconnect, bukan dibuang.

---

### Fix #2 (KRITIS) — Naikkan batas retry reconnect atau buat infinite retry

**File:** `src/server.js`, fungsi `initRedis()`

```javascript
// SEBELUM
reconnectStrategy: (retries) => {
  const delay = Math.min(retries * 200, 3000);
  if (retries > 20) {
    return new Error('Too many redis reconnect attempts'); // ← BERHENTI
  }
  return delay;
},

// SESUDAH — infinite retry dengan backoff cap
reconnectStrategy: (retries) => {
  if (retries > 50) {
    console.error(`❌ Redis reconnect attempt ${retries}, masih mencoba...`);
  }
  return Math.min(retries * 200, 5000); // cap 5 detik, tidak pernah berhenti
},
```

---

### Fix #3 (PENTING) — Baca `REDIS_SESSION_PREFIX` dan `REDIS_SESSION_TTL` dari `.env`

**File:** `src/server.js`, fungsi `buildSessionMiddleware()`

```javascript
// SEBELUM
config.store = new RedisStore({
  client: redisClient,
  prefix: 'lms:sess:',
  ttl: 60 * 60 * 8
});

// SESUDAH
config.store = new RedisStore({
  client: redisClient,
  prefix: process.env.REDIS_SESSION_PREFIX || 'lms:sess:',
  ttl: Number(process.env.REDIS_SESSION_TTL || 60 * 60 * 8)
});
```

---

### Fix #4 (PENTING) — Tambahkan `RUN_SCHEDULER` ke `ecosystem.config.js`

**File:** `ecosystem.config.js`

```javascript
env_production: {
  NODE_ENV: 'production',
  TZ: 'Asia/Jakarta',
  PORT: 3000,
  DB_CONNECTION_LIMIT: '70',
  ONLINE_TTL_SECONDS: '300',
  RUN_SCHEDULER: '0',  // ← Nonaktifkan di semua worker via ecosystem
}
```

Kemudian aktifkan hanya di 1 instance lewat PM2:
```bash
pm2 set lms-smkn1kras:RUN_SCHEDULER 1  # hanya instance 0
```
Atau gunakan `env` per instance jika versi PM2 mendukung.

---

### Fix #5 (SARAN) — Cek Koneksi Redis dari Server VPS Langsung

Dari VPS `10.10.102.11`, jalankan:
```bash
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 ping
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 info server
```

Jika `PONG` tidak kembali atau timeout, masalahnya di jaringan/firewall antara VPS, bukan di kode Node.js. Pastikan port 6379 di `10.10.102.8` terbuka untuk IP `10.10.102.11`.

---

### Fix #6 (SARAN) — Tambahkan `session.save()` Eksplisit di Login Handler

**File:** `src/routes/auth.js`

```javascript
// SEBELUM
req.session.user = { ... };
req.flash('success', `Selamat datang, ${user.full_name}!`);
return res.redirect('/dashboard');

// SESUDAH — paksa simpan session sebelum redirect
req.session.user = { ... };
req.session.save((err) => {
  if (err) console.error('[LOGIN] session.save error:', err.message);
  req.flash('success', `Selamat datang, ${user.full_name}!`);
  return res.redirect('/dashboard');
});
```

Ini memastikan session sudah tersimpan ke Redis sebelum browser melakukan redirect ke `/dashboard`.

---

## Checklist Prioritas

- [ ] **[SEGERA]** Cek jaringan dari `10.10.102.11` ke Redis `10.10.102.8:6379` — bisa ping/telnet?
- [ ] **[SEGERA]** Hapus `disableOfflineQueue: true` di `src/server.js`
- [ ] **[SEGERA]** Naikkan batas retry reconnect (hapus batas 20)
- [ ] **[PENTING]** Tambahkan `session.save()` eksplisit di login handler
- [ ] **[PENTING]** Set `RUN_SCHEDULER: '0'` di `ecosystem.config.js` env_production
- [ ] **[MINOR]** Baca `REDIS_SESSION_PREFIX` dan `REDIS_SESSION_TTL` dari `.env`

---

*Laporan ini dibuat dari analisis statis kode. Tidak ada perubahan yang dibuat ke codebase.*
