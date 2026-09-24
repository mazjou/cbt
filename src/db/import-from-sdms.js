/**
 * Import User dari Data SDMS ke Tabel Users LMS
 * ================================================
 * Script ini membuat akun login LMS untuk siswa dan guru
 * berdasarkan data yang sudah tersinkron dari SDMS.
 *
 * Username siswa : nisn (fallback: nis)
 * Password siswa : nisn (bisa diganti)
 * Role siswa     : STUDENT
 *
 * Username guru  : nip (fallback: niy, lalu nama tanpa spasi lowercase)
 * Password guru  : nip (bisa diganti)
 * Role guru      : TEACHER
 *
 * Cara pakai:
 *   node src/db/import-from-sdms.js
 *   node src/db/import-from-sdms.js --dry-run   (simulasi, tidak simpan)
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');

const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('🔍 DRY RUN MODE — tidak ada yang disimpan\n');

// Wrapper query — pool LMS pakai pg standard (result.rows)
const q = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return { rows: result.rows || result[0] || [] };
};

async function main() {
  try {
    // ── Statistik awal ───────────────────────────────────────
    const { rows: [stat] } = await q(`
      SELECT
        (SELECT COUNT(*) FROM sdms_siswa WHERE is_active=true) AS total_siswa,
        (SELECT COUNT(*) FROM sdms_guru  WHERE is_active=true) AS total_guru,
        (SELECT COUNT(*) FROM users WHERE role='STUDENT')      AS existing_siswa,
        (SELECT COUNT(*) FROM users WHERE role='TEACHER')      AS existing_guru
    `);

    console.log('📊 Status sebelum import:');
    console.log(`   sdms_siswa aktif : ${stat.total_siswa}`);
    console.log(`   sdms_guru  aktif : ${stat.total_guru}`);
    console.log(`   users STUDENT    : ${stat.existing_siswa}`);
    console.log(`   users TEACHER    : ${stat.existing_guru}`);
    console.log('');

    // ── Import Siswa ─────────────────────────────────────────
    console.log('👤 Memproses siswa...');
    const { rows: siswaList } = await q(`
      SELECT s.sdms_id, s.nama, s.nisn, s.nis, s.jurusan_kode,
             c.id AS class_id
      FROM sdms_siswa s
      LEFT JOIN classes c ON LOWER(c.code) = LOWER(
        CONCAT(s.jurusan_kode)
      )
      WHERE s.is_active = true
      ORDER BY s.nama
    `);

    let siswaInsert = 0, siswaUpdate = 0, siswaSkip = 0, siswaError = 0;

    for (const s of siswaList) {
      const username = (s.nisn || s.nis || '').trim();
      if (!username) { siswaSkip++; continue; }

      const fullName  = (s.nama || '').trim();
      const plainPass = username; // password = nisn
      const classId   = s.class_id || null;

      try {
        if (!DRY_RUN) {
          const hash = await bcrypt.hash(plainPass, 10);
          const { rows } = await q(`
            INSERT INTO users (username, full_name, role, password_hash, plain_password, class_id, is_active)
            VALUES ($1, $2, 'STUDENT', $3, $4, $5, true)
            ON CONFLICT (username) DO UPDATE SET
              full_name     = EXCLUDED.full_name,
              class_id      = COALESCE(EXCLUDED.class_id, users.class_id),
              is_active     = true,
              updated_at    = NOW()
            RETURNING (xmax = 0) AS is_new
          `, [username, fullName, hash, plainPass, classId]);

          if (rows[0]?.is_new) siswaInsert++;
          else siswaUpdate++;
        } else {
          // Dry run: hanya cek apakah user sudah ada
          const { rows } = await q(
            'SELECT id FROM users WHERE username=$1', [username]
          );
          if (rows.length === 0) siswaInsert++;
          else siswaUpdate++;
        }
      } catch (e) {
        siswaError++;
        if (siswaError <= 3) console.warn(`   ⚠ Siswa ${username}: ${e.message}`);
      }
    }

    console.log(`   ✓ Insert baru  : ${siswaInsert}`);
    console.log(`   ✓ Update ada   : ${siswaUpdate}`);
    console.log(`   - Skip (no id) : ${siswaSkip}`);
    console.log(`   ✗ Error        : ${siswaError}`);
    console.log('');

    // ── Import Guru ──────────────────────────────────────────
    console.log('👨‍🏫 Memproses guru...');
    const { rows: guruList } = await q(`
      SELECT sdms_id, nama, nip, niy, email
      FROM sdms_guru
      WHERE is_active = true
      ORDER BY nama
    `);

    let guruInsert = 0, guruUpdate = 0, guruSkip = 0, guruError = 0;

    for (const g of guruList) {
      // Username: nip > niy > email prefix > nama lowercase tanpa spasi
      let username = (g.nip || g.niy || '').trim().replace(/\s+/g, '');
      if (!username && g.email) username = g.email.split('@')[0].trim();
      if (!username) username = (g.nama || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
      if (!username) { guruSkip++; continue; }

      const fullName  = (g.nama || '').trim();
      const plainPass = (g.nip || g.niy || username).trim().replace(/\s+/g, '');

      try {
        if (!DRY_RUN) {
          const hash = await bcrypt.hash(plainPass, 10);
          const { rows } = await q(`
            INSERT INTO users (username, full_name, role, password_hash, plain_password, is_active)
            VALUES ($1, $2, 'TEACHER', $3, $4, true)
            ON CONFLICT (username) DO UPDATE SET
              full_name  = EXCLUDED.full_name,
              is_active  = true,
              updated_at = NOW()
            RETURNING (xmax = 0) AS is_new
          `, [username, fullName, hash, plainPass]);

          if (rows[0]?.is_new) guruInsert++;
          else guruUpdate++;
        } else {
          const { rows } = await q(
            'SELECT id FROM users WHERE username=$1', [username]
          );
          if (rows.length === 0) guruInsert++;
          else guruUpdate++;
        }
      } catch (e) {
        guruError++;
        if (guruError <= 3) console.warn(`   ⚠ Guru ${username}: ${e.message}`);
      }
    }

    console.log(`   ✓ Insert baru  : ${guruInsert}`);
    console.log(`   ✓ Update ada   : ${guruUpdate}`);
    console.log(`   - Skip (no id) : ${guruSkip}`);
    console.log(`   ✗ Error        : ${guruError}`);
    console.log('');

    // ── Statistik akhir ──────────────────────────────────────
    if (!DRY_RUN) {
      const { rows: [after] } = await q(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE role='STUDENT') AS siswa,
          (SELECT COUNT(*) FROM users WHERE role='TEACHER') AS guru
      `);
      console.log('📊 Status setelah import:');
      console.log(`   users STUDENT : ${after.siswa}`);
      console.log(`   users TEACHER : ${after.guru}`);
      console.log('');
      console.log('✅ Import selesai!');
      console.log('');
      console.log('🔑 Info login:');
      console.log('   Siswa  → username: NISN, password: NISN');
      console.log('   Guru   → username: NIP,  password: NIP');
    } else {
      console.log(`🔍 Dry run selesai. Akan insert ${siswaInsert} siswa + ${guruInsert} guru.`);
      console.log('   Jalankan tanpa --dry-run untuk menyimpan.');
    }

  } finally {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
