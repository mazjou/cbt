# Implementation Plan — Fix TP (Tujuan Pembelajaran) Raport per Class

## Root Cause Summary

`raport_subject_kd` hanya punya `raport_subject_id` (FK ke `raport_subjects`). Satu
`raport_subjects` bisa dipakai oleh banyak kelas lewat `raport_subject_classes`. Akibatnya
TP yang ditambah guru untuk kelas X langsung terbaca oleh kelas XI yang berbagi entri
`raport_subjects` yang sama.

Fix: tambah kolom `class_id` ke `raport_subject_kd`. Data lama (class_id = NULL) tetap
muncul untuk semua kelas agar backward-compatible. Data baru langsung terfilter per kelas.

---

## Daftar File yang Disentuh

| File | Peran |
|------|-------|
| `sql/add_kd_class_id.sql` | Baru — migration DDL |
| `src/routes/teacher.js` | UPDATE — 6 tempat query |
| `src/routes/admin.js` | CEK — tidak ada query yang perlu diubah (admin baca semua TP lintas kelas secara sengaja) |

---

## Items

- [ ] 1. **Buat migration SQL `sql/add_kd_class_id.sql`**

  Tambah kolom `class_id INT NULL REFERENCES classes(id) ON DELETE SET NULL` ke tabel
  `raport_subject_kd`, lalu buat index `idx_raport_subject_kd_class` pada kolom tersebut.
  Kolom nullable agar baris lama (class_id = NULL) tetap valid.

  ```sql
  -- Migration: tambah class_id ke raport_subject_kd agar TP per kelas bisa dibedakan
  -- Run once:
  --   PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_kd_class_id.sql

  ALTER TABLE raport_subject_kd
    ADD COLUMN IF NOT EXISTS class_id INT NULL
    REFERENCES classes(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_raport_subject_kd_class
    ON raport_subject_kd(class_id);
  ```

  **Files:** `d:\WEBSITE\cbt\sql\add_kd_class_id.sql`

  **Verify:** Jalankan file ini terhadap DB development dan konfirmasi:
  ```
  PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -c "\d raport_subject_kd"
  ```
  Kolom `class_id` harus muncul, tipe `integer`, nullable.

---

- [ ] 2. **Update `POST /teacher/raport/:period_id/:subject_id/kd` — INSERT sertakan class_id**

  Lokasi: sekitar baris 5111 di `src/routes/teacher.js`.

  `class_id` sudah ada di `req.body` (dikirim dari form redirect ke
  `/teacher/raport/${period_id}/${subject_id}/${class_id}`). Ubah INSERT dari:

  ```js
  `INSERT INTO raport_subject_kd (raport_subject_id, kd_name, sort_order) VALUES ($1, $2, $3)`,
  [subject_id, kd_name.trim(), parseInt(sort_order) || 0]
  ```

  menjadi:

  ```js
  `INSERT INTO raport_subject_kd (raport_subject_id, kd_name, sort_order, class_id)
   VALUES ($1, $2, $3, $4)`,
  [subject_id, kd_name.trim(), parseInt(sort_order) || 0, class_id]
  ```

  **Files:** `d:\WEBSITE\cbt\src\routes\teacher.js`

  **Verify:** Tambah satu TP baru di UI guru untuk kelas X. Konfirmasi di DB:
  ```sql
  SELECT id, kd_name, class_id FROM raport_subject_kd ORDER BY id DESC LIMIT 5;
  ```
  Baris baru harus punya `class_id` yang sesuai (bukan NULL).

---

- [ ] 3. **Update `GET /teacher/raport/:period_id/:subject_id/:class_id` — kdList filter by class_id**

  Lokasi: sekitar baris 5150–5153 di `src/routes/teacher.js`.

  Ubah query kdList dari:

  ```js
  `SELECT id, kd_name, sort_order FROM raport_subject_kd
   WHERE raport_subject_id = $1 ORDER BY sort_order ASC, id ASC`,
  [subject_id]
  ```

  menjadi:

  ```js
  `SELECT id, kd_name, sort_order FROM raport_subject_kd
   WHERE raport_subject_id = $1
     AND (class_id = $2 OR class_id IS NULL)
   ORDER BY sort_order ASC, id ASC`,
  [subject_id, class_id]
  ```

  `OR class_id IS NULL` menjaga TP lama (sebelum migration) tetap muncul di semua kelas.

  **Files:** `d:\WEBSITE\cbt\src\routes\teacher.js`

  **Verify:** Buka halaman input nilai untuk kelas X dan kelas XI yang berbagi mapel yang
  sama. Kelas X hanya menampilkan TP miliknya; kelas XI tidak menampilkan TP kelas X
  (kecuali TP lama ber-class_id NULL).

---

- [ ] 4. **Update `POST /teacher/raport/:period_id/:subject_id/:class_id` — kdList filter by class_id**

  Lokasi: sekitar baris 5226–5229 (route POST simpan nilai bulk). Query `activeKds` yang
  digunakan sebagai daftar valid kd_id saat menyimpan nilai.

  Ubah dari:

  ```js
  `SELECT id FROM raport_subject_kd WHERE raport_subject_id = $1`,
  [subject_id]
  ```

  menjadi:

  ```js
  `SELECT id FROM raport_subject_kd
   WHERE raport_subject_id = $1
     AND (class_id = $2 OR class_id IS NULL)`,
  [subject_id, class_id]
  ```

  **Files:** `d:\WEBSITE\cbt\src\routes\teacher.js`

  **Verify:** POST nilai dari kelas X tidak bisa menyimpan nilai untuk kd_id milik kelas XI
  (kd_id yang tidak ada di kdIds akan dilewati di loop).

---

- [ ] 5. **Update `GET /teacher/raport/:period_id/:subject_id/:class_id/export` — kdList filter by class_id**

  Lokasi: sekitar baris 5334–5337 (route export Excel). Query kdList untuk header kolom TP.

  Ubah dari:

  ```js
  `SELECT id, kd_name FROM raport_subject_kd WHERE raport_subject_id = $1 ORDER BY sort_order ASC, id ASC`,
  [subject_id]
  ```

  menjadi:

  ```js
  `SELECT id, kd_name FROM raport_subject_kd
   WHERE raport_subject_id = $1
     AND (class_id = $2 OR class_id IS NULL)
   ORDER BY sort_order ASC, id ASC`,
  [subject_id, class_id]
  ```

  **Files:** `d:\WEBSITE\cbt\src\routes\teacher.js`

  **Verify:** Download template Excel untuk kelas X. Kolom TP yang muncul hanya TP milik
  kelas X (plus TP lama ber-class_id NULL).

---

- [ ] 6. **Update `POST .../import` — activeKds filter by class_id**

  Lokasi: sekitar baris 5466–5469 (route import nilai dari Excel).

  Ubah dari:

  ```js
  `SELECT id, kd_name FROM raport_subject_kd WHERE raport_subject_id = $1 ORDER BY sort_order ASC, id ASC`,
  [subject_id]
  ```

  menjadi:

  ```js
  `SELECT id, kd_name FROM raport_subject_kd
   WHERE raport_subject_id = $1
     AND (class_id = $2 OR class_id IS NULL)
   ORDER BY sort_order ASC, id ASC`,
  [subject_id, class_id]
  ```

  **Files:** `d:\WEBSITE\cbt\src\routes\teacher.js`

  **Verify:** Import Excel yang berisi kolom TP untuk kelas X tidak memproses kd_id milik
  kelas XI (kd_id di luar `activeKds` tidak akan di-upsert ke `raport_kd_scores`).

---

- [ ] 7. **Cek `admin.js` — konfirmasi tidak perlu diubah**

  Semua query `raport_subject_kd` di `admin.js` adalah untuk:
  - `GET /admin/raport/:period_id/tp-labels` — menghitung MAX(count TP per subject) untuk
    menentukan berapa label kolom yang perlu diisi. Query ini sengaja membaca SEMUA TP lintas
    kelas agar kolom header raport konsisten se-periode.
  - `POST /admin/raport/:period_id/tp-labels` — sama, tidak perlu filter kelas.
  - `GET /admin/raport/:period_id/print/:student_id`, `print-all`, `print-all` (teacher) —
    query ini membaca TP untuk ditampilkan di raport, difilter oleh `raport_subject_id IN
    (subjectIds_milik_siswa)`. Setelah class_id ditambah ke tabel, query ini tetap benar
    karena `subjectIds` sudah per-kelas; hanya TP kelas yang bersangkutan yang ada di kelas
    itu. **Namun**, karena data lama ber-class_id NULL akan muncul di semua kelas, raport
    print untuk siswa kelas XI tidak akan menampilkan TP kelas X yang sudah punya class_id
    tersendiri.

  Tindakan: tidak ada perubahan kode di `admin.js`. Catat ini sebagai temuan di plan.

  **Files:** `d:\WEBSITE\cbt\src\routes\admin.js` (baca saja, tidak diubah)

  **Verify:** Buka raport print admin untuk satu siswa kelas X dan satu siswa kelas XI.
  Masing-masing hanya menampilkan TP kelasnya masing-masing (plus TP lama ber-class_id NULL
  jika ada).

---

## Urutan Eksekusi

```
1 (migration SQL) → 2 (INSERT class_id) → 3 (GET filter) → 4 (POST filter)
                                         → 5 (export filter)
                                         → 6 (import filter)
                                         → 7 (verifikasi admin.js — no-op)
```

Items 3–6 independen satu sama lain setelah item 1 dan 2 selesai.

---

## Asumsi & Catatan

- `class_id` pada `req.body` saat `POST /teacher/raport/:period_id/:subject_id/kd` sudah
  tersedia karena form di halaman guru mengirimkan field `class_id` (terlihat dari redirect
  ke `/${class_id}` setelah sukses/gagal). Perlu dikonfirmasi saat implementasi bahwa
  hidden input `class_id` memang ada di form template `teacher/raport_scores`.
- Data TP lama yang sudah terlanjur dibuat tanpa `class_id` (= NULL) akan muncul di **semua
  kelas** yang berbagi mapel tersebut — ini adalah keputusan backward-compatible yang
  disengaja. Guru bisa menghapus TP lama tersebut dan membuat ulang agar ter-assign per
  kelas.
- Tidak ada test framework otomatis di project ini (`npm test` tidak ada di scripts).
  Verifikasi dilakukan dengan manual smoke-test di UI dan query DB langsung.
