// Script untuk menambahkan kolom display options ke tabel exams
// Jalankan: node run-exam-display-update.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function addExamDisplayOptions() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('🔄 Adding display options to exams table...\n');

    // Cek apakah kolom sudah ada
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'exams' 
      AND COLUMN_NAME IN ('show_score_to_student', 'show_review_to_student')
    `, [process.env.DB_NAME]);

    if (columns.length > 0) {
      console.log('⚠️  Kolom display options sudah ada:');
      columns.forEach(col => console.log(`   - ${col.COLUMN_NAME}`));
    } else {
      // Tambah kolom baru
      await pool.query(`
        ALTER TABLE exams 
        ADD COLUMN show_score_to_student TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Tampilkan nilai ke siswa (1=ya, 0=tidak)',
        ADD COLUMN show_review_to_student TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Tampilkan pembahasan/jawaban benar ke siswa (1=ya, 0=tidak)'
      `);
      
      console.log('✅ Kolom display options berhasil ditambahkan!');
    }

    // Update existing exams dengan default values
    const [updateResult] = await pool.query(`
      UPDATE exams SET 
        show_score_to_student = 1,
        show_review_to_student = 0
      WHERE show_score_to_student IS NULL OR show_review_to_student IS NULL
    `);

    console.log(`✅ Updated ${updateResult.affectedRows} existing exams with default values\n`);

    // Tampilkan sample data
    const [exams] = await pool.query(`
      SELECT 
        id, 
        title, 
        show_score_to_student, 
        show_review_to_student,
        created_at
      FROM exams 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    console.log('📊 Sample exams with new display options:');
    console.log('─'.repeat(80));
    exams.forEach(exam => {
      console.log(`ID: ${exam.id} | ${exam.title}`);
      console.log(`   Show Score: ${exam.show_score_to_student ? 'YES' : 'NO'} | Show Review: ${exam.show_review_to_student ? 'YES' : 'NO'}`);
      console.log('');
    });

    console.log('🎯 Default Settings:');
    console.log('   - show_score_to_student = 1 (Tampilkan nilai ke siswa)');
    console.log('   - show_review_to_student = 0 (Jangan tampilkan pembahasan)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addExamDisplayOptions();