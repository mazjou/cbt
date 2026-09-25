/**
 * SDMS Webhook Receiver untuk LMS Node.js + PostgreSQL
 * =====================================================
 * Pakai koneksi pool yang sudah ada di LMS (/cbt/src/db/pool)
 * Database LMS: PostgreSQL (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME dari .env)
 *
 * Sudah terdaftar di server.js LMS:
 *   const { verifySDMS, handleWebhook, setupTables } = require('./sdms-webhook');
 *   setupTables().catch(console.error);
 *   app.post('/api/webhooks/sdms', verifySDMS, handleWebhook);
 */

'use strict';

// Gunakan pool yang sudah ada di LMS — tidak buat koneksi baru
let pool;
try {
  pool = require('./db/pool');
} catch {
  pool = require('../db/pool');
}

const SDMS_SECRET = process.env.SDMS_WEBHOOK_SECRET || 'sdms_lms_secret';

const log  = (msg) => console.log(`[SDMS-Webhook] ${new Date().toISOString().slice(11,19)} ${msg}`);
const warn = (msg) => console.warn(`[SDMS-Webhook] ⚠ ${msg}`);

// ============================================================
// Helper query — pool LMS return [rows, fields] seperti mysql2
// ============================================================
const q = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  // Pool LMS wrapper: hasil adalah [rows, fields]
  return Array.isArray(result) ? result[0] : (result.rows || result);
};

// ============================================================
// MIDDLEWARE — verifikasi secret header dari SDMS
// ============================================================
const verifySDMS = (req, res, next) => {
  const secret = req.headers['x-sdms-secret'];
  if (!secret || secret !== SDMS_SECRET) {
    warn(`Unauthorized dari ${req.ip}`);
    return res.status(401).json({ received: false, message: 'Unauthorized' });
  }
  next();
};

// ============================================================
// HANDLER UTAMA
// ============================================================
const handleWebhook = async (req, res) => {
  const { event, payload, meta } = req.body;

  if (!event || !payload) {
    return res.status(400).json({ received: false, message: 'event dan payload wajib ada' });
  }

  log(`Event: ${event} | ${payload?.nama || payload?.id || ''}`);

  // Balas 200 dulu agar SDMS tidak timeout
  res.json({ received: true, event });

  // Proses di background agar tidak block response
  setImmediate(async () => {
    try {
      switch (event) {
        case 'guru.created':
        case 'guru.updated':    await upsertGuru(payload);        break;
        case 'guru.deleted':    await softDeleteGuru(payload.id); break;

        case 'siswa.created':
        case 'siswa.updated':   await upsertSiswa(payload);       break;
        case 'siswa.deleted':   await softDeleteSiswa(payload.id); break;

        case 'pegawai.created':
        case 'pegawai.updated': await upsertPegawai(payload);     break;
        case 'pegawai.deleted': await softDeletePegawai(payload.id); break;

        case 'kelas.created':
        case 'kelas.updated':   await upsertKelas(payload);       break;

        case 'mapel.created':
        case 'mapel.updated':   await upsertMapel(payload);       break;

        case 'bulk.sync':       await handleBulkSync(payload);    break;

        case 'ping':
          log('Ping dari SDMS — koneksi OK ✓');
          break;

        default:
          warn(`Event tidak dikenal: ${event}`);
      }
      await logSync(event, payload?.id || null, 'success');
    } catch (err) {
      warn(`Error proses ${event}: ${err.message}`);
      await logSync(event, payload?.id || null, 'error', err.message).catch(() => {});
    }
  });
};

// ============================================================
// GURU
// ============================================================
const upsertGuru = async (data) => {
  await q(`
    INSERT INTO sdms_guru
      (sdms_id, nama, nip, niy, jenis_kelamin, status_kepegawaian,
       jabatan, mata_pelajaran, jurusan_kode, no_hp, email,
       tempat_lahir, tanggal_lahir, agama, alamat, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, nip=EXCLUDED.nip, niy=EXCLUDED.niy,
      jenis_kelamin=EXCLUDED.jenis_kelamin,
      status_kepegawaian=EXCLUDED.status_kepegawaian,
      jabatan=EXCLUDED.jabatan, mata_pelajaran=EXCLUDED.mata_pelajaran,
      jurusan_kode=EXCLUDED.jurusan_kode, no_hp=EXCLUDED.no_hp,
      email=EXCLUDED.email, tempat_lahir=EXCLUDED.tempat_lahir,
      tanggal_lahir=EXCLUDED.tanggal_lahir, agama=EXCLUDED.agama,
      alamat=EXCLUDED.alamat, is_active=true, synced_at=NOW()
  `, [
    data.id, data.nama, data.nip||null, data.niy||null,
    data.jenis_kelamin||null, data.status_kepegawaian||null,
    data.jabatan||null, data.mata_pelajaran||null,
    data.jurusan?.kode||null,
    data.no_hp||null, data.email||null,
    data.tempat_lahir||null, data.tanggal_lahir||null,
    data.agama||null, data.alamat||null,
  ]);
  log(`Guru upsert: ${data.nama}`);
};

const softDeleteGuru = async (sdmsId) => {
  await q(`UPDATE sdms_guru SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
  // Nonaktifkan akun login LMS guru (username = nip atau niy)
  try {
    const rows = await q(`SELECT nip, niy FROM sdms_guru WHERE sdms_id=$1`, [sdmsId]);
    const guru = rows[0];
    if (guru) {
      const username = guru.nip || guru.niy;
      if (username) {
        await q(`UPDATE users SET is_active=false WHERE username=$1 AND role='TEACHER'`, [username]);
        log(`Akun LMS guru dinonaktifkan: ${username}`);
      }
    }
  } catch(e) { warn(`Gagal nonaktifkan akun guru: ${e.message}`); }
  log(`Guru deleted: ${sdmsId}`);
};

// ============================================================
// SISWA
// ============================================================
const upsertSiswa = async (data) => {
  await q(`
    INSERT INTO sdms_siswa
      (sdms_id, nama, nisn, nis, jenis_kelamin, jurusan_kode,
       kelas_id, kelas_nama,
       tahun_masuk, status, tempat_lahir, tanggal_lahir,
       agama, no_hp, alamat, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, nisn=EXCLUDED.nisn, nis=EXCLUDED.nis,
      jenis_kelamin=EXCLUDED.jenis_kelamin,
      jurusan_kode=EXCLUDED.jurusan_kode,
      kelas_id=EXCLUDED.kelas_id,
      kelas_nama=EXCLUDED.kelas_nama,
      tahun_masuk=EXCLUDED.tahun_masuk, status=EXCLUDED.status,
      tempat_lahir=EXCLUDED.tempat_lahir,
      tanggal_lahir=EXCLUDED.tanggal_lahir,
      agama=EXCLUDED.agama, no_hp=EXCLUDED.no_hp,
      alamat=EXCLUDED.alamat, is_active=true, synced_at=NOW()
  `, [
    data.id, data.nama, data.nisn||null, data.nis||null,
    data.jenis_kelamin||null, data.jurusan?.kode||null,
    data.kelas_id||null, data.kelas?.nama||null,
    data.tahun_masuk||null, data.status||'Aktif',
    data.tempat_lahir||null, data.tanggal_lahir||null,
    data.agama||null, data.no_hp||null, data.alamat||null,
  ]);
  log(`Siswa upsert: ${data.nama}`);
};

const softDeleteSiswa = async (sdmsId) => {
  await q(`UPDATE sdms_siswa SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
  // Nonaktifkan akun login LMS siswa (username = nisn atau nis)
  try {
    const rows = await q(`SELECT nisn, nis FROM sdms_siswa WHERE sdms_id=$1`, [sdmsId]);
    const siswa = rows[0];
    if (siswa) {
      const username = siswa.nisn || siswa.nis;
      if (username) {
        await q(`UPDATE users SET is_active=false WHERE username=$1 AND role='STUDENT'`, [username]);
        log(`Akun LMS siswa dinonaktifkan: ${username}`);
      }
    }
  } catch(e) { warn(`Gagal nonaktifkan akun siswa: ${e.message}`); }
  log(`Siswa deleted: ${sdmsId}`);
};

// ============================================================
// PEGAWAI
// ============================================================
const upsertPegawai = async (data) => {
  await q(`
    INSERT INTO sdms_pegawai
      (sdms_id, nama, nip, jenis_kelamin, jabatan,
       unit_kerja, status_kepegawaian, no_hp, alamat, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, nip=EXCLUDED.nip,
      jenis_kelamin=EXCLUDED.jenis_kelamin,
      jabatan=EXCLUDED.jabatan, unit_kerja=EXCLUDED.unit_kerja,
      status_kepegawaian=EXCLUDED.status_kepegawaian,
      no_hp=EXCLUDED.no_hp, alamat=EXCLUDED.alamat,
      is_active=true, synced_at=NOW()
  `, [
    data.id, data.nama, data.nip||null, data.jenis_kelamin||null,
    data.jabatan||null, data.unit_kerja||null,
    data.status_kepegawaian||null, data.no_hp||null, data.alamat||null,
  ]);
  log(`Pegawai upsert: ${data.nama}`);
};

const softDeletePegawai = async (sdmsId) => {
  await q(`UPDATE sdms_pegawai SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
};

// ============================================================
// KELAS
// ============================================================
const upsertKelas = async (data) => {
  // Generate kode kelas format: XI-TKR-1 (tingkat-jurusan_kode-nomor)
  // Contoh nama: "XI TKR 1" → kode: "XI-TKR-1"
  const kodeKelas = data.nama
    ? data.nama.trim().replace(/\s+/g, '-').toUpperCase()
    : (data.jurusan?.kode ? `${data.tingkat || ''}-${data.jurusan.kode}-${data.nama}` : data.nama);

  await q(`
    INSERT INTO sdms_kelas
      (sdms_id, nama, tingkat, jurusan_kode, kapasitas, ruangan, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, tingkat=EXCLUDED.tingkat,
      jurusan_kode=EXCLUDED.jurusan_kode,
      kapasitas=EXCLUDED.kapasitas, ruangan=EXCLUDED.ruangan,
      is_active=true, synced_at=NOW()
  `, [
    data.id, data.nama, data.tingkat||null,
    data.jurusan?.kode||null,
    data.kapasitas||null, data.ruangan||null,
  ]);

  // Update tabel classes (kode pakai format XI-TKR-1, nama tetap asli)
  await q(`
    INSERT INTO classes (code, name)
    VALUES ($1, $2)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name
  `, [kodeKelas, data.nama]);

  log(`Kelas upsert: ${data.nama} (kode: ${kodeKelas})`);
};

// ============================================================
// MAPEL
// ============================================================
const upsertMapel = async (data) => {
  await q(`
    INSERT INTO sdms_mapel
      (sdms_id, kode, nama, kelompok, jurusan_kode, jam_per_minggu, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      kode=EXCLUDED.kode, nama=EXCLUDED.nama,
      kelompok=EXCLUDED.kelompok, jurusan_kode=EXCLUDED.jurusan_kode,
      jam_per_minggu=EXCLUDED.jam_per_minggu,
      is_active=true, synced_at=NOW()
  `, [
    data.id, data.kode, data.nama,
    data.kelompok||null, data.jurusan?.kode||null,
    data.jam_per_minggu||null,
  ]);
  log(`Mapel upsert: ${data.nama}`);
};

// ============================================================
// BULK SYNC
// ============================================================
const handleBulkSync = async (payload) => {
  const { guru=[], siswa=[], kelas=[], mapel=[] } = payload;
  log(`Bulk sync: ${guru.length} guru, ${siswa.length} siswa, ${kelas.length} kelas, ${mapel.length} mapel`);

  for (const k of kelas) await upsertKelas(k).catch(e => warn(`kelas ${k.nama}: ${e.message}`));
  for (const g of guru)  await upsertGuru(g).catch(e => warn(`guru ${g.nama}: ${e.message}`));
  for (const s of siswa) await upsertSiswa(s).catch(e => warn(`siswa ${s.nama}: ${e.message}`));
  for (const m of mapel) await upsertMapel(m).catch(e => warn(`mapel ${m.nama}: ${e.message}`));

  // Update class_id di tabel users berdasarkan kelas_nama siswa
  try {
    await q(`
      UPDATE users u
      SET class_id = c.id
      FROM sdms_siswa ss
      JOIN classes c ON LOWER(c.name) = LOWER(ss.kelas_nama)
      WHERE u.username = ss.nisn
        AND ss.kelas_nama IS NOT NULL
        AND u.class_id IS NULL
    `);
    log('class_id users siswa berhasil diupdate');
  } catch(e) { warn(`Gagal update class_id: ${e.message}`); }

  const stats = { insert: 0, update: 0, skip: 0, err: 0 };
  const duration = 0;
  log(`Bulk sync selesai — insert:${stats.insert} update:${stats.update} skip:${stats.skip} err:${stats.err}`);
};

// ============================================================
// LOG SYNC
// ============================================================
const logSync = async (event, resourceId, status, errorMsg=null) => {
  try {
    await q(`
      INSERT INTO sdms_sync_log (event, resource_id, status, error_message, created_at)
      VALUES ($1,$2,$3,$4,NOW())
    `, [event, resourceId, status, errorMsg]);
  } catch { /* abaikan error logging */ }
};

// ============================================================
// SETUP TABEL PostgreSQL — otomatis saat server start
// ============================================================
const setupTables = async () => {
  await q(`
    CREATE TABLE IF NOT EXISTS sdms_guru (
      id                 SERIAL PRIMARY KEY,
      sdms_id            VARCHAR(36) UNIQUE NOT NULL,
      nama               VARCHAR(200) NOT NULL,
      nip                VARCHAR(30),
      niy                VARCHAR(30),
      jenis_kelamin      CHAR(1),
      status_kepegawaian VARCHAR(20),
      jabatan            VARCHAR(100),
      mata_pelajaran     VARCHAR(200),
      jurusan_kode       VARCHAR(20),
      no_hp              VARCHAR(20),
      email              VARCHAR(150),
      tempat_lahir       VARCHAR(100),
      tanggal_lahir      DATE,
      agama              VARCHAR(20),
      alamat             TEXT,
      is_active          BOOLEAN DEFAULT true,
      synced_at          TIMESTAMP,
      created_at         TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS sdms_siswa (
      id            SERIAL PRIMARY KEY,
      sdms_id       VARCHAR(36) UNIQUE NOT NULL,
      nama          VARCHAR(200) NOT NULL,
      nisn          VARCHAR(20),
      nis           VARCHAR(20),
      jenis_kelamin CHAR(1),
      jurusan_kode  VARCHAR(20),
      tahun_masuk   VARCHAR(10),
      status        VARCHAR(20),
      tempat_lahir  VARCHAR(100),
      tanggal_lahir DATE,
      agama         VARCHAR(20),
      no_hp         VARCHAR(20),
      alamat        TEXT,
      is_active     BOOLEAN DEFAULT true,
      synced_at     TIMESTAMP,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS sdms_pegawai (
      id                 SERIAL PRIMARY KEY,
      sdms_id            VARCHAR(36) UNIQUE NOT NULL,
      nama               VARCHAR(200) NOT NULL,
      nip                VARCHAR(30),
      jenis_kelamin      CHAR(1),
      jabatan            VARCHAR(100),
      unit_kerja         VARCHAR(100),
      status_kepegawaian VARCHAR(20),
      no_hp              VARCHAR(20),
      alamat             TEXT,
      is_active          BOOLEAN DEFAULT true,
      synced_at          TIMESTAMP,
      created_at         TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS sdms_kelas (
      id           SERIAL PRIMARY KEY,
      sdms_id      VARCHAR(36) UNIQUE NOT NULL,
      nama         VARCHAR(100) NOT NULL,
      tingkat      VARCHAR(5),
      jurusan_kode VARCHAR(20),
      kapasitas    INTEGER,
      ruangan      VARCHAR(50),
      is_active    BOOLEAN DEFAULT true,
      synced_at    TIMESTAMP,
      created_at   TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS sdms_mapel (
      id             SERIAL PRIMARY KEY,
      sdms_id        VARCHAR(36) UNIQUE NOT NULL,
      kode           VARCHAR(20) NOT NULL,
      nama           VARCHAR(200) NOT NULL,
      kelompok       VARCHAR(50),
      jurusan_kode   VARCHAR(20),
      jam_per_minggu INTEGER,
      is_active      BOOLEAN DEFAULT true,
      synced_at      TIMESTAMP,
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`
    CREATE TABLE IF NOT EXISTS sdms_sync_log (
      id            SERIAL PRIMARY KEY,
      event         VARCHAR(50) NOT NULL,
      resource_id   VARCHAR(36),
      status        VARCHAR(10) NOT NULL,
      error_message TEXT,
      created_at    TIMESTAMP DEFAULT NOW()
    )
  `);

  // Index
  await q(`CREATE INDEX IF NOT EXISTS idx_sdms_guru_sdms_id  ON sdms_guru(sdms_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sdms_siswa_sdms_id ON sdms_siswa(sdms_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sdms_sync_log      ON sdms_sync_log(event, created_at)`);

  log('Tabel sdms_* siap di PostgreSQL LMS ✓');
};

module.exports = { verifySDMS, handleWebhook, setupTables };
