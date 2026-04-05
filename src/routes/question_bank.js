const express = require('express');
const path = require('path');
const multer = require('multer');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('TEACHER'));

// Upload config
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'questions');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// GET /question-bank - List all bank soal
router.get('/', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty, search } = req.query;
  
  try {
    let query = `
      SELECT qb.*, s.name AS subject_name,
             (SELECT COUNT(*) FROM question_bank_usage qbu WHERE qbu.question_bank_id = qb.id) AS usage_count
      FROM question_bank qb
      JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = :tid
    `;
    
    const params = { tid: user.id };
    
    if (subject_id) {
      query += ` AND qb.subject_id = :subject_id`;
      params.subject_id = subject_id;
    }
    
    if (difficulty) {
      query += ` AND qb.difficulty = :difficulty`;
      params.difficulty = difficulty;
    }
    
    if (search) {
      query += ` AND (qb.question_text LIKE :search OR qb.tags LIKE :search)`;
      params.search = `%${search}%`;
    }
    
    query += ` ORDER BY qb.created_at DESC;`;
    
    const [questions] = await pool.query(query, params);
    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    
    res.render('teacher/question_bank', {
      title: 'Bank Soal',
      questions,
      subjects,
      filters: { subject_id, difficulty, search }
    });
  } catch (error) {
    console.error('Error loading question bank:', error);
    req.flash('error', 'Gagal memuat bank soal');
    res.redirect('/teacher');
  }
});

// GET /question-bank/new - Form tambah soal ke bank
router.get('/new', async (req, res) => {
  try {
    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    res.render('teacher/question_bank_new', {
      title: 'Tambah Soal ke Bank',
      subjects
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Gagal memuat form');
    res.redirect('/teacher/question-bank');
  }
});

// POST /question-bank - Simpan soal ke bank
router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct } = req.body;
  
  if (!subject_id || !question_text || !a || !b || !c || !d || !e || !correct) {
    req.flash('error', 'Semua field wajib diisi');
    return res.redirect('/teacher/question-bank/new');
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const imageFile = req.files && req.files.image ? req.files.image[0] : null;
    const pdfFile = req.files && req.files.pdf ? req.files.pdf[0] : null;
    
    const [result] = await conn.query(
      `INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, question_pdf, points, difficulty, tags)
       VALUES (:tid, :sid, :chap, :qt, :img, :pdf, :pts, :diff, :tags);`,
      {
        tid: user.id,
        sid: subject_id,
        chap: chapter || null,
        qt: question_text,
        img: imageFile ? `/public/uploads/questions/${path.basename(imageFile.filename)}` : null,
        pdf: pdfFile ? `/public/uploads/questions/${path.basename(pdfFile.filename)}` : null,
        pts: Number(points || 1),
        diff: difficulty || 'MEDIUM',
        tags: tags || null
      }
    );
    
    const bankId = result.insertId;
    const options = [
      { label: 'A', text: a },
      { label: 'B', text: b },
      { label: 'C', text: c },
      { label: 'D', text: d },
      { label: 'E', text: e }
    ];
    
    for (const opt of options) {
      await conn.query(
        `INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct)
         VALUES (:bid, :lbl, :txt, :isc);`,
        {
          bid: bankId,
          lbl: opt.label,
          txt: opt.text,
          isc: opt.label === String(correct).toUpperCase() ? 1 : 0
        }
      );
    }
    
    await conn.commit();
    req.flash('success', 'Soal berhasil ditambahkan ke bank soal');
    res.redirect('/teacher/question-bank');
  } catch (error) {
    await conn.rollback();
    console.error('Error saving to question bank:', error);
    req.flash('error', 'Gagal menyimpan soal: ' + error.message);
    res.redirect('/teacher/question-bank/new');
  } finally {
    conn.release();
  }
});

// GET /question-bank/:id - Detail bank soal
router.get('/:id', async (req, res) => {
  const user = req.session.user;
  
  try {
    const [[question]] = await pool.query(
      `SELECT qb.*, s.name AS subject_name,
              (SELECT COUNT(*) FROM question_bank_usage qbu WHERE qbu.question_bank_id = qb.id) AS usage_count
       FROM question_bank qb
       JOIN subjects s ON s.id = qb.subject_id
       WHERE qb.id = :id AND qb.teacher_id = :tid
       LIMIT 1;`,
      { id: req.params.id, tid: user.id }
    );
    
    if (!question) {
      req.flash('error', 'Soal tidak ditemukan');
      return res.redirect('/teacher/question-bank');
    }
    
    const [options] = await pool.query(
      `SELECT * FROM question_bank_options WHERE question_bank_id = :id ORDER BY option_label ASC;`,
      { id: req.params.id }
    );
    
    const [usage] = await pool.query(
      `SELECT qbu.*, e.title AS exam_title, e.id AS exam_id
       FROM question_bank_usage qbu
       JOIN exams e ON e.id = qbu.exam_id
       WHERE qbu.question_bank_id = :id
       ORDER BY qbu.used_at DESC;`,
      { id: req.params.id }
    );
    
    res.render('teacher/question_bank_detail', {
      title: 'Detail Bank Soal',
      question,
      options,
      usage
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Gagal memuat detail soal');
    res.redirect('/teacher/question-bank');
  }
});

// GET /question-bank/:id/edit - Form edit bank soal
router.get('/:id/edit', async (req, res) => {
  const user = req.session.user;
  
  try {
    const [[question]] = await pool.query(
      `SELECT qb.*, s.name AS subject_name
       FROM question_bank qb
       JOIN subjects s ON s.id = qb.subject_id
       WHERE qb.id = :id AND qb.teacher_id = :tid
       LIMIT 1;`,
      { id: req.params.id, tid: user.id }
    );
    
    if (!question) {
      req.flash('error', 'Soal tidak ditemukan');
      return res.redirect('/teacher/question-bank');
    }
    
    const [options] = await pool.query(
      `SELECT * FROM question_bank_options WHERE question_bank_id = :id ORDER BY option_label ASC;`,
      { id: req.params.id }
    );
    
    const byLabel = {};
    let correct = 'A';
    for (const o of options) {
      byLabel[o.option_label] = o.option_text;
      if (o.is_correct) correct = o.option_label;
    }
    
    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    
    res.render('teacher/question_bank_edit', {
      title: 'Edit Bank Soal',
      question,
      options: byLabel,
      correct_label: correct,
      subjects
    });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Gagal memuat form edit');
    res.redirect('/teacher/question-bank');
  }
});

// PUT /question-bank/:id - Update bank soal
router.put('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct, remove_image, remove_pdf } = req.body;
  
  if (!subject_id || !question_text || !a || !b || !c || !d || !e || !correct) {
    req.flash('error', 'Semua field wajib diisi');
    return res.redirect(`/teacher/question-bank/${req.params.id}/edit`);
  }
  
  const [[existing]] = await pool.query(
    `SELECT * FROM question_bank WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
    { id: req.params.id, tid: user.id }
  );
  
  if (!existing) {
    req.flash('error', 'Akses ditolak');
    return res.redirect('/teacher/question-bank');
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Handle image
    const imageFile = req.files && req.files.image ? req.files.image[0] : null;
    let imageToSave = existing.question_image;
    if (remove_image) imageToSave = null;
    if (imageFile) imageToSave = `/public/uploads/questions/${path.basename(imageFile.filename)}`;
    
    // Handle PDF
    const pdfFile = req.files && req.files.pdf ? req.files.pdf[0] : null;
    let pdfToSave = existing.question_pdf;
    if (remove_pdf) pdfToSave = null;
    if (pdfFile) pdfToSave = `/public/uploads/questions/${path.basename(pdfFile.filename)}`;
    
    await conn.query(
      `UPDATE question_bank
       SET subject_id = :sid, chapter = :chap, question_text = :qt, question_image = :img, question_pdf = :pdf,
           points = :pts, difficulty = :diff, tags = :tags
       WHERE id = :id;`,
      {
        sid: subject_id,
        chap: chapter || null,
        qt: question_text,
        img: imageToSave,
        pdf: pdfToSave,
        pts: Number(points || 1),
        diff: difficulty || 'MEDIUM',
        tags: tags || null,
        id: req.params.id
      }
    );
    
    const options = [
      ['A', a],
      ['B', b],
      ['C', c],
      ['D', d],
      ['E', e]
    ];
    
    const corr = String(correct).toUpperCase();
    for (const [lbl, txt] of options) {
      await conn.query(
        `INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct)
         VALUES (:bid, :lbl, :txt, :isc)
         ON DUPLICATE KEY UPDATE option_text = VALUES(option_text), is_correct = VALUES(is_correct);`,
        {
          bid: req.params.id,
          lbl,
          txt,
          isc: lbl === corr ? 1 : 0
        }
      );
    }
    
    await conn.commit();
    req.flash('success', 'Bank soal berhasil diperbarui');
    res.redirect(`/teacher/question-bank/${req.params.id}`);
  } catch (error) {
    await conn.rollback();
    console.error('Error updating question bank:', error);
    req.flash('error', 'Gagal memperbarui soal: ' + error.message);
    res.redirect(`/teacher/question-bank/${req.params.id}/edit`);
  } finally {
    conn.release();
  }
});

// DELETE /question-bank/:id - Hapus bank soal
router.delete('/:id', async (req, res) => {
  const user = req.session.user;
  
  try {
    const [[question]] = await pool.query(
      `SELECT id FROM question_bank WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
      { id: req.params.id, tid: user.id }
    );
    
    if (!question) {
      req.flash('error', 'Akses ditolak');
      return res.redirect('/teacher/question-bank');
    }
    
    await pool.query(`DELETE FROM question_bank WHERE id = :id;`, { id: req.params.id });
    req.flash('success', 'Soal berhasil dihapus dari bank');
  } catch (error) {
    console.error('Error deleting question bank:', error);
    req.flash('error', 'Gagal menghapus soal');
  }
  
  res.redirect('/teacher/question-bank');
});

// POST /question-bank/:id/use-in-exam/:examId - Gunakan soal dari bank ke ujian
router.post('/:id/use-in-exam/:examId', async (req, res) => {
  const user = req.session.user;
  const bankId = req.params.id;
  const examId = req.params.examId;
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Verify bank question ownership
    const [[bankQuestion]] = await conn.query(
      `SELECT * FROM question_bank WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
      { id: bankId, tid: user.id }
    );
    
    if (!bankQuestion) {
      req.flash('error', 'Soal tidak ditemukan');
      return res.redirect('/teacher/question-bank');
    }
    
    // Verify exam ownership
    const [[exam]] = await conn.query(
      `SELECT id FROM exams WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
      { id: examId, tid: user.id }
    );
    
    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan');
      return res.redirect('/teacher/question-bank');
    }
    
    // Copy question to exam
    const [qResult] = await conn.query(
      `INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points)
       VALUES (:eid, :qt, :img, :pdf, :pts);`,
      {
        eid: examId,
        qt: bankQuestion.question_text,
        img: bankQuestion.question_image,
        pdf: bankQuestion.question_pdf,
        pts: bankQuestion.points
      }
    );
    
    const questionId = qResult.insertId;
    
    // Copy options
    const [bankOptions] = await conn.query(
      `SELECT * FROM question_bank_options WHERE question_bank_id = :bid ORDER BY option_label ASC;`,
      { bid: bankId }
    );
    
    for (const opt of bankOptions) {
      await conn.query(
        `INSERT INTO options (question_id, option_label, option_text, is_correct)
         VALUES (:qid, :lbl, :txt, :isc);`,
        {
          qid: questionId,
          lbl: opt.option_label,
          txt: opt.option_text,
          isc: opt.is_correct
        }
      );
    }
    
    // Track usage
    await conn.query(
      `INSERT INTO question_bank_usage (question_bank_id, question_id, exam_id)
       VALUES (:bid, :qid, :eid);`,
      { bid: bankId, qid: questionId, eid: examId }
    );
    
    await conn.commit();
    req.flash('success', 'Soal berhasil ditambahkan ke ujian');
    res.redirect(`/teacher/exams/${examId}`);
  } catch (error) {
    await conn.rollback();
    console.error('Error using question from bank:', error);
    req.flash('error', 'Gagal menambahkan soal ke ujian: ' + error.message);
    res.redirect('/teacher/question-bank');
  } finally {
    conn.release();
  }
});

module.exports = router;


// API: GET /api/question-bank - Get bank soal for modal (JSON)
router.get('/api', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty, search } = req.query;
  
  try {
    let query = `
      SELECT qb.id, qb.subject_id, qb.question_text, qb.points, qb.difficulty, qb.tags,
             s.name AS subject_name
      FROM question_bank qb
      JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = :tid
    `;
    
    const params = { tid: user.id };
    
    if (subject_id) {
      query += ` AND qb.subject_id = :subject_id`;
      params.subject_id = subject_id;
    }
    
    if (difficulty) {
      query += ` AND qb.difficulty = :difficulty`;
      params.difficulty = difficulty;
    }
    
    if (search) {
      query += ` AND (qb.question_text LIKE :search OR qb.tags LIKE :search)`;
      params.search = `%${search}%`;
    }
    
    query += ` ORDER BY qb.created_at DESC LIMIT 100;`;
    
    const [questions] = await pool.query(query, params);
    res.json(questions);
  } catch (error) {
    console.error('Error loading bank soal API:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: POST /api/question-bank/add-to-exam/:examId - Add multiple questions to exam
router.post('/api/add-to-exam/:examId', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.examId;
  const { questionIds } = req.body;
  
  if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
    return res.status(400).json({ error: 'questionIds array required' });
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Verify exam ownership
    const [[exam]] = await conn.query(
      `SELECT id FROM exams WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
      { id: examId, tid: user.id }
    );
    
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    
    let added = 0;
    
    for (const bankId of questionIds) {
      // Get bank question
      const [[bankQuestion]] = await conn.query(
        `SELECT * FROM question_bank WHERE id = :id AND teacher_id = :tid LIMIT 1;`,
        { id: bankId, tid: user.id }
      );
      
      if (!bankQuestion) continue;
      
      // Copy question to exam
      const [qResult] = await conn.query(
        `INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points)
         VALUES (:eid, :qt, :img, :pdf, :pts);`,
        {
          eid: examId,
          qt: bankQuestion.question_text,
          img: bankQuestion.question_image,
          pdf: bankQuestion.question_pdf,
          pts: bankQuestion.points
        }
      );
      
      const questionId = qResult.insertId;
      
      // Copy options
      const [bankOptions] = await conn.query(
        `SELECT * FROM question_bank_options WHERE question_bank_id = :bid ORDER BY option_label ASC;`,
        { bid: bankId }
      );
      
      for (const opt of bankOptions) {
        await conn.query(
          `INSERT INTO options (question_id, option_label, option_text, is_correct)
           VALUES (:qid, :lbl, :txt, :isc);`,
          {
            qid: questionId,
            lbl: opt.option_label,
            txt: opt.option_text,
            isc: opt.is_correct
          }
        );
      }
      
      // Track usage
      await conn.query(
        `INSERT INTO question_bank_usage (question_bank_id, question_id, exam_id)
         VALUES (:bid, :qid, :eid);`,
        { bid: bankId, qid: questionId, eid: examId }
      );
      
      added++;
    }
    
    await conn.commit();
    res.json({ success: true, added });
  } catch (error) {
    await conn.rollback();
    console.error('Error adding questions to exam:', error);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
