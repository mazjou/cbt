const pool = require('../db/pool');

// Retry helper function
async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Check if it's a lock timeout error
      if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
        console.log(`⏳ Lock timeout, retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function createSubmissionBackup(attemptId, studentId, examId, connection = null) {
  const useConnection = connection || pool;
  
  // Get all answers for this attempt
  const [answers] = await useConnection.query(
    `SELECT aa.question_id, aa.option_id, aa.is_correct, aa.answered_at,
            q.question_text, q.points, o.option_text
     FROM attempt_answers aa
     JOIN questions q ON q.id = aa.question_id
     LEFT JOIN options o ON o.id = aa.option_id
     WHERE aa.attempt_id = :aid`,
    { aid: attemptId }
  );

  const backupData = {
    attempt_id: attemptId,
    student_id: studentId,
    exam_id: examId,
    answers: answers,
    backup_timestamp: new Date().toISOString()
  };

  // Use INSERT ... ON DUPLICATE KEY UPDATE to avoid duplicate key errors
  await useConnection.query(
    `INSERT INTO submission_backups (attempt_id, student_id, exam_id, backup_data, status)
     VALUES (:aid, :sid, :eid, :data, 'ACTIVE')
     ON CONFLICT (attempt_id) DO UPDATE SET 
       backup_data = EXCLUDED.backup_data,
       created_at = CURRENT_TIMESTAMP,
       status = 'ACTIVE'`,
    { 
      aid: attemptId, 
      sid: studentId, 
      eid: examId, 
      data: JSON.stringify(backupData) 
    }
  );
}

async function finalizeAttemptWithBackup(attemptId, studentId, examId) {
  return await retryOperation(async () => {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Step 1: Update status to SUBMITTING with lock
      await connection.query(
        `UPDATE attempts SET submission_status = 'SUBMITTING' WHERE id = :aid`,
        { aid: attemptId }
      );
      
      // Step 2: Create backup before processing (use same connection)
      await createSubmissionBackup(attemptId, studentId, examId, connection);
      
      // Step 3: Calculate scores (same logic as original finalizeAttempt)
      const [[sum]] = await connection.query(
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

      // Step 4: Update attempt with final results
      await connection.query(
        `UPDATE attempts
         SET finished_at=NOW(), status='SUBMITTED', submission_status='SUBMITTED',
             score=:score, total_points=:total_points, correct_count=:correct_count, wrong_count=:wrong_count
         WHERE id=:aid;`,
        { score, total_points, correct_count, wrong_count, aid: attemptId }
      );
      
      await connection.commit();
      console.log(`✅ Attempt ${attemptId} successfully submitted with backup`);
      
    } catch (error) {
      await connection.rollback();
      console.error(`❌ Failed to finalize attempt ${attemptId}:`, error.message);
      throw error;
    } finally {
      connection.release();
    }
  }, 3, 2000); // 3 retries with 2 second base delay
}

module.exports = {
  createSubmissionBackup,
  finalizeAttemptWithBackup,
  retryOperation
};