/**
 * Migration: Tambah kolom option_image ke question_bank_options
 * Jalankan: node src/db/migrate-qb-option-image.js
 */
const pool = require('./pool');

async function run() {
  console.log('🔄 Migrasi question_bank_options.option_image...\n');
  try {
    await pool.query(`ALTER TABLE question_bank_options ADD COLUMN IF NOT EXISTS option_image TEXT NULL`);
    console.log('✅ Kolom option_image berhasil ditambahkan ke question_bank_options');
  } catch (e) {
    console.log('⚠️  option_image:', e.message);
  }
  console.log('\n✅ Migrasi selesai.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
