# Laporan Investigasi Celah Kecurangan Siswa — LMS CBT

**Tanggal investigasi:** 2025  
**File yang diperiksa:**  
- `src/routes/student.js`  
- `src/views/student/attempt_take.ejs`  
- `src/utils/submission-utils.js`  
- `src/routes/quiz-api.js`  
- `src/middleware/auth.js`  
- `src/server.js` (konfigurasi middleware)  
- `src/routes/auth.js` (rate limiter)

---

## Ringkasan Eksekutif

Sistem anti-cheat yang sudah ada cukup solid untuk vektor-vektor umum (tab switching, fullscreen exit, copy-paste). Namun ditemukan **4 celah kritis/serius** yang belum tertutup dan berpotensi dieksploitasi dengan mudah oleh siswa yang cukup teknis.

| No | Celah | Risiko |
|----|-------|--------|
| 1 | Network tab: jawaban benar terekspos saat autosave (subquery `is_correct`) | **KRITIS** |
| 2 | Tidak ada validasi waktu server-side di endpoint submit | **KRITIS** |
| 3 | Tidak ada CSRF protection di semua POST endpoint ujian | **SEDANG** |
| 4 | Tidak ada rate-limit di endpoint `/answer`, `/violation`, `/heartbeat` | **SEDANG** |
| 5 | Soal baru bisa di-scrape saat ujian berlangsung via Network tab | **SEDANG** |
| 6 | Tidak ada watermark identitas di layar ujian | **RENDAH** |
| 7 | Tidak ada celah di inspect element jawaban benar | AMAN |
| 8 | Multiple attempt sudah diblokir dengan benar | AMAN |
| 9 | Isolasi antar-siswa sudah benar | AMAN |
| 10 | Backup client tidak diapply ke jawaban server | AMAN |

---

## Temuan Detail

---

### 1. 🔴 KRITIS — Network Tab: Respons Autosave Mengekspos `is_correct`

**File:** `src/routes/student.js`, route `POST /attempts/:id/answer`

**Bukti kode (baris ~825–833):**
```javascript
await pool.query(
  `UPDATE attempt_answers
   SET option_id=:oid,
       is_correct=(SELECT is_correct FROM options WHERE id=:oid AND question_id=:qid LIMIT 1),
       answered_at=NOW()
   WHERE attempt_id=:aid AND question_id=:qid;`,
  { oid: option_id, aid: attemptId, qid: question_id }
);
return res.json({ ok: true });
```

**Analisis:**  
Nilai `is_correct` dari tabel `options` memang ditulis ke kolom `attempt_answers.is_correct` di DB untuk efisiensi kalkulasi skor akhir — ini benar. Namun, endpoint ini hanya mengembalikan `{ ok: true }`. Secara langsung, `is_correct` **tidak** dikembalikan di response JSON ke browser.

**NAMUN — celah tetap ada lewat cara lain:**  
Saat siswa memilih jawaban, request autosave dikirim ke `/student/attempts/:id/answer` dengan body `{ question_id, option_id }`. Siswa bisa menggunakan DevTools Network tab untuk:
1. **Melihat semua `option_id` yang valid** — karena value input HTML di `attempt_take.ejs` berisi ID opsi asli dari database (`value="<%= o.id %>"`)
2. **Brute-force: kirim request manual untuk setiap `option_id` dari soal yang sama** — respons server selalu `{ ok: true }`, tidak memberi tahu mana yang benar TETAPI, teknik ini tidak langsung memberi jawaban karena responsnya tidak mengandung `is_correct`.

**Celah yang LEBIH SERIUS di sini:**  
Endpoint `GET /student/attempts/:id` (halaman ujian) mengembalikan semua soal beserta `chosen_option_id`. Saat halaman dimuat pertama kali, semua data soal sudah ada di HTML source. Dengan inspect element atau Network tab saat pertama load, siswa bisa melihat **semua `option_id`** dari setiap opsi yang ditampilkan. Karena `option_id` adalah integer berurutan di DB, siswa yang paham bisa mengirim request autosave dengan berbagai `option_id` dan memantau apakah ada respons berbeda — tapi karena respons selalu `{ ok: true }`, celah ini **tidak sepenuhnya** terbuka untuk brute-force langsung.

**Risiko yang paling nyata:** Siswa yang membuka Network tab bisa **merekam semua request autosave** teman sekelas (jika di jaringan yang sama dan tidak ada HTTPS), atau bisa memanipulasi `option_id` yang dikirim secara manual setelah mencuri ID opsi dari HTML source. Lihat juga temuan #5.

**Rekomendasi:**  
- Endpoint `/answer` sudah cukup aman karena tidak mengembalikan `is_correct`
- Tambahkan validasi bahwa `option_id` yang dikirim adalah opsi yang memang ada di `attempt_answers` siswa tersebut (join ke `attempt_answers` di UPDATE)

---

### 2. 🔴 KRITIS — Tidak Ada Validasi Waktu Server-Side di Submit

**File:** `src/routes/student.js`, route `POST /attempts/:id/submit` (baris ~961)  
**File:** `src/utils/submission-utils.js`, fungsi `finalizeAttemptWithBackup`

**Bukti kode — route submit tidak memeriksa waktu:**
```javascript
router.post('/attempts/:id/submit', async (req, res) => {
  // ...
  const [[attempt]] = await pool.query(
    `SELECT a.id, a.status, a.exam_id, a.submission_status
     FROM attempts a
     WHERE a.id=:aid AND a.student_id=:sid LIMIT 1;`,
    { aid: attemptId, sid: user.id }
  );
  // TIDAK ADA: cek apakah NOW() > started_at + duration_minutes
  // TIDAK ADA: cek apakah NOW() > exam.end_at
  if (attempt.status === 'IN_PROGRESS' ...) {
    await finalizeAttemptWithBackup(attemptId, user.id, attempt.exam_id);
```

**Analisis:**  
Fungsi `finalizeAttemptWithBackup` di `submission-utils.js` juga tidak melakukan validasi waktu — ia langsung mengambil jawaban dari DB dan menghitung skor. Timer ujian **hanya ada di sisi client** (`attempt_take.ejs`). Siswa yang mengerti DevTools bisa:
1. Membiarkan timer client habis (auto-submit di-block dengan `timeUpSubmitted` flag)
2. Mengirim request `POST /student/attempts/:id/submit` secara manual via `curl` atau Postman **kapan saja**, bahkan jam kemudian, selama session masih aktif dan `attempt.status` masih `IN_PROGRESS`
3. Dengan demikian, siswa bisa membuka browser lain untuk mencari jawaban, lalu submit secara manual setelah waktu ujian selesai

**Catatan:** Memang ada logika `expiredCount` di route `/start` yang menganggap attempt sebagai "expired" jika sudah melewati `duration_minutes + 10`, tapi ini hanya **mencegah siswa memulai ulang**, bukan mencegah submit terlambat.

**Rekomendasi:**  
Di route `POST /attempts/:id/submit`, tambahkan validasi server-side:
```javascript
const [[attemptWithTime]] = await pool.query(
  `SELECT a.*, e.duration_minutes, e.end_at,
          EXTRACT(EPOCH FROM (NOW() - a.started_at))/60 AS elapsed_minutes
   FROM attempts a JOIN exams e ON e.id=a.exam_id
   WHERE a.id=:aid AND a.student_id=:sid LIMIT 1`,
  { aid: attemptId, sid: user.id }
);
// Tolak jika elapsed > duration + grace (misal 5 menit)
const grace = 5;
if (attemptWithTime.elapsed_minutes > attemptWithTime.duration_minutes + grace) {
  return res.status(400).json({ ok: false, message: 'Waktu ujian sudah habis.' });
}
// Tolak jika end_at sudah lewat (+ grace)
if (attemptWithTime.end_at && new Date() > new Date(new Date(attemptWithTime.end_at).getTime() + grace * 60000)) {
  return res.status(400).json({ ok: false, message: 'Batas waktu ujian sudah lewat.' });
}
```

---

### 3. 🟡 SEDANG — Tidak Ada CSRF Protection di Endpoint Ujian

**File:** `src/server.js` (tidak ditemukan `csurf` atau token CSRF)  
**File:** `src/routes/student.js` — semua POST endpoint (`/answer`, `/submit`, `/violation`, `/heartbeat`)

**Bukti:** Pencarian `csrf|csurf|_csrf|csrfToken` di seluruh codebase tidak menemukan hasil.

**Analisis:**  
Semua endpoint POST ujian tidak diproteksi CSRF. Artinya:
- Seseorang bisa membuat halaman web berbahaya yang mengirimkan request `POST /student/attempts/:id/submit` atas nama siswa yang sudah login
- Karena session berbasis cookie, jika siswa membuka tab lain ke situs berbahaya (sudah ada pelanggaran, tapi tetap mungkin sebelum terdeteksi), submit bisa dipicu dari luar
- Lebih relevan: siswa yang sudah punya `attempt_id` orang lain (misalnya bocor) bisa mencoba memanipulasi jawaban orang lain — meskipun dibatasi oleh validasi `student_id` dari session

**Rekomendasi:**  
Gunakan `csurf` package atau implementasi CSRF token sederhana di form submit. Minimal tambahkan header check `X-Requested-With: XMLHttpRequest` di endpoint AJAX.

---

### 4. 🟡 SEDANG — Tidak Ada Rate-Limit di Endpoint Autosave dan Violation

**File:** `src/routes/student.js`  
**File:** `src/routes/auth.js` — rate limiter hanya ada untuk `/login`

**Bukti:**
```javascript
// auth.js — hanya login yang dilindungi
app.post('/login', getLoginRateLimiter(redisClient));
// Tidak ada rate limit untuk:
// POST /student/attempts/:id/answer
// POST /student/attempts/:id/violation
// POST /student/attempts/:id/heartbeat
// POST /student/attempts/:id/submit
```

**Analisis:**  
- **Endpoint `/answer`:** Siswa bisa mengirim ribuan request autosave palsu, membebani DB atau mencoba brute-force (meskipun tidak ada feedback langsung)
- **Endpoint `/violation`:** Ada proteksi client-side `sentAt` map dengan debounce 2 detik, tapi di server tidak ada pembatasan — siswa bisa spam laporan palsu (tidak berbahaya, tapi mengganggu log)
- **Endpoint `/submit`:** Tanpa rate-limit, retry loop bisa membuat beban tinggi saat banyak siswa submit bersamaan

**Rekomendasi:**  
Tambahkan rate limiter per-user untuk endpoint `/answer` (maks ~60 req/menit) dan `/submit` (maks 5 req/menit) menggunakan Redis yang sudah tersedia.

---

### 5. 🟡 SEDANG — Soal Bisa Di-Scrape via Network Tab Saat Halaman Ujian Dimuat

**File:** `src/routes/student.js`, route `GET /student/attempts/:id`  
**File:** `src/views/student/attempt_take.ejs`

**Bukti kode — semua soal dikirim sekaligus ke browser:**
```javascript
// Di route GET /attempts/:id, semua soal dikirim ke template:
res.render('student/attempt_take', { title: 'Mengerjakan Ujian', attempt, questions });
// 'questions' berisi SEMUA soal dengan teks lengkap, gambar, dan semua opsi
```

**Analisis:**  
Halaman ujian di-render server-side dengan EJS, sehingga **seluruh soal ujian** (teks, gambar, semua opsi) ada di HTML yang dikirim ke browser sekaligus. Siswa bisa:
1. Membuka DevTools > Network > cari request ke `/student/attempts/:id` 
2. Lihat response HTML yang berisi semua soal
3. Atau cukup `Ctrl+U` (View Source) untuk melihat semua soal sekaligus

Meskipun `Ctrl+U` diblokir client-side, browser DevTools tidak bisa diblokir. Shortcut `Ctrl+U` hanya diblokir dengan `e.preventDefault()` di keydown, tapi DevTools → Network tetap bisa diakses.

**Catatan penting:** Soal tidak bisa di-scrape **sebelum ujian dimulai** karena route `/attempts/:id` memvalidasi bahwa attempt milik siswa tersebut dan statusnya `IN_PROGRESS`. Namun **setelah ujian dimulai**, semua soal bisa dilihat sekaligus.

**Rekomendasi:**  
Implementasikan lazy-loading soal — kirim soal satu per satu saat siswa pindah ke soal tersebut, bukan seluruhnya sekaligus. Ini butuh refactoring signifikan; alternatif lebih mudah: tambahkan watermark identitas (lihat #10) dan pastikan soal-soal tidak terlalu kritis jika bocor.

---

### 6. 🟢 RENDAH — Tidak Ada Watermark Identitas di Layar Ujian

**File:** `src/views/student/attempt_take.ejs`

**Bukti:** Pencarian `watermark|canvas|identitas` di `attempt_take.ejs` tidak menemukan hasil. Nama siswa hanya muncul di navbar (dari `partials/navbar.ejs`) sebagai teks kecil.

**Analisis:**  
Tidak ada watermark berisi nama/NISN siswa yang ditampilkan di atas layar ujian. Siswa bisa melakukan screen recording atau screenshot soal tanpa bukti identitas yang jelas tertempel di gambar.

**Rekomendasi:**  
Tambahkan overlay CSS semi-transparan di atas area soal yang menampilkan nama + username siswa secara berulang (diagonal). Ini tidak mencegah screenshot tapi membuat bukti rekaman bisa diatribusikan ke siswa tertentu. Contoh implementasi:
```css
.watermark-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 30;
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 80px,
    rgba(0,0,0,0.03) 80px,
    rgba(0,0,0,0.03) 82px
  );
}
```
Dan teks nama siswa di setiap "baris diagonal" menggunakan `canvas` atau SVG background.

---

### 7. ✅ AMAN — Inspect Element: Jawaban Benar Tidak Ada di HTML Source

**File:** `src/views/student/attempt_take.ejs`

**Bukti:**  
- Template `attempt_take.ejs` tidak pernah merender `is_correct`, `correct_option`, atau kunci jawaban apapun
- Query di route `GET /attempts/:id` hanya mengambil `option_id, option_label, option_text, option_image` — tidak ada `is_correct`
- Pencarian `is_correct|correct` di `attempt_take.ejs` tidak menemukan hasil

**Kesimpulan:** Jawaban benar tidak terekspos di HTML source halaman ujian. ✅

---

### 8. ✅ AMAN — Multiple Attempt Sudah Diblokir Dengan Benar

**File:** `src/routes/student.js`, route `POST /exams/:id/start`

**Bukti:**  
- Sistem menghitung `submittedCount + expiredCount` sebagai `effectiveCount`
- Jika `effectiveCount >= exam.max_attempts` → ditolak
- Jika ada `activeInProgress` → diarahkan ke attempt yang sudah ada
- Attempt `IN_PROGRESS` yang sudah lewat `duration_minutes + 10` dianggap expired dan masuk hitungan

**Kesimpulan:** Tidak bisa memulai ujian ulang jika kuota sudah habis. ✅

---

### 9. ✅ AMAN — Isolasi Data Antar Siswa

**File:** `src/routes/student.js`

**Bukti:**  
- Semua query menggunakan `AND a.student_id = :sid` dimana `:sid` berasal dari `req.session.user.id`
- Route `GET /attempts/:id` memvalidasi: `WHERE a.id=:aid AND a.student_id=:sid`
- Siswa tidak bisa akses halaman ujian siswa lain — akan mendapat 404

**Kesimpulan:** Isolasi data antar siswa sudah benar. ✅

---

### 10. ✅ AMAN — Backup Client Tidak Di-Apply ke Jawaban Server

**File:** `src/routes/student.js` (submit route), `src/utils/submission-utils.js`

**Bukti:**  
Pada route submit, `clientBackup` dari body request hanya di-log dan disimpan ke tabel `submission_backups` sebagai data forensik — **tidak pernah digunakan untuk mengganti jawaban di `attempt_answers`**. Fungsi `finalizeAttemptWithBackup` hanya membaca data dari DB (`attempt_answers`), bukan dari request body.

```javascript
// Di student.js submit route:
if (clientBackup) {
  console.log(`📦 Client backup received: ${clientBackup.answers?.length || 0} answers`);
}
await finalizeAttemptWithBackup(attemptId, user.id, attempt.exam_id);
// finalizeAttemptWithBackup membaca dari DB, bukan dari clientBackup
```

**Kesimpulan:** Siswa tidak bisa inject jawaban melalui field `backup_data`. ✅

---

### 11. Catatan: Validasi Backend Jawaban

**File:** `src/routes/student.js`, route `POST /attempts/:id/answer`

**Bukti:**
```javascript
// Validasi dasar:
const [[attemptQ]] = await pool.query(
  `SELECT a.id, a.exam_id, a.status, q.question_type
   FROM attempts a
   JOIN questions q ON q.id=:qid
   WHERE a.id=:aid AND a.student_id=:sid LIMIT 1;`,
  { aid: attemptId, sid: user.id, qid: question_id }
);
```

**Analisis — CELAH KECIL:**  
Validasi memastikan `attempt` milik siswa dan `question_id` adalah soal yang valid, tapi **tidak memvalidasi bahwa `question_id` tersebut ada dalam `attempt_answers` siswa ini**. Artinya siswa bisa mengirim `question_id` dari soal ujian lain (yang bukan bagian dari attempt ini) dan UPDATE akan berjalan tanpa error — namun tidak akan mengubah data karena klausa `WHERE attempt_id=:aid AND question_id=:qid` tidak akan menemukan baris. Dampak nyata: tidak ada.

Lebih penting: tidak ada validasi bahwa `option_id` yang dikirim memang opsi yang valid untuk `question_id` tersebut — siswa bisa mengirim `option_id` sembarangan. Subquery `(SELECT is_correct FROM options WHERE id=:oid AND question_id=:qid)` akan mengembalikan `NULL` jika opsi tidak ada, maka `is_correct` akan menjadi NULL, bukan error. Dampak: jawaban tersimpan tapi dianggap salah saat scoring (karena `is_correct` NULL dihitung sebagai tidak benar). Secara efektif tidak memberi keuntungan untuk kecurangan.

---

## Ringkasan Rekomendasi Prioritas

### Segera Perbaiki (Kritis)

1. **Tambahkan validasi waktu server-side di `POST /attempts/:id/submit`**  
   Cek `NOW() > started_at + duration_minutes + grace` dan `NOW() > exam.end_at + grace`. Ini adalah celah paling berbahaya karena mudah dieksploitasi dengan curl/Postman.

### Perbaiki Minggu Ini (Sedang)

2. **Tambahkan rate-limit per-user di endpoint `/answer` dan `/submit`**  
   Gunakan Redis yang sudah tersedia. Contoh: maks 120 request/menit untuk `/answer`, 10 request/menit untuk `/submit`.

3. **Tambahkan CSRF protection**  
   Minimal tambahkan synchronizer token pattern di form submit ujian, atau gunakan `csurf` middleware untuk semua route student POST.

### Improvement Jangka Panjang (Rendah)

4. **Tambahkan watermark identitas siswa di layar ujian**  
   Overlay CSS/canvas dengan nama + username siswa, diagonal, semi-transparan.

5. **Pertimbangkan lazy-loading soal (1 soal per request)**  
   Mencegah scraping seluruh soal sekaligus dari Network tab. Butuh refactoring signifikan tapi efektif untuk ujian dengan soal rahasia tinggi.

---

## Catatan CSP (Content Security Policy)

`src/server.js` mengaktifkan `helmet` tapi dengan **CSP dinonaktifkan**:
```javascript
app.use(helmet({ contentSecurityPolicy: false }));
```
Ini berarti tidak ada pembatasan `frame-ancestors`, tidak ada proteksi XSS level browser. Untuk lingkungan sekolah ini mungkin ok, tapi layak dipertimbangkan untuk diaktifkan.
