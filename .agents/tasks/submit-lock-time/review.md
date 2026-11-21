# Submit lock time — tombol kirim ujian aktif N menit sebelum waktu habis

Fitur ini memungkinkan guru/admin mengatur berapa menit sebelum waktu ujian habis tombol "Kumpulkan Jawaban" menjadi aktif. Kolom `submit_unlock_before INT NOT NULL DEFAULT 0` ditambahkan ke tabel `exams` via migration startup, field input ditambahkan di keempat form (teacher new/edit, admin new/edit), route create/update di teacher.js dan admin.js menyimpannya dengan clamp 0–60, dan frontend menampilkan countdown di tombol serta unlock + toast saat threshold tercapai. Nilai 0 menonaktifkan fitur dan tombol selalu aktif seperti sebelumnya.

**Watch for:**
- **confirmed** — Elapsed dihitung dari `durationMinutes * 60 * 1000 - remain` di `tick()`, tetapi `endAt` bisa berupa `exam_end_at` (batas absolut) bukan `startedAt + duration`. Jika ujian diperpendek oleh `exam_end_at`, `elapsed` akan over-report dan tombol bisa unlock lebih awal dari yang dikonfigurasi.
- **confirmed** — Backend membuat dua query DB terpisah untuk elapsed di POST submit: satu untuk validasi overtime, satu lagi untuk `submit_unlock_before`. Ini tidak salah fungsional, tapi redundan.
- **possible** — Countdown di tombol menampilkan `Math.ceil(msLeft / 60000)` — saat 1 detik sebelum unlock, tombol masih tampil "1 menit lagi", tidak pernah menunjukkan angka detik. Ini bisa membingungkan siswa.

**Verdict**: APPROVED

---

## High-level view

Migration menggunakan `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` di dalam blok `try/catch` di `bootstrap()`, persis setelah migration serupa untuk kolom lain. Pola ini idempotent dan aman dijalankan ulang.

Semua empat form (teacher exam_new, teacher exam_edit, admin exam_new, admin exam_edit) mendapat field `submit_unlock_before` dengan `min=0 max=60`, ditempatkan tepat setelah field `duration_minutes`. Teacher.js menggunakan named parameters (`:submit_unlock_before`), admin.js menggunakan positional parameters (`$18`/$`17`), keduanya benar sesuai driver masing-masing.

Backend validation di POST submit berada di dalam blok `if (!(isAutoSubmit && hasAutoHeader))`, sehingga auto-submit (timer habis di frontend) melewati lock validation sepenuhnya. Clamp 0–60 diterapkan di sisi server sehingga nilai dari form tidak bisa dimanipulasi melebihi batas.

Frontend di `attempt_take.ejs` menghitung `elapsed = durationMinutes * 60 * 1000 - remain` setiap tick. Ini benar selama `endAt === startedAt + durationMinutes`, tetapi `endAt` bisa diset ke `exam_end_at` (batas waktu absolut ujian) jika lebih kecil. Dalam skenario itu, `remain` mencerminkan sisa waktu ke `exam_end_at`, dan `elapsed` akan dihitung lebih besar dari waktu sebenarnya, menyebabkan tombol unlock terlalu cepat.

---

<details>
<summary>Issues (3)</summary>

1. **Elapsed salah saat exam_end_at lebih kecil dari durasi** — Di `tick()`, `elapsed = durationMinutes * 60 * 1000 - remain` tapi `remain` dihitung dari `endAt` yang bisa berupa `exam_end_at`. Perbaiki dengan menghitung elapsed dari `startedAt`: `const elapsed = now - startedAt;`.
2. **Double query elapsed di POST submit** — Validasi overtime (baris ~1077) dan validasi `submit_unlock_before` (baris ~1101) masing-masing menjalankan query `EXTRACT(EPOCH FROM (NOW() - a.started_at))` secara terpisah. Gunakan nilai dari query pertama.
3. **Countdown granularity hanya menit** — `Math.ceil(msLeft / 60000)` selalu menampilkan menit penuh; saat kurang dari 60 detik sebelum unlock, tombol masih menampilkan "1 menit lagi". Pertimbangkan menampilkan `mm:ss` di detik-detik terakhir.

</details>

---

<details>
<summary>Details</summary>

## Double query elapsed di POST submit

Query `EXTRACT(EPOCH FROM (NOW() - a.started_at))/60` dijalankan dua kali di dalam blok validasi yang sama: pertama di `timeCheck` untuk overtime check, lalu di `timeCheckUnlock` untuk lock validation. Karena keduanya berada dalam blok `if (!(isAutoSubmit && hasAutoHeader))` yang sama, `timeCheck.elapsed_minutes` bisa langsung dipakai untuk lock check tanpa round-trip DB kedua.

## Elapsed calculation di frontend

```js
const endAt = examEndAt && examEndAt < endAtByDuration ? examEndAt : endAtByDuration;

// di tick():
const remain = endAt - now;
const elapsed = durationMinutes * 60 * 1000 - remain;
```

Jika `exam_end_at` lebih kecil dari `startedAt + durationMinutes`, `endAt = examEndAt`. `remain` kemudian berkurang menuju `examEndAt`, bukan `startedAt + duration`. Akibatnya `elapsed` = `durationMs - remain` over-report waktu yang sudah berlalu, dan tombol bisa unlock lebih awal dari konfigurasi.

Perbaikan: `const elapsed = now - startedAt;` — selalu akurat terlepas dari `endAt`.

</details>

---

<details>
<summary>File map</summary>

| File | Perubahan |
|------|-----------|
| `src/server.js` | Migration `ADD COLUMN IF NOT EXISTS submit_unlock_before` di bootstrap |
| `src/routes/teacher.js` | POST+PUT exam: destructure, INSERT, UPDATE dengan clamp 0–60 |
| `src/routes/admin.js` | POST+PUT exam: positional param $18/$17, clamp 0–60 |
| `src/routes/student.js` | GET attempt: tambah `e.submit_unlock_before` ke SELECT; POST submit: tambah ke SELECT + validasi lock dengan grace 0.5 menit |
| `src/views/teacher/exam_new.ejs` | Field input setelah `duration_minutes` |
| `src/views/teacher/exam_edit.ejs` | Field input dengan pre-populate dari `exam.submit_unlock_before` |
| `src/views/admin/exam_new.ejs` | Field input setelah `duration_minutes` |
| `src/views/admin/exam_edit.ejs` | Field input dengan pre-populate dari `exam.submit_unlock_before` |
| `src/views/student/attempt_take.ejs` | JS vars, button disabled di EJS, tick() unlock + countdown + toast |

Full diff: `git -C d:\WEBSITE\cbt diff HEAD~1...HEAD`

</details>
