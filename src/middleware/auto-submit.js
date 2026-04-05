// Middleware untuk auto-submit attempt yang expired
const pool = require('../db/pool');
const { finalizeAttemptWithBackup } = require('../utils/submission-utils');

// Legacy function for backward compatibility
async function finalizeAttempt(pool, attemptId) {
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
  
  return { score, correct_count, wrong_count, total_points };
}

// Middleware untuk auto-submit attempt yang expired
async function autoSubmitMiddleware(req, res, next) {
  // Hanya jalankan untuk route student yang terkait ujian
  if (!req.path.includes('/student/') || !req.session.user) {
    return next();
  }

  try {
    // Cek attempt user yang expired
    const [expiredAttempts] = await pool.query(`
      SELECT 
        a.id,
        a.student_id,
        a.exam_id,
        a.started_at,
        e.duration_minutes,
        e.end_at as exam_end_time,
        TIMESTAMPDIFF(MINUTE, a.started_at, NOW()) as minutes_elapsed
      FROM attempts a
      JOIN exams e ON e.id = a.exam_id
      WHERE a.status = 'IN_PROGRESS'
      AND a.student_id = :student_id
      AND (
        -- Melewati durasi ujian
        TIMESTAMPDIFF(MINUTE, a.started_at, NOW()) > e.duration_minutes
        OR
        -- Melewati waktu akhir ujian (jika ada)
        (e.end_at IS NOT NULL AND NOW() > e.end_at)
      )
    `, { student_id: req.session.user.id });

    // Auto-submit attempt yang expired
    for (const attempt of expiredAttempts) {
      try {
        // Use the new backup system for auto-submit
        await finalizeAttemptWithBackup(attempt.id, attempt.student_id, attempt.exam_id);
        console.log(`[AUTO-SUBMIT] Attempt ${attempt.id} auto-submitted with backup for user ${req.session.user.id}`);
        
        // Set flash message untuk memberitahu user
        if (!req.flash) req.flash = () => {};
        req.flash('info', `Ujian Anda telah otomatis dikumpulkan karena waktu habis.`);
        
      } catch (error) {
        console.error(`[AUTO-SUBMIT] Error finalizing attempt ${attempt.id}:`, error.message);
        
        // Mark as failed for recovery
        try {
          await pool.query(
            `UPDATE attempts SET submission_status = 'FAILED' WHERE id = :aid`,
            { aid: attempt.id }
          );
        } catch (updateError) {
          console.error(`[AUTO-SUBMIT] Error marking attempt ${attempt.id} as failed:`, updateError.message);
        }
      }
    }

  } catch (error) {
    console.error('[AUTO-SUBMIT] Middleware error:', error.message);
  }

  next();
}

// Fungsi untuk auto-submit semua attempt yang expired (untuk cron job)
async function autoSubmitAllExpired() {
  try {
    const [expiredAttempts] = await pool.query(`
      SELECT 
        a.id,
        a.student_id,
        a.exam_id,
        a.started_at,
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

    let processedCount = 0;
    
    for (const attempt of expiredAttempts) {
      try {
        // Use the new backup system for auto-submit
        await finalizeAttemptWithBackup(attempt.id, attempt.student_id, attempt.exam_id);
        console.log(`[AUTO-SUBMIT] ${attempt.student_name} - ${attempt.exam_title} (ID: ${attempt.id}) auto-submitted with backup`);
        processedCount++;
      } catch (error) {
        console.error(`[AUTO-SUBMIT] Error processing attempt ${attempt.id}:`, error.message);
        
        // Mark as failed for recovery
        try {
          await pool.query(
            `UPDATE attempts SET submission_status = 'FAILED' WHERE id = :aid`,
            { aid: attempt.id }
          );
        } catch (updateError) {
          console.error(`[AUTO-SUBMIT] Error marking attempt ${attempt.id} as failed:`, updateError.message);
        }
      }
    }

    if (processedCount > 0) {
      console.log(`[AUTO-SUBMIT] Successfully processed ${processedCount} expired attempts`);
    }

    return { processed: processedCount, total: expiredAttempts.length };

  } catch (error) {
    console.error('[AUTO-SUBMIT] Error in autoSubmitAllExpired:', error.message);
    throw error;
  }
}

module.exports = {
  autoSubmitMiddleware,
  autoSubmitAllExpired,
  finalizeAttempt
};