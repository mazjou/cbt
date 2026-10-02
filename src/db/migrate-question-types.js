/**
 * Migration: Tambah tipe soal COMPLEX dan TRUE_FALSE
 * Jalankan: node src/db/migrate-question-types.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require('./pool');

async function migrate() {
  console.log('🔄 Migrasi tipe soal TKA...');

  // 1. Tambah COMPLEX, TRUE_FALSE ke ENUM question_type di tabel questions
  await pool.query(`
    ALTER TABLE questions
    DROP COLUMN IF EXISTS question_type
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE questions
    ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ'
  `);
  console.log('✅ questions.question_type OK');

  // 2. Tambah question_type ke question_bank
  await pool.query(`
    ALTER TABLE question_bank
    ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'MCQ'
  `);
  console.log('✅ question_bank.question_type OK');

  // 3. Tambah selected_option_ids dan partial_points ke attempt_answers
  //    selected_option_ids: JSON array option IDs yang dipilih untuk COMPLEX
  //    partial_points: poin parsial yang diperoleh untuk soal COMPLEX
  await pool.query(`
    ALTER TABLE attempt_answers
    ADD COLUMN IF NOT EXISTS selected_option_ids TEXT NULL
  `);
  await pool.query(`
    ALTER TABLE attempt_answers
    ADD COLUMN IF NOT EXISTS partial_points DECIMAL(6,2) NULL
  `);
  console.log('✅ attempt_answers.selected_option_ids dan partial_points OK');

  console.log('🎉 Migrasi selesai!');
  process.exit(0);
}

migrate().catch(e => {
  console.error('❌ Migrasi gagal:', e.message);
  process.exit(1);
});
