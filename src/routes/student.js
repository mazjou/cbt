const express = require('express');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');
const { finalizeAttemptWithBackup } = require('../utils/submission-utils');

const router = express.Router();
router.use(requireRole('STUDENT'));

// Anti-cheat: jumlah pelanggaran maksimal sebelum attempt dikunci & otomatis disubmit.
const MAX_VIOLATIONS = Number(process.env.ANTI_CHEAT_MAX_VIOLATIONS || 3);

function toMySqlDatetime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

router.get('/', async (req, res) => {
  res.redirect('/student/exams');
});

// ===== MATERI =====
router.get('/materials', async (req, res) => {
  const user = req.session.user;
  const [materials] = await pool.query(
    `SELECT m.id, m.title, m.description, m.created_at, m.is_published,
            s.name AS subject_name, c.name AS class_name,
            mr.first_opened_at, mr.completed_at
     FROM materials m
     JOIN subjects s ON s.id=m.subject_id
     LEFT JOIN classes c ON c.id=m.class_id
     LEFT JOIN material_reads mr ON mr.material_id=m.id AND mr.student_id=:sid
     WHERE m.is_published=true
       AND (m.class_id IS NULL OR m.class_id=:class_id)
     ORDER BY m.id DESC;`,
    { sid: user.id, class_id: user.class_id || 0 }
  );
  res.render('student/materials', { title: 'Materi', materials });
});

router.get('/materials/:id', async (req, res) => {
  const user = req.session.user;
  const materialId = req.params.id;

  const [[material]] = await pool.query(
    `SELECT m.*, s.name AS subject_name, c.name AS class_name, u.full_name AS teacher_name
     FROM materials m
     JOIN subjects s ON s.id=m.subject_id
     JOIN users u ON u.id=m.teacher_id
     LEFT JOIN classes c ON c.id=m.class_id
     WHERE m.id=:id AND m.is_published=true AND (m.class_id IS NULL OR m.class_id=:class_id)
     LIMIT 1;`,
    { id: materialId, class_id: user.class_id || 0 }
  );
  if (!material) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Materi tidak tersedia.', user });

  // Upsert read log
  try {
    await pool.query(
      `INSERT INTO material_reads (material_id, student_id, first_opened_at, last_opened_at)
       VALUES (:mid,:sid,NOW(),NOW())
       ON DUPLICATE KEY UPDATE last_opened_at=NOW();`,
      { mid: materialId, sid: user.id }
    );
  } catch (e) {
    console.error(e);
  }

  const [[mr]] = await pool.query(
    `SELECT first_opened_at, last_opened_at, completed_at
     FROM material_reads
     WHERE material_id=:mid AND student_id=:sid
     LIMIT 1;`,
    { mid: materialId, sid: user.id }
  );

  res.render('student/material_detail', { 
    title: material.title, 
    material, 
    read: mr || null,
    user
  });
});

router.post('/materials/:id/complete', async (req, res) => {
  const user = req.session.user;
  const materialId = req.params.id;
  try {
    await pool.query(
      `INSERT INTO material_reads (material_id, student_id, first_opened_at, last_opened_at, completed_at)
       VALUES (:mid,:sid,NOW(),NOW(),NOW())
       ON DUPLICATE KEY UPDATE last_opened_at=NOW(), completed_at=IF(completed_at IS NULL, NOW(), completed_at);`,
      { mid: materialId, sid: user.id }
    );
    req.flash('success', 'Materi ditandai selesai.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menandai materi.');
  }
  res.redirect(`/student/materials/${materialId}`);
});

router.get('/exams', async (req, res) => {
  const user = req.session.user;
  const [exams] = await pool.query(
    `SELECT e.id, e.title, e.description, e.start_at, e.end_at, e.duration_minutes, e.pass_score, e.max_attempts,
            e.access_code, s.name AS subject_name, u.full_name AS teacher_name,
            (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') 
             FROM exam_classes ec 
             JOIN classes c ON c.id=ec.class_id 
             WHERE ec.exam_id=e.id) AS class_names,
            (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
            (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id AND a.student_id=:sid) AS attempts_count
     FROM exams e
     JOIN subjects s ON s.id=e.subject_id
     JOIN users u ON u.id=e.teacher_id
     WHERE e.is_published=true
       AND (
         NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
         OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=:class_id)
       )
     ORDER BY e.id DESC;`,
    { sid: user.id, class_id: user.class_id || 0 }
  );

  res.render('student/exams', { title: 'Daftar Ujian', exams });
});

router.get('/exams/:id', async (req, res) => {
  const user = req.session.user;
  const [[exam]] = await pool.query(
    `SELECT e.*, s.name AS subject_name, c.name AS class_name, u.full_name AS teacher_name,
            (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
            (SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id AND a.student_id=:sid) AS attempts_count
     FROM exams e
     JOIN subjects s ON s.id=e.subject_id
     JOIN users u ON u.id=e.teacher_id
     LEFT JOIN classes c ON c.id=e.class_id
     WHERE e.id=:id AND e.is_published=true
       AND (
         NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
         OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=:class_id)
       )
     LIMIT 1;`,
    { id: req.params.id, sid: user.id, class_id: user.class_id || 0 }
  );
  if (!exam) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Ujian tidak tersedia.', user });
  
  // Fetch attempt results if max attempts reached
  let attemptResults = [];
  if (exam.attempts_count >= exam.max_attempts) {
    attemptResults = await pool.query(
      `SELECT id, score, finished_at, 
              CASE WHEN score >= :pass_score THEN 'Lulus' ELSE 'Tidak Lulus' END AS status
       FROM attempts 
       WHERE exam_id=:exam_id AND student_id=:student_id AND status='SUBMITTED'
       ORDER BY score DESC, finished_at DESC`,
      { exam_id: exam.id, student_id: user.id, pass_score: exam.pass_score }
    );
  }
  
  res.render('student/exam_detail', { title: exam.title, exam, attemptResults: attemptResults[0] || [] });
});

router.post('/exams/:id/start', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;
  const access_code_input = (req.body.access_code || '').trim();

  console.log(`[START EXAM] User: ${user.id}, Exam: ${examId}, Class: ${user.class_id}`);

  const [[exam]] = await pool.query(
    `SELECT * FROM exams
     WHERE id=:id AND is_published=true
       AND (
         NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:id)
         OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=:id AND ec.class_id=:class_id)
       )
     LIMIT 1;`,
    { id: examId, class_id: user.class_id || 0 }
  );
  
  if (!exam) {
    console.log(`[START EXAM] Exam not found or not accessible for user ${user.id}`);
    req.flash('error', 'Ujian tidak tersedia.');
    return res.redirect('/student/exams');
  }

  console.log(`[START EXAM] Exam found: ${exam.title}`);

  const now = new Date();
  if (exam.start_at && now < new Date(exam.start_at)) {
    console.log(`[START EXAM] Exam not started yet. Start: ${exam.start_at}, Now: ${now}`);
    req.flash('info', 'Ujian belum dimulai.');
    return res.redirect(`/student/exams/${examId}`);
  }
  if (exam.end_at && now > new Date(exam.end_at)) {
    console.log(`[START EXAM] Exam already ended. End: ${exam.end_at}, Now: ${now}`);
    req.flash('error', 'Ujian sudah berakhir.');
    return res.redirect(`/student/exams/${examId}`);
  }

  if (exam.access_code && exam.access_code.length) {
    console.log(`[START EXAM] Checking access code. Expected: ${exam.access_code}, Got: ${access_code_input}`);
    if (access_code_input.toUpperCase() !== String(exam.access_code).toUpperCase()) {
      console.log(`[START EXAM] Access code mismatch`);
      req.flash('error', 'Kode akses salah.');
      return res.redirect(`/student/exams/${examId}`);
    }
  }

  const [[cnt]] = await pool.query(`SELECT COUNT(*) AS c FROM attempts WHERE exam_id=:eid AND student_id=:sid;`, {
    eid: examId,
    sid: user.id
  });
  
  console.log(`[START EXAM] Attempts: ${cnt.c}/${exam.max_attempts}`);
  
  if (cnt.c >= exam.max_attempts) {
    console.log(`[START EXAM] Max attempts reached`);
    req.flash('error', 'Batas percobaan ujian sudah habis.');
    return res.redirect(`/student/exams/${examId}`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const started_at = toMySqlDatetime(new Date());
    const [aRes] = await conn.query(
      `INSERT INTO attempts (exam_id, student_id, started_at, status) VALUES (:eid,:sid,:started_at,'IN_PROGRESS');`,
      { eid: examId, sid: user.id, started_at }
    );
    const attemptId = aRes.insertId;

    console.log(`[START EXAM] Attempt created: ${attemptId}`);

    const [qRows] = await conn.query(
      `SELECT id FROM questions WHERE exam_id=:eid ORDER BY ${exam.shuffle_questions ? 'RAND()' : 'id ASC'};`,
      { eid: examId }
    );
    
    console.log(`[START EXAM] Questions found: ${qRows.length}`);
    
    for (const q of qRows) {
      await conn.query(`INSERT INTO attempt_answers (attempt_id, question_id) VALUES (:aid,:qid);`, { aid: attemptId, qid: q.id });
    }

    await conn.commit();
    console.log(`[START EXAM] Success! Redirecting to attempt ${attemptId}`);
    return res.redirect(`/student/attempts/${attemptId}`);
  } catch (e) {
    await conn.rollback();
    console.error('[START EXAM] Error:', e);
    req.flash('error', 'Gagal memulai ujian.');
    return res.redirect(`/student/exams/${examId}`);
  } finally {
    conn.release();
  }
});

router.get('/attempts/:id', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;

  const [[attempt]] = await pool.query(
    `SELECT a.*, e.title, e.description, e.duration_minutes, e.pass_score, e.shuffle_options
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     WHERE a.id=:aid AND a.student_id=:sid
     LIMIT 1;`,
    { aid: attemptId, sid: user.id }
  );

  if (!attempt) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Attempt tidak ditemukan.', user });

  if (attempt.status !== 'IN_PROGRESS') {
    return res.redirect(`/student/attempts/${attemptId}/result`);
  }

  const [rows] = await pool.query(
    `SELECT aa.question_id, aa.option_id AS chosen_option_id, q.question_text, q.question_image, q.question_pdf, q.points
     FROM attempt_answers aa
     JOIN questions q ON q.id=aa.question_id
     WHERE aa.attempt_id=:aid
     ORDER BY aa.id ASC;`,
    { aid: attemptId }
  );

  const questionIds = rows.map((r) => r.question_id);
  let optionsMap = {};
  if (questionIds.length) {
    const placeholders = questionIds.map((_, i) => `$${i + 1}`).join(',');
    const [opts] = await pool.query(
      `SELECT id, question_id, option_label, option_text
       FROM options
       WHERE question_id IN (${placeholders})
       ORDER BY question_id ASC, ${attempt.shuffle_options ? 'RANDOM()' : 'option_label ASC'};`,
      questionIds
    );
    
    // Group options by question_id
    for (const o of opts) {
      if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
      optionsMap[o.question_id].push(o);
    }
    
    // If shuffle_options is enabled, reassign labels A, B, C, D, E in order
    if (attempt.shuffle_options) {
      const labels = ['A', 'B', 'C', 'D', 'E'];
      for (const qid in optionsMap) {
        optionsMap[qid].forEach((opt, idx) => {
          opt.option_label = labels[idx] || opt.option_label;
        });
      }
    }
  }

  const questions = rows.map((r, idx) => ({
    no: idx + 1,
    id: r.question_id,
    text: r.question_text,
    image: r.question_image,
    pdf: r.question_pdf,
    points: r.points,
    chosen_option_id: r.chosen_option_id,
    options: optionsMap[r.question_id] || []
  }));

  res.render('student/attempt_take', { title: 'Mengerjakan Ujian', attempt, questions });
});

router.post('/attempts/:id/answer', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;
  const { question_id, option_id } = req.body;

  const [[attempt]] = await pool.query(`SELECT id, exam_id, status FROM attempts WHERE id=:aid AND student_id=:sid LIMIT 1;`, {
    aid: attemptId,
    sid: user.id
  });
  if (!attempt) return res.status(404).json({ ok: false, message: 'Attempt tidak ditemukan' });
  if (attempt.status !== 'IN_PROGRESS') return res.status(400).json({ ok: false, message: 'Attempt sudah selesai' });

  try {
    const [[opt]] = await pool.query(`SELECT is_correct FROM options WHERE id=:oid AND question_id=:qid LIMIT 1;`, {
      oid: option_id,
      qid: question_id
    });
    const isCorrect = opt ? (opt.is_correct ? 1 : 0) : 0;

    await pool.query(
      `UPDATE attempt_answers
       SET option_id=:oid, is_correct=:isc, answered_at=NOW()
       WHERE attempt_id=:aid AND question_id=:qid;`,
      { oid: option_id, isc: isCorrect, aid: attemptId, qid: question_id }
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal menyimpan jawaban' });
  }
});

// Catat pelanggaran anti-cheat (frontend memanggil endpoint ini).
router.post('/attempts/:id/violation', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;
  const type = String(req.body?.type || '').slice(0, 50);
  const details = req.body?.details ? String(req.body.details).slice(0, 255) : null;

  if (!type) return res.status(400).json({ ok: false, message: 'type wajib' });

  const [[attempt]] = await pool.query(
    `SELECT id, status FROM attempts WHERE id=:aid AND student_id=:sid LIMIT 1;`,
    { aid: attemptId, sid: user.id }
  );
  if (!attempt) return res.status(404).json({ ok: false, message: 'Attempt tidak ditemukan' });

  // Tetap boleh mencatat meski sudah submit, tapi tidak perlu lock/auto-submit.
  try {
    await pool.query(
      `INSERT INTO attempt_violations (attempt_id, violation_type, details) VALUES (:aid, :t, :d);`,
      { aid: attemptId, t: type, d: details }
    );
  } catch (e) {
    // Jika tabel belum ada (belum migrate), jangan memblok siswa.
    console.error('Anti-cheat log insert failed:', e?.message || e);
    return res.json({ ok: true, logged: false, max: MAX_VIOLATIONS, count: null, locked: false });
  }

  // Jika masih in progress, cek apakah sudah melewati batas.
  if (attempt.status === 'IN_PROGRESS') {
    const [[cnt]] = await pool.query(
      `SELECT COUNT(*) AS c FROM attempt_violations WHERE attempt_id=:aid;`,
      { aid: attemptId }
    );
    const count = Number(cnt?.c || 0);
    if (count >= MAX_VIOLATIONS) {
      try {
        await finalizeAttemptWithBackup(attemptId, attempt.student_id, attempt.exam_id);
      } catch (e) {
        console.error('Finalize after violations failed:', e);
      }
      return res.json({ ok: true, logged: true, max: MAX_VIOLATIONS, count, locked: true });
    }
    return res.json({ ok: true, logged: true, max: MAX_VIOLATIONS, count, locked: false });
  }

  return res.json({ ok: true, logged: true, max: MAX_VIOLATIONS, count: null, locked: false });
});

router.post('/attempts/:id/submit', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;
  const clientBackup = req.body.backup_data; // Client-side backup
  const retryCount = parseInt(req.headers['x-retry-count'] || '0');

  console.log(`📥 Submission received for attempt ${attemptId}, retry: ${retryCount}`);

  const [[attempt]] = await pool.query(
    `SELECT a.id, a.status, a.exam_id, a.submission_status
     FROM attempts a
     WHERE a.id=:aid AND a.student_id=:sid
     LIMIT 1;`,
    { aid: attemptId, sid: user.id }
  );
  
  if (!attempt) {
    req.flash('error', 'Attempt tidak ditemukan.');
    return res.redirect('/student/exams');
  }

  // If already submitted, just redirect to result
  if (attempt.submission_status === 'SUBMITTED') {
    console.log(`✅ Attempt ${attemptId} already submitted`);
    req.flash('info', 'Jawaban sudah dikumpulkan sebelumnya.');
    return res.redirect(`/student/attempts/${attemptId}/result`);
  }

  if (attempt.status === 'IN_PROGRESS' && attempt.submission_status !== 'SUBMITTING') {
    try {
      // Log client backup if provided
      if (clientBackup) {
        console.log(`📦 Client backup received: ${clientBackup.answers?.length || 0} answers`);
      }
      
      await finalizeAttemptWithBackup(attemptId, user.id, attempt.exam_id);
      
      console.log(`✅ Attempt ${attemptId} submitted successfully`);
      req.flash('success', 'Jawaban berhasil dikumpulkan.');
      
      // Return JSON for AJAX requests
      if (req.headers['content-type']?.includes('application/json')) {
        return res.json({ success: true, message: 'Submission successful' });
      }
      
    } catch (e) {
      console.error(`❌ Submission failed for attempt ${attemptId}:`, e);
      
      // Update status to FAILED for recovery
      await pool.query(
        `UPDATE attempts SET submission_status = 'FAILED' WHERE id = :aid`,
        { aid: attemptId }
      );
      
      // Store client backup if provided
      if (clientBackup && clientBackup.answers) {
        try {
          await pool.query(
            `INSERT INTO submission_backups (attempt_id, student_id, exam_id, backup_data, status)
             VALUES (:aid, :sid, :eid, :data, 'ACTIVE')
             ON DUPLICATE KEY UPDATE backup_data = :data`,
            {
              aid: attemptId,
              sid: user.id,
              eid: attempt.exam_id,
              data: JSON.stringify(clientBackup)
            }
          );
          console.log(`💾 Client backup stored for attempt ${attemptId}`);
        } catch (backupError) {
          console.error('Failed to store client backup:', backupError);
        }
      }
      
      req.flash('error', 'Gagal submit jawaban. Jawaban Anda telah disimpan dan dapat dipulihkan oleh admin. Silakan hubungi guru atau admin.');
      
      // Return JSON error for AJAX requests
      if (req.headers['content-type']?.includes('application/json')) {
        return res.status(500).json({ 
          success: false, 
          message: 'Submission failed',
          retry: retryCount < 3 
        });
      }
    }
  } else if (attempt.submission_status === 'SUBMITTING') {
    console.log(`⏳ Attempt ${attemptId} is already being submitted`);
    req.flash('info', 'Submission sedang diproses. Mohon tunggu...');
  }
  
  res.redirect(`/student/attempts/${attemptId}/result`);
});

router.get('/attempts/:id/result', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;

  const [[attempt]] = await pool.query(
    `SELECT a.*, e.title, e.pass_score, e.show_score_to_student, e.show_review_to_student, s.name AS subject_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN subjects s ON s.id=e.subject_id
     WHERE a.id=:aid AND a.student_id=:sid
     LIMIT 1;`,
    { aid: attemptId, sid: user.id }
  );

  if (!attempt) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Hasil tidak ditemukan.', user });

  // Only get review data if teacher allows it
  let review = [];
  if (attempt.show_review_to_student) {
    const [reviewData] = await pool.query(
      `SELECT q.id AS question_id, q.question_text, q.question_image, q.points, aa.is_correct, aa.option_id,
              (SELECT CONCAT(o.option_label,'. ', o.option_text) FROM options o WHERE o.id=aa.option_id) AS chosen_text,
              (SELECT CONCAT(o2.option_label,'. ', o2.option_text) FROM options o2 WHERE o2.question_id=q.id AND o2.is_correct=1 LIMIT 1) AS correct_text
       FROM attempt_answers aa
       JOIN questions q ON q.id=aa.question_id
       WHERE aa.attempt_id=:aid
       ORDER BY aa.id ASC;`,
      { aid: attemptId }
    );
    review = reviewData;
  }

  res.render('student/attempt_result', { title: 'Hasil Ujian', attempt, review });
});

router.get('/history', async (req, res) => {
  const user = req.session.user;
  const [rows] = await pool.query(
    `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
            e.title AS exam_title, s.name AS subject_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN subjects s ON s.id=e.subject_id
     WHERE a.student_id=:sid
     ORDER BY a.id DESC
     LIMIT 100;`,
    { sid: user.id }
  );
  res.render('student/history', { title: 'Riwayat Ujian', rows });
});

router.get('/material-history', async (req, res) => {
  const user = req.session.user;
  const [rows] = await pool.query(
    `SELECT mr.material_id, mr.first_opened_at, mr.last_opened_at, mr.completed_at,
            m.title AS material_title, s.name AS subject_name, c.name AS class_name
     FROM material_reads mr
     JOIN materials m ON m.id=mr.material_id
     JOIN subjects s ON s.id=m.subject_id
     LEFT JOIN classes c ON c.id=m.class_id
     WHERE mr.student_id=:sid
     ORDER BY mr.last_opened_at DESC
     LIMIT 100;`,
    { sid: user.id }
  );
  res.render('student/material_history', { title: 'Riwayat Materi', rows });
});

// ===== ASSIGNMENTS (TUGAS) =====

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Upload config untuk assignment submissions
const assignmentsDir = path.join(__dirname, '..', 'public', 'uploads', 'assignments');
fs.mkdirSync(assignmentsDir, { recursive: true });

const storageAssignments = multer.diskStorage({
  destination: (req, file, cb) => cb(null, assignmentsDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const uploadAssignments = multer({
  storage: storageAssignments,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// List assignments
router.get('/assignments', async (req, res) => {
  try {
    const user = req.session.user;
    
    const [assignments] = await pool.query(
      `SELECT 
        a.id, a.title, a.description, a.due_date, a.max_score, a.created_at,
        s.name AS subject_name,
        u.full_name AS teacher_name,
        sub.id AS submission_id,
        sub.submitted_at,
        sub.score,
        sub.feedback
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN users u ON u.id = a.teacher_id
       INNER JOIN assignment_classes ac ON ac.assignment_id = a.id
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = :studentId
       WHERE a.is_published = true
         AND ac.class_id = :classId
       ORDER BY a.due_date ASC, a.created_at DESC;`,
      { studentId: user.id, classId: user.class_id || 0 }
    );
    
    res.render('student/assignments', {
      title: 'Tugas Saya',
      assignments
    });
  } catch (err) {
    console.error('Error loading assignments:', err);
    req.flash('error', 'Gagal memuat daftar tugas');
    res.redirect('/student');
  }
});

// View assignment detail
router.get('/assignments/:id', async (req, res) => {
  try {
    const user = req.session.user;
    const assignmentId = req.params.id;
    
    const [[assignment]] = await pool.query(
      `SELECT 
        a.*,
        s.name AS subject_name,
        u.full_name AS teacher_name
       FROM assignments a
       JOIN subjects s ON s.id = a.subject_id
       JOIN users u ON u.id = a.teacher_id
       WHERE a.id = :id 
         AND a.is_published = true
         AND (a.class_id IS NULL OR a.class_id = :classId);`,
      { id: assignmentId, classId: user.class_id || 0 }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan atau tidak tersedia untuk Anda');
      return res.redirect('/student/assignments');
    }
    
    // Check if already submitted
    const [[submission]] = await pool.query(
      `SELECT * FROM assignment_submissions 
       WHERE assignment_id = :assignmentId AND student_id = :studentId;`,
      { assignmentId, studentId: user.id }
    );
    
    res.render('student/assignment_detail', {
      title: assignment.title,
      assignment,
      submission
    });
  } catch (err) {
    console.error('Error loading assignment detail:', err);
    req.flash('error', 'Gagal memuat detail tugas');
    res.redirect('/student/assignments');
  }
});

// Submit assignment
router.post('/assignments/:id/submit', uploadAssignments.single('file'), async (req, res) => {
  try {
    const user = req.session.user;
    const assignmentId = req.params.id;
    const { notes } = req.body;
    const file = req.file;
    
    // Check if assignment exists and is available
    const [[assignment]] = await pool.query(
      `SELECT * FROM assignments 
       WHERE id = :id 
         AND is_published = true
         AND (class_id IS NULL OR class_id = :classId);`,
      { id: assignmentId, classId: user.class_id || 0 }
    );
    
    if (!assignment) {
      if (file) fs.unlinkSync(file.path);
      req.flash('error', 'Tugas tidak ditemukan atau tidak tersedia');
      return res.redirect('/student/assignments');
    }
    
    // Check deadline
    const now = new Date();
    if (assignment.due_date && new Date(assignment.due_date) < now && !assignment.allow_late_submission) {
      if (file) fs.unlinkSync(file.path);
      req.flash('error', 'Deadline sudah lewat dan pengumpulan terlambat tidak diizinkan');
      return res.redirect(`/student/assignments/${assignmentId}`);
    }
    
    // Check if already submitted
    const [[existing]] = await pool.query(
      `SELECT id FROM assignment_submissions 
       WHERE assignment_id = :assignmentId AND student_id = :studentId;`,
      { assignmentId, studentId: user.id }
    );
    
    if (existing) {
      // Update existing submission
      await pool.query(
        `UPDATE assignment_submissions 
         SET file_path = :filePath,
             file_name = :fileName,
             notes = :notes,
             submitted_at = NOW(),
             score = NULL,
             feedback = NULL,
             graded_at = NULL,
             graded_by = NULL
         WHERE assignment_id = :assignmentId AND student_id = :studentId;`,
        {
          filePath: file ? file.filename : null,
          fileName: file ? file.originalname : null,
          notes: notes || null,
          assignmentId,
          studentId: user.id
        }
      );
      req.flash('success', 'Tugas berhasil diperbarui');
    } else {
      // Create new submission
      await pool.query(
        `INSERT INTO assignment_submissions 
         (assignment_id, student_id, file_path, file_name, notes, submitted_at)
         VALUES (:assignmentId, :studentId, :filePath, :fileName, :notes, NOW());`,
        {
          assignmentId,
          studentId: user.id,
          filePath: file ? file.filename : null,
          fileName: file ? file.originalname : null,
          notes: notes || null
        }
      );
      req.flash('success', 'Tugas berhasil dikumpulkan');
    }
    
    res.redirect(`/student/assignments/${assignmentId}`);
  } catch (err) {
    console.error('Error submitting assignment:', err);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
    req.flash('error', 'Gagal mengumpulkan tugas');
    res.redirect(`/student/assignments/${req.params.id}`);
  }
});

module.exports = router;
