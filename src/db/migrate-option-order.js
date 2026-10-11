/**
 * Migration: Tambah kolom option_order ke attempt_answers
 * Menyimpan urutan opsi acak per-soal per-attempt agar konsisten saat refresh.
 * Jalankan: node src/db/migrate-option-order.js
 */
const pool = require('./pool');

async function run() {
  console.log('🔄 Migrasi attempt_answers.option_order...\n');
  try {
    await pool.query(`ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS option_order TEXT NULL`);
    console.log('✅ Kolom option_order berhasil ditambahkan ke attempt_answers');
  } catch (e) {
    console.log('⚠️  option_order:', e.message);
  }
  console.log('\n✅ Migrasi selesai.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
