# Laporan Investigasi Keamanan Ujian — CBT LMS
**Tanggal:** Investigasi otomatis, read-only  
**Fokus:** Deteksi multi-tab & pelanggaran siswa saat ujian

---

## Ringkasan Jawaban Cepat

| Pertanyaan | Jawaban |
|---|---|
| Apakah ada deteksi multi-tab? | **Ya** — `visibilitychange` + `window blur` (desktop only) |
| Mekanisme benar-benar mengunci atau hanya mencatat? | **Keduanya** — mencatat dulu, lalu **mengunci layar** setelah pelanggaran mencapai `max_violations` |
| Di mana logikanya? | **Frontend + Backend** (full-stack) |
| Apakah ada celah bypass? | **Ya** — beberapa celah nyata, dijelaskan di bawah |
| Apakah ada tabel DB? | **Ya** — tabel `attempt_violations` + kolom `is_locked`, `unlock_token`, `locked_at`, `unlock_count` di `attempts` |
| Batas pelanggaran sebelum auto-submit? | **Tidak ada auto-submit** — hanya dikunci, siswa tetap bisa lanjut setelah guru buka kunci |

---

## 1. Mekanisme Deteksi (Frontend)

**File:** `src/views/student/attempt_take.ejs`

Tiga event dideteksi:

### a. `visibilitychange`
```javascript
// Baris ~985 attempt_take.ejs
document.addEventListener('visibilitychange', () => {
  if (document.hidden) reportViolation('Pindah Tab/Aplikasi', 'visibilitychange');
});
```
Ini event paling handal untuk deteksi pindah tab. Terpicu setiap kali tab menjadi hidden — termasuk saat siswa membuka tab baru, switch ke aplikasi lain, atau menekan Alt+Tab.

### b. `window blur` (desktop only)
```javascript
// Baris ~990 attempt_take.ejs
const isMobileDevice = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent);
if (!isMobileDevice) {
  window.addEventListener('blur', () => reportViolation('Pindah Tab/Aplikasi', 'blur'));
}
```
Sengaja dinonaktifkan di HP/tablet karena keyboard virtual sering memicu blur palsu. Ini keputusan yang tepat.

### c. `fullscreenchange`
```javascript
document.addEventListener('fullscreenchange', () => {
  if (!isFullscreen()) reportViolation('Keluar Fullscreen', 'fullscreenchange');
});
```

### d. Pelanggaran tambahan yang turut dideteksi
- Klik kanan (`contextmenu`) — desktop only
- Copy/cut/paste
- Keyboard shortcut: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+P, Ctrl+S, Ctrl+U
- PrintScreen key

### Debounce
Setiap tipe pelanggaran diberi debounce 2 detik:
```javascript
// anti.sentAt — Map untuk track waktu terakhir tiap tipe violation
if (nowMs() - last < 2000) return;
```
Artinya satu tindakan tidak bisa menghasilkan banyak pelanggaran sekaligus dalam 2 detik.

---

## 2. Cara Kerja Backend

**File:** `src/routes/student.js`, baris 841–909

### Alur pelanggaran:
1. Frontend POST ke `/student/attempts/:id/violation` dengan `{ type, details }`
2. Backend cek: apakah anti-cheat diaktifkan (`max_violations > 0`)? Jika tidak → abaikan
3. Jika `is_locked` sudah true → kembalikan status terkunci tanpa catat baru
4. INSERT ke tabel `attempt_violations`
5. Hitung jumlah pelanggaran **sejak `locked_at` terakhir** (bukan total):
   ```sql
   SELECT COUNT(*) AS c FROM attempt_violations
   WHERE attempt_id=:aid
   AND created_at > COALESCE(
     (SELECT locked_at FROM attempts WHERE id=:aid),
     '1970-01-01'
   );
   ```
6. Jika `count >= max_violations` → set `is_locked=true`, generate `unlock_token` acak (6 karakter), simpan `locked_at=now()`
7. Frontend terima `{ locked: true }` → tampilkan layar kunci merah fullscreen
8. Frontend polling `/student/attempts/:id/lock-status` setiap 3 detik
9. Guru buka kunci dari halaman `/teacher/violations/locked` → UPDATE `is_locked=false, locked_at=now()`
10. Saat unlock, `locked_at` diperbarui → counter pelanggaran mulai dari nol lagi

### Layar kunci
Layar kunci (div `#lockScreen`) menutupi seluruh viewport dengan z-index tinggi dan background merah. Siswa **tidak bisa mengerjakan soal** selama terkunci.

**Penting:** Tidak ada auto-submit. Jawaban yang sudah tersimpan aman.

---

## 3. Lokasi Logika

| Komponen | File | Fungsi |
|---|---|---|
| Frontend deteksi event | `src/views/student/attempt_take.ejs` | `reportViolation()`, event listeners |
| Backend catat violation | `src/routes/student.js` | `POST /attempts/:id/violation` |
| Backend cek status kunci | `src/routes/student.js` | `GET /attempts/:id/lock-status` |
| Backend unlock via token | `src/routes/student.js` | `POST /attempts/:id/unlock` |
| Admin/teacher buka kunci | `src/routes/admin.js` + `src/routes/teacher.js` | `GET/POST /violations/locked`, `/violations/unlock/:id` |
| View daftar terkunci | `src/views/teacher/violations_locked.ejs` | Tabel siswa terkunci + tombol setujui |
| Konfigurasi anti-cheat | Admin/teacher saat buat/edit ujian | Field `max_violations`, checkbox `anticheat_enabled` |
| Socket | `src/socket/index.js` | **Tidak ada** logika anti-cheat di socket |

---

## 4. Skema Database

**Tabel `exams`** (`sql/schema_pg.sql`, baris 132):
```sql
max_violations INT NOT NULL DEFAULT 3
```
Nilai 0 = anti-cheat dinonaktifkan.

**Tabel `attempts`** (`sql/add_violation_lock.sql`):
```sql
is_locked    BOOLEAN NOT NULL DEFAULT FALSE
unlock_token VARCHAR(20) NULL
locked_at    TIMESTAMP NULL
unlock_count INT NOT NULL DEFAULT 0
```

**Tabel `attempt_violations`** (`sql/schema_pg.sql`, baris 213–221):
```sql
CREATE TABLE IF NOT EXISTS attempt_violations (
  id SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_violation_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);
```

---

## 5. Celah / Bypass yang Ditemukan

### Celah 1 — KRITIS: Disable JavaScript di browser
**Deskripsi:** Seluruh sistem anti-cheat berjalan di JavaScript frontend. Jika siswa menonaktifkan JavaScript sebelum membuka halaman ujian (browser tertentu mengizinkan ini), tidak ada satu pun event listener yang aktif. Pelanggaran tidak akan pernah terkirim ke server.

**Dampak:** Siswa bisa bebas buka multi-tab tanpa dicatat.

**Sumber:** `attempt_take.ejs` — semua kode deteksi ada dalam tag `<script>`.

---

### Celah 2 — SEDANG: Bypass via `visibilitychange` menggunakan browser extension / second monitor
**Deskripsi:** Beberapa browser extension bisa memblokir event `visibilitychange`. Selain itu, jika siswa memiliki dua monitor, mereka bisa membuka browser/referensi di monitor kedua tanpa tab berpindah. Event `blur` dinonaktifkan di mobile.

**Dampak:** Siswa bisa membuka material referensi tanpa deteksi.

---

### Celah 3 — SEDANG: Counter violation reset setelah unlock (desain disengaja, tapi bisa dieksploitasi)
**Deskripsi:** Logika penghitungan violation menggunakan timestamp `locked_at`:
```sql
AND created_at > COALESCE((SELECT locked_at FROM attempts WHERE id=:aid), '1970-01-01')
```
Saat guru membuka kunci, `locked_at` diperbarui ke `now()`. Ini berarti **counter pelanggaran reset ke nol**. Siswa yang sudah 3 kali melanggar, dikunci, lalu dibuka → bisa melanggar 3 kali lagi.

**File:** `src/routes/teacher.js` baris 2780:
```sql
UPDATE attempts SET is_locked=false, unlock_token=null, unlock_count=unlock_count+1, locked_at=now() WHERE id=:aid;
```

**Dampak:** Siswa bisa berulang kali melanggar selama guru terus membuka kunci. Kolom `unlock_count` mencatat berapa kali dibuka, tapi tidak ada batas maksimum unlock.

---

### Celah 4 — SEDANG: Siswa unlock sendiri jika tahu token (endpoint terbuka)
**Deskripsi:** Ada endpoint `POST /student/attempts/:id/unlock` yang menerima token dari siswa:
```javascript
// src/routes/student.js baris 925
router.post('/attempts/:id/unlock', async (req, res) => {
  const { token } = req.body || {};
  // ...
  if (String(attempt.unlock_token).toUpperCase() !== String(token).toUpperCase()) {
    return res.json({ ok: false, message: 'Token salah.' });
  }
  // Buka kunci!
});
```
Token dihasilkan sebagai string 6 karakter alfanumerik (`Math.random().toString(36).substring(2, 8)`). Ruang token adalah ~36^6 ≈ 2,1 miliar kombinasi — sulit di-bruteforce secara manual. Namun, tidak ada proteksi rate-limit pada endpoint ini. Jika ada siswa yang bisa mengirim banyak permintaan, endpoint ini bisa diserang.

**Catatan:** Di UI frontend (`attempt_take.ejs`), fungsi `submitUnlockToken()` sudah dikomentari: `// Tidak digunakan lagi - unlock dilakukan oleh guru/admin`. Tapi **route backend-nya masih ada** dan aktif. Siswa yang tahu URL bisa langsung POST ke endpoint ini.

---

### Celah 5 — RENDAH: Tidak ada `beforeunload` listener
**Deskripsi:** Tidak ada event `beforeunload` yang mencatat atau mencegah siswa menutup tab ujian. Saat siswa menutup tab, browser menampilkan dialog standar hanya jika ada form yang belum disubmit — tidak ada dalam implementasi ini karena autosave via fetch.

**Dampak:** Siswa bisa menutup tab tanpa peringatan. Namun ini tidak terlalu berbahaya karena jawaban tersimpan otomatis dan attempt masih aktif.

---

### Celah 6 — RENDAH: Fullscreen tidak wajib (hanya disarankan)
**Deskripsi:** Fullscreen diminta saat interaksi pertama, tapi browser tidak wajibkan user menerima. Jika siswa menolak fullscreen, tidak ada sanksi — hanya akan terus dilaporkan sebagai pelanggaran "Keluar Fullscreen" setiap kali `fullscreenchange` terpicu. Ini bisa dengan cepat memenuhi kuota `max_violations` untuk pelanggaran yang sebenarnya bukan kecurangan tabbing.

---

### Celah 7 — RENDAH: Tidak ada validasi status attempt di endpoint violation
**Deskripsi:** Di backend violation handler, baris terakhir:
```javascript
// Baris 908
if (attempt.status === 'IN_PROGRESS') {
  // hitung dan kunci
}
return res.json({ ok: true, logged: true, locked: false }); // ← bila status bukan IN_PROGRESS, tetap INSERT
```
Violation tetap di-INSERT ke database meski status attempt bukan `IN_PROGRESS`, tapi pengecekan kunci hanya dilakukan jika status `IN_PROGRESS`. Ini bukan masalah serius tetapi mengotori tabel violations.

---

## 6. Apa yang Sudah Benar

✅ **Deteksi `visibilitychange` diimplementasikan dengan benar** — ini event paling andal untuk deteksi pindah tab di browser modern.

✅ **Debounce 2 detik** mencegah satu tindakan membanjiri violation log.

✅ **Anti-cheat bisa dinonaktifkan per ujian** (`max_violations = 0`) — guru fleksibel.

✅ **Layar kunci benar-benar memblokir UI** — tidak hanya mencatat, tapi mengunci akses ke soal.

✅ **Jawaban tidak hilang saat terkunci** — ada LocalStorage backup + autosave per jawaban.

✅ **Polling real-time** (3 detik) agar layar terbuka otomatis setelah guru setujui.

✅ **Dashboard guru/admin** untuk melihat semua siswa terkunci + buka kunci satu per satu atau massal.

✅ **Log lengkap** di tabel `attempt_violations` — ada violation type, details, timestamp.

✅ **Autentikasi route** — semua route student dilindungi `requireRole('STUDENT')`, endpoint violation memvalidasi bahwa attempt milik siswa yang sedang login.

✅ **Mobile device detection** yang tepat untuk menonaktifkan blur listener di HP.

---

## 7. Rekomendasi Perbaikan

### P1 — KRITIS: Lindungi dari JS disabled

Tidak ada cara frontend bisa mendeteksi ini. Solusinya ada di **sisi server**:

1. Implementasikan **server-sent heartbeat** — setiap 30 detik, siswa wajib kirim sinyal "masih aktif" ke server. Jika tidak ada sinyal dalam X detik → server tandai sebagai potensi kecurangan atau otomatis submit.
2. Alternatif: gunakan **WebSocket/Socket.IO** yang sudah ada di project ini (`src/socket/index.js`) untuk membuat siswa harus join room ujian aktif. Jika socket putus lebih dari N detik tanpa reconnect → catat sebagai pelanggaran di sisi server.

---

### P2 — SEDANG: Tambahkan rate-limit di endpoint `/student/attempts/:id/unlock`

Meski tidak ada UI untuk token unlock di frontend, route backend masih aktif. Tambahkan rate-limit (misalnya max 10 request per 5 menit per IP):

```javascript
// Contoh dengan express-rate-limit
const unlockLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10 });
router.post('/attempts/:id/unlock', unlockLimiter, async (req, res) => { ... });
```

Atau nonaktifkan seluruh endpoint `/student/attempts/:id/unlock` jika memang sudah tidak digunakan (fungsi `submitUnlockToken()` sudah dikomentari di frontend).

---

### P3 — SEDANG: Batasi jumlah unlock per attempt

Saat ini `unlock_count` hanya dicatat, tidak pernah dicek. Tambahkan batas maksimum:

```javascript
// Di teacher/admin unlock handler:
if (attempt.unlock_count >= MAX_UNLOCK_ALLOWED) {
  // Otomatis submit atau blokir unlock lebih lanjut
}
```

Atau tampilkan peringatan di UI violations_locked ketika `unlock_count >= 2`.

---

### P4 — SEDANG: Pisahkan pelanggaran "Keluar Fullscreen" dari tab switching

Fullscreen refusal bisa terjadi karena alasan teknis (browser policy, accessibility). Solusi:

- Beri bobot berbeda: "Pindah Tab" = 1 violation, "Keluar Fullscreen" = 0.5 violation (atau nilai terpisah)
- Atau: jangan hitung "Keluar Fullscreen" pertama sebagai violation penuh, beri satu kali gratis

---

### P5 — RENDAH: Tambahkan `beforeunload` warning

```javascript
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = 'Yakin meninggalkan halaman ujian? Jawaban yang belum tersimpan mungkin hilang.';
});
```

Ini tidak mencegah kecurangan tapi mengurangi aksidental menutup tab.

---

### P6 — RENDAH: Bersihkan INSERT violation untuk attempt yang sudah selesai

Di backend, tambahkan guard sebelum INSERT:

```javascript
if (attempt.status !== 'IN_PROGRESS') {
  return res.json({ ok: true, logged: false, locked: false });
}
```

---

## Kesimpulan

Sistem anti-cheat CBT LMS ini sudah **cukup baik untuk lingkungan sekolah normal**. Deteksi multi-tab via `visibilitychange` berfungsi dengan benar, backend memvalidasi dan menyimpan setiap pelanggaran, dan layar kunci benar-benar memblokir siswa. Guru punya kontrol penuh untuk buka/tutup kunci.

**Kelemahan utama** adalah ketergantungan total pada JavaScript sisi klien — yang secara prinsip tidak bisa dipercaya sepenuhnya. Untuk ujian dengan tingkat kepercayaan tinggi (misalnya ujian nasional), perlu tambahan mekanisme server-side heartbeat. Untuk ujian sekolah biasa, sistem yang ada sudah memadai jika guru aktif memantau dashboard violations.

Celah token unlock (`/student/attempts/:id/unlock`) adalah risiko nyata yang mudah diperbaiki dan sebaiknya segera ditangani.
