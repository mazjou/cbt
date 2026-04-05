// Script untuk auto-submit attempt yang sudah expired
// Jalankan: node auto-submit-expired-attempts.js

require('dotenv').config();
const mysql = require('mysql2/promise');

// Fungsi untuk finalisasi attempt (sama seperti di student.js)
async function finalizeAttempt(pool, attemptId) {
  console.log(`🔄 Finalizing attempt ${attemptId}...`);
  
  const [[sum]] = await pool.query(
    `SELECT
        SUM(q.points) AS total_points,
        SUM(CASE WHEN aa.is_correct=1 THEN q.points ELSE 0 END) AS score_points,
        SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,
        SUM(CASE WHEN aa.option_id IS NOT NULL AND aa.is_correct=0 THEN 1 ELSE 0 END) AS wrong_count
     FROM attempt_answers aa
     JOIN questions q ON q.id=aa.question_id
     WHERE aa.attempt_id=:aid;`,
    { aid: attemptId }
  );
  
  const total_points = Number(sum.total_points || 0);
  const score_points = Number(sum.score_points || 0);
  const correct_count = Number(sum.correct_count || 0);
  const wrong_count = Number(sum.wrong_count || 0);
  const score = total_points > 0 ? Math.round((score_points / total_points) * 100) : 0;

  await pool.query(
    `UPDATE attempts
     SET finished_at=NOW(), status='SUBMITTED', score=:score, total_points=:total_points, correct_count=:correct_count, wrong_count=:wrong_count
     WHERE id=:aid;`,
    { score, total_points, correct_count, wrong_count, aid: attemptId }
  );
  
  console.log(`✅ Attempt ${attemptId} finalized with score: ${score}`);
  return { score, correct_count, wrong_count, total_points };
}

async function autoSubmitExpiredAttempts() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true
  });

  try {
    console.log('🔍 Mencari attempt yang sudah expired...\n');

    // Cari attempt yang sudah melewati batas waktu
    const [expiredAttempts] = await pool.query(`
      SELECT 
        a.id,
        a.student_id,
        a.exam_id,
        a.started_at,
        a.status,
        u.full_name as student_name,
        e.title as exam_title,
        e.duration_minutes,
        e.end_at as exam_end_time,
        TIMESTAMPDIFF(MINUTE, a.started_at, NOW()) as minutes_elapsed
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      WHERE a.status = 'IN_PROGRESS'
      AND (
        -- Melewati durasi ujian
        TIMESTAMPDIFF(MINUTE, a.started_at, NOW()) > e.duration_minutes
        OR
        -- Melewati waktu akhir ujian (jika ada)
        (e.end_at IS NOT NULL AND NOW() > e.end_at)
      )
      ORDER BY a.started_at ASC
    `);

    console.log(`📊 Ditemukan ${expiredAttempts.length} attempt yang expired:\n`);

    if (expiredAttempts.length === 0) {
      console.log('✅ Tidak ada attempt yang perlu di-auto submit.');
      return;
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const attempt of expiredAttempts) {
      try {
        console.log(`\n${processedCount + 1}. Processing Attempt ID: ${attempt.id}`);
        console.log(`   Siswa: ${attempt.student_name}`);
        console.log(`   Ujian: ${attempt.exam_title}`);
        console.log(`   Mulai: ${new Date(attempt.started_at).toLocaleString('id-ID')}`);
        console.log(`   Durasi: ${attempt.duration_minutes} menit`);
        console.log(`   Sudah berjalan: ${attempt.minutes_elapsed} menit`);
        
        // Cek berapa soal yang sudah dijawab
        const [answerStats] = await pool.query(`
          SELECT 
            COUNT(*) as total_answered,
            COUNT(CASE WHEN is_correct = 1 THEN 1 END) as correct_answers
          FROM attempt_answers 
          WHERE attempt_id = :attempt_id AND option_id IS NOT NULL
        `, { attempt_id: attempt.id });

        const stats = answerStats[0];
        console.log(`   Soal dijawab: ${stats.total_answered} (${stats.correct_answers} benar)`);

        // Finalisasi attempt
        const result = await finalizeAttempt(pool, attempt.id);
        
        console.log(`   ✅ AUTO-SUBMITTED dengan nilai: ${result.score}`);
        processedCount++;
        
      } catch (error) {
        console.error(`   ❌ Error processing attempt ${attempt.id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 RINGKASAN:');
    console.log('─────────────────────────────────────');
    console.log(`✅ Berhasil diproses: ${processedCount} attempt`);
    console.log(`❌ Error: ${errorCount} attempt`);
    console.log(`📊 Total ditemukan: ${expiredAttempts.length} attempt`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

// Jalankan script
if (require.main === module) {
  autoSubmitExpiredAttempts();
}

module.exports = { autoSubmitExpiredAttempts, finalizeAttempt };