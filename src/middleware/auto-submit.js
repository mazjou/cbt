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
      EXPIRED_QUERY + ' AND a.student_id = $1',
      [req.session.user.id]
    );
    for (const a of expired) {
      try {
        await finalizeAttemptWithBackup(a.id, a.student_id, a.exam_id);
        if (req.flash) req.flash('info', 'Ujian Anda telah otomatis dikumpulkan karena waktu habis.');
      } catch(e) {
        console.error(`[AUTO-SUBMIT] Error attempt ${a.id}:`, e.message);
        try { await pool.query(`UPDATE attempts SET submission_status='FAILED' WHERE id=$1`, [a.id]); } catch(_) {}
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
    // Proses per batch 10 agar tidak banjiri DB sekaligus
    const BATCH = 10;
    for (let i = 0; i < expired.length; i += BATCH) {
      const batch = expired.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async (a) => {
        try {
          await finalizeAttemptWithBackup(a.id, a.student_id, a.exam_id);
          console.log(`[AUTO-SUBMIT] Attempt ${a.id} selesai`);
          processed++;
        } catch(e) {
          console.error(`[AUTO-SUBMIT] Error attempt ${a.id}:`, e.message);
          try { await pool.query(`UPDATE attempts SET submission_status='FAILED' WHERE id=$1`, [a.id]); } catch(_) {}
        }
      }));
      // Jeda 500ms antar batch agar DB tidak overload
      if (i + BATCH < expired.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (processed > 0) console.log(`[AUTO-SUBMIT] Processed ${processed}/${expired.length}`);
    return { processed, total: expired.length };
  } catch(e) {
    console.error('[AUTO-SUBMIT] autoSubmitAllExpired error:', e.message);
    throw e;
  }
}

/**
 * Auto-publish ujian yang sudah mencapai start_at dan belum end_at,
 * dan auto-close (unpublish) ujian yang sudah melewati end_at.
 *
 * Aturan:
 *  - Auto-publish: is_published=false, start_at IS NOT NULL, NOW() >= start_at,
 *                  dan (end_at IS NULL OR NOW() < end_at)
 *  - Auto-close  : is_published=true,  end_at IS NOT NULL, NOW() >= end_at
 */
async function autoPublishAndCloseExams() {
  try {
    // pool.query() wrapper mengembalikan [rows, fields] (pgResultToMysql2)
    // affectedRows tersedia di resultArray.affectedRows

    // 1. Auto-publish
    const publishResult = await pool.query(
      `UPDATE exams
       SET is_published = true
       WHERE is_published = false
         AND start_at IS NOT NULL
         AND NOW() >= start_at
         AND (end_at IS NULL OR NOW() < end_at)`
    );
    const published = publishResult?.affectedRows ?? 0;
    if (published > 0) {
      console.log(`[AUTO-PUBLISH] ✅ ${published} ujian dipublish otomatis`);
    }

    // 2. Auto-close
    const closeResult = await pool.query(
      `UPDATE exams
       SET is_published = false
       WHERE is_published = true
         AND end_at IS NOT NULL
         AND NOW() >= end_at`
    );
    const closed = closeResult?.affectedRows ?? 0;
    if (closed > 0) {
      console.log(`[AUTO-CLOSE] ✅ ${closed} ujian ditutup otomatis`);
    }

    return { published, closed };
  } catch (e) {
    console.error('[AUTO-PUBLISH/CLOSE] Error:', e.message);
    throw e;
  }
}

module.exports = { autoSubmitMiddleware, autoSubmitAllExpired, autoPublishAndCloseExams };
