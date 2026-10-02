/**
 * Migration: Tambah tipe soal COMPLEX dan TRUE_FALSE
 * Jalankan: node src/db/migrate-question-types.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function migrate() {
  console.log('🔄 Migrasi tipe soal TKA...\n');

  // 1. Ubah question_type di tabel questions dari ENUM ke VARCHAR
  //    agar bisa menerima COMPLEX dan TRUE_FALSE
  try {
    await pool.query(`ALTER TABLE questions ALTER COLUMN question_type TYPE VARCHAR(20)`);
    console.log('✅ questions.question_type diubah ke VARCHAR(20)');
  } catch(e) {
    if (e.message.includes('already exists') || e.message.includes('does not exist')) {
      console.log('ℹ️  questions.question_type sudah VARCHAR, skip');
    } else {
      console.log('⚠️  questions.question_type:', e.message);
    }
  }

  // Set default untuk yang NULL
  await pool.query(`UPDATE questions SET question_type = 'MCQ' WHERE question_type IS NULL OR question_type = ''`).catch(() => {});

  // 2. Tambah question_type ke question_bank jika belum ada
  try {
    await pool.query(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ'`);
    console.log('✅ question_bank.question_type OK');
  } catch(e) {
    console.log('⚠️  question_bank.question_type:', e.message);
  }

  // 3. Ubah question_bank.question_type dari ENUM ke VARCHAR jika perlu
  try {
    await pool.query(`ALTER TABLE question_bank ALTER COLUMN question_type TYPE VARCHAR(20)`);
    console.log('✅ question_bank.question_type diubah ke VARCHAR(20)');
  } catch(e) {
    console.log('ℹ️  question_bank.question_type:', e.message.substring(0, 60));
  }

  // 4. Tambah selected_option_ids ke attempt_answers
  try {
    await pool.query(`ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS selected_option_ids TEXT NULL`);
    console.log('✅ attempt_answers.selected_option_ids OK');
  } catch(e) {
    console.log('⚠️  selected_option_ids:', e.message);
  }

  // 5. Tambah partial_points ke attempt_answers
  try {
    await pool.query(`ALTER TABLE attempt_answers ADD COLUMN IF NOT EXISTS partial_points DECIMAL(6,2) NULL`);
    console.log('✅ attempt_answers.partial_points OK');
  } catch(e) {
    console.log('⚠️  partial_points:', e.message);
  }

  // Verifikasi hasil
  const [cols] = await pool.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name IN ('questions','question_bank','attempt_answers')
      AND column_name IN ('question_type','selected_option_ids','partial_points')
    ORDER BY table_name, column_name
  `);
  console.log('\n📋 Hasil verifikasi:');
  cols.forEach(c => console.log(`  ${c.table_name || 'unknown'}.${c.column_name}: ${c.data_type} (${c.udt_name})`));

  console.log('\n🎉 Migrasi selesai!');
  process.exit(0);
}

migrate().catch(e => {
  console.error('❌ Migrasi gagal:', e.message);
  process.exit(1);
});
