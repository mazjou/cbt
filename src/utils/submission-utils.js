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

      // Step 2: Create backup before processing
      await createSubmissionBackup(attemptId, studentId, examId, connection);

      // Step 3: Ambil semua jawaban + tipe soal + opsi benar
      const [answers] = await connection.query(
        `SELECT aa.question_id, aa.option_id, aa.selected_option_ids, aa.is_correct,
                q.points, q.question_type
         FROM attempt_answers aa
         JOIN questions q ON q.id = aa.question_id
         WHERE aa.attempt_id = :aid`,
        { aid: attemptId }
      );

      // Ambil semua opsi yang benar per soal (untuk kalkulasi COMPLEX)
      const qids = [...new Set(answers.map(a => a.question_id))];
      let correctOptionsMap = {}; // { question_id: [{ option_id, is_correct }, ...] }
      if (qids.length > 0) {
        const ph = qids.map((_, i) => `$${i + 1}`).join(',');
        const [correctOpts] = await connection.query(
          `SELECT question_id, id AS option_id, is_correct FROM options WHERE question_id IN (${ph})`,
          qids
        );
        for (const o of correctOpts) {
          if (!correctOptionsMap[o.question_id]) correctOptionsMap[o.question_id] = [];
          correctOptionsMap[o.question_id].push({ option_id: Number(o.option_id), is_correct: !!o.is_correct });
        }
      }

      // Step 4: Hitung skor dengan poin parsial untuk COMPLEX / MULTI_TF
      let total_points  = 0;
      let score_points  = 0;
      let correct_count = 0;
      let wrong_count   = 0;

      for (const aa of answers) {
        const qpoints = Number(aa.points || 0);
        total_points += qpoints;
        const qtype = aa.question_type || 'MCQ';
        // allOpts: [{ option_id, is_correct }, ...]
        const allOpts = correctOptionsMap[aa.question_id] || [];

        if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
          // Derive correctIds from new object shape
          const correctIds = allOpts.filter(o => o.is_correct).map(o => o.option_id);

          // Poin parsial proporsional tanpa penalti: floor(benar_dipilih / total_benar * poin)
          let selectedIds = [];
          try {
            selectedIds = aa.selected_option_ids
              ? JSON.parse(aa.selected_option_ids).map(Number)
              : (aa.option_id ? [Number(aa.option_id)] : []);
          } catch(_) {
            selectedIds = aa.option_id ? [Number(aa.option_id)] : [];
          }

          const totalCorrect = correctIds.length;
          if (totalCorrect > 0 && selectedIds.length > 0) {
            // Hitung benar yang dipilih (intersection) — tanpa penalti
            const correctSelected = selectedIds.filter(id => correctIds.includes(id)).length;
            // Formula proporsional tanpa penalti
            const partial = Math.floor((correctSelected / totalCorrect) * qpoints);
            score_points += partial;

            // Update partial_points di DB untuk referensi
            await connection.query(
              `UPDATE attempt_answers SET partial_points = :pp, is_correct = :isc
               WHERE attempt_id = :aid AND question_id = :qid`,
              {
                pp: partial,
                isc: correctSelected === totalCorrect && selectedIds.every(id => correctIds.includes(id)) ? 1 : 0,
                aid: attemptId,
                qid: aa.question_id
              }
            );
            if (partial > 0) correct_count++;
            else if (selectedIds.length > 0) wrong_count++;
          } else if (selectedIds.length > 0) {
            wrong_count++;
          }

        } else if (qtype === 'MULTI_TF') {
          const N = allOpts.length;

          let selectedIds = [];
          try {
            selectedIds = aa.selected_option_ids
              ? JSON.parse(aa.selected_option_ids).map(Number)
              : [];
          } catch(_) { selectedIds = []; }

          if (N > 0) {
            // Benar jika: student bilang Benar (id ada di selectedIds) DAN is_correct === true
            //          ATAU student tidak bilang Benar (id tidak ada) DAN is_correct === false
            let correctAnswered = 0;
            for (const opt of allOpts) {
              const studentSaidBenar = selectedIds.includes(opt.option_id);
              if (studentSaidBenar === opt.is_correct) correctAnswered++;
            }
            const partial = Math.floor((correctAnswered / N) * qpoints);
            score_points += partial;
            await connection.query(
              `UPDATE attempt_answers SET partial_points = :pp, is_correct = :isc
               WHERE attempt_id = :aid AND question_id = :qid`,
              {
                pp: partial,
                isc: correctAnswered === N ? 1 : 0,
                aid: attemptId,
                qid: aa.question_id
              }
            );
            if (correctAnswered === N) correct_count++;
            else if (selectedIds.length > 0) wrong_count++;
            // Tidak tambah wrong_count saat belum menjawab (no penalty, AC-6)
          }

        } else {
          // MCQ / TRUE_FALSE: all-or-nothing
          // Gunakan aa.is_correct langsung — tidak terpengaruh perubahan query
          const isCorrect = Number(aa.is_correct || 0) === 1;
          if (isCorrect) {
            score_points += qpoints;
            correct_count++;
          } else if (aa.option_id) {
            wrong_count++;
          }
        }
      }

      const score = total_points > 0 ? Math.round((score_points / total_points) * 100) : 0;

      // Step 5: Update attempt dengan hasil akhir
      await connection.query(
        `UPDATE attempts
         SET finished_at=NOW(), status='SUBMITTED', submission_status='SUBMITTED',
             score=:score, total_points=:total_points, correct_count=:correct_count, wrong_count=:wrong_count
         WHERE id=:aid;`,
        { score, total_points, correct_count, wrong_count, aid: attemptId }
      );

      await connection.commit();
      console.log(`✅ Attempt ${attemptId} submitted | score=${score} (${score_points}/${total_points}pts) correct=${correct_count} wrong=${wrong_count}`);

    } catch (error) {
      await connection.rollback();
      console.error(`❌ Failed to finalize attempt ${attemptId}:`, error.message);
      throw error;
    } finally {
      connection.release();
    }
  }, 3, 2000);
}

module.exports = {
  createSubmissionBackup,
  finalizeAttemptWithBackup,
  retryOperation
};