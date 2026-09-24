'use strict';
/**
 * Sync Kelas & Mapel dari SDMS ke LMS
 * =====================================
 * 1. Sync sdms_kelas → tabel classes LMS
 * 2. Sync sdms_mapel → tabel subjects LMS
 * 3. Update class_id di tabel users (siswa) berdasarkan nama kelas
 *
 * Cara pakai:
 *   node src/db/sync-kelas-mapel.js
 *   node src/db/sync-kelas-mapel.js --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.resolve('/cbt/.env') });
const pool = require('./pool');

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY RUN — tidak ada yang disimpan\n');

// Pool LMS: result[0] = rows (mysql2-like wrapper di pg)
const q = async (sql, params = []) => {
  const r = await pool.query(sql, params);
  return r.rows || (Array.isArray(r) ? r[0] : []);
};

// Buat kode kelas dari nama: "XI KULINER 2" → "XI-KULINER-2"
function makeCode(nama) {
  return (nama || '').trim().toUpperCase().replace(/\s+/g, '-');
}

async function syncKelas() {
  console.log('🏫 Sync Kelas...');
  const kelasList = await q('SELECT sdms_id, nama FROM sdms_kelas WHERE is_active=true ORDER BY nama');
  console.log(`   Total kelas SDMS: ${kelasList.length}`);

  let inserted = 0, updated = 0, errors = 0;

  for (const k of kelasList) {
    const code = makeCode(k.nama);
    const name = (k.nama || '').trim();
    try {
      if (!DRY_RUN) {
        const existing = await q('SELECT id FROM classes WHERE code=$1', [code]);
        if (existing.length === 0) {
          await q('INSERT INTO classes (code, name) VALUES ($1, $2)', [code, name]);
          inserted++;
        } else {
          await q('UPDATE classes SET name=$1 WHERE code=$2', [name, code]);
          updated++;
        }
      } else {
        const existing = await q('SELECT id FROM classes WHERE code=$1', [code]);
        if (existing.length === 0) inserted++;
        else updated++;
      }
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn(`   ⚠ Kelas ${name}: ${e.message}`);
    }
  }

  console.log(`   ✓ Insert baru : ${inserted}`);
  console.log(`   ✓ Update ada  : ${updated}`);
  console.log(`   ✗ Error       : ${errors}`);
  console.log('');
  return kelasList.length;
}

async function syncMapel() {
  console.log('📚 Sync Mata Pelajaran...');
  const mapelList = await q('SELECT sdms_id, kode, nama FROM sdms_mapel WHERE is_active=true ORDER BY nama');
  console.log(`   Total mapel SDMS: ${mapelList.length}`);

  if (mapelList.length === 0) {
    console.log('   ⚠ Tidak ada data mapel — pastikan sudah sync dari SDMS dulu');
    console.log('');
    return 0;
  }

  let inserted = 0, updated = 0, errors = 0;

  for (const m of mapelList) {
    const code = (m.kode || makeCode(m.nama)).trim().toUpperCase();
    const name = (m.nama || '').trim();
    try {
      if (!DRY_RUN) {
        const existing = await q('SELECT id FROM subjects WHERE code=$1', [code]);
        if (existing.length === 0) {
          await q('INSERT INTO subjects (code, name) VALUES ($1, $2)', [code, name]);
          inserted++;
        } else {
          await q('UPDATE subjects SET name=$1 WHERE code=$2', [name, code]);
          updated++;
        }
      } else {
        const existing = await q('SELECT id FROM subjects WHERE code=$1', [code]);
        if (existing.length === 0) inserted++;
        else updated++;
      }
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn(`   ⚠ Mapel ${name}: ${e.message}`);
    }
  }

  console.log(`   ✓ Insert baru : ${inserted}`);
  console.log(`   ✓ Update ada  : ${updated}`);
  console.log(`   ✗ Error       : ${errors}`);
  console.log('');
  return mapelList.length;
}

async function updateSiswaKelas() {
  console.log('🔗 Update kelas siswa...');

  // Ambil semua siswa dari sdms_siswa beserta nama kelasnya
  const siswaList = await q(`
    SELECT u.id AS user_id, u.username, sk.nama AS kelas_nama
    FROM users u
    JOIN sdms_siswa ss ON ss.nisn = u.username OR ss.nis = u.username
    JOIN sdms_kelas sk ON sk.sdms_id = ss.kelas_id
    WHERE u.role = 'STUDENT' AND ss.kelas_id IS NOT NULL AND ss.is_active = true
  `);

  console.log(`   Siswa dengan data kelas: ${siswaList.length}`);

  let updated = 0, notFound = 0, errors = 0;

  for (const s of siswaList) {
    const code = makeCode(s.kelas_nama);
    try {
      const cls = await q('SELECT id FROM classes WHERE code=$1', [code]);
      if (cls.length === 0) {
        notFound++;
        continue;
      }
      if (!DRY_RUN) {
        await q('UPDATE users SET class_id=$1 WHERE id=$2', [cls[0].id, s.user_id]);
      }
      updated++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn(`   ⚠ Siswa ${s.username}: ${e.message}`);
    }
  }

  console.log(`   ✓ Siswa diupdate   : ${updated}`);
  console.log(`   - Kelas tidak ada  : ${notFound}`);
  console.log(`   ✗ Error            : ${errors}`);
  console.log('');

  // Cek siswa yang kelas_id masih null
  const nullKelas = await q("SELECT COUNT(*) AS c FROM users WHERE role='STUDENT' AND class_id IS NULL");
  console.log(`   Siswa tanpa kelas : ${nullKelas[0]?.c || 0}`);
  console.log('');
}

async function main() {
  console.log('=== Sync Kelas & Mapel SDMS → LMS ===\n');

  // Statistik awal
  const before = await q(`
    SELECT
      (SELECT COUNT(*) FROM classes)  AS kelas_lms,
      (SELECT COUNT(*) FROM subjects) AS mapel_lms,
      (SELECT COUNT(*) FROM users WHERE role='STUDENT' AND class_id IS NOT NULL) AS siswa_berkelas,
      (SELECT COUNT(*) FROM users WHERE role='STUDENT') AS total_siswa
  `);
  console.log('📊 Sebelum sync:');
  console.log(`   classes LMS  : ${before[0]?.kelas_lms}`);
  console.log(`   subjects LMS : ${before[0]?.mapel_lms}`);
  console.log(`   Siswa berkelas: ${before[0]?.siswa_berkelas} / ${before[0]?.total_siswa}`);
  console.log('');

  await syncKelas();
  await syncMapel();
  await updateSiswaKelas();

  if (!DRY_RUN) {
    const after = await q(`
      SELECT
        (SELECT COUNT(*) FROM classes)  AS kelas_lms,
        (SELECT COUNT(*) FROM subjects) AS mapel_lms,
        (SELECT COUNT(*) FROM users WHERE role='STUDENT' AND class_id IS NOT NULL) AS siswa_berkelas,
        (SELECT COUNT(*) FROM users WHERE role='STUDENT') AS total_siswa
    `);
    console.log('📊 Setelah sync:');
    console.log(`   classes LMS  : ${after[0]?.kelas_lms}`);
    console.log(`   subjects LMS : ${after[0]?.mapel_lms}`);
    console.log(`   Siswa berkelas: ${after[0]?.siswa_berkelas} / ${after[0]?.total_siswa}`);
    console.log('');
    console.log('✅ Selesai!');
  } else {
    console.log('🔍 Dry run selesai. Jalankan tanpa --dry-run untuk menyimpan.');
  }

  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
