const pool = require('../db/pool');
const { finalizeAttemptWithBackup } = require('../utils/submission-utils');

// Query expired attempts - PostgreSQL syntax
const EXPIRED_QUERY = `
  SELECT a.id, a.student_id, a.exam_id, a.started_at,
         e.duration_minutes, e.end_at AS exam_end_time,
         FLOOR(EXTRACT(EPOCH FROM (NOW() - a.started_at))/60) AS minutes_elapsed
  FROM attempts a
  JOIN exams e ON e.id = a.exam_id
  WHERE a.status = 'IN_PROGRESS'
  AND (
    FLOOR(EXTRACT(EPOCH FROM (NOW() - a.started_at))/60) > e.duration_minutes
    OR (e.end_at IS NOT NULL AND NOW() > e.end_at)
  )
`;

async function autoSubmitMiddleware(req, res, next) {
  if (!req.path.includes('/student/') || !req.session?.user) return next();
  try {
    const [expired] = await pool.query(
      EXPIRED_QUERY + ' AND a.student_id = :sid',
      { sid: req.session.user.id }
    );
    for (const a of expired) {
      try {
        await finalizeAttemptWithBackup(a.id, a.student_id, a.exam_id);
        if (req.flash) req.flash('info', 'Ujian Anda telah otomatis dikumpulkan karena waktu habis.');
      } catch(e) {
        console.error(`[AUTO-SUBMIT] Error attempt ${a.id}:`, e.message);
        try { await pool.query(`UPDATE attempts SET submission_status='FAILED' WHERE id=:id`, { id: a.id }); } catch(_) {}
      }
    }
  } catch(e) {
    console.error('[AUTO-SUBMIT] Middleware error:', e.message);
  }
  next();
}

async function autoSubmitAllExpired() {
  try {
    const [expired] = await pool.query(
      EXPIRED_QUERY + `
        AND a.submission_status IS DISTINCT FROM 'SUBMITTING'
        ORDER BY a.started_at ASC
      `
    );

    let processed = 0;
    for (const a of expired) {
      try {
        await finalizeAttemptWithBackup(a.id, a.student_id, a.exam_id);
        console.log(`[AUTO-SUBMIT] Attempt ${a.id} selesai`);
        processed++;
      } catch(e) {
        console.error(`[AUTO-SUBMIT] Error attempt ${a.id}:`, e.message);
        try { await pool.query(`UPDATE attempts SET submission_status='FAILED' WHERE id=:id`, { id: a.id }); } catch(_) {}
      }
    }
    if (processed > 0) console.log(`[AUTO-SUBMIT] Processed ${processed}/${expired.length}`);
    return { processed, total: expired.length };
  } catch(e) {
    console.error('[AUTO-SUBMIT] autoSubmitAllExpired error:', e.message);
    throw e;
  }
}

module.exports = { autoSubmitMiddleware, autoSubmitAllExpired };
