# Laporan Investigasi: Sinkronisasi SDMS → LMS CBT

**Tanggal:** Investigasi kode (read-only)  
**Scope:** `src/sdms-webhook.js`, `sdms-webhook.js` (root), `src/sdms-sync-endpoint.js`, `src/sdms-webhook-mysql.js`, `src/routes/admin.js`, `sql/schema_pg.sql`, `sql/add_homeroom_teacher.sql`, `src/db/sync-kelas-mapel.js`

---

## Ringkasan Jawaban

| Pertanyaan | Jawaban |
|---|---|
| Apakah sync SDMS mencakup sinkronisasi **KELAS**? | **YA** — tapi terbatas |
| Apakah sync SDMS mencakup **WALI KELAS**? | **TIDAK** |
| Apakah sync SDMS mencakup **MATA PELAJARAN (subjects)**? | **YA** — tapi tidak otomatis |

---

## Pertanyaan 1: Sinkronisasi Kelas & Wali Kelas

### Jawaban: Kelas = YA (parsial) | Wali Kelas = TIDAK

### Bukti Kode

#### File aktif yang dipakai server: `src/sdms-webhook.js`

Entry point aplikasi (`package.json` → `"main": "src/server.js"`) mengimpor `src/sdms-webhook.js`:

```js
// src/server.js baris 181
const { verifySDMS, handleWebhook, setupTables } = require('./sdms-webhook');
```

> Ada juga `sdms-webhook.js` di root direktori (versi lama/cadangan) yang tidak dipakai oleh `src/server.js`. Root `server.js` yang ada di root folder memuat versi root itu, tetapi `package.json` mengarahkan ke `src/server.js`.

#### Bagaimana kelas di-sync:

**`src/sdms-webhook.js` — fungsi `upsertKelas`** (baris ~340–366):

```js
const upsertKelas = async (data) => {
  // Hanya menyimpan ke tabel sdms_kelas — TIDAK langsung ke tabel classes
  await q(`
    INSERT INTO sdms_kelas
      (sdms_id, nama, tingkat, jurusan_kode, kapasitas, ruangan, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, tingkat=EXCLUDED.tingkat, ...
  `, [data.id, data.nama, data.tingkat, data.jurusan?.kode, data.kapasitas, data.ruangan]);
};
```

Data kelas dari SDMS disimpan ke `sdms_kelas` (tabel staging), **bukan langsung ke tabel `classes` LMS**.

#### Bridge `sdms_kelas` → `classes`:

Ada dua mekanisme untuk memindahkan data ke tabel `classes` LMS:

1. **Script manual** `src/db/sync-kelas-mapel.js` — dijalankan via CLI:
   ```bash
   node src/db/sync-kelas-mapel.js
   ```
   Script ini membaca `sdms_kelas`, membuat kode (`XI TKR 1` → `XI-TKR-1`), lalu INSERT/UPDATE ke tabel `classes`.

2. **Root `sdms-webhook.js`** (versi lama, tidak aktif di production) — `upsertKelas` langsung INSERT ke `classes`:
   ```js
   await q(`INSERT INTO classes (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name`, [kodeKelas, data.nama]);
   ```
   Namun file ini **tidak dipakai** oleh `src/server.js`.

#### Kesimpulan kelas:

- Webhook/bulk sync menyimpan data kelas ke `sdms_kelas` ✓  
- Kelas **tidak otomatis** masuk ke tabel `classes` LMS yang dipakai ujian/absensi — perlu jalankan `sync-kelas-mapel.js` secara manual atau memanggil `bulk.sync` via event yang memicu `handleBulkSync` di `src/sdms-webhook.js`.  
- Di dalam `handleBulkSync` (`src/sdms-webhook.js`) tidak ada langkah INSERT ke `classes` — hanya ke `sdms_kelas`.

---

### Wali Kelas: TIDAK ada di sync SDMS

#### Bukti:

**Payload `kelas` yang diterima dari SDMS** (berdasarkan field yang di-consume di `upsertKelas`):

| Field | Keterangan |
|---|---|
| `data.id` | UUID kelas di SDMS |
| `data.nama` | Nama kelas, mis. "XI TKR 1" |
| `data.tingkat` | Tingkat: X, XI, XII |
| `data.jurusan?.kode` | Kode jurusan |
| `data.kapasitas` | Kapasitas siswa |
| `data.ruangan` | Nama ruangan |

**Tidak ada field** `wali_kelas`, `homeroom_teacher`, `guru_wali`, atau sejenisnya di payload maupun di fungsi `upsertKelas`.

#### Kolom wali kelas di database:

File migrasi `sql/add_homeroom_teacher.sql` menambahkan kolom ke tabel `classes`:

```sql
ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS homeroom_teacher_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS homeroom_teacher_nip  VARCHAR(30)  NULL;
```

Kolom ini sudah ada di skema, tetapi diisi **hanya melalui admin manual**:

```js
// src/routes/admin.js baris 756–777
router.post('/classes/:id/homeroom', async (req, res) => {
  const { homeroom_teacher_name, homeroom_teacher_nip } = req.body;
  await pq(
    `UPDATE classes SET homeroom_teacher_name = $1, homeroom_teacher_nip = $2 WHERE id = $3`,
    [name, nip, id]
  );
});
```

**Tidak ada kode** di webhook, bulk sync, atau sync-kelas-mapel.js yang menyalin data wali kelas dari SDMS ke `classes.homeroom_teacher_name`.

---

## Pertanyaan 2: Sinkronisasi Mata Pelajaran (Subjects)

### Jawaban: YA — tapi tidak otomatis saat webhook, perlu script terpisah

### Bukti Kode

#### Webhook menerima dan menyimpan mapel ke staging:

**`src/sdms-webhook.js` — `upsertMapel`** (baris ~385–420):

```js
const upsertMapel = async (data) => {
  await q(`
    INSERT INTO sdms_mapel
      (sdms_id, kode, nama, kelompok, jurusan_kode, jam_per_minggu, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET kode=..., nama=..., ...
  `, [data.id, data.kode, data.nama, data.kelompok, data.jurusan?.kode, data.jam_per_minggu]);
};
```

Event yang ditangani: `mapel.created`, `mapel.updated`, dan bulk sync melalui `handleBulkSync`.

#### Bridge `sdms_mapel` → `subjects`:

**`src/db/sync-kelas-mapel.js` — `syncMapel()`** (baris 71–105):

```js
async function syncMapel() {
  const mapelList = await q('SELECT sdms_id, kode, nama FROM sdms_mapel WHERE is_active=true');
  for (const m of mapelList) {
    const code = (m.kode || makeCode(m.nama)).toUpperCase();
    const existing = await q('SELECT id FROM subjects WHERE code=$1', [code]);
    if (existing.length === 0) {
      await q('INSERT INTO subjects (code, name) VALUES ($1, $2)', [code, name]);
    } else {
      await q('UPDATE subjects SET name=$1 WHERE code=$2', [name, code]);
    }
  }
}
```

Script ini dieksekusi manual via CLI: `node src/db/sync-kelas-mapel.js`. Juga ada npm script: `npm run db:import-sdms`.

#### Apakah subjects dibuat manual atau dari SDMS?

Berdasarkan kode di `src/routes/admin.js` (baris ~860–1040), admin bisa:
- Tambah manual via form
- Import massal via Excel/CSV
- Tidak ada tombol "Sync dari SDMS" khusus untuk subjects di halaman admin

Halaman sync SDMS (`/sdms-sync`) hanya menampilkan counter `sdms_mapel.aktif` sebagai informasi, tidak memicu pemindahan ke `subjects`.

---

## Struktur Data SDMS yang Diterima

### Payload Kelas (`kelas.created` / `kelas.updated`)

```json
{
  "id": "uuid-kelas",
  "nama": "XI TKR 1",
  "tingkat": "XI",
  "jurusan": { "kode": "TKR" },
  "kapasitas": 36,
  "ruangan": "Ruang 12"
}
```

**Tidak ada field wali kelas di payload ini.**

### Payload Mapel (`mapel.created` / `mapel.updated`)

```json
{
  "id": "uuid-mapel",
  "kode": "MTK",
  "nama": "Matematika",
  "kelompok": "A",
  "jurusan": { "kode": "TKR" },
  "jam_per_minggu": 4
}
```

### Payload Siswa (mencakup info kelas)

```json
{
  "id": "uuid-siswa",
  "nama": "Ahmad Fauzi",
  "nisn": "1234567890",
  "nis": "21001",
  "jenis_kelamin": "L",
  "jurusan": { "kode": "TKR" },
  "kelas_id": "uuid-kelas",
  "kelas_nama": "XI TKR 1",
  "tahun_masuk": "2023",
  "status": "Aktif",
  "tempat_lahir": "Kediri",
  "tanggal_lahir": "2007-01-15",
  "agama": "Islam",
  "no_hp": "08123456789",
  "alamat": "Jl. ...",
  "nama_ayah": "Budi"
}
```

### Payload Guru (`guru.created` / `guru.updated`)

```json
{
  "id": "uuid-guru",
  "nama": "Budi Santoso",
  "nip": "198001012005011001",
  "niy": null,
  "jenis_kelamin": "L",
  "status_kepegawaian": "PNS",
  "jabatan": "Guru",
  "mata_pelajaran": "Matematika",
  "jurusan": { "kode": "TKR" },
  "no_hp": "08199...",
  "email": "budi@smkn1kras.sch.id",
  "tempat_lahir": "Kediri",
  "tanggal_lahir": "1980-01-01",
  "agama": "Islam",
  "alamat": "Jl. ..."
}
```

---

## Kesimpulan & Rekomendasi

### Gap 1: Wali Kelas tidak di-sync dari SDMS

**Kondisi saat ini:**  
SDMS tidak mengirimkan field wali kelas di payload `kelas`. Kolom `homeroom_teacher_name` dan `homeroom_teacher_nip` di tabel `classes` hanya bisa diisi manual oleh admin.

**Rekomendasi:**  
Dua opsi — pilih salah satu sesuai kemampuan SDMS:

**Opsi A** (jika SDMS bisa kirim field wali kelas):  
Tambahkan field `wali_kelas_nip` atau `wali_kelas_nama` ke payload kelas SDMS, lalu update fungsi `upsertKelas` di `src/sdms-webhook.js` untuk menyalin ke `classes.homeroom_teacher_nip` / `homeroom_teacher_name` setelah INSERT/UPDATE ke `sdms_kelas`.

**Opsi B** (jika SDMS tidak bisa ubah payload):  
Buat mapping manual di LMS: setelah sync kelas, admin memilih guru wali dari daftar guru yang sudah ada di `sdms_guru` untuk setiap kelas.

---

### Gap 2: Kelas tidak otomatis masuk ke tabel `classes` LMS saat bulk sync

**Kondisi saat ini:**  
`handleBulkSync` di `src/sdms-webhook.js` memanggil `upsertKelas` yang hanya menulis ke `sdms_kelas`. Pemindahan ke `classes` butuh `node src/db/sync-kelas-mapel.js` secara terpisah.

**Rekomendasi:**  
Tambahkan langkah INSERT ke `classes` di dalam `upsertKelas` di `src/sdms-webhook.js`, mengikuti pola yang sudah ada di `sdms-webhook.js` (root/versi lama):

```js
// Tambahkan di akhir upsertKelas() di src/sdms-webhook.js
const kodeKelas = data.nama.trim().replace(/\s+/g, '-').toUpperCase();
await q(`
  INSERT INTO classes (code, name)
  VALUES ($1, $2)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
`, [kodeKelas, data.nama]);
```

---

### Gap 3: Mata Pelajaran tidak otomatis masuk ke tabel `subjects` LMS saat bulk sync

**Kondisi saat ini:**  
`upsertMapel` hanya menulis ke `sdms_mapel`. Pemindahan ke `subjects` perlu script CLI terpisah.

**Rekomendasi:**  
Tambahkan langkah INSERT ke `subjects` di dalam `upsertMapel` di `src/sdms-webhook.js`:

```js
// Tambahkan di akhir upsertMapel() di src/sdms-webhook.js
const kodeMapel = (data.kode || data.nama.trim().replace(/\s+/g, '-')).toUpperCase();
await q(`
  INSERT INTO subjects (code, name)
  VALUES ($1, $2)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
`, [kodeMapel, data.nama]);
```

---

### Gap 4: Halaman sync manual (`/sdms-sync`) tidak memicu pemindahan ke `classes`/`subjects`

**Kondisi saat ini:**  
Tombol "Sinkronkan Sekarang" di `/sdms-sync` hanya men-trigger SDMS untuk push data via webhook (ke `sdms_*` staging tables). Tidak ada langkah lanjutan ke tabel operasional.

**Rekomendasi:**  
Setelah webhook selesai, tambahkan pemanggilan fungsi `syncKelas()` dan `syncMapel()` dari `sync-kelas-mapel.js` agar data langsung tersedia di LMS tanpa CLI tambahan.

---

## File-File yang Relevan

| File | Peran |
|---|---|
| `src/sdms-webhook.js` | **Aktif** — webhook receiver, upsert ke staging tables |
| `src/sdms-sync-endpoint.js` | **Aktif** — endpoint manual sync + UI `/sdms-sync` |
| `src/db/sync-kelas-mapel.js` | **Script CLI** — bridge `sdms_kelas`→`classes`, `sdms_mapel`→`subjects` |
| `src/routes/admin.js` | Kelola kelas/mapel manual, endpoint wali kelas |
| `sql/add_homeroom_teacher.sql` | Migrasi kolom wali kelas di tabel `classes` |
| `sdms-webhook.js` (root) | Versi lama/tidak aktif — lebih lengkap: langsung sync ke `classes` |
| `src/sdms-webhook-mysql.js` | Versi MySQL — tidak dipakai (project pakai PostgreSQL) |
