'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');

const nanoid = (size) => crypto.randomBytes(size || 12).toString('base64url').slice(0, size || 12);

const router = express.Router();
router.use(requireRole('TEACHER'));

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'questions');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadImport = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// helper: ambil row pertama dari hasil pool.query ([rows, fields])
const firstRow = (result) => result && result[0] && result[0][0];

// strip HTML untuk export
const stripHtml = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

// ===== LIST =====
router.get('/', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty, search } = req.query;
  try {
    const params = [user.id];
    let query = `SELECT qb.*, s.name AS subject_name,
      (SELECT COUNT(*) FROM question_bank_usage qbu WHERE qbu.question_bank_id = qb.id) AS usage_count
      FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = $1`;
    if (subject_id) { params.push(subject_id); query += ` AND qb.subject_id = $${params.length}`; }
    if (difficulty) { params.push(difficulty); query += ` AND qb.difficulty = $${params.length}`; }
    if (search) { params.push('%' + search + '%'); query += ` AND (qb.question_text ILIKE $${params.length} OR qb.tags ILIKE $${params.length})`; }
    query += ' ORDER BY qb.created_at DESC';
    const [questions] = await pool.query(query, params);
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.render('teacher/question_bank', { title: 'Bank Soal', questions, subjects, filters: { subject_id, difficulty, search } });
  } catch (error) {
    console.error('Error loading question bank:', error);
    req.flash('error', 'Gagal memuat bank soal: ' + error.message);
    res.redirect('/teacher');
  }
});

// ===== NEW FORM =====
router.get('/new', async (req, res) => {
  try {
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.render('teacher/question_bank_new', { title: 'Tambah Soal ke Bank', subjects });
  } catch (error) {
    req.flash('error', 'Gagal memuat form');
    res.redirect('/teacher/question-bank');
  }
});

// ===== EXPORT =====
router.get('/export', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty } = req.query;
  try {
    const params = [user.id];
    let query = `SELECT qb.id, qb.question_text, qb.question_image, qb.points, qb.difficulty, qb.tags, qb.chapter,
      s.name AS subject_name, s.code AS subject_code
      FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = $1`;
    if (subject_id) { params.push(subject_id); query += ` AND qb.subject_id = $${params.length}`; }
    if (difficulty) { params.push(difficulty); query += ` AND qb.difficulty = $${params.length}`; }
    query += ' ORDER BY s.name ASC, qb.id ASC';
    const [questions] = await pool.query(query, params);
    if (!questions.length) {
      req.flash('error', 'Tidak ada soal untuk diekspor.');
      return res.redirect('/teacher/question-bank');
    }
    const ids = questions.map(q => q.id);
    const ph = ids.map((_, i) => `$${i + 1}`).join(',');
    const [options] = await pool.query(
      `SELECT question_bank_id, option_label, option_text, is_correct FROM question_bank_options WHERE question_bank_id IN (${ph}) ORDER BY question_bank_id ASC, option_label ASC`,
      ids
    );
    const optMap = {};
    for (const o of options) {
      if (!optMap[o.question_bank_id]) optMap[o.question_bank_id] = {};
      optMap[o.question_bank_id][o.option_label] = { text: o.option_text || '', correct: o.is_correct };
    }
    const getRef = (p) => {
      if (!p) return '';
      const v = String(p).trim();
      if (/^https?:\/\//i.test(v)) return v;
      return path.basename(v).replace(/^\d{10,13}_/, '') || '';
    };
    const rows = questions.map(q => {
      const opts = optMap[q.id] || {};
      const correct = Object.entries(opts).find(([, v]) => v.correct);
      return {
        question_text: stripHtml(q.question_text),
        image:         getRef(q.question_image),
        points:        q.points || 1,
        correct:       correct ? correct[0] : '',
        A: stripHtml(opts['A']?.text), B: stripHtml(opts['B']?.text),
        C: stripHtml(opts['C']?.text), D: stripHtml(opts['D']?.text),
        E: stripHtml(opts['E']?.text),
        difficulty: q.difficulty || 'MEDIUM',
        subject:    q.subject_code || q.subject_name || '',
        chapter:    q.chapter || '',
        tags:       q.tags || ''
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['question_text','image','points','correct','A','B','C','D','E','difficulty','subject','chapter','tags']
    });
    ws['!cols'] = [{wch:60},{wch:25},{wch:8},{wch:8},{wch:35},{wch:35},{wch:35},{wch:35},{wch:35},{wch:10},{wch:15},{wch:20},{wch:25}];
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="bank_soal_' + Date.now() + '.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error('Export error:', e);
    req.flash('error', 'Gagal export: ' + e.message);
    res.redirect('/teacher/question-bank');
  }
});

// ===== IMPORT HALAMAN =====
router.get('/import', async (req, res) => {
  const [subjects] = await pool.query('SELECT id, code, name FROM subjects ORDER BY name ASC');
  res.render('teacher/question_bank_import', { title: 'Import Bank Soal', subjects });
});

// ===== DOWNLOAD TEMPLATE IMPORT =====
router.get('/import/template', async (req, res) => {
  try {
    const [subjects] = await pool.query('SELECT code, name FROM subjects ORDER BY name ASC');
    const subjectList = subjects.map(s => s.code || s.name).join(', ');
    const contoh = [
      { question_text: 'Contoh: Ibu kota Indonesia adalah?', image: '', points: 1, correct: 'A',
        A: 'Jakarta', B: 'Surabaya', C: 'Bandung', D: 'Yogyakarta', E: '',
        difficulty: 'EASY', subject: subjects[0]?.code || 'KODE_MAPEL', chapter: 'Bab 1', tags: 'geografi' },
      { question_text: 'Contoh: 2 + 2 = ?', image: '', points: 2, correct: 'B',
        A: '3', B: '4', C: '5', D: '6', E: '',
        difficulty: 'EASY', subject: subjects[0]?.code || 'KODE_MAPEL', chapter: 'Bab 1', tags: 'matematika' }
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh, {
      header: ['question_text','image','points','correct','A','B','C','D','E','difficulty','subject','chapter','tags']
    });
    ws['!cols'] = [{wch:60},{wch:25},{wch:8},{wch:8},{wch:35},{wch:35},{wch:35},{wch:35},{wch:35},{wch:10},{wch:15},{wch:20},{wch:25}];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Soal');
    const panduan = [
      ['Kolom','Keterangan','Wajib','Contoh'],
      ['question_text','Teks pertanyaan','Ya','Sebutkan ibu kota Indonesia!'],
      ['image','Nama file gambar soal','Tidak','gambar1.jpg'],
      ['points','Poin soal (default 1)','Tidak','1'],
      ['correct','Kunci: A/B/C/D/E','Ya','A'],
      ['A','Teks opsi A','Ya','Jakarta'],
      ['B','Teks opsi B','Ya','Surabaya'],
      ['C','Teks opsi C','Ya','Bandung'],
      ['D','Teks opsi D','Ya','Yogyakarta'],
      ['E','Teks opsi E (opsional)','Tidak',''],
      ['difficulty','EASY/MEDIUM/HARD','Tidak','MEDIUM'],
      ['subject', `Kode/nama mapel. Tersedia: ${subjectList}`, 'Ya', subjects[0]?.code || 'KODE_MAPEL'],
      ['chapter','Bab/topik soal','Tidak','Bab 1'],
      ['tags','Tag pencarian, pisah koma','Tidak','integral, turunan'],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:18},{wch:55},{wch:8},{wch:30}];
    XLSX.utils.book_append_sheet(wb, wsPanduan, 'Panduan');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_bank_soal.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    req.flash('error', 'Gagal membuat template: ' + e.message);
    res.redirect('/teacher/question-bank/import');
  }
});

// ===== UPLOAD GAMBAR SOAL BANK =====
router.get('/upload-images', async (req, res) => {
  try {
    const user = req.session.user;
    const [questions] = await pool.query(
      `SELECT qb.id, qb.question_text, qb.question_image, s.name AS subject_name
       FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id
       WHERE qb.teacher_id = $1 ORDER BY qb.id DESC LIMIT 200`,
      [user.id]
    );
    res.render('teacher/question_bank_upload_images', { title: 'Upload Gambar Bank Soal', questions });
  } catch (e) {
    req.flash('error', 'Gagal memuat halaman.');
    res.redirect('/teacher/question-bank');
  }
});

router.post('/upload-images', uploadImport.any(), async (req, res) => {
  const user = req.session.user;
  try {
    const uploadedFiles = (req.files || []).filter(f => f.mimetype.startsWith('image/'));
    if (!uploadedFiles.length) {
      req.flash('error', 'Tidak ada file gambar yang diupload.');
      return res.redirect('/teacher/question-bank/upload-images');
    }
    const fileMap = {};
    for (const f of uploadedFiles) {
      const orig = f.originalname.trim();
      const stored = '/public/uploads/questions/' + f.filename;
      fileMap[orig] = stored;
      fileMap[orig.replace(/\s+/g,'_')] = stored;
      fileMap[orig.replace(/\.[^.]+$/, '')] = stored;
    }
    const [questions] = await pool.query('SELECT id, question_image FROM question_bank WHERE teacher_id = $1', [user.id]);
    let updated = 0;
    for (const q of questions) {
      const imgVal = (q.question_image || '').trim();
      if (imgVal && !imgVal.startsWith('http') && !imgVal.startsWith('/public/')) {
        const base = path.basename(imgVal);
        const matched = fileMap[base] || fileMap[base.replace(/\.[^.]+$/, '')] || null;
        if (matched) {
          await pool.query('UPDATE question_bank SET question_image = $1 WHERE id = $2', [matched, q.id]);
          updated++;
        }
      }
    }
    req.flash('success', 'Berhasil mengupdate ' + updated + ' gambar soal.');
    res.redirect('/teacher/question-bank/upload-images');
  } catch (e) {
    req.flash('error', 'Gagal upload gambar: ' + e.message);
    res.redirect('/teacher/question-bank/upload-images');
  }
});

// ===== IMPORT PREVIEW =====
router.post('/import/preview',
  uploadImport.fields([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 200 }]),
  async (req, res) => {
    const user = req.session.user;
    const file = (req.files?.file || [])[0];
    if (!file) { req.flash('error', 'File belum dipilih.'); return res.redirect('/teacher/question-bank/import'); }
    try {
      const wb = XLSX.readFile(file.path, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows.length) { req.flash('error', 'File kosong.'); return res.redirect('/teacher/question-bank/import'); }
      const uploaded = (req.files?.images || []).map(f => ({ originalname: f.originalname, filename: f.filename }));
      const resolveImg = (val) => {
        if (!val) return null;
        const v = String(val).trim();
        if (!v) return null;
        if (/^https?:\/\//i.test(v)) return v;
        const base = path.basename(v);
        const hit = uploaded.find(u => u.originalname === base) ||
                    uploaded.find(u => u.originalname.replace(/\s+/g,'_') === base);
        if (hit) return '/public/uploads/questions/' + path.basename(hit.filename);
        const absExact = path.join(uploadDir, base);
        if (fs.existsSync(absExact)) return '/public/uploads/questions/' + base;
        try {
          const files = fs.readdirSync(uploadDir);
          const matched = files.find(f => f.replace(/^\d{10,13}_/, '') === base);
          if (matched) return '/public/uploads/questions/' + matched;
        } catch (_) {}
        return base;
      };
      const pickVal = (row, keys) => {
        const low = {};
        for (const k of Object.keys(row)) low[k.trim().toLowerCase()] = row[k];
        for (const k of keys) { const v = low[k.toLowerCase()]; if (v !== undefined) return v; }
        return '';
      };
      const [subjects] = await pool.query('SELECT id, code, name FROM subjects');
      const subjectMap = new Map();
      for (const s of subjects) {
        if (s.code) subjectMap.set(s.code.toLowerCase(), s.id);
        if (s.name) subjectMap.set(s.name.toLowerCase(), s.id);
      }
      const preview = [], errors = [];
      rows.forEach((row, idx) => {
        const rowNo = idx + 2;
        const reasons = [];
        const question_text = String(pickVal(row, ['question_text','question','soal','pertanyaan'])).trim();
        const points = Number(pickVal(row, ['points','poin','score']) || 1) || 1;
        const correct = String(pickVal(row, ['correct','kunci','answer','jawaban_benar'])).trim().toUpperCase();
        const A = String(pickVal(row, ['A','a','opsi_a'])).trim();
        const B = String(pickVal(row, ['B','b','opsi_b'])).trim();
        const C = String(pickVal(row, ['C','c','opsi_c'])).trim();
        const D = String(pickVal(row, ['D','d','opsi_d'])).trim();
        const E = String(pickVal(row, ['E','e','opsi_e'])).trim();
        const difficulty = String(pickVal(row, ['difficulty','kesulitan']) || 'MEDIUM').toUpperCase();
        const subjectRaw = String(pickVal(row, ['subject','mapel','mata_pelajaran','subject_code']) || '').trim();
        const chapter = String(pickVal(row, ['chapter','bab']) || '').trim();
        const tags = String(pickVal(row, ['tags','tag']) || '').trim();
        const question_image = resolveImg(pickVal(row, ['image','gambar','image_url','img']));
        if (!question_text) reasons.push('Kolom question_text kosong');
        if (!A || !B || !C || !D) reasons.push('Opsi A-D wajib terisi');
        if (!['A','B','C','D','E'].includes(correct)) reasons.push('Kunci harus A/B/C/D/E');
        let subject_id = null;
        if (subjectRaw) {
          subject_id = subjectMap.get(subjectRaw.toLowerCase()) || null;
          if (!subject_id) reasons.push('Mata pelajaran "' + subjectRaw + '" tidak ditemukan');
        }
        const validDiff = ['EASY','MEDIUM','HARD'].includes(difficulty) ? difficulty : 'MEDIUM';
        const item = { rowNo, question_text, question_image, points, correct, subject_id, subjectRaw,
          difficulty: validDiff, chapter, tags, options: { A, B, C, D, E } };
        if (reasons.length) errors.push({ rowNo, reasons, snapshot: item });
        else preview.push(item);
      });
      const importId = nanoid(12);
      req.session.bankImportPreview = { importId, preview, errors, createdAt: Date.now() };
      try { fs.unlinkSync(file.path); } catch (_) {}
      res.render('teacher/question_bank_import_preview', { title: 'Preview Import Bank Soal', importId, preview, errors, subjects });
    } catch (e) {
      console.error(e);
      try { fs.unlinkSync(file.path); } catch (_) {}
      req.flash('error', 'Gagal membaca file: ' + e.message);
      res.redirect('/teacher/question-bank/import');
    }
  }
);

// ===== IMPORT COMMIT =====
router.post('/import/commit', async (req, res) => {
  const user = req.session.user;
  const { importId, default_subject_id } = req.body;
  const sess = req.session.bankImportPreview;
  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid. Upload ulang.');
    return res.redirect('/teacher/question-bank/import');
  }
  const rows = Array.isArray(sess.preview) ? sess.preview : [];
  if (!rows.length) { req.flash('error', 'Tidak ada soal valid.'); return res.redirect('/teacher/question-bank/import'); }
  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    await conn.beginTransaction();
    for (const r of rows) {
      const sid = r.subject_id || default_subject_id || null;
      if (!sid) continue;
      const [res2] = await conn.query(
        'INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, points, difficulty, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [user.id, sid, r.chapter || null, r.question_text, r.question_image || null, r.points || 1, r.difficulty || 'MEDIUM', r.tags || null]
      );
      const bankId = res2.insertId;
      for (const lbl of ['A','B','C','D','E']) {
        if (!r.options[lbl]) continue;
        await conn.query(
          'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
          [bankId, lbl, r.options[lbl], lbl === r.correct ? true : false]
        );
      }
      inserted++;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error('Import commit error:', e);
    req.flash('error', 'Gagal menyimpan import: ' + e.message);
    return res.redirect('/teacher/question-bank/import');
  } finally {
    conn.release();
  }
  req.session.bankImportPreview = null;
  req.flash('success', 'Import berhasil. ' + inserted + ' soal ditambahkan ke bank soal.');
  res.redirect('/teacher/question-bank');
});

// ===== SAVE NEW =====
router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct } = req.body;
  if (!subject_id || !question_text || !a || !b || !c || !d || !correct) {
    req.flash('error', 'Semua field wajib diisi (minimal A-D dan kunci jawaban)');
    return res.redirect('/teacher/question-bank/new');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const imageFile = req.files?.image?.[0];
    const pdfFile   = req.files?.pdf?.[0];
    const [result] = await conn.query(
      'INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, question_pdf, points, difficulty, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [user.id, subject_id, chapter || null, question_text,
       imageFile ? '/public/uploads/questions/' + path.basename(imageFile.filename) : null,
       pdfFile   ? '/public/uploads/questions/' + path.basename(pdfFile.filename)   : null,
       Number(points || 1), difficulty || 'MEDIUM', tags || null]
    );
    const bankId = result.insertId;
    const corr = String(correct).toUpperCase();
    for (const [lbl, txt] of [['A',a],['B',b],['C',c],['D',d],['E',e||'']]) {
      if (!txt) continue;
      await conn.query(
        'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
        [bankId, lbl, txt, lbl === corr]
      );
    }
    await conn.commit();
    req.flash('success', 'Soal berhasil ditambahkan ke bank soal');
    res.redirect('/teacher/question-bank');
  } catch (error) {
    await conn.rollback();
    req.flash('error', 'Gagal menyimpan soal: ' + error.message);
    res.redirect('/teacher/question-bank/new');
  } finally {
    conn.release();
  }
});

// ===== DETAIL =====
router.get('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect('/teacher/question-bank');
  const user = req.session.user;
  try {
    const question = firstRow(await pool.query(
      'SELECT qb.*, s.name AS subject_name, (SELECT COUNT(*) FROM question_bank_usage qbu WHERE qbu.question_bank_id = qb.id) AS usage_count FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id WHERE qb.id = $1 AND qb.teacher_id = $2 LIMIT 1',
      [req.params.id, user.id]
    ));
    if (!question) { req.flash('error', 'Soal tidak ditemukan'); return res.redirect('/teacher/question-bank'); }
    const [options] = await pool.query('SELECT * FROM question_bank_options WHERE question_bank_id = $1 ORDER BY option_label ASC', [req.params.id]);
    let usage = [];
    try {
      const [usageRows] = await pool.query(
        'SELECT qbu.*, e.title AS exam_title, e.id AS exam_id FROM question_bank_usage qbu JOIN exams e ON e.id = qbu.exam_id WHERE qbu.question_bank_id = $1 ORDER BY qbu.id DESC',
        [req.params.id]
      );
      usage = usageRows || [];
    } catch(_) { /* tabel atau kolom belum ada */ }
    res.render('teacher/question_bank_detail', { title: 'Detail Bank Soal', question, options, usage });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Gagal memuat detail soal');
    res.redirect('/teacher/question-bank');
  }
});

// ===== EDIT FORM =====
router.get('/:id/edit', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect('/teacher/question-bank');
  const user = req.session.user;
  try {
    const question = firstRow(await pool.query(
      'SELECT qb.*, s.name AS subject_name FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id WHERE qb.id = $1 AND qb.teacher_id = $2 LIMIT 1',
      [req.params.id, user.id]
    ));
    if (!question) { req.flash('error', 'Soal tidak ditemukan'); return res.redirect('/teacher/question-bank'); }
    const [options] = await pool.query('SELECT * FROM question_bank_options WHERE question_bank_id = $1 ORDER BY option_label ASC', [req.params.id]);
    const byLabel = {};
    let correct = 'A';
    for (const o of options) { byLabel[o.option_label] = o.option_text; if (o.is_correct) correct = o.option_label; }
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.render('teacher/question_bank_edit', { title: 'Edit Bank Soal', question, options: byLabel, correct_label: correct, subjects });
  } catch (error) {
    console.error('Error:', error);
    req.flash('error', 'Gagal memuat form edit');
    res.redirect('/teacher/question-bank');
  }
});

// ===== UPDATE =====
router.put('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect('/teacher/question-bank');
  const user = req.session.user;
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct, remove_image, remove_pdf } = req.body;
  if (!subject_id || !question_text || !a || !b || !c || !d || !correct) {
    req.flash('error', 'Semua field wajib diisi');
    return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
  }
  const existing = firstRow(await pool.query('SELECT * FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [req.params.id, user.id]));
  if (!existing) { req.flash('error', 'Akses ditolak'); return res.redirect('/teacher/question-bank'); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const imageFile = req.files?.image?.[0];
    let imageToSave = existing.question_image;
    if (remove_image) imageToSave = null;
    if (imageFile) imageToSave = '/public/uploads/questions/' + path.basename(imageFile.filename);
    const pdfFile = req.files?.pdf?.[0];
    let pdfToSave = existing.question_pdf;
    if (remove_pdf) pdfToSave = null;
    if (pdfFile) pdfToSave = '/public/uploads/questions/' + path.basename(pdfFile.filename);
    await conn.query(
      'UPDATE question_bank SET subject_id=$1, chapter=$2, question_text=$3, question_image=$4, question_pdf=$5, points=$6, difficulty=$7, tags=$8, updated_at=NOW() WHERE id=$9',
      [subject_id, chapter || null, question_text, imageToSave, pdfToSave, Number(points || 1), difficulty || 'MEDIUM', tags || null, req.params.id]
    );
    const corr = String(correct).toUpperCase();
    for (const [lbl, txt] of [['A',a],['B',b],['C',c],['D',d],['E',e||'']]) {
      if (!txt) continue;
      await conn.query(
        'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4) ON CONFLICT (question_bank_id, option_label) DO UPDATE SET option_text=EXCLUDED.option_text, is_correct=EXCLUDED.is_correct',
        [req.params.id, lbl, txt, lbl === corr]
      );
    }
    await conn.commit();
    req.flash('success', 'Bank soal berhasil diperbarui');
    res.redirect('/teacher/question-bank/' + req.params.id);
  } catch (error) {
    await conn.rollback();
    req.flash('error', 'Gagal memperbarui soal: ' + error.message);
    res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
  } finally {
    conn.release();
  }
});

// ===== DELETE =====
router.delete('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.redirect('/teacher/question-bank');
  const user = req.session.user;
  try {
    const question = firstRow(await pool.query('SELECT id FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [req.params.id, user.id]));
    if (!question) { req.flash('error', 'Akses ditolak'); return res.redirect('/teacher/question-bank'); }
    await pool.query('DELETE FROM question_bank WHERE id = $1', [req.params.id]);
    req.flash('success', 'Soal berhasil dihapus dari bank');
  } catch (error) {
    req.flash('error', 'Gagal menghapus soal');
  }
  res.redirect('/teacher/question-bank');
});

// ===== USE IN EXAM =====
router.post('/:id/use-in-exam/:examId', async (req, res) => {
  const user = req.session.user;
  const bankId = req.params.id;
  const examId = req.params.examId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const bankQuestion = firstRow(await conn.query('SELECT * FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [bankId, user.id]));
    if (!bankQuestion) { req.flash('error', 'Soal tidak ditemukan'); return res.redirect('/teacher/question-bank'); }
    const exam = firstRow(await conn.query('SELECT id FROM exams WHERE id = $1 AND teacher_id = $2 LIMIT 1', [examId, user.id]));
    if (!exam) { req.flash('error', 'Ujian tidak ditemukan'); return res.redirect('/teacher/question-bank'); }
    const [qResult] = await conn.query(
      'INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [examId, bankQuestion.question_text, bankQuestion.question_image, bankQuestion.question_pdf, bankQuestion.points || 1]
    );
    const questionId = qResult.insertId;
    const [bankOptions] = await conn.query('SELECT * FROM question_bank_options WHERE question_bank_id = $1 ORDER BY option_label ASC', [bankId]);
    for (const opt of bankOptions) {
      await conn.query('INSERT INTO options (question_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
        [questionId, opt.option_label, opt.option_text, opt.is_correct]);
    }
    await conn.query('INSERT INTO question_bank_usage (question_bank_id, question_id, exam_id) VALUES ($1,$2,$3)', [bankId, questionId, examId]);
    await conn.commit();
    req.flash('success', 'Soal berhasil ditambahkan ke ujian');
    res.redirect('/teacher/exams/' + examId);
  } catch (error) {
    await conn.rollback();
    req.flash('error', 'Gagal menambahkan soal ke ujian: ' + error.message);
    res.redirect('/teacher/question-bank');
  } finally {
    conn.release();
  }
});

// ===== API LIST (diakses dari /teacher/question-bank/api) =====
router.get('/api', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty, search } = req.query;
  try {
    const params = [user.id];
    let query = 'SELECT qb.id, qb.subject_id, qb.question_text, qb.points, qb.difficulty, qb.tags, s.name AS subject_name FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id WHERE qb.teacher_id = $1';
    if (subject_id) { params.push(subject_id); query += ` AND qb.subject_id = $${params.length}`; }
    if (difficulty) { params.push(difficulty); query += ` AND qb.difficulty = $${params.length}`; }
    if (search) { params.push('%' + search + '%'); query += ` AND (qb.question_text ILIKE $${params.length} OR qb.tags ILIKE $${params.length})`; }
    query += ' ORDER BY qb.created_at DESC LIMIT 200';
    const [questions] = await pool.query(query, params);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== API ADD TO EXAM (bulk) =====
router.post('/api/add-to-exam/:examId', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.examId;
  const { questionIds } = req.body;
  if (!questionIds || !Array.isArray(questionIds) || !questionIds.length)
    return res.status(400).json({ error: 'questionIds required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const exam = firstRow(await conn.query('SELECT id FROM exams WHERE id = $1 AND teacher_id = $2 LIMIT 1', [examId, user.id]));
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    let added = 0;
    for (const bankId of questionIds) {
      const bq = firstRow(await conn.query('SELECT * FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [bankId, user.id]));
      if (!bq) continue;
      const [qResult] = await conn.query(
        'INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [examId, bq.question_text, bq.question_image, bq.question_pdf, bq.points || 1]
      );
      const questionId = qResult.insertId;
      const [opts] = await conn.query('SELECT * FROM question_bank_options WHERE question_bank_id = $1 ORDER BY option_label ASC', [bankId]);
      for (const opt of opts) {
        await conn.query('INSERT INTO options (question_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
          [questionId, opt.option_label, opt.option_text, opt.is_correct]);
      }
      try { await conn.query('INSERT INTO question_bank_usage (question_bank_id, question_id, exam_id) VALUES ($1,$2,$3)', [bankId, questionId, examId]); } catch(_) {}
      added++;
    }
    await conn.commit();
    res.json({ success: true, added });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
