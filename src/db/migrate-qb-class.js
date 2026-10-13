/**
 * Migration: Tambah kolom class_level ke question_bank
 * Nilai: 'X', 'XI', 'XII', atau NULL (semua tingkat)
 * Jalankan: node src/db/migrate-qb-class.js
 */
const pool = require('./pool');

async function run() {
  console.log('🔄 Migrasi question_bank.class_level...\n');
  try {
    await pool.query(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS class_level VARCHAR(10) NULL`);
    console.log('✅ Kolom class_level berhasil ditambahkan ke question_bank');
  } catch (e) {
    console.log('⚠️  class_level:', e.message);
  }
  console.log('\n✅ Migrasi selesai.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
