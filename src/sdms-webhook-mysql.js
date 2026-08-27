/**
 * SDMS Webhook Receiver untuk LMS Node.js + MySQL/MariaDB
 * =========================================================
 * Versi ini menggunakan pool MySQL yang sudah ada di LMS (/cbt/src/db/pool)
 *
 * Sudah terdaftar di server.js LMS:
 *   const { verifySDMS, handleWebhook, setupTables } = require('./sdms-webhook');
 *   setupTables().catch(console.error);
 *   app.post('/api/webhooks/sdms', verifySDMS, handleWebhook);
 */

'use strict';

// Gunakan pool MySQL yang sudah ada di LMS — tidak buat koneksi baru
let pool;
try {
  pool = require('./db/pool');
} catch {
  // Fallback jika path berbeda
  pool = require('../db/pool');
}

const SDMS_SECRET = process.env.SDMS_WEBHOOK_SECRET || 'sdms_lms_secret';

const log  = (msg) => console.log(`[SDMS-Webhook] ${new Date().toISOString().slice(11,19)} ${msg}`);
const warn = (msg) => console.warn(`[SDMS-Webhook] ⚠ ${msg}`);

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

  // Proses di background
  setImmediate(async () => {
    try {
      switch (event) {
        case 'guru.created':
        case 'guru.updated':   await upsertGuru(payload);       break;
        case 'guru.deleted':   await softDeleteGuru(payload.id); break;

        case 'siswa.created':
        case 'siswa.updated':  await upsertSiswa(payload);       break;
        case 'siswa.deleted':  await softDeleteSiswa(payload.id); break;

        case 'pegawai.created':
        case 'pegawai.updated': await upsertPegawai(payload);    break;
        case 'pegawai.deleted': await softDeletePegawai(payload.id); break;

        case 'kelas.created':
        case 'kelas.updated':  await upsertKelas(payload);       break;

        case 'mapel.created':
        case 'mapel.updated':  await upsertMapel(payload);       break;

        case 'bulk.sync':      await handleBulkSync(payload);    break;

        case 'ping':
          log('Ping dari SDMS — OK');
          break;

        default:
          warn(`Event tidak dikenal: ${event}`);
      }
      await logSync(event, payload?.id || null, 'success');
    } catch (err) {
      warn(`Error ${event}: ${err.message}`);
      await logSync(event, payload?.id || null, 'error', err.message).catch(() => {});
    }
  });
};

// ============================================================
// Helper query MySQL — pakai pool.query dari LMS
// ============================================================
const q = async (sql, params = []) => {
  // pool LMS bisa berupa mysql2 pool (callback) atau promise pool
  // Coba promise API dulu, fallback ke callback
  if (typeof pool.execute === 'function') {
    const [rows] = await pool.execute(sql, params);
    return rows;
  }
  if (typeof pool.query === 'function') {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  throw new Error('Pool tidak mendukung promise API');
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
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW())
    ON DUPLICATE KEY UPDATE
      nama=VALUES(nama), nip=VALUES(nip), niy=VALUES(niy),
      jenis_kelamin=VALUES(jenis_kelamin),
      status_kepegawaian=VALUES(status_kepegawaian),
      jabatan=VALUES(jabatan), mata_pelajaran=VALUES(mata_pelajaran),
      jurusan_kode=VALUES(jurusan_kode), no_hp=VALUES(no_hp),
      email=VALUES(email), tempat_lahir=VALUES(tempat_lahir),
      tanggal_lahir=VALUES(tanggal_lahir), agama=VALUES(agama),
      alamat=VALUES(alamat), is_active=1, synced_at=NOW()
  `, [
    data.id, data.nama, data.nip || null, data.niy || null,
    data.jenis_kelamin || null, data.status_kepegawaian || null,
    data.jabatan || null, data.mata_pelajaran || null,
    data.jurusan?.kode || null,
    data.no_hp || null, data.email || null,
    data.tempat_lahir || null, data.tanggal_lahir || null,
    data.agama || null, data.alamat || null,
  ]);
  log(`Guru upsert: ${data.nama}`);
};

const softDeleteGuru = async (sdmsId) => {
  await q(`UPDATE sdms_guru SET is_active=0, synced_at=NOW() WHERE sdms_id=?`, [sdmsId]);
  log(`Guru deleted: ${sdmsId}`);
};

// ============================================================
// SISWA
// ============================================================
const upsertSiswa = async (data) => {
  await q(`
    INSERT INTO sdms_siswa
      (sdms_id, nama, nisn, nis, jenis_kelamin, jurusan_kode,
       tahun_masuk, status, tempat_lahir, tanggal_lahir,
       agama, no_hp, alamat, is_active, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW())
    ON DUPLICATE KEY UPDATE
      nama=VALUES(nama), nisn=VALUES(nisn), nis=VALUES(nis),
      jenis_kelamin=VALUES(jenis_kelamin), jurusan_kode=VALUES(jurusan_kode),
      tahun_masuk=VALUES(tahun_masuk), status=VALUES(status),
      tempat_lahir=VALUES(tempat_lahir), tanggal_lahir=VALUES(tanggal_lahir),
      agama=VALUES(agama), no_hp=VALUES(no_hp), alamat=VALUES(alamat),
      is_active=1, synced_at=NOW()
  `, [
    data.id, data.nama, data.nisn || null, data.nis || null,
    data.jenis_kelamin || null, data.jurusan?.kode || null,
    data.tahun_masuk || null, data.status || 'Aktif',
    data.tempat_lahir || null, data.tanggal_lahir || null,
    data.agama || null, data.no_hp || null, data.alamat || null,
  ]);
  log(`Siswa upsert: ${data.nama}`);
};

const softDeleteSiswa = async (sdmsId) => {
  await q(`UPDATE sdms_siswa SET is_active=0, synced_at=NOW() WHERE sdms_id=?`, [sdmsId]);
};

// ============================================================
// PEGAWAI
// ============================================================
const upsertPegawai = async (data) => {
  await q(`
    INSERT INTO sdms_pegawai
      (sdms_id, nama, nip, jenis_kelamin, jabatan,
       unit_kerja, status_kepegawaian, no_hp, alamat, is_active, synced_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,NOW())
    ON DUPLICATE KEY UPDATE
      nama=VALUES(nama), nip=VALUES(nip),
      jenis_kelamin=VALUES(jenis_kelamin), jabatan=VALUES(jabatan),
      unit_kerja=VALUES(unit_kerja),
      status_kepegawaian=VALUES(status_kepegawaian),
      no_hp=VALUES(no_hp), alamat=VALUES(alamat),
      is_active=1, synced_at=NOW()
  `, [
    data.id, data.nama, data.nip || null, data.jenis_kelamin || null,
    data.jabatan || null, data.unit_kerja || null,
    data.status_kepegawaian || null, data.no_hp || null, data.alamat || null,
  ]);
  log(`Pegawai upsert: ${data.nama}`);
};

const softDeletePegawai = async (sdmsId) => {
  await q(`UPDATE sdms_pegawai SET is_active=0, synced_at=NOW() WHERE sdms_id=?`, [sdmsId]);
};

// ============================================================
// KELAS
// ============================================================
const upsertKelas = async (data) => {
  await q(`
    INSERT INTO sdms_kelas
      (sdms_id, nama, tingkat, jurusan_kode, kapasitas, ruangan, is_active, synced_at)
    VALUES (?,?,?,?,?,?,1,NOW())
    ON DUPLICATE KEY UPDATE
      nama=VALUES(nama), tingkat=VALUES(tingkat),
      jurusan_kode=VALUES(jurusan_kode), kapasitas=VALUES(kapasitas),
      ruangan=VALUES(ruangan), is_active=1, synced_at=NOW()
  `, [
    data.id, data.nama, data.tingkat || null,
    data.jurusan?.kode || null,
    data.kapasitas || null, data.ruangan || null,
  ]);
  log(`Kelas upsert: ${data.nama}`);
};

// ============================================================
// MAPEL
// ============================================================
const upsertMapel = async (data) => {
  await q(`
    INSERT INTO sdms_mapel
      (sdms_id, kode, nama, kelompok, jurusan_kode, jam_per_minggu, is_active, synced_at)
    VALUES (?,?,?,?,?,?,1,NOW())
    ON DUPLICATE KEY UPDATE
      kode=VALUES(kode), nama=VALUES(nama), kelompok=VALUES(kelompok),
      jurusan_kode=VALUES(jurusan_kode),
      jam_per_minggu=VALUES(jam_per_minggu),
      is_active=1, synced_at=NOW()
  `, [
    data.id, data.kode, data.nama,
    data.kelompok || null, data.jurusan?.kode || null,
    data.jam_per_minggu || null,
  ]);
  log(`Mapel upsert: ${data.nama}`);
};

// ============================================================
// BULK SYNC
// ============================================================
const handleBulkSync = async (payload) => {
  const { guru = [], siswa = [], kelas = [] } = payload;
  log(`Bulk sync: ${guru.length} guru, ${siswa.length} siswa, ${kelas.length} kelas`);
  for (const g of guru)  await upsertGuru(g).catch(e => warn(`guru ${g.nama}: ${e.message}`));
  for (const s of siswa) await upsertSiswa(s).catch(e => warn(`siswa ${s.nama}: ${e.message}`));
  for (const k of kelas) await upsertKelas(k).catch(e => warn(`kelas ${k.nama}: ${e.message}`));
  log('Bulk sync selesai');
};

// ============================================================
// LOG SYNC
// ============================================================
const logSync = async (event, resourceId, status, errorMsg = null) => {
  try {
    await q(`
      INSERT INTO sdms_sync_log (event, resource_id, status, error_message, created_at)
      VALUES (?,?,?,?,NOW())
    `, [event, resourceId, status, errorMsg]);
  } catch { /* abaikan */ }
};

// ============================================================
// SETUP TABEL MySQL — jalankan sekali saat server start
// ============================================================
const setupTables = async () => {
  const tables = [
    `CREATE TABLE IF NOT EXISTS sdms_guru (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      sdms_id          VARCHAR(36) NOT NULL UNIQUE,
      nama             VARCHAR(200) NOT NULL,
      nip              VARCHAR(30),
      niy              VARCHAR(30),
      jenis_kelamin    CHAR(1),
      status_kepegawaian VARCHAR(20),
      jabatan          VARCHAR(100),
      mata_pelajaran   VARCHAR(200),
      jurusan_kode     VARCHAR(20),
      no_hp            VARCHAR(20),
      email            VARCHAR(150),
      tempat_lahir     VARCHAR(100),
      tanggal_lahir    DATE,
      agama            VARCHAR(20),
      alamat           TEXT,
      is_active        TINYINT(1) DEFAULT 1,
      synced_at        DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sdms_siswa (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      sdms_id          VARCHAR(36) NOT NULL UNIQUE,
      nama             VARCHAR(200) NOT NULL,
      nisn             VARCHAR(20),
      nis              VARCHAR(20),
      jenis_kelamin    CHAR(1),
      jurusan_kode     VARCHAR(20),
      tahun_masuk      VARCHAR(10),
      status           VARCHAR(20),
      tempat_lahir     VARCHAR(100),
      tanggal_lahir    DATE,
      agama            VARCHAR(20),
      no_hp            VARCHAR(20),
      alamat           TEXT,
      is_active        TINYINT(1) DEFAULT 1,
      synced_at        DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sdms_pegawai (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      sdms_id          VARCHAR(36) NOT NULL UNIQUE,
      nama             VARCHAR(200) NOT NULL,
      nip              VARCHAR(30),
      jenis_kelamin    CHAR(1),
      jabatan          VARCHAR(100),
      unit_kerja       VARCHAR(100),
      status_kepegawaian VARCHAR(20),
      no_hp            VARCHAR(20),
      alamat           TEXT,
      is_active        TINYINT(1) DEFAULT 1,
      synced_at        DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sdms_kelas (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      sdms_id          VARCHAR(36) NOT NULL UNIQUE,
      nama             VARCHAR(100) NOT NULL,
      tingkat          VARCHAR(5),
      jurusan_kode     VARCHAR(20),
      kapasitas        INT,
      ruangan          VARCHAR(50),
      is_active        TINYINT(1) DEFAULT 1,
      synced_at        DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sdms_mapel (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      sdms_id          VARCHAR(36) NOT NULL UNIQUE,
      kode             VARCHAR(20) NOT NULL,
      nama             VARCHAR(200) NOT NULL,
      kelompok         VARCHAR(50),
      jurusan_kode     VARCHAR(20),
      jam_per_minggu   INT,
      is_active        TINYINT(1) DEFAULT 1,
      synced_at        DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS sdms_sync_log (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      event            VARCHAR(50) NOT NULL,
      resource_id      VARCHAR(36),
      status           VARCHAR(10) NOT NULL,
      error_message    TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_event (event, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];

  for (const sql of tables) {
    await q(sql);
  }
  log('Tabel sdms_* siap di MySQL LMS');
};

module.exports = { verifySDMS, handleWebhook, setupTables };
