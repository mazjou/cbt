# Laporan Investigasi: Auto-Publish Ujian Tidak Konsisten

**Tanggal investigasi:** 16 Oktober 2026  
**Status:** READ-ONLY — tidak ada perubahan kode  
**Codebase:** `d:\WEBSITE\cbt` (mirror lokal dari `/cbt` di lms-new)

---

## Ringkasan Temuan (Jawaban Singkat)

**Root cause utama:** Sebelum commit `a00eb5c` (di-push 16 Oktober 2026 pukul 13:04 WIB), fungsi `autoPublishAndCloseExams()` di `src/middleware/auto-submit.js` **hanya membaca `exams.start_at` (jadwal global)**, dan sama sekali tidak memeriksa `exam_classes.start_at` (jadwal per kelas). Ujian yang gurunya hanya mengisi jadwal di tiap kelas — bukan di jadwal global — tidak pernah ter-publish otomatis, karena kondisi WHERE-nya tidak pernah terpenuhi.

Ujian pagi yang "berhasil" adalah ujian yang gurunya kebetulan mengisi **jadwal global** sekaligus. Ujian siang yang "tidak bisa" adalah ujian yang gurunya hanya mengisi **jadwal per kelas**.

---

## Bukti & Analisis Detail

### 1. Kode Sebelum Fix — Query yang Salah

**File:** `src/middleware/auto-submit.js`  
**Kode lama (sebelum commit `a00eb5c`):**

```sql
UPDATE exams
SET is_published = true
WHERE is_published = false
  AND start_at IS NOT NULL
  AND NOW() >= (start_at - INTERVAL '15 minutes')
  AND (end_at IS NULL OR NOW() < end_at)
```

Kondisi `start_at IS NOT NULL` mengacu pada kolom `exams.start_at` (jadwal global). Jika guru hanya mengisi jadwal di tiap kelas (tersimpan di `exam_classes.start_at`), maka `exams.start_at = NULL`, sehingga baris UPDATE ini **tidak pernah cocok** dan ujian tidak ter-publish.

### 2. Pola Penyimpanan Jadwal

Dari `src/routes/teacher.js` (baris ~784 dan ~973), saat guru membuat/mengedit ujian:

- **Jadwal global**: disimpan ke `exams.start_at` dan `exams.end_at`
- **Jadwal per kelas**: disimpan ke `exam_classes.start_at`, `exam_classes.end_at`, `exam_classes.duration_minutes` (kolom ini ditambahkan via migrasi — `run-migration-exam-class-schedule.js` / `sql/add_exam_class_schedule.sql`)

Kalau guru mengisi jadwal **per kelas** saja (field `class_start_at[c_{id}]` di form), maka `exams.start_at` tetap `NULL`. Itulah mengapa ujian tersebut tidak masuk ke query auto-publish lama.

### 3. Skenario yang Menyebabkan Gagal

| Skenario | `exams.start_at` | `exam_classes.start_at` | Berhasil auto-publish (LAMA) |
|----------|-------------------|--------------------------|------------------------------|
| Guru isi jadwal global saja | TIDAK NULL | NULL semua | ✅ Ya |
| Guru isi jadwal global + per kelas | TIDAK NULL | TIDAK NULL | ✅ Ya (tapi pakai global) |
| Guru isi jadwal per kelas saja | NULL | TIDAK NULL | ❌ Tidak |
| Tidak ada jadwal sama sekali | NULL | NULL | ❌ Tidak (benar) |

**Skenario 3 adalah penyebab "ujian siang tidak bisa auto-publish"** — karena guru di soal ini menyatakan: *"waktu ujian global dikosongi, hanya setting waktu ujian di tiap kelas"*.

### 4. Fix di Commit `a00eb5c`

**File:** `src/middleware/auto-submit.js`  
**Di-push:** 16 Oktober 2026, 13:04 WIB  

Query auto-publish sekarang menjadi:

```sql
UPDATE exams
SET is_published = true
WHERE is_published = false
  AND (
    -- Jadwal global
    (
      start_at IS NOT NULL
      AND NOW() >= (start_at - INTERVAL '15 minutes')
      AND (end_at IS NULL OR NOW() < end_at)
    )
    OR
    -- Jadwal per kelas: minimal 1 kelas sudah 15 menit sebelum mulai
    EXISTS (
      SELECT 1 FROM exam_classes ec
      WHERE ec.exam_id = exams.id
        AND ec.start_at IS NOT NULL
        AND NOW() >= (ec.start_at - INTERVAL '15 minutes')
        AND (ec.end_at IS NULL OR NOW() < ec.end_at)
    )
  )
```

Fix ini **sudah benar** dan mencakup kedua skenario.

### 5. Masalah Tampilan di Admin Detail — Sudah Diperbaiki

**File:** `src/views/admin/exam_detail.ejs`  
**Commit:** `82f8de7` (16 Oktober 2026, 10:17 WIB)

Sebelumnya halaman detail ujian di admin tidak menampilkan jadwal per kelas sama sekali. Commit ini menambahkan:
- Bagian "Jadwal Per Kelas" yang menampilkan `cs.start_at`, `cs.end_at`, `cs.duration_minutes` per kelas
- Logika prioritas: jika `cs.start_at` ada, tampilkan itu; jika tidak, fallback ke jadwal global + label `(global)`
- Jika semua kelas tanpa jadwal khusus, tampilkan keterangan "Semua kelas pakai jadwal global"

Data disupply oleh route `GET /admin/exams/:id` di `src/routes/admin.js` (baris ~2928) yang query `exam_classes` lengkap dengan kolom `start_at`, `end_at`, `duration_minutes`.

### 6. Apakah Migrasi Kolom `exam_classes.start_at` Sudah Berjalan?

File `src/db/setup.js` (baris 74–76) menyertakan migrasi berikut di dalam `setup.js`:

```sql
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS start_at TIMESTAMP NULL;
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS end_at TIMESTAMP NULL;
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS duration_minutes INT NULL;
```

Juga tersedia sebagai script terpisah: `run-migration-exam-class-schedule.js` dan `sql/add_exam_class_schedule.sql`.

**Risiko:** Jika migrasi ini belum dijalankan di VPS production (DB 10.10.102.12), maka kolom `exam_classes.start_at` belum ada dan query baru di commit `a00eb5c` akan **error**. Kode di `src/routes/teacher.js` baris 870–873 sudah ada fallback catch untuk ini, tapi `autoPublishAndCloseExams()` di `auto-submit.js` **tidak memiliki fallback** — error akan di-catch di level atas dan cron akan berhenti untuk iterasi tersebut.

### 7. Potensi Edge Case yang Tersisa

#### Edge Case A: `exam_classes` dengan `start_at = NULL` (kelas tanpa jadwal sendiri)
Jika ujian punya 3 kelas, tapi hanya 1 kelas yang diisi jadwal, fix baru akan mempublish ujian berdasarkan kelas yang sudah waktunya. Kelas lain yang belum waktunya juga ikut terpublish. Ini mungkin disengaja (satu ujian = satu status publish), tapi perlu disadari.

#### Edge Case B: Auto-close per kelas
Query auto-close baru:

```sql
-- Semua kelas sudah melewati end_at (tidak ada yang masih aktif)
(
  end_at IS NULL
  AND EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id = exams.id AND ec.end_at IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM exam_classes ec2
    WHERE ec2.exam_id = exams.id
      AND (ec2.end_at IS NULL OR NOW() < ec2.end_at)
  )
)
```

Perhatikan kondisi `ec2.end_at IS NULL OR NOW() < ec2.end_at` — kelas yang **tidak punya `end_at`** (NULL) dianggap **masih aktif selamanya**. Jika ada kelas terdaftar tanpa jadwal per kelas, ujian tidak akan pernah di-close otomatis. Ini adalah edge case yang bisa menyebabkan ujian tetap terpublish setelah semua kelas selesai.

#### Edge Case C: `RUN_SCHEDULER` tidak ada di `ecosystem.config.js`

**File:** `ecosystem.config.js`  
**File:** `.env`

`.env` memiliki `RUN_SCHEDULER=1`, namun `ecosystem.config.js` bagian `env_production` **tidak mencantumkan** `RUN_SCHEDULER`. PM2 menjalankan app dengan `env_production` saat mode produksi, yang bisa **menimpa** nilai dari `.env`. Perlu dikonfirmasi apakah PM2 juga membaca `.env` secara otomatis.

Jika `RUN_SCHEDULER` tidak terbaca, maka `startAutoSubmitCron()` langsung return tanpa menjalankan cron (`⏸️ Auto-submit cron dinonaktifkan di node ini`), dan auto-publish tidak akan berjalan sama sekali.

Namun karena PM2 menggunakan `dotenv` di awal `server.js`:
```js
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
```
maka `.env` dibaca secara eksplisit, sehingga `RUN_SCHEDULER=1` **seharusnya terbaca** meskipun tidak ada di `ecosystem.config.js`. Ini aman, tapi perlu diperiksa dengan `pm2 env 0` di server untuk konfirmasi.

#### Edge Case D: Redis Lock bisa menghambat pada multi-worker
Dari `server.js` baris ~520:

```js
const hasLock = await acquireRedisLock('lock:auto-submit', lockValue, 120);
if (!hasLock) return;
```

Dengan 4 worker PM2 (instance: 'max'), hanya 1 worker yang mendapat lock per menit. Jika worker yang mendapat lock adalah worker yang `RUN_SCHEDULER=0` (tidak ada scheduler), lock tidak akan diambil. Namun karena `RUN_SCHEDULER` dibaca dari `.env` yang sama, semua worker punya nilai yang sama — ini aman.

---

## Kesimpulan

| # | Temuan | Status |
|---|--------|--------|
| 1 | Bug utama: query auto-publish lama hanya cek `exams.start_at`, tidak cek `exam_classes.start_at` | ✅ Diperbaiki di `a00eb5c` |
| 2 | Admin detail tidak tampilkan jadwal per kelas | ✅ Diperbaiki di `82f8de7` |
| 3 | Migrasi kolom `exam_classes.start_at/end_at/duration_minutes` harus sudah dijalankan di DB | ⚠️ Perlu verifikasi |
| 4 | Auto-close bisa gagal jika ada kelas tanpa `end_at` (NULL dianggap aktif selamanya) | ⚠️ Edge case — rekomendasi perbaikan |
| 5 | `RUN_SCHEDULER` tidak ada di `ecosystem.config.js` (hanya di `.env`) | ⚠️ Perlu konfirmasi via `pm2 env 0` |

---

## Rekomendasi

### Wajib (sebelum deploy / sesudah deploy fix `a00eb5c`)

1. **Verifikasi migrasi di DB production:**
   ```sql
   -- Jalankan di psql -h 10.10.102.12 -U lmsuser cbt_smk
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'exam_classes'
     AND column_name IN ('start_at','end_at','duration_minutes');
   ```
   Harus mengembalikan 3 baris. Jika tidak, jalankan:
   ```bash
   cd /cbt && node run-migration-exam-class-schedule.js
   ```

2. **Konfirmasi `RUN_SCHEDULER` terbaca oleh PM2:**
   ```bash
   pm2 env 0 | grep RUN_SCHEDULER
   ```
   Harus mengembalikan `RUN_SCHEDULER: 1`. Jika tidak, tambahkan ke `ecosystem.config.js` bagian `env_production`.

3. **Verifikasi cron berjalan:** Cek PM2 log setelah 13:04 (waktu fix di-push + restart):
   ```bash
   pm2 log --lines 50 | grep "AUTO-PUBLISH\|AUTO-CLOSE\|Auto-submit cron"
   ```

### Disarankan (edge case)

4. **Perbaiki logika auto-close untuk kelas tanpa `end_at`:**  
   Kelas tanpa `end_at` seharusnya tidak dianggap "aktif selamanya". Ganti kondisi:
   ```sql
   -- Sebelum (bermasalah untuk kelas tanpa end_at)
   (ec2.end_at IS NULL OR NOW() < ec2.end_at)
   
   -- Sesudah: kelas tanpa end_at tidak mencegah close
   (ec2.end_at IS NOT NULL AND NOW() < ec2.end_at)
   ```

5. **Tambahkan log lebih detail di auto-publish** untuk debugging:
   ```js
   console.log(`[AUTO-PUBLISH] Checking at ${new Date().toISOString()}`);
   ```
   Ini membantu verifikasi cron berjalan meski tidak ada ujian yang di-publish.

6. **Untuk ujian yang sudah lewat jadwal tapi belum terpublish** (akibat bug lama): publish manual dari halaman admin, atau jalankan query satu kali:
   ```sql
   -- Simulasi dulu (SELECT) sebelum UPDATE
   SELECT id, title, start_at FROM exams
   WHERE is_published = false
     AND start_at IS NULL
     AND EXISTS (
       SELECT 1 FROM exam_classes ec
       WHERE ec.exam_id = exams.id
         AND ec.start_at IS NOT NULL
         AND ec.start_at < NOW()
         AND (ec.end_at IS NULL OR NOW() < ec.end_at)
     );
   ```

---

*Investigasi dilakukan secara read-only terhadap codebase lokal. Tidak ada query yang dijalankan langsung ke DB production. Data aktual di DB (jumlah ujian, status publish, dll) tidak dapat diverifikasi dari lingkungan ini.*
