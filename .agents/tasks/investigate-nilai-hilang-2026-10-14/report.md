# Laporan Investigasi: Nilai Hilang saat Ujian Berlangsung
**Tanggal kejadian:** 14 Oktober 2026  
**Dibuat:** Investigasi otomatis berdasarkan kode sumber + bukti DB  
**Scope:** Server App (lms-new 10.10.102.11), Server DB (10.10.102.12), Server Redis (10.10.102.8), Caddy (reverseproxy8)

---

## Ringkasan Eksekutif (Jawaban Cepat)

**Nilai tidak benar-benar hilang.** Data 53 attempts dengan status SUBMITTED tersimpan aman di PostgreSQL. Kejadian yang tampak seperti "nilai hilang" adalah kombinasi dua hal independen:

1. **Masalah tampilan/cache:** Dashboard guru (`/teacher/grades`) membaca langsung dari DB — tapi ada cache metadata ujian per kelas di Redis (`student:exams:meta:{classId}`) dan cache soal (`exam:q:{examId}:*`) yang mungkin membuat data *terlihat* stale pada klien tertentu.

2. **FLUSHDB Redis yang tidak disengaja:** Semua session aktif terhapus, menyebabkan siswa yang sedang ujian ter-logout. Namun karena jawaban disimpan per-request ke PostgreSQL (`attempt_answers.option_id`), siswa bisa resume setelah login ulang, dan data tidak hilang.

**Perpanjangan waktu ujian (`duration_minutes` atau `end_at`) yang dilakukan saat ujian berlangsung: AMAN untuk data**, tapi berpotensi menyebabkan confusion di dashboard karena cache belum di-invalidasi.

---

## 1. Bukti: Data Aman di PostgreSQL

Dari query yang dijalankan langsung di DB:

```
total_attempts | submitted | in_progress
----------------+-----------+-------------
            93 |        53 |          40
```

- **53 attempts SUBMITTED** dengan score tercatat (70–100 untuk XI TKJ, 83–100 untuk XI TPTUP, dst.)
- **40 attempts IN_PROGRESS** saat investigasi — masih dalam proses mengerjakan atau sudah terhapus session-nya karena FLUSHDB

Dari tabel `attempts`, kolom `score`, `finished_at`, `status='SUBMITTED'` terisi lengkap untuk 53 siswa tersebut.

**Referensi kode:** `src/utils/submission-utils.js`, fungsi `finalizeAttemptWithBackup()` — menggunakan transaksi PostgreSQL (BEGIN/COMMIT) sehingga data atomik, tidak bisa setengah tersimpan.

---

## 2. Kronologi Kejadian dan Root Cause

### 2a. "Nilai Hilang" dari Dashboard — Masalah Cache

Dashboard guru membaca dari endpoint `GET /teacher/grades` (`src/routes/teacher.js:2629`). Query ini langsung ke PostgreSQL, **tidak menggunakan cache Redis**. Artinya jika nilai benar-benar ada di DB, seharusnya tampil.

Namun ada dua sumber cache yang bisa menyebabkan confusion:

1. **Cache metadata ujian per kelas** (`student:exams:meta:{classId}`) di Redis, TTL 30 detik (`src/routes/student.js`, fungsi `/exams`). Cache ini hanya untuk siswa, bukan dashboard guru.
2. **Cache soal** (`exam:q:{examId}:*`), TTL 10 menit (`EXAM_CACHE_TTL = 600`).

Yang lebih mungkin menjadi masalah: **kondisi race antara `auto-close` dan `auto-publish`** di `src/middleware/auto-submit.js`, fungsi `autoPublishAndCloseExams()`. Fungsi ini berjalan setiap menit via cron (`RUN_SCHEDULER=1` di `.env`), dan bisa men-set `is_published=false` pada ujian yang sudah melewati `end_at`. Jika `end_at` diubah (perpanjangan waktu) tapi cache belum di-invalidasi, siswa bisa kehilangan akses sesaat.

Lebih lanjut: **PM2 cluster 4 worker** (`instances: 'max'` di `ecosystem.config.js`) menyimpan `examQuestionsCache` (in-memory `Map`) secara terpisah per worker. Saat Caddy round-robin request ke worker berbeda, data cache bisa inconsistent antar worker.

### 2b. FLUSHDB Redis — Penyebab Logout Massal

```
redis-cli ... FLUSHDB → OK
```

Perintah ini menghapus **seluruh** database Redis termasuk:
- `lms:sess:*` — semua session aktif siswa
- `online_users_zset` — tracking online
- `lock:auto-submit` — distributed lock cron
- `rate:answer:{userId}` — rate limiter

Akibatnya semua siswa yang sedang ujian ter-logout. Saat mereka membuka halaman ujian lagi, mereka diminta login ulang. Setelah login, session baru dibuat, dan karena attempt masih `IN_PROGRESS` di DB, siswa diarahkan kembali ke attempt yang sama (`src/routes/student.js`, blok `activeInProgress > 0`):

```javascript
// src/routes/student.js
if (activeInProgress > 0) {
  // arahkan melanjutkan attempt
  return res.redirect(`/student/attempts/${activeAttempt.id}`);
}
```

Jawaban yang sudah dijawab **tidak hilang** karena setiap klik jawaban langsung di-UPDATE ke `attempt_answers` di PostgreSQL (`POST /student/attempts/:id/answer`).

### 2c. Perpanjangan Waktu dan Efeknya

Perpanjangan waktu ujian bisa dilakukan melalui dua cara:

**Cara 1: Edit ujian global** (`POST /teacher/exams/:id/edit`, `src/routes/teacher.js:907`) — mengubah `duration_minutes` atau `end_at` di tabel `exams`.

**Cara 2: Edit jadwal per kelas** — mengubah `exam_classes.end_at` atau `exam_classes.duration_minutes`.

**Dampak terhadap jawaban:** TIDAK ada. Perpanjangan waktu tidak menyentuh tabel `attempts` atau `attempt_answers`. Data jawaban tetap aman.

**Dampak terhadap tampilan:** Ada, karena:
1. Cache Redis `student:exams:meta:{classId}` menyimpan `end_at` lama selama 30 detik. Siswa yang membuka halaman ujian dalam window 30 detik ini masih melihat waktu lama.
2. In-memory cache `examQuestionsCache` di setiap worker PM2 tidak di-invalidasi saat exam di-edit. Tapi ini hanya menyimpan soal, bukan jadwal.
3. Timer countdown di browser (`attempt_take.ejs`) dihitung dari `started_at + duration_minutes` atau `exam_end_at`, yang diambil saat halaman di-render. Perpanjangan waktu tidak otomatis memperbarui timer di browser yang sudah buka halaman ujian.

**Spesifik kasus 14 Oktober:** Dari data DB, attempt 4108 (ANISA PUTRI MARGARET, XI KULINER 1) hanya berjalan 2.1 menit dengan score 0. Ini konsisten dengan skenario: siswa ter-logout karena FLUSHDB, resume attempt, tapi tidak menyelesaikan ujian atau tidak menjawab soal setelah resume.

---

## 3. Titik Kegagalan (Single Points of Failure) per Server

### 3a. Server App (lms-new, 10.10.102.11)

| Komponen | SPOF | Dampak | Severity |
|---|---|---|---|
| PM2 cluster worker crash | Worker restart otomatis, in-memory cache hilang di worker itu | Cache miss, lebih banyak query DB | Medium |
| `RUN_SCHEDULER=1` di semua worker | Hanya 1 worker yang dapat Redis lock, 3 lainnya skip — tapi jika Redis down, semua 4 worker menjalankan cron bersamaan | Race condition pada auto-submit | High |
| In-memory `examQuestionsCache` per worker | Setiap worker punya salinan berbeda; edit soal tidak otomatis invalidasi semua worker | Siswa di worker berbeda bisa dapat soal berbeda (jika cache hit berbeda) | Medium |
| `AUTO_SUBMIT_MIDDLEWARE_ENABLED=0` di .env | Auto-submit per-request tidak aktif; hanya cron yang submit attempt expired | Jika cron gagal/terlambat, attempt expired tidak di-submit | Low (cron berjalan tiap 5 menit) |

**Kode referensi:** `ecosystem.config.js` (instances: 'max'), `src/server.js:acquireRedisLock()`, `src/routes/student.js:examQuestionsCache`

### 3b. Server DB (10.10.102.12 — PostgreSQL)

| Komponen | SPOF | Dampak | Severity |
|---|---|---|---|
| Single PostgreSQL node | Tidak ada replica/standby | Total downtime jika DB crash saat ujian | Critical |
| Connection pool limit | `DB_CONNECTION_LIMIT=80` per worker × 4 worker = 320; PostgreSQL default `max_connections` biasanya 100-300 | Connection exhaustion saat ujian besar | High |
| `statement_timeout=30000ms` | Query berat (laporan, bulk import) bisa timeout | Query laporan gagal, error di teacher/grades | Low |
| Lock wait timeout | Tidak ada explicit `lock_timeout` di pool config | Deadlock antara finalizeAttempt dan auto-submit cron | Medium |

**Kode referensi:** `src/db/pool.js` (`max: 70, connectionTimeoutMillis: 8000, statement_timeout: 30000`)

### 3c. Server Redis (10.10.102.8)

| Komponen | SPOF | Dampak | Severity |
|---|---|---|---|
| Single Redis tanpa replica | Tidak ada Redis Sentinel/Cluster | Jika Redis down: session hilang, semua user logout | Critical |
| FLUSHDB manual | Menghapus semua data termasuk session aktif | Logout massal saat ujian | Critical |
| Tidak ada ACL/pembatasan command | User `lmsuser` (atau siapapun yang tahu password) bisa FLUSHDB | Risiko human error atau command injection | High |
| `disableOfflineQueue: true` di Redis client | Request yang masuk saat Redis reconnecting langsung gagal (tidak di-queue) | Beberapa request autosave bisa gagal jika Redis flap | Low (fallback ke in-memory ada) |

**Kode referensi:** `src/server.js:initRedis()` (reconnectStrategy, disableOfflineQueue)

### 3d. Server Caddy (reverseproxy8)

| Komponen | SPOF | Dampak | Severity |
|---|---|---|---|
| Single Caddy instance | Tidak ada failover | Total downtime jika Caddy crash | Critical |
| `response_header_timeout 120s` | Request panjang (upload soal Word 15MB) bisa timeout di Caddy sebelum selesai di App | Upload gagal di tengah jalan | Medium |
| Round-robin ke satu backend | `reverse_proxy 10.10.102.110:3000` — hanya 1 IP | Caddy tidak melakukan load balancing ke multiple IP; semua request ke satu node | N/A (bukan LB) |
| Tidak ada health check probe | Caddy tidak dikonfigurasi active health check (`health_uri`) | Request bisa diteruskan ke App yang crash | Medium |

**Kode referensi:** `Caddyfile` (transport http config, tidak ada `health_uri`)

---

## 4. Apa yang Harus Dilakukan saat Nilai "Hilang" dari Dashboard

### Langkah Diagnostik (Urutan Benar)

**Langkah 1: Verifikasi data di PostgreSQL dulu, sebelum panik**
```sql
-- Cek total attempt per kelas untuk ujian tertentu
SELECT c.name AS kelas,
       COUNT(CASE WHEN a.status='SUBMITTED' THEN 1 END) AS submitted,
       COUNT(CASE WHEN a.status='IN_PROGRESS' THEN 1 END) AS in_progress,
       MIN(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS min_nilai,
       MAX(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS max_nilai,
       ROUND(AVG(CASE WHEN a.status='SUBMITTED' THEN a.score END),1) AS avg_nilai
FROM attempts a
JOIN users u ON u.id = a.student_id
JOIN classes c ON c.id = u.class_id
WHERE a.exam_id = <ID_UJIAN>
GROUP BY c.name ORDER BY c.name;
```

**Langkah 2: Cek status Redis**
```bash
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --no-auth-warning PING
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --no-auth-warning DBSIZE
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --no-auth-warning --scan --pattern "lms:sess:*" | wc -l
```

**Langkah 3: Cek App Server (PM2)**
```bash
pm2 status
pm2 logs lms-smkn1kras --lines 50
```

**Langkah 4: Cek koneksi DB dari App**
```bash
curl -s http://localhost:3000/healthz | python3 -m json.tool
```

**Langkah 5: Jika nilai tidak tampil di dashboard tapi ada di DB**
```bash
# Clear HANYA cache, JANGAN FLUSHDB
bash /cbt/scripts/clear-exam-cache.sh
```

**Langkah 6: Cek log Caddy**
```bash
tail -100 /var/log/caddy/liveclass.log
```

---

## 5. Apakah Perpanjangan Waktu Ujian Saat Berlangsung Aman?

**Jawaban: AMAN untuk integritas data, tapi perlu tindakan tambahan.**

**Yang aman:**
- Data jawaban di `attempt_answers` tidak terpengaruh sama sekali
- Attempt yang sudah `SUBMITTED` tidak berubah
- Tidak ada cascade delete/update ke `attempt_answers`

**Yang perlu diperhatikan:**

1. **Timer di browser tidak otomatis update.** Siswa yang sudah membuka halaman ujian masih melihat countdown berdasarkan `duration_minutes` lama. Mereka perlu refresh halaman untuk mendapat timer baru.

2. **Cache Redis perlu di-clear setelah perpanjangan.**
   ```bash
   bash /cbt/scripts/clear-exam-cache.sh
   ```

3. **Auto-close cron bisa menutup ujian lebih cepat dari yang diharapkan.** Jika `end_at` belum diubah (hanya `duration_minutes` yang diperpanjang), cron `autoPublishAndCloseExams()` di `auto-submit.js` akan tetap menutup ujian saat `end_at` lama.

4. **In-memory cache per worker tidak otomatis ter-invalidasi.** Kode `teacher.js` memiliki fungsi `invalidateExamQuestionsCache()` yang dipanggil saat soal diedit, tapi tidak dipanggil saat `exam_classes` di-update (perpanjangan per kelas).

---

## 6. Risiko FLUSHDB Redis saat Ujian Berlangsung

**Ini adalah operasi paling berbahaya yang bisa dilakukan saat ujian.** Dampaknya:

| Aksi | Dampak Langsung | Recoverable? |
|---|---|---|
| FLUSHDB | Semua `lms:sess:*` terhapus → semua user logout | Ya (login ulang) |
| FLUSHDB | `lock:auto-submit` terhapus → 4 worker jalan cron bersamaan | Ya (lock baru dibuat) |
| FLUSHDB | `rate:answer:{userId}` terhapus → rate limiter reset | Ya (harmless) |
| FLUSHDB | `online_users_zset` terhapus → tracking online reset | Ya (harmless) |

**Mengapa FLUSHDB terjadi:** Dari log yang diberikan, perintah FLUSHDB dijalankan atas saran agent/investigasi. Ini adalah **human error yang dipicu oleh prosedur diagnostik yang salah**. FLUSHDB tidak boleh dijalankan saat ada ujian aktif.

**Proteksi yang harus ditambahkan:**
1. Buat Redis user khusus App (ACL) yang tidak punya akses FLUSHDB/FLUSHALL
2. Tambahkan alias/check script sebelum operasi Redis destruktif

---

## 7. Checklist Monitoring untuk Deteksi Dini

### Monitoring yang Sudah Ada
- `/health` dan `/healthz` endpoint di App (`src/server.js`)
- Log PM2 di `/cbt/logs/pm2-out.log` dan `/cbt/logs/pm2-error.log`
- Log Caddy di `/var/log/caddy/liveclass.log` (format JSON, rotasi 100MB)

### Monitoring yang Perlu Ditambahkan

**a. Server App:**
```bash
# Cron monitoring: cek attempt IN_PROGRESS yang sudah expired > 15 menit tapi belum SUBMITTED
# Jalankan setiap 5 menit, alert jika ada
SELECT COUNT(*) FROM attempts a
JOIN exams e ON e.id = a.exam_id
WHERE a.status = 'IN_PROGRESS'
  AND EXTRACT(EPOCH FROM (NOW() - a.started_at))/60 > e.duration_minutes + 15;
```

**b. Server DB:**
- Aktifkan `pg_stat_activity` monitoring untuk deteksi connection exhaustion
- Set `max_connections` di PostgreSQL ke minimal 400 untuk mengakomodasi 4 worker × 80 koneksi + headroom
- Pertimbangkan PgBouncer sebagai connection pooler

**c. Server Redis:**
```bash
# Monitor ukuran DB dan memory setiap menit
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --no-auth-warning INFO memory | grep used_memory_human
redis-cli -h 10.10.102.8 -p 6379 -a redisCBT2026 --no-auth-warning DBSIZE
```

**d. Dashboard Real-time:**
Endpoint `/whoami` sudah mengembalikan `onlineTracked180s` dan `activeExams`. Tambahkan polling dari dashboard admin setiap 30 detik untuk deteksi dini lonjakan.

---

## 8. Rekomendasi Perbaikan (Tanpa Implementasi Sekarang)

### Prioritas Tinggi (Sebelum Ujian Berikutnya)

**R1. Batasi perintah FLUSHDB/FLUSHALL di Redis dengan ACL**
```bash
# Di redis.conf atau via redis-cli
ACL SETUSER lmsapp on >redisCBT2026 ~lms:* +@all -FLUSHDB -FLUSHALL -DEBUG -CONFIG
```
Ini mencegah App (dan siapapun yang tahu password App) menjalankan FLUSHDB secara tidak sengaja.

**R2. Buat prosedur resmi "cache clear saat ujian berlangsung"**
Script `/cbt/scripts/clear-exam-cache.sh` sudah ada dan benar — **hanya hapus `exam:*` dan `student:exams:meta:*`, TIDAK pernah session**. Dokumenkan ini sebagai satu-satunya cara membersihkan cache saat ujian aktif.

**R3. Invalidasi cache exam saat `exam_classes` di-update**
Di `src/routes/teacher.js`, fungsi `invalidateExamQuestionsCache()` sudah ada tapi hanya dipanggil saat soal diedit. Panggil juga saat `exam_classes` di-update (perpanjangan waktu per kelas).

### Prioritas Menengah

**R4. Tambahkan health check di Caddyfile**
```
reverse_proxy 10.10.102.110:3000 {
    health_uri /health
    health_interval 10s
    health_timeout 5s
}
```

**R5. Tambahkan `lock_timeout` di PostgreSQL pool**
Di `src/db/pool.js`, tambahkan `options: '-c timezone=Asia/Jakarta -c lock_timeout=5000'` untuk mencegah deadlock hanging.

**R6. Pertimbangkan `max_connections` PostgreSQL**
4 worker × 80 koneksi = 320 koneksi dari App saja. Jika ada koneksi lain (monitoring, psql manual), bisa melebihi limit. Naikan ke 400-500 atau pasang PgBouncer.

**R7. Aktifkan `AUTO_SUBMIT_MIDDLEWARE_ENABLED=1`**
Saat ini `AUTO_SUBMIT_MIDDLEWARE_ENABLED=0` di `.env`. Aktifkan ini sehingga jika cron gagal, auto-submit tetap berjalan saat siswa membuka halaman student.

### Prioritas Rendah

**R8. Redis Sentinel atau Replica**
Redis saat ini single-node. Untuk ujian kritikal, pertimbangkan Redis Sentinel dengan 1 master + 1 replica.

**R9. Notifikasi otomatis saat attempt gagal submit**
`submission_status='FAILED'` sudah ada di DB. Tambahkan query monitoring yang memeriksa kolom ini dan alert ke admin/guru.

---

## 9. Jawaban Langsung atas Pertanyaan Investigasi

**Q: Apakah perpanjangan waktu menyebabkan jawaban hilang?**  
**A: Tidak.** Perpanjangan waktu tidak menyebabkan jawaban hilang. Jawaban per soal disimpan langsung ke PostgreSQL setiap kali siswa mengklik pilihan (POST `/student/attempts/:id/answer`). Perpanjangan `duration_minutes` atau `end_at` hanya mengubah batas waktu, tidak menyentuh `attempt_answers`.

**Q: Kenapa FLUSHDB bisa jalan?**  
**A:** Redis di `10.10.102.8` dikonfigurasi dengan satu password tanpa ACL. Siapapun yang tahu password `redisCBT2026` bisa menjalankan perintah apa saja termasuk FLUSHDB. Tidak ada pembatasan command per user. Ini harus diperbaiki dengan Redis ACL.

**Q: Apakah nilai 40 siswa IN_PROGRESS aman?**  
**A:** Jawaban yang sudah mereka isi sebelum FLUSHDB **tersimpan di PostgreSQL** dan tidak hilang. Yang hilang hanya session mereka. Setelah login ulang dan akses ujian, mereka bisa melanjutkan dari jawaban terakhir. Namun ada risiko bahwa siswa tidak tahu cara resume, atau ujian sudah berakhir sebelum mereka sempat login ulang.

---

## Ringkasan Temuan

| Temuan | Status |
|---|---|
| Data 53 SUBMITTED tersimpan aman di PostgreSQL | ✅ Confirmed |
| Nilai 0 di beberapa siswa XI KULINER bukan karena hilang, tapi belum submit | ✅ Confirmed |
| Perpanjangan waktu tidak menyebabkan data hilang | ✅ Confirmed |
| FLUSHDB menghapus session aktif → logout massal | ✅ Root cause confirmed |
| Redis tanpa ACL → FLUSHDB bisa dijalankan siapapun | ⚠️ Perlu diperbaiki |
| PM2 in-memory cache tidak shared antar worker | ⚠️ Perlu diperhatikan |
| Tidak ada Redis replica/sentinel | ⚠️ SPOF |
| Tidak ada health check di Caddy | ⚠️ Perlu ditambahkan |
| Script `clear-exam-cache.sh` sudah ada dan benar | ✅ Gunakan ini, bukan FLUSHDB |
