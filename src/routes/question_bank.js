const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { nanoid } = require('nanoid');
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

// Upload untuk import (file xlsx + gambar)
const uploadImport = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
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
         ON CONFLICT (question_bank_id, option_label) DO UPDATE SET option_text=EXCLUDED.option_text, is_correct=EXCLUDED.is_correct`,
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

// ===== EXPORT BANK SOAL =====
router.get('/export', async (req, res) => {
  const user = req.session.user;
  const { subject_id, difficulty } = req.query;
  try {
    let query = `
      SELECT qb.id, qb.question_text, qb.question_image, qb.points, qb.difficulty, qb.tags, qb.chapter,
             s.name AS subject_name, s.code AS subject_code
      FROM question_bank qb
      JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = :tid`;
    const params = { tid: user.id };
    if (subject_id) { query += ` AND qb.subject_id = :subject_id`; params.subject_id = subject_id; }
    if (difficulty) { query += ` AND qb.difficulty = :difficulty`; params.difficulty = difficulty; }
    query += ` ORDER BY s.name ASC, qb.id ASC;`;

    const [questions] = await pool.query(query, params);
    if (!questions.length) {
      req.flash('error', 'Tidak ada soal untuk diekspor.');
      return res.redirect('/teacher/question-bank');
    }

    const ids = questions.map(q => q.id);
    const ph = ids.map((_, i) => `:id${i}`).join(',');
    const pObj = {}; ids.forEach((id, i) => { pObj[`id${i}`] = id; });
    const [options] = await pool.query(
      `SELECT question_bank_id, option_label, option_text, option_image, is_correct
       FROM question_bank_options WHERE question_bank_id IN (${ph})
       ORDER BY question_bank_id ASC, option_label ASC;`, pObj
    );
    const optMap = {};
    for (const o of options) {
      if (!optMap[o.question_bank_id]) optMap[o.question_bank_id] = {};
      optMap[o.question_bank_id][o.option_label] = { text: o.option_text || '', image: o.option_image || '', correct: o.is_correct };
    }

    const getImageRef = (p) => {
      if (!p) return '';
      const v = String(p).trim();
      if (/^https?:\/\//i.test(v)) return v;
      return path.basename(v).replace(/^\d{10,13}_/, '') || '';
    };

    const imgList = [['Nama File (isi di Excel)', 'URL Download Gambar', 'Dipakai di']];
    const imgSeen = new Set();
    const addImg = (storedPath, usedIn) => {
      if (!storedPath || /^https?:\/\//i.test(storedPath)) return;
      const base = path.basename(storedPath);
      if (!imgSeen.has(base)) {
        imgSeen.add(base);
        const displayName = base.replace(/^\d{10,13}_/, '');
        imgList.push([displayName, `https://psaj.smkn1kras.sch.id/public/uploads/questions/${base}`, usedIn]);
      }
    };

    const rows = questions.map((q, idx) => {
      const opts = optMap[q.id] || {};
      const correct = Object.entries(opts).find(([, v]) => v.correct)?.[0] || '';
      const qText = String(q.question_text || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (q.question_image) addImg(q.question_image, `Soal no.${idx + 1}`);
      ['A','B','C','D','E'].forEach(lbl => { if (opts[lbl]?.image) addImg(opts[lbl].image, `Soal no.${idx+1} opsi ${lbl}`); });
      return {
        'question_text': qText,
        'image': getImageRef(q.question_image),
        'points': q.points || 1,
        'correct': correct,
        'A': opts['A']?.text || '',
        'B': opts['B']?.text || '',
        'C': opts['C']?.text || '',
        'D': opts['D']?.text || '',
        'E': opts['E']?.text || '',
        'image_a': getImageRef(opts['A']?.image),
        'image_b': getImageRef(opts['B']?.image),
        'image_c': getImageRef(opts['C']?.image),
        'image_d': getImageRef(opts['D']?.image),
        'image_e': getImageRef(opts['E']?.image),
        'difficulty': q.difficulty || 'MEDIUM',
        'subject': q.subject_code || q.subject_name || '',
        'chapter': q.chapter || '',
        'tags': q.tags || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['question_text','image','points','correct','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e','difficulty','subject','chapter','tags']
    });
    ws['!cols'] = [
      {wch:60},{wch:25},{wch:8},{wch:8},
      {wch:35},{wch:35},{wch:35},{wch:35},{wch:35},
      {wch:20},{wch:20},{wch:20},{wch:20},{wch:20},
      {wch:10},{wch:15},{wch:20},{wch:25}
    ];

    const panduan = [
      ['PANDUAN IMPORT BANK SOAL'],[''],
      ['Kolom','Keterangan','Wajib?'],
      ['question_text','Teks soal','Ya'],
      ['image','Nama file gambar soal (opsional)','Tidak'],
      ['points','Poin soal (angka, default: 1)','Ya'],
      ['correct','Kunci jawaban: A/B/C/D/E','Ya'],
      ['A','Teks opsi A','Ya'],['B','Teks opsi B','Ya'],['C','Teks opsi C','Ya'],
      ['D','Teks opsi D','Ya'],['E','Teks opsi E','Ya'],
      ['image_a s/d image_e','Nama file gambar per opsi (opsional)','Tidak'],
      ['difficulty','Tingkat kesulitan: EASY / MEDIUM / HARD (default: MEDIUM)','Tidak'],
      ['subject','Kode atau nama mata pelajaran','Tidak'],
      ['chapter','Bab/chapter soal','Tidak'],
      ['tags','Tag soal, pisah koma (contoh: trigonometri,sudut)','Tidak'],
      [''],['Catatan:'],
      ['- File ini bisa langsung diimport ulang ke bank soal'],
      ['- Kolom gambar berisi nama file asli (tanpa prefix timestamp)'],
      ['- Lihat sheet "Daftar Gambar" untuk download gambar yang dibutuhkan'],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:20},{wch:60},{wch:8}];

    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    if (imgList.length > 1) {
      const wsImg = XLSX.utils.aoa_to_sheet(imgList);
      wsImg['!cols'] = [{wch:35},{wch:70},{wch:25}];
      XLSX.utils.book_append_sheet(wb, wsImg, 'Daftar Gambar');
    }
    XLSX.utils.book_append_sheet(wb, wsPanduan, 'Panduan');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="bank_soal_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal export bank soal: ' + e.message);
    res.redirect('/teacher/question-bank');
  }
});

// ===== IMPORT BANK SOAL - Halaman =====
router.get('/import', async (req, res) => {
  const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
  res.render('teacher/question_bank_import', { title: 'Import Bank Soal', subjects });
});

// ===== IMPORT BANK SOAL - Preview =====
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
        const hit = uploaded.find(u => u.originalname === base) || uploaded.find(u => u.originalname.replace(/\s+/g,'_') === base);
        if (hit) return `/public/uploads/questions/${path.basename(hit.filename)}`;
        const absExact = path.join(uploadDir, base);
        if (fs.existsSync(absExact)) return `/public/uploads/questions/${base}`;
        try {
          const files = fs.readdirSync(uploadDir);
          const matched = files.find(f => f.replace(/^\d{10,13}_/, '') === base);
          if (matched) return `/public/uploads/questions/${matched}`;
        } catch (_) {}
        return base;
      };

      const pickVal = (row, keys) => {
        const low = {}; for (const k of Object.keys(row)) low[k.trim().toLowerCase()] = row[k];
        for (const k of keys) { const v = low[k.toLowerCase()]; if (v !== undefined) return v; }
        return '';
      };

      const [subjects] = await pool.query(`SELECT id, code, name FROM subjects;`);
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
        const image_a = resolveImg(pickVal(row, ['image_a','gambar_a','img_a']));
        const image_b = resolveImg(pickVal(row, ['image_b','gambar_b','img_b']));
        const image_c = resolveImg(pickVal(row, ['image_c','gambar_c','img_c']));
        const image_d = resolveImg(pickVal(row, ['image_d','gambar_d','img_d']));
        const image_e = resolveImg(pickVal(row, ['image_e','gambar_e','img_e']));

        if (!question_text) reasons.push('Kolom question_text kosong');
        if (!A || !B || !C || !D || !E) reasons.push('Opsi A–E wajib terisi');
        if (!['A','B','C','D','E'].includes(correct)) reasons.push('Kunci (correct) harus A/B/C/D/E');
        if (!Number.isFinite(points) || points <= 0) reasons.push('Points harus angka > 0');

        let subject_id = null;
        if (subjectRaw) {
          subject_id = subjectMap.get(subjectRaw.toLowerCase()) || null;
          if (!subject_id) reasons.push(`Mata pelajaran "${subjectRaw}" tidak ditemukan`);
        }

        const validDiff = ['EASY','MEDIUM','HARD'].includes(difficulty) ? difficulty : 'MEDIUM';
        const item = {
          rowNo, question_text, question_image, points, correct, subject_id, subjectRaw,
          difficulty: validDiff, chapter, tags,
          options: { A, B, C, D, E },
          option_images: { A: image_a, B: image_b, C: image_c, D: image_d, E: image_e }
        };
        if (reasons.length) errors.push({ rowNo, reasons, snapshot: item });
        else preview.push(item);
      });

      const importId = nanoid(12);
      req.session.bankImportPreview = { importId, preview, errors, createdAt: Date.now() };
      try { fs.unlinkSync(file.path); } catch (_) {}

      res.render('teacher/question_bank_import_preview', {
        title: 'Preview Import Bank Soal',
        importId, preview, errors, subjects
      });
    } catch (e) {
      console.error(e);
      try { fs.unlinkSync(file.path); } catch (_) {}
      req.flash('error', 'Gagal membaca file: ' + e.message);
      res.redirect('/teacher/question-bank/import');
    }
  }
);

// ===== IMPORT BANK SOAL - Commit =====
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
        `INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, points, difficulty, tags)
         VALUES (:tid, :sid, :chap, :qt, :img, :pts, :diff, :tags);`,
        { tid: user.id, sid, chap: r.chapter || null, qt: r.question_text, img: r.question_image || null, pts: r.points, diff: r.difficulty, tags: r.tags || null }
      );
      const bankId = res2.insertId;
      for (const lbl of ['A','B','C','D','E']) {
        await conn.query(
          `INSERT INTO question_bank_options (question_bank_id, option_label, option_text, option_image, is_correct)
           VALUES (:bid, :lbl, :txt, :img, :isc);`,
          { bid: bankId, lbl, txt: r.options[lbl] || '', img: r.option_images[lbl] || null, isc: lbl === r.correct ? 1 : 0 }
        );
      }
      inserted++;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menyimpan import: ' + e.message);
    return res.redirect('/teacher/question-bank/import');
  } finally {
    conn.release();
  }
  req.session.bankImportPreview = null;
  req.flash('success', `Import berhasil. ${inserted} soal ditambahkan ke bank soal.`);
  res.redirect('/teacher/question-bank');
});

// POST /question-bank/:id/use-in-exam/:examId
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
