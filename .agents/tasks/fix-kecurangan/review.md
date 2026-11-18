# Review: Fix Kecurangan Ujian (3 Fix)

## Syntax Check
`node --check d:\WEBSITE\cbt\src\routes\student.js` → **EXIT 0** (tidak ada error sintaks).

---

## Fix 1 — Validasi Waktu Server-Side di Submit

**Lokasi kode:** `src/routes/student.js`, handler `POST /attempts/:id/submit`.

| Syarat | Status | Bukti |
|---|---|---|
| Bypass auto-submit: cek `req.body.auto_submit === true` atau `'true'` | ✅ | Baris `const isAutoSubmit = req.body.auto_submit === true \|\| req.body.auto_submit === 'true'` |
| Bypass: cek header `X-Auto-Submit: 1` | ✅ | Baris `const hasAutoHeader = req.headers['x-auto-submit'] === '1'` |
| Tolak 400 + JSON `{ ok: false, message: 'Waktu ujian sudah habis.' }` jika elapsed > duration + 5 menit | ✅ | Blok `if (durationMinutes > 0 && elapsedMinutes > durationMinutes + 5)` |
| Tolak jika `end_at` tidak null dan NOW() > end_at + 5 menit | ✅ | Query `SELECT (NOW() > :end_at::timestamptz + interval '5 minutes') AS expired` |
| Validasi SEBELUM `finalizeAttemptWithBackup` | ✅ | Blok validasi muncul sebelum pemanggilan `finalizeAttemptWithBackup` |
| Logika skor di `finalizeAttemptWithBackup` tidak berubah | ✅ | Fungsi diimpor dari `../utils/submission-utils` dan tidak dimodifikasi di file ini |

### ❌ BLOCKER — Klien tidak pernah mengirim `auto_submit: true` atau header `X-Auto-Submit: 1`

`submitWithRetry()` di `attempt_take.ejs` (dipanggil baik saat timeout maupun submit manual) mengirim fetch dengan:

```js
headers: {
  'Content-Type': 'application/json',
  'X-Retry-Count': retryCount.toString()   // ← tidak ada X-Auto-Submit
},
body: JSON.stringify({
  backup_data: loadBackupFromLocalStorage() // ← tidak ada auto_submit
})
```

Ketika timer habis (`remain <= 0`), `tick()` memanggil `submitWithRetry()` **tanpa argumen dan tanpa menyuntikkan field `auto_submit` atau header `X-Auto-Submit: 1`**. Dengan demikian, `isAutoSubmit` dan `hasAutoHeader` keduanya `false` saat auto-submit, sehingga server menjalankan validasi waktu. Karena elapsed sudah > duration + 5 menit (waktu sudah habis), server mengembalikan **400 `Waktu ujian sudah habis.`** dan jawaban tidak dikumpulkan — persis kondisi yang ingin dihindari oleh bypass ini.

**Konsekuensi:** Siswa yang mencapai batas waktu tidak dapat mengumpulkan jawaban secara otomatis; submisi gagal dengan 400, jawaban tidak tersimpan ke DB.

**Koreksi:** Di `attempt_take.ejs`, ubah `submitWithRetry` agar menerima parameter `isAuto`, lalu saat dipanggil dari `tick()` kirimkan `isAuto = true`. Dalam fetch, sertakan:
```js
// Jika isAuto === true:
headers: { 'Content-Type': 'application/json', 'X-Auto-Submit': '1', 'X-Retry-Count': String(retryCount) },
body: JSON.stringify({ auto_submit: true, backup_data: loadBackupFromLocalStorage() })
```

---

## Fix 2 — Watermark Identitas Siswa

**Lokasi kode:** `src/views/student/attempt_take.ejs`, bagian awal.

| Syarat | Status | Bukti |
|---|---|---|
| Overlay `position:fixed` | ✅ | `style="position:fixed;top:0;left:0;width:100%;height:100%;..."` |
| `pointer-events:none` | ✅ | Ada di style inline |
| `z-index:20` | ✅ | Ada di style inline |
| Nama siswa + username (tanpa @domain) via JS | ✅ | `var name = "<%= user.full_name %>"` dan `var uname = "<%= user.username.split('@')[0] %>"` |
| Opacity SVG sekitar 0.05 | ✅ | `opacity="0.05"` pada elemen `<text>` di SVG |
| Tidak mengganggu elemen interaktif | ✅ | `pointer-events:none` memastikan klik/input tembus ke bawah |

**Fix 2: LULUS.**

---

## Fix 3 — Rate Limit Autosave dan Submit

**Lokasi kode:** `src/routes/student.js`, bagian atas.

| Syarat | Status | Bukti |
|---|---|---|
| `submitRateMap` ada | ✅ | `const submitRateMap = new Map()` |
| `autosaveRateMap` ada | ✅ | `const autosaveRateMap = new Map()` |
| Fungsi `checkRateLimit` ada | ✅ | Didefinisikan dengan parameter `(map, userId, maxCount, windowMs)` |
| Autosave maks 120 req/menit per user, tolak 429 | ✅ | `checkRateLimit(autosaveRateMap, user.id, 120, 60 * 1000)` → `res.status(429)` |
| Submit maks 5 req per 10 menit per user, tolak 429 | ✅ | `checkRateLimit(submitRateMap, user.id, 5, 10 * 60 * 1000)` → `res.status(429)` |
| Cleanup interval untuk Map | ✅ | `setInterval` 30 menit menghapus entri kedaluwarsa dari kedua Map |

**Fix 3: LULUS.**

---

## Temuan Lain (Non-Blocker, Out of Scope)

- Ada pemeriksaan `if (!attempt)` duplikat setelah blok validasi waktu (sekitar baris setelah `// ─────`), sudah ada pemeriksaan sebelumnya — tidak menimbulkan masalah fungsional, hanya dead code.

---

## Ringkasan Verdict

| Fix | Status |
|---|---|
| Fix 1 – Validasi waktu server-side | ❌ BLOCKER: klien auto-submit tidak mengirim bypass headers/body |
| Fix 2 – Watermark identitas | ✅ LULUS |
| Fix 3 – Rate limit | ✅ LULUS |

**Verdict: CHANGES_REQUESTED**
