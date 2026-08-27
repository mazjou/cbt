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

const crypto = require('crypto');

const SDMS_SECRET = process.env.SDMS_WEBHOOK_SECRET || 'sdms_lms_secret';

const log  = (msg) => console.log(`[SDMS-Webhook] ${new Date().toISOString().slice(11,19)} ${msg}`);
const warn = (msg) => console.warn(`[SDMS-Webhook] ⚠ ${msg}`);

// ============================================================
// Helper query — pool LMS return [rows, fields] seperti pg
// ============================================================
const q = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  // Pool PostgreSQL: result.rows
  // Pool wrapper LMS: mungkin [rows, fields]
  if (result && result.rows) return result.rows;
  if (Array.isArray(result)) return result[0];
  return result;
};

// ============================================================
// MIDDLEWARE — verifikasi request dari SDMS
//
// SDMS mengirim header X-API-Signature (HMAC-SHA256) untuk
// semua target (DB-registered maupun hardcoded).
// Fallback: cek X-SDMS-Secret (plain) untuk kompatibilitas
// dengan deployment lama.
// ============================================================
const verifySDMS = (req, res, next) => {
  // --- Metode 1: HMAC-SHA256 (dipakai syncService.js SDMS) ---
  const signature = req.headers['x-api-signature'];
  if (signature) {
    try {
      const expected = crypto
        .createHmac('sha256', SDMS_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
      // Bandingkan secara constant-time untuk mencegah timing attack
      const sigBuf  = Buffer.from(signature, 'hex');
      const expBuf  = Buffer.from(expected,  'hex');
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        return next();
      }
      warn(`Signature HMAC tidak valid dari ${req.ip}`);
      return res.status(401).json({ received: false, message: 'Unauthorized' });
    } catch {
      warn(`Error verifikasi HMAC dari ${req.ip}`);
      return res.status(401).json({ received: false, message: 'Unauthorized' });
    }
  }

  // --- Metode 2: Plain secret (fallback / deployment lama) ---
  const plainSecret = req.headers['x-sdms-secret'];
  if (plainSecret && plainSecret === SDMS_SECRET) {
    return next();
  }

  warn(`Unauthorized dari ${req.ip} — tidak ada header X-API-Signature maupun X-SDMS-Secret`);
  return res.status(401).json({ received: false, message: 'Unauthorized' });
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
      let result = null;
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

        case 'bulk.sync':       result = await handleBulkSync(payload); break;

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
// Return: 'inserted' | 'updated' | 'skipped'
// ============================================================
const upsertGuru = async (data) => {
  // Cek dulu apakah sudah ada dan datanya sama persis
  const existing = await q(
    `SELECT nama, nip, niy, jenis_kelamin, status_kepegawaian, jabatan,
            mata_pelajaran, jurusan_kode, no_hp, email,
            tempat_lahir, tanggal_lahir::text, agama, alamat
     FROM sdms_guru WHERE sdms_id=$1`,
    [data.id]
  );

  if (existing.length > 0) {
    const e = existing[0];
    const same =
      e.nama               === (data.nama             || null) &&
      e.nip                === (data.nip              || null) &&
      e.niy                === (data.niy              || null) &&
      e.jenis_kelamin      === (data.jenis_kelamin    || null) &&
      e.status_kepegawaian === (data.status_kepegawaian || null) &&
      e.jabatan            === (data.jabatan          || null) &&
      e.mata_pelajaran     === (data.mata_pelajaran   || null) &&
      e.jurusan_kode       === (data.jurusan?.kode    || null) &&
      e.no_hp              === (data.no_hp            || null) &&
      e.email              === (data.email            || null) &&
      e.tempat_lahir       === (data.tempat_lahir     || null) &&
      e.tanggal_lahir      === (data.tanggal_lahir    || null) &&
      e.agama              === (data.agama            || null) &&
      e.alamat             === (data.alamat           || null);
    if (same) { return 'skipped'; }
  }

  const rows = await q(`
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
    RETURNING (xmax = 0) AS is_new
  `, [
    data.id, data.nama, data.nip||null, data.niy||null,
    data.jenis_kelamin||null, data.status_kepegawaian||null,
    data.jabatan||null, data.mata_pelajaran||null,
    data.jurusan?.kode||null,
    data.no_hp||null, data.email||null,
    data.tempat_lahir||null, data.tanggal_lahir||null,
    data.agama||null, data.alamat||null,
  ]);

  const isNew = rows[0]?.is_new;
  log(`Guru ${isNew ? 'INSERT' : 'UPDATE'}: ${data.nama}`);
  return isNew ? 'inserted' : 'updated';
};

const softDeleteGuru = async (sdmsId) => {
  await q(`UPDATE sdms_guru SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
  log(`Guru deleted: ${sdmsId}`);
};

// ============================================================
// SISWA
// Return: 'inserted' | 'updated' | 'skipped'
// ============================================================
const upsertSiswa = async (data) => {
  const existing = await q(
    `SELECT nama, nisn, nis, jenis_kelamin, jurusan_kode,
            tahun_masuk, status, tempat_lahir, tanggal_lahir::text,
            agama, no_hp, alamat
     FROM sdms_siswa WHERE sdms_id=$1`,
    [data.id]
  );

  if (existing.length > 0) {
    const e = existing[0];
    const same =
      e.nama          === (data.nama             || null) &&
      e.nisn          === (data.nisn             || null) &&
      e.nis           === (data.nis              || null) &&
      e.jenis_kelamin === (data.jenis_kelamin    || null) &&
      e.jurusan_kode  === (data.jurusan?.kode    || null) &&
      e.tahun_masuk   === (data.tahun_masuk      || null) &&
      e.status        === (data.status           || 'Aktif') &&
      e.tempat_lahir  === (data.tempat_lahir     || null) &&
      e.tanggal_lahir === (data.tanggal_lahir    || null) &&
      e.agama         === (data.agama            || null) &&
      e.no_hp         === (data.no_hp            || null) &&
      e.alamat        === (data.alamat           || null);
    if (same) { return 'skipped'; }
  }

  const rows = await q(`
    INSERT INTO sdms_siswa
      (sdms_id, nama, nisn, nis, jenis_kelamin, jurusan_kode,
       tahun_masuk, status, tempat_lahir, tanggal_lahir,
       agama, no_hp, alamat, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, nisn=EXCLUDED.nisn, nis=EXCLUDED.nis,
      jenis_kelamin=EXCLUDED.jenis_kelamin,
      jurusan_kode=EXCLUDED.jurusan_kode,
      tahun_masuk=EXCLUDED.tahun_masuk, status=EXCLUDED.status,
      tempat_lahir=EXCLUDED.tempat_lahir,
      tanggal_lahir=EXCLUDED.tanggal_lahir,
      agama=EXCLUDED.agama, no_hp=EXCLUDED.no_hp,
      alamat=EXCLUDED.alamat, is_active=true, synced_at=NOW()
    RETURNING (xmax = 0) AS is_new
  `, [
    data.id, data.nama, data.nisn||null, data.nis||null,
    data.jenis_kelamin||null, data.jurusan?.kode||null,
    data.tahun_masuk||null, data.status||'Aktif',
    data.tempat_lahir||null, data.tanggal_lahir||null,
    data.agama||null, data.no_hp||null, data.alamat||null,
  ]);

  const isNew = rows[0]?.is_new;
  log(`Siswa ${isNew ? 'INSERT' : 'UPDATE'}: ${data.nama}`);
  return isNew ? 'inserted' : 'updated';
};

const softDeleteSiswa = async (sdmsId) => {
  await q(`UPDATE sdms_siswa SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
};

// ============================================================
// PEGAWAI
// Return: 'inserted' | 'updated' | 'skipped'
// ============================================================
const upsertPegawai = async (data) => {
  const existing = await q(
    `SELECT nama, nip, jenis_kelamin, jabatan, unit_kerja, status_kepegawaian, no_hp, alamat
     FROM sdms_pegawai WHERE sdms_id=$1`,
    [data.id]
  );
  if (existing.length > 0) {
    const e = existing[0];
    const same =
      e.nama               === (data.nama               || null) &&
      e.nip                === (data.nip                || null) &&
      e.jenis_kelamin      === (data.jenis_kelamin      || null) &&
      e.jabatan            === (data.jabatan            || null) &&
      e.unit_kerja         === (data.unit_kerja         || null) &&
      e.status_kepegawaian === (data.status_kepegawaian || null) &&
      e.no_hp              === (data.no_hp              || null) &&
      e.alamat             === (data.alamat             || null);
    if (same) { return 'skipped'; }
  }

  const rows = await q(`
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
    RETURNING (xmax = 0) AS is_new
  `, [
    data.id, data.nama, data.nip||null, data.jenis_kelamin||null,
    data.jabatan||null, data.unit_kerja||null,
    data.status_kepegawaian||null, data.no_hp||null, data.alamat||null,
  ]);

  const isNew = rows[0]?.is_new;
  log(`Pegawai ${isNew ? 'INSERT' : 'UPDATE'}: ${data.nama}`);
  return isNew ? 'inserted' : 'updated';
};

const softDeletePegawai = async (sdmsId) => {
  await q(`UPDATE sdms_pegawai SET is_active=false, synced_at=NOW() WHERE sdms_id=$1`, [sdmsId]);
};

// ============================================================
// KELAS
// Return: 'inserted' | 'updated' | 'skipped'
// ============================================================
const upsertKelas = async (data) => {
  const existing = await q(
    `SELECT nama, tingkat, jurusan_kode, kapasitas, ruangan FROM sdms_kelas WHERE sdms_id=$1`,
    [data.id]
  );
  if (existing.length > 0) {
    const e = existing[0];
    const same =
      e.nama         === (data.nama            || null) &&
      e.tingkat      === (data.tingkat         || null) &&
      e.jurusan_kode === (data.jurusan?.kode   || null) &&
      String(e.kapasitas || '') === String(data.kapasitas || '') &&
      e.ruangan      === (data.ruangan         || null);
    if (same) { return 'skipped'; }
  }

  const rows = await q(`
    INSERT INTO sdms_kelas
      (sdms_id, nama, tingkat, jurusan_kode, kapasitas, ruangan, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      nama=EXCLUDED.nama, tingkat=EXCLUDED.tingkat,
      jurusan_kode=EXCLUDED.jurusan_kode,
      kapasitas=EXCLUDED.kapasitas, ruangan=EXCLUDED.ruangan,
      is_active=true, synced_at=NOW()
    RETURNING (xmax = 0) AS is_new
  `, [
    data.id, data.nama, data.tingkat||null,
    data.jurusan?.kode||null,
    data.kapasitas||null, data.ruangan||null,
  ]);

  const isNew = rows[0]?.is_new;
  log(`Kelas ${isNew ? 'INSERT' : 'UPDATE'}: ${data.nama}`);
  return isNew ? 'inserted' : 'updated';
};

// ============================================================
// MAPEL
// Return: 'inserted' | 'updated' | 'skipped'
// ============================================================
const upsertMapel = async (data) => {
  const existing = await q(
    `SELECT kode, nama, kelompok, jurusan_kode, jam_per_minggu FROM sdms_mapel WHERE sdms_id=$1`,
    [data.id]
  );
  if (existing.length > 0) {
    const e = existing[0];
    const same =
      e.kode           === (data.kode            || null) &&
      e.nama           === (data.nama            || null) &&
      e.kelompok       === (data.kelompok        || null) &&
      e.jurusan_kode   === (data.jurusan?.kode   || null) &&
      String(e.jam_per_minggu || '') === String(data.jam_per_minggu || '');
    if (same) { return 'skipped'; }
  }

  const rows = await q(`
    INSERT INTO sdms_mapel
      (sdms_id, kode, nama, kelompok, jurusan_kode, jam_per_minggu, is_active, synced_at)
    VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
    ON CONFLICT (sdms_id) DO UPDATE SET
      kode=EXCLUDED.kode, nama=EXCLUDED.nama,
      kelompok=EXCLUDED.kelompok, jurusan_kode=EXCLUDED.jurusan_kode,
      jam_per_minggu=EXCLUDED.jam_per_minggu,
      is_active=true, synced_at=NOW()
    RETURNING (xmax = 0) AS is_new
  `, [
    data.id, data.kode, data.nama,
    data.kelompok||null, data.jurusan?.kode||null,
    data.jam_per_minggu||null,
  ]);

  const isNew = rows[0]?.is_new;
  log(`Mapel ${isNew ? 'INSERT' : 'UPDATE'}: ${data.nama}`);
  return isNew ? 'inserted' : 'updated';
};

// ============================================================
// BULK SYNC
// Mengembalikan statistik: { inserted, updated, skipped, errors }
// ============================================================
const handleBulkSync = async (payload) => {
  const { guru=[], siswa=[], kelas=[], mapel=[], pegawai=[] } = payload;
  log(`Bulk sync: ${guru.length} guru, ${siswa.length} siswa, ${kelas.length} kelas`);

  const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  const runUpsert = async (fn, item, label) => {
    try {
      const result = await fn(item);
      if (result === 'inserted') stats.inserted++;
      else if (result === 'updated') stats.updated++;
      else stats.skipped++;
    } catch (e) {
      stats.errors++;
      warn(`${label} ${item.nama}: ${e.message}`);
    }
  };

  for (const g of guru)    await runUpsert(upsertGuru,    g, 'guru');
  for (const s of siswa)   await runUpsert(upsertSiswa,   s, 'siswa');
  for (const k of kelas)   await runUpsert(upsertKelas,   k, 'kelas');
  for (const m of mapel)   await runUpsert(upsertMapel,   m, 'mapel');
  for (const p of pegawai) await runUpsert(upsertPegawai, p, 'pegawai');

  log(`Bulk sync selesai — insert:${stats.inserted} update:${stats.updated} skip:${stats.skipped} err:${stats.errors}`);
  return stats;
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

module.exports = { verifySDMS, handleWebhook, setupTables, handleBulkSync, upsertGuru, upsertSiswa, upsertKelas, upsertMapel, upsertPegawai };
