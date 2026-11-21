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
  const { subject_id, difficulty, search, class_level } = req.query;
  try {
    const params = [user.id];
    let query = `SELECT qb.*, s.name AS subject_name,
      (SELECT COUNT(*) FROM question_bank_usage qbu WHERE qbu.question_bank_id = qb.id) AS usage_count
      FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id
      WHERE qb.teacher_id = $1`;
    if (subject_id) { params.push(subject_id); query += ` AND qb.subject_id = $${params.length}`; }
    if (difficulty) { params.push(difficulty); query += ` AND qb.difficulty = $${params.length}`; }
    if (class_level) { params.push(class_level); query += ` AND qb.class_level = $${params.length}`; }
    if (search) { params.push('%' + search + '%'); query += ` AND (qb.question_text ILIKE $${params.length} OR qb.tags ILIKE $${params.length})`; }
    query += ' ORDER BY qb.created_at DESC';
    const [questions] = await pool.query(query, params);
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.render('teacher/question_bank', { title: 'Bank Soal', questions, subjects, filters: { subject_id, difficulty, search, class_level } });
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
    let query = `SELECT qb.id, qb.question_text, qb.question_image, qb.points,
      qb.difficulty, qb.tags, qb.chapter, qb.question_type,
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
      `SELECT question_bank_id, option_label, option_text, option_image, is_correct FROM question_bank_options WHERE question_bank_id IN (${ph}) ORDER BY question_bank_id ASC, option_label ASC`,
      ids
    );
    const optMap = {};
    for (const o of options) {
      if (!optMap[o.question_bank_id]) optMap[o.question_bank_id] = {};
      optMap[o.question_bank_id][o.option_label] = { text: o.option_text || '', image: o.option_image || '', correct: o.is_correct };
    }
    const getRef = (p) => {
      if (!p) return '';
      const v = String(p).trim();
      if (/^https?:\/\//i.test(v)) return v;
      return path.basename(v).replace(/^\d{10,13}_/, '') || '';
    };

    // Sheet Daftar Gambar
    const appUrl = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const imgList = [['Nama File (isi di Excel)', 'URL Download Gambar', 'Dipakai di']];
    const imgSeen = new Set();
    const addImg = (storedPath, usedIn) => {
      if (!storedPath) return;
      const v = String(storedPath).trim();
      if (!v || /^https?:\/\//i.test(v)) return;
      const base = path.basename(v);
      if (!imgSeen.has(base)) {
        imgSeen.add(base);
        const displayName = base.replace(/^\d{10,13}_/, '');
        imgList.push([displayName, `${appUrl}/public/uploads/questions/${base}`, usedIn]);
      }
    };

    const rows = questions.map((q, idx) => {
      const opts = optMap[q.id] || {};
      const qtype = q.question_type || 'MCQ';
      const correctEntries = Object.entries(opts).filter(([, v]) => v.correct);
      let correctStr;
      if (qtype === 'MULTI_TF') {
        // Tulis semua pernyataan yang ada teks dengan status B atau S
        const allLabels = Object.keys(opts).sort();
        correctStr = allLabels.filter(lbl => opts[lbl]).map(lbl => lbl + ':' + (opts[lbl].correct ? 'B' : 'S')).join(',');
      } else {
        correctStr = correctEntries.map(([lbl]) => lbl).join(',');
      }

      // Kumpulkan gambar
      if (q.question_image) addImg(q.question_image, `Soal no.${idx+1}`);
      ['A','B','C','D','E'].forEach(lbl => {
        if (opts[lbl]?.image) addImg(opts[lbl].image, `Soal no.${idx+1} opsi ${lbl}`);
      });

      return {
        question_text: stripHtml(q.question_text),
        image:         getRef(q.question_image),
        points:        q.points || 1,
        correct:       correctStr,
        question_type: qtype,
        A: stripHtml(opts['A']?.text), B: stripHtml(opts['B']?.text),
        C: stripHtml(opts['C']?.text), D: stripHtml(opts['D']?.text),
        E: stripHtml(opts['E']?.text),
        image_a: getRef(opts['A']?.image),
        image_b: getRef(opts['B']?.image),
        image_c: getRef(opts['C']?.image),
        image_d: getRef(opts['D']?.image),
        image_e: getRef(opts['E']?.image),
        difficulty: q.difficulty || 'MEDIUM',
        subject:    q.subject_code || q.subject_name || '',
        chapter:    q.chapter || '',
        tags:       q.tags || '',
        class_level: q.class_level || ''
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['question_text','image','points','correct','question_type','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e','difficulty','subject','chapter','tags','class_level']
    });
    ws['!cols'] = [{wch:60},{wch:20},{wch:8},{wch:12},{wch:12},{wch:30},{wch:30},{wch:30},{wch:30},{wch:30},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20},{wch:10},{wch:15},{wch:20},{wch:25},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');

    // Tambahkan sheet Daftar Gambar jika ada
    if (imgList.length > 1) {
      const wsImg = XLSX.utils.aoa_to_sheet(imgList);
      wsImg['!cols'] = [{wch:35},{wch:70},{wch:25}];
      XLSX.utils.book_append_sheet(wb, wsImg, 'Daftar Gambar');
    }

    // Sheet Panduan
    const panduan = [
      ['PANDUAN IMPORT BANK SOAL'],[''],
      ['Kolom','Keterangan'],
      ['question_text','Teks soal (wajib)'],
      ['image','Nama file gambar soal (opsional)'],
      ['points','Poin soal (default: 1)'],
      ['correct','Kunci jawaban: MCQ=A/B/C/D/E; CHECKBOX=A,C; MULTI_TF=A:B,B:S,C:B (wajib)'],
      ['question_type','MCQ / CHECKBOX / TRUE_FALSE / MULTI_TF (default MCQ)'],
      ['A - E','Teks opsi. Boleh kosong jika ada gambar di image_a-image_e'],
      ['image_a - image_e','Nama file gambar per opsi (opsional)'],
      ['difficulty','EASY / MEDIUM / HARD'],
      ['subject','Kode/nama mata pelajaran'],
      ['chapter','Bab/materi'],
      ['tags','Tag pencarian, pisah koma'],
      [''],['Catatan:'],
      ['- Lihat sheet "Daftar Gambar" untuk download gambar'],
      ['- Upload gambar via menu "Upload Gambar Bank Soal" setelah import'],
      ['- MULTI_TF: kunci format A:B,B:S,C:B -- B=Benar S=Salah'],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:15},{wch:70}];
    XLSX.utils.book_append_sheet(wb, wsPanduan, 'Panduan');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Jika ada gambar → ZIP berisi Excel + folder gambar
    if (imgSeen.size > 0) {
      const JSZip = require('jszip');
      const zip = new JSZip();
      zip.file('bank_soal.xlsx', xlsxBuffer);
      const imgFolder = zip.folder('gambar');
      for (const base of imgSeen) {
        const absPath = path.join(uploadDir, base);
        if (fs.existsSync(absPath)) {
          const displayName = base.replace(/^\d{10,13}_/, '');
          imgFolder.file(displayName, fs.readFileSync(absPath));
        }
      }
      zip.file('PANDUAN_IMPORT.txt',
        `PANDUAN IMPORT BANK SOAL DENGAN GAMBAR\n` +
        `=========================================\n\n` +
        `1. File Excel: bank_soal.xlsx\n` +
        `   - Kolom image, image_a-image_e berisi nama file gambar\n\n` +
        `2. Folder gambar/\n` +
        `   - Berisi semua file gambar yang dipakai soal\n\n` +
        `CARA IMPORT:\n` +
        `1. Import file bank_soal.xlsx ke Bank Soal\n` +
        `2. Buka menu "Upload Gambar Bank Soal"\n` +
        `3. Pilih semua file dari folder gambar/ dan upload sekaligus\n` +
        `4. Sistem akan mencocokkan gambar secara otomatis\n`
      );
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Disposition', 'attachment; filename="bank_soal_dengan_gambar.zip"');
      res.setHeader('Content-Type', 'application/zip');
      res.send(zipBuffer);
    } else {
      res.setHeader('Content-Disposition', 'attachment; filename="bank_soal.xlsx"');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(xlsxBuffer);
    }
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
    const firstSubject = subjects[0]?.code || subjects[0]?.name || 'KODE_MAPEL';
    const contoh = [
      // Contoh 1: MCQ biasa
      { question_text: 'Contoh MCQ: Ibu kota Indonesia adalah?',
        image: '', points: 1, correct: 'A', question_type: 'MCQ',
        A: 'Jakarta', B: 'Surabaya', C: 'Bandung', D: 'Yogyakarta', E: '',
        image_a: '', image_b: '', image_c: '', image_d: '', image_e: '',
        difficulty: 'EASY', subject: firstSubject, chapter: 'Bab 1', tags: 'geografi', class_level: 'X' },
      // Contoh 2: CHECKBOX (jawaban benar lebih dari satu, tanpa penalti)
      { question_text: 'Contoh CHECKBOX: Manakah yang termasuk bilangan prima?',
        image: '', points: 4, correct: 'A,C,D', question_type: 'CHECKBOX',
        A: '2', B: '4', C: '5', D: '7', E: '9',
        difficulty: 'MEDIUM', subject: firstSubject, chapter: 'Bab 2', tags: 'matematika,prima' },
      // Contoh 3: TRUE_FALSE (A=Benar, B=Salah)
      { question_text: 'Contoh TRUE_FALSE: Air mendidih pada 100 derajat Celcius pada tekanan normal.',
        image: '', points: 2, correct: 'A', question_type: 'TRUE_FALSE',
        A: 'Benar', B: 'Salah', C: '', D: '', E: '',
        difficulty: 'EASY', subject: firstSubject, chapter: 'Bab 1', tags: 'IPA,suhu' },
      // Contoh 4: CHECKBOX multi-jawaban lain
      { question_text: 'Contoh CHECKBOX: Manakah yang termasuk perangkat input?',
        image: '', points: 3, correct: 'A,C,E', question_type: 'CHECKBOX',
        A: 'Keyboard', B: 'Monitor', C: 'Mouse', D: 'Speaker', E: 'Touchpad',
        difficulty: 'MEDIUM', subject: firstSubject, chapter: 'Bab 2', tags: 'hardware,input' },
      // Contoh 5: MULTI_TF -- kunci per pernyataan format A:B,B:S,...
      { question_text: 'Contoh MULTI_TF: Perhatikan pernyataan tentang proses fotosintesis.',
        image: '', points: 4, correct: 'A:B,B:S,C:B,D:B', question_type: 'MULTI_TF',
        A: 'Fotosintesis membutuhkan cahaya matahari', B: 'CO2 dihasilkan pada fotosintesis',
        C: 'Klorofil berperan sebagai pigmen', D: 'O2 dilepaskan sebagai produk samping', E: '',
        difficulty: 'MEDIUM', subject: firstSubject, chapter: 'Bab 3', tags: 'biologi,fotosintesis' },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh, {
      header: ['question_text','image','points','correct','question_type','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e','difficulty','subject','chapter','tags','class_level']
    });
    ws['!cols'] = [{wch:60},{wch:20},{wch:8},{wch:12},{wch:12},{wch:30},{wch:30},{wch:30},{wch:30},{wch:30},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20},{wch:10},{wch:15},{wch:20},{wch:25},{wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Soal');
    const panduan = [
      ['Kolom','Keterangan','Wajib','Contoh'],
      ['question_text','Teks pertanyaan (boleh HTML dari editor)','Ya','Manakah yang termasuk bilangan prima?'],
      ['image','Nama file gambar soal (opsional, upload terpisah)','Tidak','gambar1.jpg'],
      ['points','Poin soal (angka, default 1)','Tidak','1'],
      ['correct','Kunci jawaban. MCQ: huruf tunggal. CHECKBOX: pisah koma. TRUE_FALSE: A atau B','Ya','A atau A,C,D'],
      ['question_type','Tipe soal: MCQ / CHECKBOX / TRUE_FALSE (default: MCQ)','Tidak','CHECKBOX'],
      ['A','Teks opsi A','Ya (kecuali TRUE_FALSE sudah otomatis)','Jakarta'],
      ['B','Teks opsi B','Ya','Surabaya'],
      ['C','Teks opsi C','Ya (tidak wajib untuk TRUE_FALSE)','Bandung'],
      ['D','Teks opsi D','Ya (tidak wajib untuk TRUE_FALSE)','Yogyakarta'],
      ['E','Teks opsi E (opsional)','Tidak',''],
      ['difficulty','Tingkat kesulitan: EASY / MEDIUM / HARD','Tidak','MEDIUM'],
      ['subject', `Kode/nama mata pelajaran. Tersedia: ${subjectList}`, 'Ya', firstSubject],
      ['chapter','Bab atau topik soal','Tidak','Bab 1 - Trigonometri'],
      ['tags','Tag pencarian, pisahkan dengan koma','Tidak','integral, turunan'],
      ['','','',''],
      ['--- PANDUAN TIPE SOAL ---','','',''],
      ['MCQ','Pilihan ganda biasa. correct = 1 huruf (A/B/C/D/E)','','correct: A'],
      ['CHECKBOX','Multi-jawaban. Tiap jawaban benar = poin proporsional tanpa penalti. correct = huruf dipisah koma','','correct: A,C,D'],
      ['TRUE_FALSE','Pernyataan benar/salah. Opsi A=Benar, B=Salah. correct = A atau B','','correct: A'],
      ['MULTI_TF','Benar/Salah per pernyataan. correct = pasangan LABEL:B/S dipisah koma','','correct: A:B,B:S,C:B'],
      ['--- POIN PARSIAL COMPLEX/CHECKBOX ---','','',''],
      ['','Rumus: floor(benar_dipilih / total_benar x poin). Tanpa penalti untuk pilihan salah.','',''],
      ['','Contoh: poin=4, benar ada 3 (A,C,D), siswa pilih A,C -> dapat 2/3 x 4 = 2 poin','',''],
      ['--- POIN PARSIAL MULTI_TF ---','','',''],
      ['','Rumus: floor(pernyataan_benar / jumlah_pernyataan x poin)','',''],
      ['','Contoh: poin=4, ada 4 pernyataan, siswa benar 3 -> dapat 3/4 x 4 = 3 poin','',''],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:22},{wch:65},{wch:8},{wch:20}];
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
      fileMap[orig.toLowerCase()] = stored;
    }
    let updated = 0;

    // 1. Cocokkan gambar soal (question_image)
    const [questions] = await pool.query('SELECT id, question_image FROM question_bank WHERE teacher_id = $1', [user.id]);
    for (const q of questions) {
      const imgVal = (q.question_image || '').trim();
      if (!imgVal || imgVal.startsWith('http') || imgVal.startsWith('/public/')) continue;
      const base = path.basename(imgVal);
      const matched = fileMap[base] || fileMap[base.replace(/\.[^.]+$/, '')] || fileMap[base.toLowerCase()] || null;
      if (matched) {
        await pool.query('UPDATE question_bank SET question_image = $1 WHERE id = $2', [matched, q.id]);
        updated++;
      }
    }

    // 2. Cocokkan gambar opsi (option_image)
    const [opts] = await pool.query(
      `SELECT qbo.id, qbo.option_image, qbo.option_label, qbo.question_bank_id
       FROM question_bank_options qbo
       JOIN question_bank qb ON qb.id = qbo.question_bank_id
       WHERE qb.teacher_id = $1
       ORDER BY qbo.question_bank_id ASC, qbo.option_label ASC`,
      [user.id]
    );

    // Kelompokkan per question_bank_id untuk pola q{N}_{label}
    const qbOptsMap = {};
    for (const o of opts) {
      if (!qbOptsMap[o.question_bank_id]) qbOptsMap[o.question_bank_id] = {};
      qbOptsMap[o.question_bank_id][o.option_label] = o;
    }
    const qbIds = Object.keys(qbOptsMap);

    // Cocokkan option_image yang berisi nama file mentah
    for (const opt of opts) {
      const imgVal = (opt.option_image || '').trim();
      if (!imgVal || imgVal.startsWith('http') || imgVal.startsWith('/public/')) continue;
      const base = path.basename(imgVal);
      const matched = fileMap[base] || fileMap[base.replace(/\.[^.]+$/, '')] || fileMap[base.toLowerCase()] || null;
      if (matched) {
        await pool.query('UPDATE question_bank_options SET option_image = $1 WHERE id = $2', [matched, opt.id]);
        updated++;
      }
    }

    // Cocokkan pola q{N}_{label}.ext
    for (const [origName, storedPath] of Object.entries(fileMap)) {
      if (!origName.includes('.')) continue;
      const mQ = origName.match(/^q(\d+)[_-]?([a-eA-E])\.[^.]+$/i);
      if (!mQ) continue;
      const qIdx = parseInt(mQ[1]) - 1;
      const lbl = mQ[2].toUpperCase();
      const qbid = qbIds[qIdx];
      if (qbid && qbOptsMap[qbid]?.[lbl] && !qbOptsMap[qbid][lbl].option_image?.startsWith('/public/')) {
        await pool.query('UPDATE question_bank_options SET option_image = $1 WHERE id = $2', [
          storedPath, qbOptsMap[qbid][lbl].id
        ]);
        updated++;
      }
    }

    req.flash('success', 'Berhasil mengupdate ' + updated + ' gambar soal/opsi.');
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
      const wb = XLSX.readFile(file.path, { cellDates: true, cellText: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
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
      const [subjects] = await pool.query('SELECT id, code, name FROM subjects ORDER BY name ASC');
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
        // Gambar per opsi (sama seperti import ujian)
        const image_a = resolveImg(pickVal(row, ['image_a','gambar_a','img_a']));
        const image_b = resolveImg(pickVal(row, ['image_b','gambar_b','img_b']));
        const image_c = resolveImg(pickVal(row, ['image_c','gambar_c','img_c']));
        const image_d = resolveImg(pickVal(row, ['image_d','gambar_d','img_d']));
        const image_e = resolveImg(pickVal(row, ['image_e','gambar_e','img_e']));
        const qtypeRaw = String(pickVal(row, ['question_type','tipe','type']) || 'MCQ').trim().toUpperCase();
        const classLevelRaw = String(pickVal(row, ['class_level','kelas','tingkat']) || '').trim().toUpperCase();
        const validClassLevel = ['X','XI','XII'].includes(classLevelRaw) ? classLevelRaw : null;
        // Normalise: COMPLEX → CHECKBOX agar konsisten
        const rawQtype = ['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX','MULTI_TF'].includes(qtypeRaw) ? qtypeRaw : 'MCQ';
        // Treat COMPLEX sama seperti CHECKBOX (multi-jawaban)
        const validQtype = rawQtype === 'COMPLEX' ? 'COMPLEX' : rawQtype;
        const isMulti = validQtype === 'COMPLEX' || validQtype === 'CHECKBOX';

        if (!question_text) reasons.push('Kolom question_text kosong');

        // Validasi opsi — sesuai tipe soal
        if (validQtype === 'TRUE_FALSE') {
          if (!A && !image_a) reasons.push('TRUE_FALSE: opsi A wajib diisi');
          if (!B && !image_b) reasons.push('TRUE_FALSE: opsi B wajib diisi');
        } else if (validQtype === 'MULTI_TF') {
          if (!A && !image_a) reasons.push('MULTI_TF: pernyataan A wajib diisi');
          if (!B && !image_b) reasons.push('MULTI_TF: pernyataan B wajib diisi');
        } else {
          // MCQ / COMPLEX / CHECKBOX wajib punya A, B — C dan D boleh kosong jika ada 2 opsi cukup
          if (!A && !image_a) reasons.push('Opsi A wajib terisi (teks atau gambar)');
          if (!B && !image_b) reasons.push('Opsi B wajib terisi (teks atau gambar)');
        }

        // Validasi kunci jawaban sesuai tipe
        const correctRaw = String(correct).trim();
        let correctLabels = [];
        let correctMap = null;
        if (validQtype === 'MULTI_TF') {
          correctMap = {};
          const parts = correctRaw.split(',').map(s => s.trim()).filter(Boolean);
          for (const p of parts) {
            const m = p.match(/^([A-E]):([BS])$/i);
            if (m) correctMap[m[1].toUpperCase()] = m[2].toUpperCase() === 'B';
          }
          if (Object.keys(correctMap).length < 2) {
            reasons.push('MULTI_TF: minimal 2 pernyataan wajib diisi (format kunci: A:B,B:S,C:B)');
          }
        } else if (isMulti) {
          correctLabels = correctRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
          if (correctLabels.length === 0 || !correctLabels.every(l => ['A','B','C','D','E'].includes(l))) {
            reasons.push('Kunci jawaban tidak valid (gunakan A/B/C/D/E, untuk COMPLEX/CHECKBOX pisahkan dengan koma)');
          }
        } else {
          correctLabels = [correctRaw.toUpperCase()];
          if (!['A','B','C','D','E'].includes(correctLabels[0])) {
            reasons.push('Kunci jawaban tidak valid (gunakan A/B/C/D/E, untuk COMPLEX/CHECKBOX pisahkan dengan koma)');
          }
        }
        let subject_id = null;
        if (subjectRaw) {
          subject_id = subjectMap.get(subjectRaw.toLowerCase()) || null;
          if (!subject_id) reasons.push('Mata pelajaran "' + subjectRaw + '" tidak ditemukan');
        }
        const validDiff = ['EASY','MEDIUM','HARD'].includes(difficulty) ? difficulty : 'MEDIUM';
        const item = { rowNo, question_text, question_image, points,
          correct: validQtype === 'MULTI_TF' ? Object.entries(correctMap || {}).map(([k,v]) => k + ':' + (v ? 'B' : 'S')).join(',') : (isMulti ? correctLabels.join(',') : (correctLabels[0] || '')),
          correctLabels,
          correctMap,
          question_type: validQtype,
          subject_id, subjectRaw,
          difficulty: validDiff, chapter, tags,
          class_level: validClassLevel,
          options: { A, B, C, D, E },
          option_images: { A: image_a, B: image_b, C: image_c, D: image_d, E: image_e }
        };
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
      const qtype = r.question_type || 'MCQ';
      const [res2] = await conn.query(
        'INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, points, difficulty, tags, question_type, class_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [user.id, sid, r.chapter || null, r.question_text, r.question_image || null, r.points || 1, r.difficulty || 'MEDIUM', r.tags || null, qtype, r.class_level || null]
      );
      const bankId = res2.insertId;
      // Tentukan correctLabels / correctMap sesuai tipe
      let correctLabels = [];
      let correctMap = null;
      if (qtype === 'MULTI_TF') {
        correctMap = r.correctMap || {};
        // Fallback: parse dari r.correct string "A:B,B:S"
        if (!Object.keys(correctMap).length && r.correct) {
          correctMap = {};
          String(r.correct).split(',').forEach(p => {
            const m = p.trim().match(/^([A-E]):([BS])$/i);
            if (m) correctMap[m[1].toUpperCase()] = m[2].toUpperCase() === 'B';
          });
        }
      } else {
        correctLabels = r.correctLabels || (r.correct ? String(r.correct).split(',').map(s => s.trim().toUpperCase()) : ['A']);
      }
      for (const lbl of ['A','B','C','D','E']) {
        const optText = r.options?.[lbl] || '';
        const optImg = r.option_images?.[lbl] || null;
        if (!optText && !optImg) continue;
        let isc;
        if (qtype === 'MULTI_TF') {
          isc = (correctMap !== null && correctMap[lbl] !== undefined) ? correctMap[lbl] : false;
        } else {
          isc = correctLabels.includes(lbl);
        }
        await conn.query(
          'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, option_image, is_correct) VALUES ($1,$2,$3,$4,$5)',
          [bankId, lbl, optText, optImg, isc]
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
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct, question_type, class_level } = req.body;
  const qtype = question_type || 'MCQ';

  if (!subject_id || !question_text) {
    req.flash('error', 'Mata pelajaran dan pertanyaan wajib diisi');
    return res.redirect('/teacher/question-bank/new');
  }
  if (qtype === 'TRUE_FALSE' && (!a || !b)) {
    req.flash('error', 'Opsi A (Benar) dan B (Salah) wajib diisi');
    return res.redirect('/teacher/question-bank/new');
  }
  if (qtype === 'MULTI_TF' && (!a || !b)) {
    req.flash('error', 'MULTI_TF: minimal pernyataan A dan B harus diisi');
    return res.redirect('/teacher/question-bank/new');
  }
  if (qtype !== 'TRUE_FALSE' && qtype !== 'MULTI_TF' && (!a || !b || !c || !d)) {
    req.flash('error', 'Minimal opsi A-D wajib diisi');
    return res.redirect('/teacher/question-bank/new');
  }

  // Kunci jawaban
  let correctLabels = [];
  let correctMap = null;
  if (qtype === 'MULTI_TF') {
    correctMap = {};
    for (const lbl of ['A','B','C','D','E']) {
      const val = req.body['correct_' + lbl];
      if (val === 'B') correctMap[lbl] = true;
      else if (val === 'S') correctMap[lbl] = false;
    }
    if (Object.keys(correctMap).length < 2) {
      req.flash('error', 'MULTI_TF: minimal 2 pernyataan wajib memiliki kunci jawaban (B/S)');
      return res.redirect('/teacher/question-bank/new');
    }
  } else if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
    const rawCorrect = req.body.correct;
    if (Array.isArray(rawCorrect)) correctLabels = rawCorrect.map(s => s.toUpperCase());
    else if (rawCorrect) correctLabels = String(rawCorrect).split(',').map(s => s.trim().toUpperCase());
  } else {
    correctLabels = [String(correct || 'A').toUpperCase()];
  }

  if ((qtype === 'COMPLEX' || qtype === 'CHECKBOX') && correctLabels.length === 0) {
    req.flash('error', 'Soal ' + qtype + ' harus memiliki minimal 1 jawaban benar');
    return res.redirect('/teacher/question-bank/new');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const imageFile = req.files?.image?.[0];
    const pdfFile   = req.files?.pdf?.[0];
    const [result] = await conn.query(
      'INSERT INTO question_bank (teacher_id, subject_id, chapter, question_text, question_image, question_pdf, points, difficulty, tags, question_type, class_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
      [user.id, subject_id, chapter || null, question_text,
       imageFile ? '/public/uploads/questions/' + path.basename(imageFile.filename) : null,
       pdfFile   ? '/public/uploads/questions/' + path.basename(pdfFile.filename)   : null,
       Number(points || 1), difficulty || 'MEDIUM', tags || null, qtype, class_level || null]
    );
    const bankId = result.insertId;

    const optsToInsert = qtype === 'TRUE_FALSE'
      ? [['A', a || 'Benar'], ['B', b || 'Salah']]
      : [['A',a],['B',b],['C',c||''],['D',d||''],['E',e||'']];

    for (const [lbl, txt] of optsToInsert) {
      if (!txt) continue;
      let isc;
      if (qtype === 'MULTI_TF') {
        isc = (correctMap !== null && correctMap[lbl] !== undefined) ? correctMap[lbl] : false;
      } else {
        isc = correctLabels.includes(lbl);
      }
      await conn.query(
        'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4)',
        [bankId, lbl, txt, isc]
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
    res.render('teacher/question_bank_detail', { title: 'Detail Bank Soal', question, options, usage, backUrl: '/teacher/question-bank' });
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
    const correctLabels = [];
    const correctMap = {};
    for (const o of options) {
      byLabel[o.option_label] = o.option_text;
      correctMap[o.option_label] = !!o.is_correct;
      if (o.is_correct) { correct = o.option_label; correctLabels.push(o.option_label); }
    }
    const [subjects] = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.render('teacher/question_bank_edit', { title: 'Edit Bank Soal', question, options: byLabel, correct_label: correct, correct_labels: correctLabels, correct_map: correctMap, subjects });
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
  const { subject_id, chapter, question_text, points, difficulty, tags, a, b, c, d, e, correct, remove_image, remove_pdf, question_type, class_level } = req.body;
  if (!subject_id || !question_text) {
    req.flash('error', 'Mata pelajaran dan pertanyaan wajib diisi');
    return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
  }
  const existing = firstRow(await pool.query('SELECT * FROM question_bank WHERE id = $1 AND teacher_id = $2 LIMIT 1', [req.params.id, user.id]));
  if (!existing) { req.flash('error', 'Akses ditolak'); return res.redirect('/teacher/question-bank'); }
  const qtype = question_type || existing.question_type || 'MCQ';

  if (qtype === 'MULTI_TF' && (!a || !b)) {
    req.flash('error', 'MULTI_TF: minimal pernyataan A dan B harus diisi');
    return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
  }
  if (qtype !== 'TRUE_FALSE' && qtype !== 'MULTI_TF' && (!a || !b || !c || !d)) {
    req.flash('error', 'Semua field wajib diisi');
    return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
  }

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
      'UPDATE question_bank SET subject_id=$1, chapter=$2, question_text=$3, question_image=$4, question_pdf=$5, points=$6, difficulty=$7, tags=$8, class_level=$9, updated_at=NOW() WHERE id=$10',
      [subject_id, chapter || null, question_text, imageToSave, pdfToSave, Number(points || 1), difficulty || 'MEDIUM', tags || null, class_level || null, req.params.id]
    );

    // Parse correct key
    let corrLabels = [];
    let correctMap = null;
    if (qtype === 'MULTI_TF') {
      correctMap = {};
      for (const lbl of ['A','B','C','D','E']) {
        const val = req.body['correct_' + lbl];
        if (val === 'B') correctMap[lbl] = true;
        else if (val === 'S') correctMap[lbl] = false;
      }
      if (Object.keys(correctMap).length < 2) {
        await conn.rollback();
        conn.release();
        req.flash('error', 'MULTI_TF: minimal 2 pernyataan wajib memiliki kunci jawaban (B/S)');
        return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
      }
    } else if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
      const rawCorrect = req.body.correct;
      if (Array.isArray(rawCorrect)) corrLabels = rawCorrect.map(s => s.toUpperCase());
      else if (rawCorrect) corrLabels = String(rawCorrect).split(',').map(s => s.trim().toUpperCase());
    } else {
      corrLabels = correct ? [String(correct).toUpperCase()] : ['A'];
    }
    if ((qtype === 'COMPLEX' || qtype === 'CHECKBOX') && corrLabels.length === 0) {
      await conn.rollback();
      conn.release();
      req.flash('error', 'Soal ' + qtype + ' harus memiliki minimal 1 jawaban benar');
      return res.redirect('/teacher/question-bank/' + req.params.id + '/edit');
    }

    const optsToUpsert = qtype === 'TRUE_FALSE'
      ? [['A', a || 'Benar'], ['B', b || 'Salah']]
      : [['A',a],['B',b],['C',c||''],['D',d||''],['E',e||'']];

    for (const [lbl, txt] of optsToUpsert) {
      if (!txt) continue;
      let isc;
      if (qtype === 'MULTI_TF') {
        isc = (correctMap !== null && correctMap[lbl] !== undefined) ? correctMap[lbl] : false;
      } else {
        isc = corrLabels.includes(lbl);
      }
      await conn.query(
        'INSERT INTO question_bank_options (question_bank_id, option_label, option_text, is_correct) VALUES ($1,$2,$3,$4) ON CONFLICT (question_bank_id, option_label) DO UPDATE SET option_text=EXCLUDED.option_text, is_correct=EXCLUDED.is_correct',
        [req.params.id, lbl, txt, isc]
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

// ===== BULK DELETE =====
router.post('/bulk-delete', async (req, res) => {
  const user = req.session.user;
  let ids = req.body['ids[]'] || req.body.ids || [];
  if (typeof ids === 'string') ids = [ids];
  const validIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!validIds.length) {
    req.flash('error', 'Tidak ada soal yang dipilih.');
    return res.redirect('/teacher/question-bank');
  }
  try {
    const ph = validIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await pool.query(
      `DELETE FROM question_bank WHERE id IN (${ph}) AND teacher_id = $1`,
      [user.id, ...validIds]
    );
    const deleted = result[0]?.affectedRows || validIds.length;
    req.flash('success', `${deleted} soal berhasil dihapus dari bank soal.`);
  } catch (e) {
    console.error('Bulk delete error:', e);
    req.flash('error', 'Gagal menghapus soal: ' + e.message);
  }
  res.redirect('/teacher/question-bank');
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
  const { subject_id, difficulty, search, class_level } = req.query;
  try {
    const params = [user.id];
    let query = `SELECT qb.id, qb.subject_id, qb.question_text, qb.points, qb.difficulty,
      qb.tags, qb.chapter, qb.question_type, qb.class_level, s.name AS subject_name
      FROM question_bank qb JOIN subjects s ON s.id = qb.subject_id WHERE qb.teacher_id = $1`;
    if (subject_id) { params.push(subject_id); query += ` AND qb.subject_id = $${params.length}`; }
    if (difficulty) { params.push(difficulty); query += ` AND qb.difficulty = $${params.length}`; }
    if (class_level) { params.push(class_level); query += ` AND qb.class_level = $${params.length}`; }
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

// ===== TEMPLATE WORD BANK SOAL =====
router.get('/import/template-word', (req, res) => {
  const staticFile = path.join(__dirname, '../public/templates/import_template_word.docx');
  if (fs.existsSync(staticFile)) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_soal_bank.docx"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(staticFile);
  }
  res.download(path.join(__dirname, '../public/templates/import_template_word.txt'), 'template_import_soal_bank.txt');
});

// ===== IMPORT WORD BANK SOAL =====
router.post('/import/preview-word', uploadImport.single('file'), async (req, res) => {
  const user = req.session.user;
  const file = req.file;
  if (!file) {
    req.flash('error', 'File Word (.docx) belum dipilih.');
    return res.redirect('/teacher/question-bank/import');
  }

  try {
    const mammoth = require('mammoth');
    const cheerio = require('cheerio');

    const imageMap = {};
    let imgCounter = 0;

    const result = await mammoth.convertToHtml(
      { path: file.path },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const ct = String(image.contentType || 'image/png');
            const ext = (ct.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
            const fname = `${Date.now()}_${nanoid(10)}.${ext}`;
            const buf = await image.read('base64').then(b64 => Buffer.from(b64, 'base64'));
            fs.writeFileSync(path.join(uploadDir, fname), buf);
            const src = `/public/uploads/questions/${fname}`;
            imageMap[imgCounter++] = src;
            return { src, 'data-img-idx': String(imgCounter - 1) };
          } catch(imgErr) {
            return { src: '' };
          }
        })
      }
    );

    const html = result.value || '';
    const $ = cheerio.load(html);
    const blocks = [];
    $('body').children().each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\u00a0/g, ' ').trim();
      const imgs = [];
      $el.find('img').each((__, img) => { const src = $(img).attr('src'); if (src) imgs.push(src); });
      if ($el.is('img')) { const src = $el.attr('src'); if (src) imgs.push(src); }
      if (text || imgs.length) blocks.push({ text, imgs });
    });

    // Parser sama seperti teacher.js import Word
    const parsed = [];
    let cur = null;
    let lastLabel = null;

    const startNew = (qText, imgs = []) => {
      if (cur) parsed.push(cur);
      cur = {
        question_text: qText.trim(),
        question_image: imgs[0] || null,
        points: 1, correct: null, correctLabels: [], correctMap: null,
        question_type: 'MCQ',
        options: { A: '', B: '', C: '', D: '', E: '' },
        option_images: { A: null, B: null, C: null, D: null, E: null }
      };
      lastLabel = null;
    };

    for (const b of blocks) {
      const t = String(b.text || '').trim();
      const imgs = b.imgs || [];
      if (!t && imgs.length) {
        if (cur) {
          if (lastLabel && !cur.option_images[lastLabel]) cur.option_images[lastLabel] = imgs[0];
          else if (!cur.question_image) cur.question_image = imgs[0];
        }
        continue;
      }
      if (!t) continue;
      const mQ = t.match(/^\s*(\d+)\s*[.)]\s*(.*)$/);
      if (mQ) { startNew(mQ[2], imgs); continue; }
      if (!cur) continue;
      const mOpt = t.match(/^\s*([A-E])\s*[.)]\s*(.*)$/i);
      if (mOpt) {
        const lbl = mOpt[1].toUpperCase();
        cur.options[lbl] = mOpt[2].trim();
        lastLabel = lbl;
        if (imgs.length && !cur.option_images[lbl]) cur.option_images[lbl] = imgs[0];
        continue;
      }
      const mStmtKey = t.match(/^\s*KUNCI_([A-E])\s*[:=]\s*([BS])\s*$/i);
      if (mStmtKey) {
        if (!cur.correctMap) cur.correctMap = {};
        cur.correctMap[mStmtKey[1].toUpperCase()] = mStmtKey[2].toUpperCase() === 'B';
        lastLabel = null; continue;
      }
      const mKey = t.match(/^\s*KUNCI\s*[:=]\s*([A-E,\s]+)\s*$/i);
      if (mKey) {
        const correctStr = mKey[1].replace(/\s/g, '').toUpperCase();
        cur.correct = correctStr;
        cur.correctLabels = correctStr.split(',').filter(Boolean);
        lastLabel = null; continue;
      }
      const mType = t.match(/^\s*TIPE\s*[:=]\s*(MCQ|COMPLEX|TRUE_FALSE|CHECKBOX|MULTI_TF)\s*$/i);
      if (mType) { cur.question_type = mType[1].toUpperCase(); lastLabel = null; continue; }
      const mPts = t.match(/^\s*(NILAI|POIN)\s*[:=]\s*(\d+(?:\.\d+)?)\s*$/i);
      if (mPts) { cur.points = Number(mPts[2]) || 1; lastLabel = null; continue; }
      if (imgs.length && !cur.question_image) cur.question_image = imgs[0];
      if (!lastLabel) cur.question_text = (cur.question_text ? cur.question_text + '\n' : '') + t;
      else cur.options[lastLabel] = (cur.options[lastLabel] ? cur.options[lastLabel] + ' ' : '') + t;
    }
    if (cur) parsed.push(cur);

    const preview = [], errors = [];
    parsed.forEach((q, idx) => {
      const reasons = [];
      const qt = String(q.question_text || '').trim();
      const qtype = String(q.question_type || 'MCQ').toUpperCase();
      const A = String(q.options.A || '').trim();
      const B = String(q.options.B || '').trim();
      const imgO = q.option_images || {};
      if (!qt && !q.question_image) reasons.push('Teks soal kosong');
      if (qtype === 'MULTI_TF') {
        const cm = q.correctMap || {};
        const hasA = A || imgO.A; const hasB = B || imgO.B;
        if (!hasA || !hasB) reasons.push('MULTI_TF: minimal pernyataan A dan B wajib');
        if (Object.keys(cm).length < 2) reasons.push('MULTI_TF: minimal 2 kunci (KUNCI_A: B, KUNCI_B: S, ...)');
      } else if (qtype === 'TRUE_FALSE') {
        if (!A || !B) reasons.push('Opsi A dan B wajib untuk TRUE_FALSE');
        const cl = q.correctLabels || [];
        if (!cl.length || !['A','B'].includes(cl[0])) reasons.push('KUNCI harus A atau B untuk TRUE_FALSE');
      } else {
        const hasA = A || imgO.A; const hasB = B || imgO.B;
        const hasC = String(q.options.C||'').trim() || imgO.C;
        const hasD = String(q.options.D||'').trim() || imgO.D;
        const hasE = String(q.options.E||'').trim() || imgO.E;
        if (!hasA || !hasB || !hasC || !hasD || !hasE) reasons.push('Opsi A-E wajib terisi untuk MCQ/CHECKBOX');
        const cl = q.correctLabels || [];
        if (!cl.length) reasons.push('KUNCI harus diisi');
      }
      const item = {
        rowNo: idx + 1, question_text: qt || '(gambar)',
        question_image: q.question_image, points: q.points,
        correct: q.correctMap
          ? Object.entries(q.correctMap).map(([l,v]) => l+':'+(v?'B':'S')).join(',')
          : (q.correctLabels||[]).join(',') || q.correct || '',
        correctLabels: q.correctLabels || [],
        correctMap: q.correctMap || null,
        question_type: qtype,
        options: { A: String(q.options.A||''), B: String(q.options.B||''), C: String(q.options.C||''), D: String(q.options.D||''), E: String(q.options.E||'') },
        option_images: q.option_images
      };
      if (reasons.length) errors.push({ rowNo: idx + 1, reasons, snapshot: item });
      else preview.push(item);
    });

    const importId = nanoid(12);
    req.session.bankWordImportPreview = { importId, preview, errors, createdAt: Date.now() };
    try { fs.unlinkSync(file.path); } catch(_) {}

    const [subjects] = await pool.query('SELECT id, code, name FROM subjects ORDER BY name ASC');
    return res.render('teacher/question_bank_import_preview', {
      title: 'Preview Import Word - Bank Soal',
      importId, preview, errors,
      subjects, source: 'word',
      commitUrl: '/teacher/question-bank/import/commit-word'
    });
  } catch(e) {
    console.error(e);
    try { fs.unlinkSync(file.path); } catch(_) {}
    req.flash('error', 'Gagal import Word: ' + e.message);
    return res.redirect('/teacher/question-bank/import');
  }
});

// ===== COMMIT IMPORT WORD BANK SOAL =====
router.post('/import/commit-word', async (req, res) => {
  const user = req.session.user;
  const { importId, default_subject_id } = req.body;
  const sess = req.session.bankWordImportPreview;
  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid. Upload ulang.');
    return res.redirect('/teacher/question-bank/import');
  }
  const items = sess.preview || [];
  if (!items.length) {
    req.flash('error', 'Tidak ada soal valid untuk disimpan.');
    return res.redirect('/teacher/question-bank/import');
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  try {
    await conn.beginTransaction();
    for (const r of items) {
      const qtype = r.question_type || 'MCQ';
      const subjectId = default_subject_id ? parseInt(default_subject_id) : null;
      const [qRes] = await conn.query(
        `INSERT INTO question_bank (teacher_id, subject_id, question_text, question_image, points, difficulty, question_type)
         VALUES ($1,$2,$3,$4,$5,'MEDIUM',$6) RETURNING id`,
        [user.id, subjectId, r.question_text, r.question_image || null, r.points || 1, qtype]
      );
      const qid = qRes[0]?.id;
      if (!qid) continue;

      if (qtype === 'MULTI_TF') {
        const cm = r.correctMap || {};
        const labels = ['A','B','C','D','E'].filter(l => r.options[l] || (r.option_images && r.option_images[l]));
        for (let i = 0; i < labels.length; i++) {
          const lbl = labels[i];
          const isCorrect = cm[lbl] === true;
          await conn.query(
            `INSERT INTO question_bank_options (question_bank_id, option_label, option_text, option_image, is_correct)
             VALUES ($1,$2,$3,$4,$5)`,
            [qid, lbl, r.options[lbl] || '', r.option_images?.[lbl] || null, isCorrect]
          );
        }
      } else {
        const labelsToInsert = qtype === 'TRUE_FALSE' ? ['A','B'] : ['A','B','C','D','E'];
        for (const lbl of labelsToInsert) {
          const txt = r.options[lbl] || '';
          const img = r.option_images?.[lbl] || null;
          if (!txt && !img) continue;
          const isCorrect = (r.correctLabels || []).includes(lbl);
          await conn.query(
            `INSERT INTO question_bank_options (question_bank_id, option_label, option_text, option_image, is_correct)
             VALUES ($1,$2,$3,$4,$5)`,
            [qid, lbl, txt, img, isCorrect]
          );
        }
      }
      inserted++;
    }
    await conn.commit();
    req.session.bankWordImportPreview = null;
    req.flash('success', `${inserted} soal berhasil diimport dari Word ke bank soal.`);
    res.redirect('/teacher/question-bank');
  } catch(e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal simpan: ' + e.message);
    res.redirect('/teacher/question-bank/import');
  } finally {
    conn.release();
  }
});

module.exports = router;
