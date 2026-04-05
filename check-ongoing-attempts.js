// Script untuk cek attempt yang sedang berlangsung
// Jalankan: node check-ongoing-attempts.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkOngoingAttempts() {
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
    console.log('🔍 Mengecek attempt yang sedang berlangsung...\n');

    // Cek attempt dengan status IN_PROGRESS
    const [attempts] = await pool.query(`
      SELECT 
        a.id,
        a.student_id,
        a.exam_id,
        a.status,
        a.score,
        a.started_at,
        a.finished_at,
        a.created_at,
        u.full_name as student_name,
        u.username,
        e.title as exam_title,
        e.start_at as exam_start,
        e.end_at as exam_end,
        e.duration_minutes,
        c.name as class_name
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE a.status = 'IN_PROGRESS'
      ORDER BY a.started_at DESC
    `);

    console.log(`📊 Ditemukan ${attempts.length} attempt yang sedang berlangsung:\n`);

    if (attempts.length === 0) {
      console.log('✅ Tidak ada attempt yang sedang berlangsung.');
      return;
    }

    attempts.forEach((attempt, index) => {
      console.log(`${index + 1}. ATTEMPT ID: ${attempt.id}`);
      console.log(`   Siswa: ${attempt.student_name} (${attempt.username})`);
      console.log(`   Kelas: ${attempt.class_name || 'Tidak ada kelas'}`);
      console.log(`   Ujian: ${attempt.exam_title}`);
      console.log(`   Status: ${attempt.status}`);
      console.log(`   Mulai mengerjakan: ${new Date(attempt.started_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      console.log(`   Dibuat: ${new Date(attempt.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      
      if (attempt.exam_start) {
        console.log(`   Jadwal ujian mulai: ${new Date(attempt.exam_start).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      }
      if (attempt.exam_end) {
        console.log(`   Jadwal ujian selesai: ${new Date(attempt.exam_end).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
      }
      
      // Hitung durasi sudah mengerjakan
      const now = new Date();
      const startTime = new Date(attempt.started_at);
      const durationMs = now - startTime;
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      const durationHours = Math.floor(durationMinutes / 60);
      const remainingMinutes = durationMinutes % 60;
      
      console.log(`   Sudah mengerjakan: ${durationHours} jam ${remainingMinutes} menit`);
      console.log(`   Durasi ujian: ${attempt.duration_minutes} menit`);
      
      // Cek apakah sudah melebihi durasi
      if (durationMinutes > attempt.duration_minutes) {
        console.log(`   ⚠️  MELEBIHI DURASI! (${durationMinutes - attempt.duration_minutes} menit lebih)`);
      }
      
      console.log('   ─────────────────────────────────────\n');
    });

    // Cek jawaban yang sudah diisi
    console.log('📝 Mengecek jawaban yang sudah diisi...\n');
    
    for (const attempt of attempts) {
      const [answers] = await pool.query(`
        SELECT 
          COUNT(*) as total_answered,
          COUNT(CASE WHEN is_correct = 1 THEN 1 END) as correct_answers,
          COUNT(CASE WHEN is_correct = 0 THEN 1 END) as wrong_answers
        FROM attempt_answers 
        WHERE attempt_id = :attempt_id AND option_id IS NOT NULL
      `, { attempt_id: attempt.id });

      const [totalQuestions] = await pool.query(`
        SELECT COUNT(*) as total
        FROM questions 
        WHERE exam_id = :exam_id
      `, { exam_id: attempt.exam_id });

      const answered = answers[0];
      const total = totalQuestions[0].total;
      
      console.log(`Attempt ${attempt.id} (${attempt.student_name}):`);
      console.log(`   Soal dijawab: ${answered.total_answered}/${total}`);
      console.log(`   Benar: ${answered.correct_answers}, Salah: ${answered.wrong_answers}`);
      
      if (answered.total_answered > 0) {
        const currentScore = total > 0 ? Math.round((answered.correct_answers / total) * 100) : 0;
        console.log(`   Nilai sementara: ${currentScore}`);
      }
      console.log('');
    }

    console.log('\n💡 ANALISIS:');
    console.log('─────────────────────────────────────');
    console.log('1. Attempt dengan status IN_PROGRESS akan tetap tersimpan');
    console.log('2. Nilai akan dihitung ketika attempt di-submit (status berubah ke SUBMITTED)');
    console.log('3. Jika siswa tidak submit, attempt akan tetap IN_PROGRESS');
    console.log('4. Guru/admin bisa reset attempt jika diperlukan');
    console.log('');
    console.log('🔧 SOLUSI jika attempt terlalu lama:');
    console.log('1. Siswa bisa melanjutkan dan submit manual');
    console.log('2. Guru bisa reset attempt dari halaman grades');
    console.log('3. Admin bisa update status langsung di database');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkOngoingAttempts();