const express = require('express');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');
const { createNotificationForClass, createNotificationForMultipleClasses } = require('../utils/notifications');

// ── Invalidasi cache soal ujian di Redis + in-memory ─────────────────────────
async function invalidateExamQuestionsCache(examId, redisClient) {
  try {
    if (redisClient && redisClient.isReady) {
      const keys = await redisClient.keys(`exam:q:${examId}:*`);
      if (keys.length > 0) await redisClient.del(keys);
    }
  } catch(e) {
    console.warn('[CACHE] Gagal invalidasi cache soal exam', examId, e.message);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const router = express.Router();
router.use(requireRole('TEACHER', 'ADMIN'));

// SQL untuk urut kelas: tingkat (X < XI < XII) lalu jurusan alfabet lalu nomor
const CLASS_ORDER_SQL = `
  CASE
    WHEN name ~* '^XII' THEN 3
    WHEN name ~* '^XI'  THEN 2
    WHEN name ~* '^X'   THEN 1
    ELSE 4
  END,
  regexp_replace(upper(name), '^(XII|XI|X)\\s+', '') ASC,
  (regexp_match(name, '(\\d+)\\s*$'))[1]::int NULLS LAST
`;

// Helper: admin bisa akses semua data, teacher hanya miliknya sendiri
// Gunakan di query: WHERE (:isAdmin=1 OR e.teacher_id=:tid)
function teacherFilter(user) {
  return {
    tid: user.id,
    isAdmin: user.role === 'ADMIN' ? 1 : 0
  };
}

// Upload config (gambar soal & import)
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, '..', 'public', 'uploads');
const uploadDir = path.join(UPLOAD_ROOT, 'questions');
fs.mkdirSync(uploadDir, { recursive: true });

// Ekstensi berbahaya yang TIDAK boleh diupload (dipakai semua multer config)
const DANGEROUS_EXTENSIONS = /\.(php|php3|php4|php5|php7|phtml|phar|asp|aspx|jsp|cgi|pl|py|rb|sh|bash|cmd|bat|exe|dll|so|htaccess|htpasswd)$/i;

// Upload config untuk materi (DOCX -> HTML + gambar)
const materialsDir = path.join(UPLOAD_ROOT, 'materials');
const materialsTmpDir = path.join(materialsDir, 'tmp');
fs.mkdirSync(materialsDir, { recursive: true });
fs.mkdirSync(materialsTmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // keep original name (sanitized) so it can be referenced from import sheet
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    if (DANGEROUS_EXTENSIONS.test(file.originalname)) {
      return cb(new Error(`File "${file.originalname}" tidak diizinkan.`), false);
    }
    cb(null, true);
  }
});

const uploadDocx = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB docx
  fileFilter: (req, file, cb) => {
    if (DANGEROUS_EXTENSIONS.test(file.originalname)) {
      return cb(new Error(`File "${file.originalname}" tidak diizinkan.`), false);
    }
    cb(null, true);
  }
});

const storageMaterialsUpload = multer.diskStorage({
  destination: (req, file, cb) => {
    // DOCX goes to tmp (will be converted then deleted), PDF goes to permanent materialsDir
    if (file.fieldname === 'docx') return cb(null, materialsTmpDir);
    return cb(null, materialsDir);
  },
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
    cb(null, `${Date.now()}_${safe}`);
  }
});

// Hanya izinkan PDF dan DOCX berdasarkan fieldname
const uploadMaterials = multer({
  storage: storageMaterialsUpload,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    // Blokir ekstensi berbahaya berdasarkan nama file
    if (DANGEROUS_EXTENSIONS.test(file.originalname)) {
      return cb(new Error(`File "${file.originalname}" tidak diizinkan. Hanya PDF dan DOCX yang diterima.`), false);
    }
    // Hanya izinkan PDF dan DOCX berdasarkan fieldname
    if (file.fieldname === 'pdf') {
      if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
        return cb(new Error('Hanya file PDF yang diizinkan untuk materi.'), false);
      }
    }
    if (file.fieldname === 'docx') {
      if (!file.originalname.toLowerCase().match(/\.(docx|doc)$/)) {
        return cb(new Error('Hanya file DOCX/DOC yang diizinkan untuk konversi materi.'), false);
      }
    }
    cb(null, true);
  }
});

function toYoutubeEmbedUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // Accept full iframe embed code
  const iframeMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
  const candidate = (iframeMatch ? iframeMatch[1] : raw).trim();

  // Helper: robustly extract a YouTube video id from many URL shapes.
  // Supports:
  // - https://www.youtube.com/watch?v=ID
  // - https://youtu.be/ID
  // - https://www.youtube.com/embed/ID
  // - https://www.youtube.com/shorts/ID
  // - https://www.youtube.com/live/ID
  // - plus any of the above with extra params.
  const extractId = (s) => {
    const m1 = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
    if (m1 && m1[1]) return m1[1];

    const m2 = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
    if (m2 && m2[1]) return m2[1];

    const m3 = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (m3 && m3[1]) return m3[1];

    const m4 = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/);
    if (m4 && m4[1]) return m4[1];

    const m5 = s.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/);
    if (m5 && m5[1]) return m5[1];

    return null;
  };

  let vid = extractId(candidate);

  // Fallback: try URL parsing in case the input is slightly unusual.
  if (!vid) {
    try {
      const u = new URL(candidate);
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,}$/.test(v)) vid = v;

      if (!vid) {
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.findIndex((p) => ['embed', 'shorts', 'live'].includes(p));
        if (idx >= 0 && parts[idx + 1] && /^[a-zA-Z0-9_-]{6,}$/.test(parts[idx + 1])) vid = parts[idx + 1];
      }
    } catch (_) {
      // ignore
    }
  }

  if (!vid) return null;

  // Privacy-enhanced domain + safe params.
  // If a video disallows embedding, UI will show a "Watch on YouTube" link as a fallback.
  return `https://www.youtube-nocookie.com/embed/${vid}?rel=0&modestbranding=1`;
}

// Konversi URL Google Drive /view → /preview agar bisa di-embed iframe
function normalizePdfUrl(url) {
  if (!url) return url;
  const raw = String(url).trim();
  const driveMatch = raw.match(/https:\/\/drive\.google\.com\/file\/d\/([^\/\?#]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return raw;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function resolveImagePath(cellValue, uploadedFiles = []) {
  const v = String(cellValue || '').trim();
  if (!v) return null;
  // allow remote URL
  if (/^https?:\/\//i.test(v)) return v;

  // try match by original filename (without timestamp prefix) OR by exact stored filename
  const byExact = uploadedFiles.find((f) => f.filename === v);
  if (byExact) return byExact.filename;

  const byOriginal = uploadedFiles.find((f) => String(f.originalname || '').trim() === v);
  if (byOriginal) return byOriginal.filename;

  // fallback: treat as already-stored filename
  return v;
}

function pickRowValue(row, keys) {
  const lowered = {};
  for (const k of Object.keys(row || {})) lowered[String(k).trim().toLowerCase()] = row[k];
  for (const k of keys) {
    const v = lowered[String(k).trim().toLowerCase()];
    if (v !== undefined) return v;
  }
  return '';
}

function buildImportPreview(rows, filesImages = []) {
  const uploaded = (filesImages || []).map((f) => ({ originalname: f.originalname, filename: f.filename }));
  const preview = [];
  const errors = [];

  // Helper: resolve nama file gambar → path tersimpan
  function resolveImg(val) {
    if (!val) return null;
    const v = String(val).trim();
    if (!v || v === 'undefined' || v === 'null') return null;
    if (/^https?:\/\//i.test(v)) return v;
    const base = path.basename(v);
    if (!base) return null;

    // 1. Cek dari file yang baru diupload bersamaan (originalname cocok)
    const hit = uploaded.find(u => u.originalname === base) ||
                uploaded.find(u => u.originalname.replace(/\s+/g,'_') === base);
    if (hit) return `/public/uploads/questions/${path.basename(hit.filename)}`;

    // 2. Cek file yang sudah ada di server dengan nama persis
    const absExact = path.join(uploadDir, base);
    if (fs.existsSync(absExact)) return `/public/uploads/questions/${base}`;

    // 3. Cek file yang sudah ada di server dengan prefix timestamp
    try {
      const files = fs.readdirSync(uploadDir);
      const matched = files.find(f => {
        const withoutTs = f.replace(/^\d{10,13}_/, '');
        return withoutTs === base;
      });
      if (matched) return `/public/uploads/questions/${matched}`;
    } catch (_) {}

    // 4. Simpan nama file mentah — akan di-resolve saat upload gambar terpisah
    return base;
  }

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const reasons = [];

    const question_text = String(pickRowValue(row, ['question_text', 'question', 'soal', 'pertanyaan'])).trim();
    const pointsRaw = pickRowValue(row, ['points', 'poin', 'score']);
    const points = Number(pointsRaw || 1) || 1;
    const correctRaw = String(pickRowValue(row, ['correct', 'kunci', 'answer', 'jawaban_benar'])).trim().toUpperCase();
    const qtypeRaw = String(pickRowValue(row, ['question_type','tipe','type']) || 'MCQ').trim().toUpperCase();
    const validQtype = ['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX'].includes(qtypeRaw) ? qtypeRaw : 'MCQ';
    if (qtypeRaw && qtypeRaw !== 'MCQ' && !['MCQ','COMPLEX','TRUE_FALSE','CHECKBOX'].includes(qtypeRaw)) {
      reasons.push(`Tipe soal "${qtypeRaw}" tidak dikenal. Gunakan: MCQ, CHECKBOX, TRUE_FALSE`);
    }

    // Kunci jawaban: COMPLEX/CHECKBOX bisa multi (pisah koma)
    const correctLabels = (validQtype === 'COMPLEX' || validQtype === 'CHECKBOX')
      ? correctRaw.split(',').map(s => s.trim()).filter(s => ['A','B','C','D','E'].includes(s))
      : (correctRaw && ['A','B','C','D','E'].includes(correctRaw) ? [correctRaw] : []);
    const correct = correctLabels[0] || ''; // untuk backward compat

    const A = String(pickRowValue(row, ['A', 'a', 'opsi_a'])).trim();
    const B = String(pickRowValue(row, ['B', 'b', 'opsi_b'])).trim();
    const C = String(pickRowValue(row, ['C', 'c', 'opsi_c'])).trim();
    const D = String(pickRowValue(row, ['D', 'd', 'opsi_d'])).trim();
    const E = String(pickRowValue(row, ['E', 'e', 'opsi_e'])).trim();

    // Gambar soal
    const question_image = resolveImg(pickRowValue(row, ['image', 'gambar', 'image_url', 'img']));

    // Gambar per opsi jawaban
    const image_a = resolveImg(pickRowValue(row, ['image_a', 'gambar_a', 'img_a']));
    const image_b = resolveImg(pickRowValue(row, ['image_b', 'gambar_b', 'img_b']));
    const image_c = resolveImg(pickRowValue(row, ['image_c', 'gambar_c', 'img_c']));
    const image_d = resolveImg(pickRowValue(row, ['image_d', 'gambar_d', 'img_d']));
    const image_e = resolveImg(pickRowValue(row, ['image_e', 'gambar_e', 'img_e']));

    if (!question_text) reasons.push('Kolom question_text/soal kosong');
    if (validQtype === 'TRUE_FALSE') {
      if (!A || !B) reasons.push('TRUE_FALSE: opsi A dan B wajib');
    } else {
      // Opsi boleh kosong jika ada gambar di image_a-image_e
      const hasImgA = !!image_a, hasImgB = !!image_b, hasImgC = !!image_c, hasImgD = !!image_d;
      if ((!A && !hasImgA) || (!B && !hasImgB) || (!C && !hasImgC) || (!D && !hasImgD)) {
        reasons.push('Opsi A-D wajib terisi (teks atau gambar di kolom image_a-image_d)');
      }
    }
    if (correctLabels.length === 0) reasons.push('Kunci jawaban tidak valid (gunakan A/B/C/D/E, COMPLEX pisahkan koma)');
    if (!Number.isFinite(points) || points <= 0) reasons.push('Points harus angka > 0');

    const item = {
      rowNo, question_text, question_image, points, correct,
      correctLabels, question_type: validQtype,
      options: { A, B, C, D, E },
      option_images: { A: image_a, B: image_b, C: image_c, D: image_d, E: image_e }
    };

    if (reasons.length) {
      errors.push({ rowNo, reasons, snapshot: item });
    } else {
      preview.push(item);
    }
  });

  return { preview, errors };
}

router.get('/', async (req, res) => {
  const user = req.session.user;
  
  try {
    // Get statistics
    const [[examCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM exams WHERE teacher_id=:tid;`,
      { tid: user.id }
    );
    
    const [[attemptCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       WHERE e.teacher_id=:tid;`,
      { tid: user.id }
    );
    
    const [[materialCount]] = await pool.query(
      `SELECT COUNT(*) AS c FROM materials WHERE teacher_id=:tid;`,
      { tid: user.id }
    );
    
    // Try to get assignment count, default to 0 if table doesn't exist
    let assignmentCount = { c: 0 };
    try {
      [[assignmentCount]] = await pool.query(
        `SELECT COUNT(*) AS c FROM assignments WHERE teacher_id=:tid;`,
        { tid: user.id }
      );
    } catch (err) {
      console.log('Assignments table not found, defaulting to 0');
    }
    
    const stats = {
      exams: examCount.c,
      attempts: attemptCount.c,
      materials: materialCount.c,
      assignments: assignmentCount.c
    };
    
    res.render('teacher/index', { title: 'Dashboard Guru', stats });
  } catch (error) {
    console.error('Error loading teacher dashboard:', error);
    req.flash('error', 'Gagal memuat dashboard');
    res.redirect('/dashboard');
  }
});

// ===== MATERI =====
router.get('/materials', async (req, res) => {
  const user = req.session.user;
  const [materials] = await pool.query(
    `SELECT m.*, s.name AS subject_name, c.name AS class_name
     FROM materials m
     JOIN subjects s ON s.id=m.subject_id
     LEFT JOIN classes c ON c.id=m.class_id
     WHERE m.teacher_id=:tid
     ORDER BY m.id DESC;`,
    { tid: user.id }
  );
  res.render('teacher/materials', { title: 'Kelola Materi', materials });
});

router.get('/materials/new', async (req, res) => {
  const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY ${CLASS_ORDER_SQL};`);
  res.render('teacher/material_new', { title: 'Buat Materi', subjects, classes });
});

router.post('/materials', uploadMaterials.fields([{ name: 'docx', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const { subject_id, title, description, class_id, content_html, embed_mode, youtube_url, pdf_url, auto_complete_minutes } = req.body;

  let html = String(content_html || '').trim() || null;

  const docx = req.files && req.files.docx ? req.files.docx[0] : null;
  const pdf = req.files && req.files.pdf ? req.files.pdf[0] : null;

  let embed_type = null;
  let embed_url = null;

  // Embed handling (optional)
  if (pdf) {
    embed_type = 'PDF';
    embed_url = `/public/uploads/materials/${pdf.filename}`;
  } else if (String(embed_mode || '').toUpperCase() === 'YOUTUBE') {
    embed_type = 'YOUTUBE';
    embed_url = toYoutubeEmbedUrl(youtube_url);
    if (!embed_url) {
      req.flash('error', 'Link YouTube tidak valid. Tempel URL YouTube (youtu.be / watch?v=) atau kode embed.');
      return res.redirect('/teacher/materials/new');
    }
  } else if (String(embed_mode || '').toUpperCase() === 'PDF') {
    embed_type = 'PDF';
    embed_url = normalizePdfUrl(String(pdf_url || '').trim());
    if (!embed_url) {
      req.flash('error', 'Link PDF kosong. Isi URL PDF (http/https) atau upload file PDF.');
      return res.redirect('/teacher/materials/new');
    }
    if (!/^https?:\/\//i.test(embed_url) && !embed_url.startsWith('/public/')) {
      req.flash('error', 'Link PDF harus berupa URL http/https atau path lokal yang diawali /public/.');
      return res.redirect('/teacher/materials/new');
    }
  } else if (String(embed_mode || '').toUpperCase() === 'WEB') {
    const rawWeb = String(req.body.web_url || '').trim();
    if (!rawWeb || !/^https?:\/\//i.test(rawWeb)) {
      req.flash('error', 'URL Web tidak valid. Harus diawali https://');
      return res.redirect('/teacher/materials/new');
    }
    embed_type = 'WEB';
    embed_url  = rawWeb;
  }

  try {
    if (docx) {
      const result = await mammoth.convertToHtml(
        { path: docx.path },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const ct = String(image.contentType || 'image/png');
            const ext = (ct.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
            const fname = `${Date.now()}_${nanoid(10)}.${ext}`;
            const buf = await image.read('buffer');
            fs.writeFileSync(path.join(materialsDir, fname), buf);
            return { src: `/public/uploads/materials/${fname}` };
          })
        }
      );
      html = result.value || '';
      // cleanup tmp docx
      try { fs.unlinkSync(docx.path); } catch (_) {}
    }

    if (!html || !html.length) {
      req.flash('error', 'Konten materi kosong. Upload DOCX atau isi konten HTML.');
      return res.redirect('/teacher/materials/new');
    }

    const autoCompleteValue = parseInt(auto_complete_minutes) || 5;

    // Ambil class_ids dari form (bisa array multi-kelas atau string single)
    let classIds = [];
    if (req.body.class_ids) {
      const raw = Array.isArray(req.body.class_ids) ? req.body.class_ids : [req.body.class_ids];
      classIds = raw.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
    }

    const [insertResult] = await pool.query(
      `INSERT INTO materials (subject_id, teacher_id, title, description, content_html, class_id, embed_type, embed_url, is_published, auto_complete_minutes)
       VALUES (:subject_id,:teacher_id,:title,:description,:content_html,:class_id,:embed_type,:embed_url,false,:auto_complete_minutes)
       RETURNING id;`,
      {
        subject_id: parseInt(subject_id) || null,
        teacher_id: user.id,
        title,
        description: description || null,
        content_html: html,
        class_id: classIds.length === 1 ? classIds[0] : null, // backward compat
        embed_type,
        embed_url,
        auto_complete_minutes: autoCompleteValue
      }
    );
    const newId = insertResult[0]?.id || insertResult?.insertId;

    // Simpan ke material_classes (junction table multi-kelas)
    if (newId && classIds.length > 0) {
      for (const cid of classIds) {
        try {
          await pool.query(
            `INSERT INTO material_classes (material_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [newId, cid]
          );
        } catch (_) {}
      }
    }

    req.flash('success', 'Materi dibuat.');
    return res.redirect('/teacher/materials');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal membuat materi.');
    return res.redirect('/teacher/materials');
  }
});

router.post('/materials/:id/toggle-publish', async (req, res) => {
  const user = req.session.user;
  try {
    // Get material info before update
    const [[material]] = await pool.query(
      `SELECT m.*, s.name AS subject_name, c.name AS class_name
       FROM materials m
       JOIN subjects s ON s.id=m.subject_id
       LEFT JOIN classes c ON c.id=m.class_id
       WHERE m.id=:id AND m.teacher_id=:tid;`,
      { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    if (!material) {
      req.flash('error', 'Materi tidak ditemukan.');
      return res.redirect('/teacher/materials');
    }

    const wasPublished = material.is_published === 1;

    await pool.query(
      `UPDATE materials SET is_published = NOT is_published
       WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`,
      { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    // Kirim notifikasi jika materi baru dipublish — DIHAPUS
    // Notifikasi hanya dibuat manual oleh guru

    req.flash('success', 'Status publish materi diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengubah status publish materi.');
  }
  res.redirect('/teacher/materials');
});

router.get('/materials/:id', async (req, res) => {
  const user = req.session.user;
  const [[material]] = await pool.query(
    `SELECT m.*, s.name AS subject_name, c.name AS class_name
     FROM materials m
     JOIN subjects s ON s.id=m.subject_id
     LEFT JOIN classes c ON c.id=m.class_id
     WHERE m.id=:id AND m.teacher_id=:tid
     LIMIT 1;`,
    { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );
  if (!material) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Materi tidak ditemukan.', user });
  res.render('teacher/material_detail', { title: `Materi: ${material.title}`, material });
});


router.get('/materials/:id/edit', async (req, res) => {
  const user = req.session.user;
  const isAdmin = user.role === 'ADMIN';
  const [[material]] = await pool.query(
    `SELECT m.*, s.name AS subject_name
     FROM materials m
     JOIN subjects s ON s.id=m.subject_id
     WHERE m.id=:id AND (:isAdmin OR m.teacher_id=:tid)
     LIMIT 1;`,
    { id: req.params.id, tid: user.id, isAdmin }
  );
  if (!material) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Materi tidak ditemukan.', user });

  const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY ${CLASS_ORDER_SQL};`);

  // Ambil kelas-kelas yang sudah dipilih (dari material_classes, fallback ke class_id lama)
  let selectedClassIds = [];
  try {
    const [mcRows] = await pool.query(
      `SELECT class_id FROM material_classes WHERE material_id = $1`, [req.params.id]
    );
    selectedClassIds = mcRows.map(r => r.class_id);
  } catch (_) {}
  // fallback ke kolom class_id lama jika material_classes kosong
  if (selectedClassIds.length === 0 && material.class_id) {
    selectedClassIds = [material.class_id];
  }
  // Jika selectedClassIds masih kosong = materi untuk semua kelas
  // kirim flag ke view agar "Semua Kelas" + semua checkbox tercentang
  const isAllClasses = selectedClassIds.length === 0;

  res.render('teacher/material_edit', { title: `Edit Materi: ${material.title}`, material, subjects, classes, selectedClassIds, isAllClasses });
});

router.put('/materials/:id', uploadMaterials.fields([{ name: 'docx', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const materialId = req.params.id;
  const { subject_id, title, description, class_id, content_html, embed_mode, youtube_url, pdf_url, auto_complete_minutes } = req.body;

  const [[existing]] = await pool.query(
    `SELECT * FROM materials WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
    { id: materialId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );
  if (!existing) {
    req.flash('error', 'Materi tidak ditemukan.');
    const redirectUrl = user.role === 'ADMIN' ? '/admin/materials' : '/teacher/materials';
    return res.redirect(redirectUrl);
  }

  let html = String(content_html || '').trim() || null;
  const docx = req.files && req.files.docx ? req.files.docx[0] : null;
  const pdf = req.files && req.files.pdf ? req.files.pdf[0] : null;

  let embed_type = null;
  let embed_url = null;

  // Determine embed from form
  if (pdf) {
    embed_type = 'PDF';
    embed_url = `/public/uploads/materials/${pdf.filename}`;
  } else if (String(embed_mode || '').toUpperCase() === 'YOUTUBE') {
    embed_type = 'YOUTUBE';
    embed_url = toYoutubeEmbedUrl(youtube_url);
    if (!embed_url) {
      req.flash('error', 'Link YouTube tidak valid.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
  } else if (String(embed_mode || '').toUpperCase() === 'PDF') {
    embed_type = 'PDF';
    embed_url = normalizePdfUrl(String(pdf_url || '').trim());
    if (!embed_url) {
      req.flash('error', 'Link PDF kosong. Isi URL PDF (http/https) atau upload file PDF.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
    if (!/^https?:\/\//i.test(embed_url) && !embed_url.startsWith('/public/')) {
      req.flash('error', 'Link PDF harus berupa URL http/https atau path lokal yang diawali /public/.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
  } else if (String(embed_mode || '').toUpperCase() === 'WEB') {
    const rawWeb = String(req.body.web_url || '').trim();
    if (!rawWeb || !/^https?:\/\//i.test(rawWeb)) {
      req.flash('error', 'URL Web tidak valid. Harus diawali https://');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
    embed_type = 'WEB';
    embed_url  = rawWeb;
  } else {
    // NONE
    embed_type = null;
    embed_url = null;
  }

  try {
    if (docx) {
      const result = await mammoth.convertToHtml(
        { path: docx.path },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const ct = String(image.contentType || 'image/png');
            const ext = (ct.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
            const fname = `${Date.now()}_${nanoid(10)}.${ext}`;
            const buf = await image.read('buffer');
            fs.writeFileSync(path.join(materialsDir, fname), buf);
            return { src: `/public/uploads/materials/${fname}` };
          })
        }
      );
      html = result.value || '';
      try { fs.unlinkSync(docx.path); } catch (_) {}
    }

    if (!html || !html.length) {
      req.flash('error', 'Konten materi kosong. Upload DOCX atau isi konten HTML.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }

    const autoCompleteValue = parseInt(auto_complete_minutes) || 5;

    // Ambil class_ids dari form (multi-kelas)
    let classIds = [];
    if (req.body.class_ids) {
      const raw = Array.isArray(req.body.class_ids) ? req.body.class_ids : [req.body.class_ids];
      classIds = raw.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
    }

    const isAdmin = user.role === 'ADMIN';
    await pool.query(
      `UPDATE materials
       SET subject_id=:subject_id,
           title=:title,
           description=:description,
           content_html=:content_html,
           class_id=:class_id,
           embed_type=:embed_type,
           embed_url=:embed_url,
           auto_complete_minutes=:auto_complete_minutes
       WHERE id=:id AND (:isAdmin OR teacher_id=:tid);`,
      {
        subject_id: parseInt(subject_id) || null,
        title,
        description: description || null,
        content_html: html,
        class_id: classIds.length === 1 ? classIds[0] : null, // backward compat
        embed_type,
        embed_url,
        auto_complete_minutes: autoCompleteValue,
        id: materialId,
        isAdmin,
        tid: user.id
      }
    );

    // Update material_classes: hapus lama, isi baru
    try {
      await pool.query(`DELETE FROM material_classes WHERE material_id = $1`, [materialId]);
      for (const cid of classIds) {
        await pool.query(
          `INSERT INTO material_classes (material_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [materialId, cid]
        );
      }
    } catch (_) {} // table mungkin belum ada di versi lama

    req.flash('success', 'Materi diperbarui.');
    // Admin diarahkan kembali ke halaman admin materials, guru ke detail materinya
    const redirectUrl = (user.role === 'ADMIN')
      ? '/admin/materials'
      : `/teacher/materials/${materialId}`;
    return res.redirect(redirectUrl);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui materi.');
    return res.redirect(`/teacher/materials/${materialId}/edit`);
  }
});

router.get('/exams', async (req, res) => {
  const user = req.session.user;
  const [exams] = await pool.query(
    `SELECT e.*, s.name AS subject_name,
            COUNT(DISTINCT q.id) AS question_count,
            STRING_AGG(DISTINCT c.name, ', ' ORDER BY c.name) AS class_names,
            COUNT(DISTINCT ec2.class_id) AS exam_class_count,
            COUNT(DISTINCT ec2.class_id) AS exam_class_schedule_count
     FROM exams e
     JOIN subjects s ON s.id=e.subject_id
     LEFT JOIN questions q ON q.exam_id=e.id
     LEFT JOIN exam_classes ec ON ec.exam_id=e.id
     LEFT JOIN classes c ON c.id=ec.class_id
     LEFT JOIN exam_classes ec2 ON ec2.exam_id=e.id
     WHERE e.teacher_id=:tid
     GROUP BY e.id, s.name
     ORDER BY e.id DESC;`,
    { tid: user.id }
  );

  if (!exams.length) return res.render('teacher/exams', { title: 'Kelola Ujian', exams: [] });

  // Ambil semua statistik partisipasi dalam 2 query saja (bukan N query)
  const examIds = exams.map(e => e.id);
  const placeholders = examIds.map((_, i) => `$${i+1}`).join(',');

  const [completedRows] = await pool.query(
    `SELECT exam_id, COUNT(DISTINCT student_id) AS completed
     FROM attempts WHERE exam_id IN (${placeholders}) GROUP BY exam_id`,
    examIds
  );
  const completedMap = Object.fromEntries(completedRows.map(r => [r.exam_id, Number(r.completed)]));

  const [totalRows] = await pool.query(
    `SELECT ec.exam_id, COUNT(DISTINCT u.id) AS total
     FROM exam_classes ec
     JOIN users u ON u.class_id=ec.class_id AND u.role='STUDENT' AND u.is_active=true
     WHERE ec.exam_id IN (${placeholders})
     GROUP BY ec.exam_id`,
    examIds
  );
  const totalMap = Object.fromEntries(totalRows.map(r => [r.exam_id, Number(r.total)]));

  for (const exam of exams) {
    exam.completed_count = completedMap[exam.id] || 0;
    exam.total_students = totalMap[exam.id] || 0;
    exam.participation_percentage = exam.total_students > 0
      ? Math.round((exam.completed_count / exam.total_students) * 100) : 0;
  }

  res.render('teacher/exams', { title: 'Kelola Ujian', exams });
});

router.get('/exams/new', async (req, res) => {
  const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY ${CLASS_ORDER_SQL};`);
  res.render('teacher/exam_new', { title: 'Buat Ujian', subjects, classes });
});

router.post('/exams', async (req, res) => {
  const user = req.session.user;
  const {
    subject_id, title, description, class_ids,
    start_at, end_at, duration_minutes, pass_score, max_attempts,
    shuffle_questions, shuffle_options, access_code,
    show_score_to_student, show_review_to_student, max_questions, max_violations
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO exams
        (subject_id, teacher_id, title, description, class_id, start_at, end_at, duration_minutes, pass_score, max_attempts, shuffle_questions, shuffle_options, access_code, show_score_to_student, show_review_to_student, is_published, max_questions, max_violations)
       VALUES
        (:subject_id,:teacher_id,:title,:description,NULL,:start_at,:end_at,:duration_minutes,:pass_score,:max_attempts,:shuffle_questions,:shuffle_options,:access_code,:show_score_to_student,:show_review_to_student,:is_published,:max_questions,:max_violations);`,
      {
        subject_id, teacher_id: user.id, title,
        description: description || null,
        start_at: start_at || null, end_at: end_at || null,
        duration_minutes: Number(duration_minutes || 60),
        pass_score: Number(pass_score || 75),
        max_attempts: Number(max_attempts || 1),
        shuffle_questions: shuffle_questions ? true : false,
        shuffle_options: shuffle_options ? true : false,
        access_code: access_code || null,
        show_score_to_student: show_score_to_student ? true : false,
        show_review_to_student: show_review_to_student ? true : false,
        // Auto-publish: hanya jika start_at dalam 15 menit ke depan atau sudah lewat
        // Jika start_at lebih dari 15 menit dari sekarang → simpan sebagai Draft
        is_published: start_at
          ? (new Date(start_at).getTime() - Date.now() <= 15 * 60 * 1000)
          : false,
        max_questions: max_questions ? Number(max_questions) : null,
        max_violations: req.body.anticheat_enabled ? Math.max(1, Number(max_violations) || 3) : 0
      }
    );

    const examId = result.insertId;
    // class_ids bisa datang sebagai 'class_ids[]' (bracket dari HTML) atau 'class_ids'
    const rawCids = req.body['class_ids[]'] || req.body['class_ids'] || [];
    const classIdsForNew = Array.isArray(rawCids) ? rawCids : (rawCids ? [rawCids] : []);
    if (classIdsForNew.length > 0) {
      const rawStart    = req.body.class_start_at  || {};
      const rawEnd      = req.body.class_end_at    || {};
      const rawDuration = req.body.class_duration  || {};
      const getVal = (obj, id) => obj[`c_${id}`] !== undefined ? obj[`c_${id}`] : (obj[id] || null);
      for (const classId of classIdsForNew) {
        if (!classId) continue;
        const cs = getVal(rawStart, classId)    || null;
        const ce = getVal(rawEnd, classId)      || null;
        if (cs && ce && new Date(cs) >= new Date(ce)) {
          req.flash('error', 'Waktu mulai kelas harus lebih awal dari waktu selesai.');
          return res.redirect('/teacher/exams');
        }
        const cd = getVal(rawDuration, classId) ? Number(getVal(rawDuration, classId)) : null;
        try {
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id, start_at, end_at, duration_minutes)
             VALUES (:exam_id, :class_id, :start_at, :end_at, :duration_minutes);`,
            { exam_id: examId, class_id: classId, start_at: cs || null, end_at: ce || null, duration_minutes: cd || null }
          );
        } catch (insertErr) {
          console.warn('exam_classes insert with schedule failed, fallback:', insertErr.message);
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id) VALUES (:exam_id, :class_id)
             ON CONFLICT (exam_id, class_id) DO NOTHING;`,
            { exam_id: examId, class_id: classId }
          );
        }
      }
    }
    req.flash('success', 'Ujian dibuat. Silakan tambahkan soal.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal membuat ujian: ' + e.message);
  }
  res.redirect('/teacher/exams');
});

router.post('/exams/:id/toggle-publish', async (req, res) => {
  const user = req.session.user;
  try {
    // Get exam info before update
    const [[exam]] = await pool.query(
      `SELECT e.*, s.name AS subject_name
       FROM exams e
       JOIN subjects s ON s.id=e.subject_id
       WHERE e.id=:id AND e.teacher_id=:tid;`,
      { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/teacher/exams');
    }

    const wasPublished = exam.is_published === true;

    await pool.query(`UPDATE exams SET is_published = NOT is_published WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, {
      id: req.params.id,
      tid: user.id
    });

    req.flash('success', 'Status publish diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengubah status publish.');
  }
  res.redirect('/teacher/exams');
});

// GET Edit Exam
router.get('/exams/:id/edit', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  try {
    // Get exam data
    const [[exam]] = await pool.query(
      `SELECT * FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/teacher/exams');
    }

    // Get subjects and classes
    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    const [classes] = await pool.query(`SELECT * FROM classes ORDER BY ${CLASS_ORDER_SQL};`);

    // Get selected classes for this exam — defensive: kolom schedule mungkin belum ada
    let examClasses;
    try {
      [examClasses] = await pool.query(
        `SELECT class_id, start_at, end_at, duration_minutes FROM exam_classes WHERE exam_id=:exam_id;`,
        { exam_id: examId }
      );
    } catch (e) {
      // Fallback jika kolom belum ada (migrasi belum dijalankan di VPS)
      const [rows] = await pool.query(
        `SELECT class_id FROM exam_classes WHERE exam_id=:exam_id;`,
        { exam_id: examId }
      );
      examClasses = rows;
    }
    const selectedClassIds = examClasses.map(ec => ec.class_id);
    const examClassSchedules = {};
    for (const ec of examClasses) {
      if (ec.start_at || ec.end_at || ec.duration_minutes) {
        examClassSchedules[ec.class_id] = {
          start_at: ec.start_at || null,
          end_at: ec.end_at || null,
          duration_minutes: ec.duration_minutes || null
        };
      }
    }

    res.render('teacher/exam_edit', {
      title: 'Edit Ujian',
      exam,
      subjects,
      classes,
      selectedClassIds,
      examClassSchedules
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data ujian.');
    res.redirect('/teacher/exams');
  }
});

// PUT Update Exam
router.put('/exams/:id', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;
  const {
    subject_id, title, description, class_ids,
    start_at, end_at, duration_minutes, pass_score, max_attempts,
    shuffle_questions, shuffle_options, access_code,
    show_score_to_student, show_review_to_student, max_questions, max_violations
  } = req.body;

  try {
    const [[exam]] = await pool.query(
      `SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );
    if (!exam) { req.flash('error', 'Ujian tidak ditemukan.'); return res.redirect('/teacher/exams'); }

    await pool.query(
      `UPDATE exams SET
        subject_id=:subject_id, title=:title, description=:description,
        start_at=:start_at, end_at=:end_at, duration_minutes=:duration_minutes,
        pass_score=:pass_score, max_attempts=:max_attempts,
        shuffle_questions=:shuffle_questions, shuffle_options=:shuffle_options,
        access_code=:access_code, show_score_to_student=:show_score_to_student,
        show_review_to_student=:show_review_to_student, max_questions=:max_questions,
        max_violations=:max_violations,
        is_published = is_published
       WHERE id=:id;`,
      {
        id: examId, subject_id, title,
        description: description || null,
        start_at: start_at || null, end_at: end_at || null,
        duration_minutes: Number(duration_minutes || 60),
        pass_score: Number(pass_score || 75),
        max_attempts: Number(max_attempts || 1),
        shuffle_questions: shuffle_questions ? true : false,
        shuffle_options: shuffle_options ? true : false,
        access_code: access_code || null,
        show_score_to_student: show_score_to_student ? true : false,
        show_review_to_student: show_review_to_student ? true : false,
        max_questions: max_questions ? Number(max_questions) : null,
        max_violations: req.body.anticheat_enabled ? Math.max(1, Number(max_violations) || 3) : 0
      }
    );

    await pool.query(`DELETE FROM exam_classes WHERE exam_id=:exam_id;`, { exam_id: examId });

    // class_ids bisa datang sebagai 'class_ids[]' (dari form HTML) atau 'class_ids'
    const rawClassIds = req.body['class_ids[]'] || req.body['class_ids'] || [];
    const classIdsArr = Array.isArray(rawClassIds) ? rawClassIds : (rawClassIds ? [rawClassIds] : []);

    if (classIdsArr.length > 0) {
      // class_start_at dikirim sebagai object dengan key 'c_{id}' untuk hindari parse array numerik
      const rawStart    = req.body.class_start_at  || {};
      const rawEnd      = req.body.class_end_at    || {};
      const rawDuration = req.body.class_duration  || {};
      // Normalize: coba key 'c_{id}' dulu, fallback ke '{id}'
      const getVal = (obj, id) => obj[`c_${id}`] !== undefined ? obj[`c_${id}`] : (obj[id] || null);

      for (const cid of classIdsArr) {
        if (!cid) continue;
        const cs = getVal(rawStart, cid)    || null;
        const ce = getVal(rawEnd, cid)      || null;
        const cd = getVal(rawDuration, cid) ? Number(getVal(rawDuration, cid)) : null;
        if (cs && ce && new Date(cs) >= new Date(ce)) {
          req.flash('error', 'Waktu mulai kelas harus lebih awal dari waktu selesai.');
          return res.redirect(`/teacher/exams/${examId}/edit`);
        }
        try {
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id, start_at, end_at, duration_minutes)
             VALUES (:exam_id, :class_id, :start_at, :end_at, :duration_minutes);`,
            { exam_id: examId, class_id: cid, start_at: cs || null, end_at: ce || null, duration_minutes: cd || null }
          );
        } catch (insertErr) {
          console.warn('exam_classes insert with schedule failed, fallback:', insertErr.message);
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id) VALUES (:exam_id, :class_id)
             ON CONFLICT (exam_id, class_id) DO NOTHING;`,
            { exam_id: examId, class_id: cid }
          );
        }
      }
    }

    req.flash('success', 'Ujian berhasil diperbarui.');
    // Invalidasi cache metadata ujian per kelas agar perpanjangan waktu langsung efektif
    try {
      const redisClient = req.app.locals.redisClient;
      if (redisClient && redisClient.isReady) {
        // Hapus cache metadata exam per kelas (student:exams:meta:*)
        const keys = await redisClient.keys('student:exams:meta:*');
        if (keys.length > 0) await redisClient.del(keys);
        // Hapus cache soal ujian ini
        await invalidateExamQuestionsCache(examId, redisClient);
        console.log(`[EDIT EXAM] Cache invalidated for exam ${examId}, ${keys.length} meta keys cleared`);
      }
    } catch (_) {}
    res.redirect(`/teacher/exams/${examId}`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui ujian: ' + e.message);
    res.redirect(`/teacher/exams/${examId}/edit`);
  }
});

router.get('/exams/:id', async (req, res) => {
  const user = req.session.user;
  const [[exam]] = await pool.query(
    `SELECT e.*, s.name AS subject_name, c.name AS class_name
     FROM exams e
     JOIN subjects s ON s.id=e.subject_id
     LEFT JOIN classes c ON c.id=e.class_id
     WHERE e.id=:id AND (:isAdmin=1 OR e.teacher_id=:tid)
     LIMIT 1;`,
    { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );
  if (!exam) return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Ujian tidak ditemukan.', user });

  const [questions] = await pool.query(
    `SELECT q.id, q.question_text, q.question_image, q.question_pdf, q.points,
            (SELECT COUNT(*) FROM options o WHERE o.question_id=q.id) AS option_count
     FROM questions q WHERE q.exam_id=:id ORDER BY q.id ASC;`,
    { id: exam.id }
  );

  // Get options for each question
  for (const q of questions) {
    const [options] = await pool.query(
      `SELECT id, option_label, option_text, option_image, is_correct
       FROM options
       WHERE question_id=:qid
       ORDER BY option_label ASC;`,
      { qid: q.id }
    );
    q.options = options;
  }
  
  // Get participant statistics
  let totalStudentsQuery;
  let queryParams = { exam_id: exam.id };
  
  // Cek apakah ujian menggunakan sistem exam_classes (baru) atau class_id (lama)
  const [examClassesCount] = await pool.query(
    `SELECT COUNT(*) as count FROM exam_classes WHERE exam_id = :exam_id`,
    { exam_id: exam.id }
  );
  
  if (examClassesCount[0].count > 0) {
    // Ujian menggunakan sistem exam_classes (baru) - hitung siswa di kelas yang ditargetkan
    totalStudentsQuery = `
      SELECT COUNT(DISTINCT u.id) as total 
      FROM users u
      INNER JOIN exam_classes ec ON ec.class_id = u.class_id
      WHERE u.role = 'STUDENT' 
      AND u.is_active = true 
      AND ec.exam_id = :exam_id
    `;
  } else if (exam.class_id) {
    // Ujian menggunakan sistem lama dengan class_id tertentu
    totalStudentsQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      WHERE role = 'STUDENT' 
      AND is_active = true 
      AND class_id = :class_id
    `;
    queryParams.class_id = exam.class_id;
  } else {
    // Ujian untuk semua kelas (tidak ada target kelas)
    totalStudentsQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      WHERE role = 'STUDENT' 
      AND is_active = true
    `;
  }
  
  const [[totalStudentsResult]] = await pool.query(totalStudentsQuery, queryParams);
  const [[completedResult]] = await pool.query(
    `SELECT COUNT(DISTINCT student_id) as completed FROM attempts WHERE exam_id = :exam_id`,
    { exam_id: exam.id }
  );
  
  exam.completed_count = completedResult.completed || 0;
  exam.total_students = totalStudentsResult.total || 0;
  exam.not_completed_count = exam.total_students - exam.completed_count;
  exam.completed_percentage = exam.total_students > 0 ? Math.round((exam.completed_count / exam.total_students) * 100) : 0;
  exam.not_completed_percentage = 100 - exam.completed_percentage;
  
  // Get list of students who completed the exam
  let completedStudentsQuery;
  if (examClassesCount[0].count > 0) {
    // Ujian menggunakan sistem exam_classes (baru)
    completedStudentsQuery = `
      SELECT DISTINCT u.id, u.username, u.full_name, c.name as class_name,
             MAX(a.created_at) as last_attempt
      FROM users u
      INNER JOIN attempts a ON a.student_id = u.id
      INNER JOIN exam_classes ec ON ec.class_id = u.class_id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true AND a.exam_id = :exam_id AND ec.exam_id = :exam_id
      GROUP BY u.id, u.username, u.full_name, c.name, c.id
      ORDER BY u.full_name ASC`;
  } else if (exam.class_id) {
    // Ujian menggunakan sistem lama dengan class_id tertentu
    completedStudentsQuery = `
      SELECT DISTINCT u.id, u.username, u.full_name, c.name as class_name,
             MAX(a.created_at) as last_attempt
      FROM users u
      INNER JOIN attempts a ON a.student_id = u.id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true AND u.class_id = :class_id AND a.exam_id = :exam_id
      GROUP BY u.id, u.username, u.full_name, c.name, c.id
      ORDER BY u.full_name ASC`;
  } else {
    // Ujian untuk semua kelas
    completedStudentsQuery = `
      SELECT DISTINCT u.id, u.username, u.full_name, c.name as class_name,
             MAX(a.created_at) as last_attempt
      FROM users u
      INNER JOIN attempts a ON a.student_id = u.id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true AND a.exam_id = :exam_id
      GROUP BY u.id, u.username, u.full_name, c.name, c.id
      ORDER BY u.full_name ASC`;
  }
  const [completedStudents] = await pool.query(completedStudentsQuery, queryParams);
  
  // Get list of students who haven't completed the exam
  let notCompletedStudentsQuery;
  if (examClassesCount[0].count > 0) {
    // Ujian menggunakan sistem exam_classes (baru)
    notCompletedStudentsQuery = `
      SELECT u.id, u.username, u.full_name, c.name as class_name
      FROM users u
      INNER JOIN exam_classes ec ON ec.class_id = u.class_id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true AND ec.exam_id = :exam_id
      AND u.id NOT IN (SELECT DISTINCT student_id FROM attempts WHERE exam_id = :exam_id)
      ORDER BY u.full_name ASC`;
  } else if (exam.class_id) {
    // Ujian menggunakan sistem lama dengan class_id tertentu
    notCompletedStudentsQuery = `
      SELECT u.id, u.username, u.full_name, c.name as class_name
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true AND u.class_id = :class_id
      AND u.id NOT IN (SELECT DISTINCT student_id FROM attempts WHERE exam_id = :exam_id)
      ORDER BY u.full_name ASC`;
  } else {
    // Ujian untuk semua kelas
    notCompletedStudentsQuery = `
      SELECT u.id, u.username, u.full_name, c.name as class_name
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role='STUDENT' AND u.is_active = true
      AND u.id NOT IN (SELECT DISTINCT student_id FROM attempts WHERE exam_id = :exam_id)
      ORDER BY u.full_name ASC`;
  }
  const [notCompletedStudents] = await pool.query(notCompletedStudentsQuery, queryParams);
  
  exam.completed_students = completedStudents;
  exam.not_completed_students = notCompletedStudents;

  // Ambil jadwal per kelas — defensive: kolom schedule mungkin belum ada
  let classSchedules = [];
  try {
    const [rows] = await pool.query(
      `SELECT ec.class_id, c.name AS class_name,
              ec.start_at, ec.end_at, ec.duration_minutes
       FROM exam_classes ec
       JOIN classes c ON c.id=ec.class_id
       WHERE ec.exam_id=:exam_id
       ORDER BY c.name ASC;`,
      { exam_id: exam.id }
    );
    classSchedules = rows;
  } catch (e) {
    const [rows] = await pool.query(
      `SELECT ec.class_id, c.name AS class_name
       FROM exam_classes ec
       JOIN classes c ON c.id=ec.class_id
       WHERE ec.exam_id=:exam_id
       ORDER BY c.name ASC;`,
      { exam_id: exam.id }
    );
    classSchedules = rows;
  }
  exam.class_schedules = classSchedules;

  res.render('teacher/exam_detail', { title: `Ujian: ${exam.title}`, exam, questions });
});

router.post('/exams/:id/questions', upload.any(), async (req, res) => {
  const user = req.session.user;
  let { question_text, points, a, b, c, d, e, correct, question_type } = req.body;
  const examId = req.params.id;
  const qtype = question_type || 'MCQ';

  // Auto-strip gambar base64 inline
  function stripBase64Images(html) {
    if (!html) return html;
    return html.replace(/<img[^>]+src=["']data:image\/[^"']+["'][^>]*>/gi,
      '<span style="color:red;font-size:11px">[gambar dihapus - gunakan upload gambar]</span>');
  }
  if (question_text && question_text.includes('data:image/')) {
    question_text = stripBase64Images(question_text);
    req.flash('info', 'Gambar yang di-paste langsung dihapus otomatis. Gunakan Upload Gambar.');
  }
  a = stripBase64Images(a); b = stripBase64Images(b);
  c = stripBase64Images(c); d = stripBase64Images(d); e = stripBase64Images(e);

  // Validasi — TRUE_FALSE hanya butuh A dan B, COMPLEX butuh minimal A-D
  if (!question_text) {
    req.flash('error', 'Pertanyaan wajib diisi.');
    return res.redirect(`/teacher/exams/${examId}`);
  }
  if (qtype === 'MCQ' && (!a || !b || !c || !d || !e || !correct)) {
    req.flash('error', 'MCQ: semua opsi A-E dan kunci jawaban wajib diisi.');
    return res.redirect(`/teacher/exams/${examId}`);
  }
  if (qtype === 'COMPLEX' && (!a || !b || !c || !d)) {
    req.flash('error', 'COMPLEX: minimal opsi A-D wajib diisi.');
    return res.redirect(`/teacher/exams/${examId}`);
  }
  if (qtype === 'CHECKBOX' && (!a || !b || !c || !d)) {
    req.flash('error', 'CHECKBOX: minimal opsi A-D wajib diisi.');
    return res.redirect(`/teacher/exams/${examId}`);
  }
  if (qtype === 'TRUE_FALSE' && (!a || !b)) {
    req.flash('error', 'TRUE_FALSE: opsi A (Benar) dan B (Salah) wajib diisi.');
    return res.redirect(`/teacher/exams/${examId}`);
  }

  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) { req.flash('error', 'Akses ditolak.'); return res.redirect('/teacher/exams'); }

  // Kunci jawaban: untuk COMPLEX/CHECKBOX bisa array, untuk MCQ/TRUE_FALSE string
  let correctLabels = [];
  if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
    // correct bisa berupa string 'A,B' atau array ['A','B']
    const rawCorrect = req.body.correct;
    if (Array.isArray(rawCorrect)) correctLabels = rawCorrect.map(s => s.toUpperCase());
    else if (rawCorrect) correctLabels = String(rawCorrect).split(',').map(s => s.trim().toUpperCase());
  } else {
    correctLabels = [String(correct || 'A').toUpperCase()];
  }

  if ((qtype === 'COMPLEX' || qtype === 'CHECKBOX') && correctLabels.length === 0) {
    req.flash('error', 'Soal ' + qtype + ' harus memiliki minimal 1 jawaban benar.');
    return res.redirect(`/teacher/exams/${examId}`);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const files = req.files || [];
    const imageFile = files.find(f => f.fieldname === 'image');
    const pdfFile = files.find(f => f.fieldname === 'pdf');

    const [qRes] = await conn.query(
      `INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points, question_type)
       VALUES (:exam_id,:question_text,:question_image,:question_pdf,:points,:qtype);`,
      {
        exam_id: examId,
        question_text,
        question_image: imageFile ? `/public/uploads/questions/${path.basename(imageFile.filename)}` : null,
        question_pdf: pdfFile ? `/public/uploads/questions/${path.basename(pdfFile.filename)}` : null,
        points: Number(points || 1),
        qtype
      }
    );
    const questionId = qRes.insertId;

    // Gambar per opsi dari upload
    const optImgMap = {};
    if (req.files) {
      for (const f of req.files) {
        const m = f.fieldname.match(/^option_image_([a-e])$/i);
        if (m) optImgMap[m[1].toUpperCase()] = `/public/uploads/questions/${path.basename(f.filename)}`;
      }
    }

    // Opsi yang akan dimasukkan berdasarkan tipe
    let optsToInsert;
    if (qtype === 'TRUE_FALSE') {
      optsToInsert = [['A', a || 'Benar'], ['B', b || 'Salah']];
    } else {
      optsToInsert = [['A',a],['B',b],['C',c],['D',d]];
      if (e) optsToInsert.push(['E', e]);
    }

    for (const [lbl, txt] of optsToInsert) {
      if (!txt && !optImgMap[lbl]) continue;
      await conn.query(
        `INSERT INTO options (question_id, option_label, option_text, option_image, is_correct)
         VALUES (:qid,:lbl,:txt,:img,:isc);`,
        { qid: questionId, lbl, txt: txt || '', img: optImgMap[lbl] || null, isc: correctLabels.includes(lbl) ? 1 : 0 }
      );
    }

    await conn.commit();
    req.flash('success', 'Soal ditambahkan.');
    await invalidateExamQuestionsCache(examId, req.app.locals.redisClient);
  } catch (e) {
    await conn.rollback();
    console.error('Error adding question:', e);
    req.flash('error', 'Gagal menambahkan soal: ' + e.message);
  } finally {
    conn.release();
  }
  res.redirect(`/teacher/exams/${examId}`);
});

// ── Download Template Import Soal Ujian ────────────────────────────────────
router.get('/exams/:id/import/template', async (req, res) => {
  const XLSX = require('xlsx');
  try {
    const contoh = [
      { question_text: 'Contoh MCQ: Ibu kota Indonesia adalah?',
        image: '', points: 1, correct: 'A', question_type: 'MCQ',
        A: 'Jakarta', B: 'Surabaya', C: 'Bandung', D: 'Yogyakarta', E: '',
        image_a: '', image_b: '', image_c: '', image_d: '', image_e: '' },
      { question_text: 'Contoh CHECKBOX: Manakah yang termasuk bilangan prima?',
        image: '', points: 4, correct: 'A,C,D', question_type: 'CHECKBOX',
        A: '2', B: '4', C: '5', D: '7', E: '9',
        image_a: '', image_b: '', image_c: '', image_d: '', image_e: '' },
      { question_text: 'Contoh TRUE_FALSE: Air mendidih pada 100°C.',
        image: '', points: 2, correct: 'A', question_type: 'TRUE_FALSE',
        A: 'Benar', B: 'Salah', C: '', D: '', E: '',
        image_a: '', image_b: '', image_c: '', image_d: '', image_e: '' },
      { question_text: 'Contoh CHECKBOX: Manakah yang termasuk perangkat input?',
        image: '', points: 3, correct: 'A,C,E', question_type: 'CHECKBOX',
        A: 'Keyboard', B: 'Monitor', C: 'Mouse', D: 'Speaker', E: 'Touchpad',
        image_a: '', image_b: '', image_c: '', image_d: '', image_e: '' },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh, {
      header: ['question_text','image','points','correct','question_type','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e']
    });
    ws['!cols'] = [{wch:60},{wch:20},{wch:8},{wch:12},{wch:12},{wch:30},{wch:30},{wch:30},{wch:30},{wch:30},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws, 'Template Soal');
    const panduan = [
      ['Kolom','Keterangan','Wajib','Contoh'],
      ['question_text','Teks pertanyaan','Ya','Manakah yang termasuk bilangan prima?'],
      ['image','Nama file gambar soal','Tidak','gambar1.jpg'],
      ['points','Poin soal (default 1)','Tidak','1'],
      ['correct','Kunci: MCQ=A, CHECKBOX=A,C,D (pisah koma), TRUE_FALSE=A/B','Ya','A atau A,C,D'],
      ['question_type','MCQ / CHECKBOX / TRUE_FALSE (default MCQ)','Tidak','CHECKBOX'],
      ['A','Teks opsi A. Boleh kosong jika gambar diisi di image_a','Ya*','Jakarta atau (kosong)'],
      ['B','Teks opsi B. Boleh kosong jika gambar diisi di image_b','Ya*','Surabaya atau (kosong)'],
      ['C','Teks opsi C. Boleh kosong jika gambar diisi di image_c','Ya*','Bandung atau (kosong)'],
      ['D','Teks opsi D. Boleh kosong jika gambar diisi di image_d','Ya*','Yogyakarta atau (kosong)'],
      ['E','Teks opsi E (opsional)','Tidak',''],
      ['image_a - image_e','Nama file gambar per opsi. Jika diisi, kolom A-E boleh kosong','Tidak','diagram_iot.png'],
      ['','*) Wajib salah satu: teks ATAU gambar','',''],
      ['','','',''],
      ['--- TIPE SOAL ---','','',''],
      ['MCQ','Pilihan ganda biasa, 1 jawaban benar','','correct: A'],
      ['CHECKBOX','Multi-jawaban, tiap jawaban benar = poin proporsional tanpa penalti','','correct: A,C,D'],
      ['TRUE_FALSE','Benar/Salah, A=Benar B=Salah','','correct: A'],
      ['','Rumus CHECKBOX: floor(benar_dipilih / total_benar × poin)','',''],
      ['','Contoh: poin=4, benar ada 3 (A,C,D), siswa pilih A,C → dapat 2 poin','',''],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:18},{wch:55},{wch:8},{wch:25}];
    XLSX.utils.book_append_sheet(wb, wsPanduan, 'Panduan');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="template_import_soal_ujian.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    req.flash('error', 'Gagal membuat template: ' + e.message);
    res.redirect(`/teacher/exams/${req.params.id}/import`);
  }
});

router.get('/exams/:id/import', async (req, res) => {
  const user = req.session.user;
  const [[exam]] = await pool.query(`SELECT id, title FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`, {
    id: req.params.id,
    tid: user.id,
    isAdmin: user.role === 'ADMIN' ? 1 : 0
  });
  if (!exam) {
    req.flash('error', 'Ujian tidak ditemukan.');
    return res.redirect(user.role === 'ADMIN' ? '/admin/exams' : '/teacher/exams');
  }
  const backUrl = user.role === 'ADMIN' ? `/admin/exams/${exam.id}` : `/teacher/exams/${exam.id}`;
  res.render('teacher/question_import', { title: 'Import Soal', exam, backUrl });
});
router.post('/exams/:id/questions/import-word', uploadDocx.single('docx'), async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) { req.flash('error', 'Akses ditolak.'); return res.redirect('/teacher/exams'); }

  const file = req.file;
  if (!file) { req.flash('error', 'File Word (.docx) belum dipilih.'); return res.redirect(`/teacher/exams/${examId}/import`); }

  try {
    // Simpan semua gambar embedded dari DOCX ke uploads/questions
    const imageMap = {}; // index → path (untuk assign ke soal/opsi)
    let imgCounter = 0;

    const result = await mammoth.convertToHtml(
      { path: file.path },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const ct = String(image.contentType || 'image/png');
          const ext = (ct.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
          const fname = `${Date.now()}_${nanoid(10)}.${ext}`;
          const buf = await image.read('buffer');
          fs.writeFileSync(path.join(uploadDir, fname), buf);
          const src = `/public/uploads/questions/${fname}`;
          imageMap[imgCounter++] = src;
          return { src, 'data-img-idx': String(imgCounter - 1) };
        })
      }
    );

    const html = result.value || '';
    const $ = cheerio.load(html);

    // Kumpulkan blok: { text, imgs[] }
    const blocks = [];
    $('body').children().each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\u00a0/g, ' ').trim();
      const imgs = [];
      $el.find('img').each((__, img) => {
        const src = $(img).attr('src');
        if (src) imgs.push(src);
      });
      if ($el.is('img')) { const src = $el.attr('src'); if (src) imgs.push(src); }
      if (text || imgs.length) blocks.push({ text, imgs });
    });

    // ── Parser ──────────────────────────────────────────────────────────────
    // Format yang didukung:
    //   1. Teks soal
    //   [gambar soal bisa di baris berikutnya sebagai paragraf kosong berisi gambar]
    //   A. Teks opsi A
    //   [gambar opsi A bisa di baris berikutnya]
    //   B. Teks opsi B  ...dst
    //   KUNCI: B
    //   NILAI: 1
    // ────────────────────────────────────────────────────────────────────────
    const parsed = [];
    let cur = null;
    let lastLabel = null; // label opsi terakhir yang diparse (untuk assign gambar)

    const startNew = (qText, imgs = []) => {
      if (cur) parsed.push(cur);
      cur = {
        question_text: qText.trim(),
        question_image: imgs[0] || null,
        extra_q_imgs: imgs.slice(1),
        points: 1,
        correct: null,
        correctLabels: [],
        question_type: 'MCQ',
        options: { A: '', B: '', C: '', D: '', E: '' },
        option_images: { A: null, B: null, C: null, D: null, E: null }
      };
      lastLabel = null;
    };

    for (const b of blocks) {
      const t = String(b.text || '').trim();
      const imgs = b.imgs || [];

      // Blok hanya berisi gambar (teks kosong) → assign ke konteks terakhir
      if (!t && imgs.length) {
        if (cur) {
          if (lastLabel && !cur.option_images[lastLabel]) {
            // Gambar setelah opsi → gambar opsi tersebut
            cur.option_images[lastLabel] = imgs[0];
          } else if (!cur.question_image) {
            // Gambar setelah nomor soal → gambar soal
            cur.question_image = imgs[0];
          }
        }
        continue;
      }

      if (!t) continue;

      // Nomor soal: "1." atau "1)"
      const mQ = t.match(/^\s*(\d+)\s*[.)]\s*(.*)$/);
      if (mQ) {
        startNew(mQ[2], imgs);
        continue;
      }

      if (!cur) continue;

      // Opsi: "A." atau "A)" - teks bisa kosong (gambar menyusul)
      const mOpt = t.match(/^\s*([A-E])\s*[.)]\s*(.*)$/i);
      if (mOpt) {
        const lbl = mOpt[1].toUpperCase();
        const optText = mOpt[2].trim();
        cur.options[lbl] = optText;
        lastLabel = lbl;
        // Gambar inline di baris yang sama dengan opsi
        if (imgs.length && !cur.option_images[lbl]) cur.option_images[lbl] = imgs[0];
        continue;
      }

      // KUNCI: supports single letter (MCQ) and comma-separated (COMPLEX/CHECKBOX)
      const mKey = t.match(/^\s*KUNCI\s*[:=]\s*([A-E,\s]+)\s*$/i);
      if (mKey) {
        const correctStr = mKey[1].replace(/\s/g, '').toUpperCase();
        cur.correct = correctStr;
        cur.correctLabels = correctStr.split(',').filter(Boolean);
        lastLabel = null;
        continue;
      }

      // TIPE:
      const mType = t.match(/^\s*TIPE\s*[:=]\s*(MCQ|COMPLEX|TRUE_FALSE|CHECKBOX)\s*$/i);
      if (mType) { cur.question_type = mType[1].toUpperCase(); lastLabel = null; continue; }

      // NILAI/POIN:
      const mPts = t.match(/^\s*(NILAI|POIN|POINTS?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*$/i);
      if (mPts) {
        const n = Number(mPts[2]);
        cur.points = Number.isFinite(n) && n > 0 ? n : 1;
        lastLabel = null;
        continue;
      }

      // Gambar inline di baris soal (bukan opsi)
      if (imgs.length && !cur.question_image && !lastLabel) cur.question_image = imgs[0];

      // Lanjutan teks soal
      if (!lastLabel) {
        cur.question_text = (cur.question_text ? cur.question_text + '\n' : '') + t;
      } else {
        // Lanjutan teks opsi
        cur.options[lastLabel] = (cur.options[lastLabel] ? cur.options[lastLabel] + ' ' : '') + t;
      }
    }
    if (cur) parsed.push(cur);

    // Validasi & pisahkan valid/error
    const preview = [], errors = [];
    parsed.forEach((q, idx) => {
      const reasons = [];
      const qt = String(q.question_text || '').trim();
      const qtype = String(q.question_type || 'MCQ').toUpperCase();
      const corr = String(q.correct || '').trim().toUpperCase();
      const correctLabels = q.correctLabels && q.correctLabels.length ? q.correctLabels : (corr ? corr.split(',').filter(Boolean) : []);
      const A = String(q.options.A || '').trim();
      const B = String(q.options.B || '').trim();
      const C = String(q.options.C || '').trim();
      const D = String(q.options.D || '').trim();
      const E = String(q.options.E || '').trim();

      if (!qt && !q.question_image) reasons.push('Teks soal kosong');

      if (qtype === 'TRUE_FALSE') {
        if (!A || !B) reasons.push('Opsi A dan B wajib untuk TRUE_FALSE');
        if (!correctLabels.length || !['A','B'].includes(correctLabels[0])) reasons.push('KUNCI harus A atau B untuk TRUE_FALSE');
      } else if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
        if (!A || !B) reasons.push('Minimal opsi A dan B wajib untuk COMPLEX/CHECKBOX');
        if (!correctLabels.length) reasons.push('KUNCI wajib diisi (pisah koma, contoh: A,C,D)');
        if (!correctLabels.every(l => ['A','B','C','D','E'].includes(l))) reasons.push('KUNCI hanya boleh huruf A-E');
      } else {
        // MCQ
        if (!A || !B || !C || !D || !E) reasons.push('Opsi A–E wajib terisi untuk MCQ (boleh gambar saja jika ada)');
        if (!correctLabels.length || !['A','B','C','D','E'].includes(correctLabels[0])) reasons.push('KUNCI harus A/B/C/D/E');
      }

      const item = {
        rowNo: idx + 1,
        question_text: qt || '(gambar)',
        question_image: q.question_image,
        points: q.points,
        correct: correctLabels.join(',') || corr,
        correctLabels,
        question_type: qtype,
        options: { A, B, C, D, E },
        option_images: q.option_images
      };

      if (reasons.length) errors.push({ rowNo: idx + 1, reasons, snapshot: item });
      else preview.push(item);
    });

    // Simpan ke session untuk preview
    const importId = nanoid(12);
    req.session.importPreview = {
      importId,
      examId: String(examId),
      preview,
      errors,
      createdAt: Date.now(),
      source: 'word'
    };

    try { fs.unlinkSync(file.path); } catch (_) {}

    return res.render('teacher/question_import_word_preview', {
      title: 'Preview Import Word',
      exam: ok,
      importId,
      preview,
      errors,
      examId
    });

  } catch (e) {
    console.error(e);
    try { fs.unlinkSync(file.path); } catch (_) {}
    req.flash('error', 'Gagal import Word: ' + e.message);
    return res.redirect(`/teacher/exams/${examId}/import`);
  }
});

// Preview & validasi import Excel/CSV
router.post(
  '/exams/:id/questions/import/preview',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'images', maxCount: 200 }
  ]),
  async (req, res) => {
    const user = req.session.user;
    const examId = req.params.id;

    const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
    if (!ok) {
      req.flash('error', 'Akses ditolak.');
      return res.redirect('/teacher/exams');
    }

    const file = (req.files?.file || [])[0];
    if (!file) {
      req.flash('error', 'File import belum dipilih.');
      return res.redirect(`/teacher/exams/${examId}/import`);
    }

    try {
      const wb = XLSX.readFile(file.path, { cellDates: true, cellText: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

      if (!rows.length) {
        req.flash('error', 'File kosong / tidak ada data.');
        return res.redirect(`/teacher/exams/${examId}/import`);
      }

      const { preview, errors } = buildImportPreview(rows, req.files?.images || []);
      const importId = nanoid(12);
      req.session.importPreview = { importId, examId: String(examId), preview, errors, createdAt: Date.now() };

      const [[exam]] = await pool.query(`SELECT id, title FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`, {
        id: examId,
        tid: user.id,
        isAdmin: user.role === 'ADMIN' ? 1 : 0
      });

      return res.render('teacher/question_import_preview', {
        title: 'Preview Import Soal',
        exam,
        importId,
        preview,
        errors
      });
    } catch (e) {
      console.error(e);
      req.flash('error', 'Gagal import. Pastikan format file sesuai template.' );
      return res.redirect(`/teacher/exams/${examId}/import`);
    }
  }
);

// Download laporan error (CSV) dari sesi preview terakhir
router.get('/exams/:id/questions/import/errors.csv', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) return res.status(403).send('Forbidden');

  const sess = req.session.importPreview;
  if (!sess || String(sess.examId) !== String(examId) || !Array.isArray(sess.errors)) {
    return res.status(404).send('Tidak ada data error (jalankan preview import dulu).');
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="import_errors_exam_${examId}.csv"`);
  res.write('row_no,reasons\n');
  for (const e of sess.errors) {
    const reasons = (e.reasons || []).join(' | ').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    res.write(`${e.rowNo},"${reasons}"\n`);
  }
  res.end();
});

// Commit import dari preview yang sudah divalidasi
router.post('/exams/:id/questions/import/commit', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;
  const { importId } = req.body;

  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/teacher/exams');
  }

  const sess = req.session.importPreview;
  if (!sess || String(sess.examId) !== String(examId) || sess.importId !== importId) {
    req.flash('error', 'Data preview import tidak ditemukan / sudah kedaluwarsa. Silakan upload ulang dan preview lagi.');
    return res.redirect(`/teacher/exams/${examId}/import`);
  }

  const rows = Array.isArray(sess.preview) ? sess.preview : [];
  if (!rows.length) {
    req.flash('error', 'Tidak ada soal valid untuk di-import.');
    return res.redirect(`/teacher/exams/${examId}/import`);
  }

  let inserted = 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Bulk insert questions sekaligus, ambil id yang di-generate
    const qExamIds   = rows.map(() => String(examId));
    const qTexts     = rows.map(r => r.question_text);
    const qImages    = rows.map(r => r.question_image || null);
    const qPoints    = rows.map(r => Math.round(Number(r.points || 1) || 1));
    const qTypes     = rows.map(r => r.question_type || 'MCQ');

    const [qRes] = await conn.rawQuery(
      `INSERT INTO questions (exam_id, question_text, question_image, points, question_type)
       SELECT ei::int, qt, qi, pt::int, qtp
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         AS t(ei, qt, qi, pt, qtp)
       RETURNING id`,
      [qExamIds, qTexts, qImages, qPoints.map(String), qTypes]
    );

    const questionIds = qRes.map(r => r.id);
    inserted = questionIds.length;

    // Siapkan semua opsi dari semua soal
    const LABELS = ['A', 'B', 'C', 'D', 'E'];
    const oQids   = [];
    const oLabels = [];
    const oTexts  = [];
    const oImages = [];
    const oCorrect = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const qid = String(questionIds[i]);
      // Kunci jawaban: COMPLEX bisa multi (array atau string pisah koma)
      const correctLabels = r.correctLabels
        || (r.correct ? String(r.correct).split(',').map(s => s.trim().toUpperCase()) : ['A']);
      for (const label of LABELS) {
        oQids.push(qid);
        oLabels.push(label);
        oTexts.push(String(r.options?.[label] || ''));
        oImages.push(r.option_images?.[label] || null);
        oCorrect.push(correctLabels.includes(label) ? 'true' : 'false');
      }
    }

    // Bulk insert semua opsi sekaligus
    await conn.rawQuery(
      `INSERT INTO options (question_id, option_label, option_text, option_image, is_correct)
       SELECT qi::int, ol, ot, oi, ic::boolean
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
         AS t(qi, ol, ot, oi, ic)`,
      [oQids, oLabels, oTexts, oImages, oCorrect]
    );

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menyimpan import. Coba pecah file menjadi lebih kecil.');
    return res.redirect(`/teacher/exams/${examId}/import`);
  } finally {
    conn.release();
  }

  const errorCount = Array.isArray(sess.errors) ? sess.errors.length : 0;
  req.flash('success', `Import tersimpan. Berhasil menambahkan ${inserted} soal. (Gagal/terlewat: ${errorCount})`);
  await invalidateExamQuestionsCache(examId, req.app.locals.redisClient);
  // Keep errors for download, but clear preview items to avoid double import
  req.session.importPreview = { ...sess, preview: [] };
  return res.redirect(`/teacher/exams/${examId}`);
});

// Backward compatibility: still accept direct import endpoint (commit without preview)
router.post('/exams/:id/questions/import', (req, res) => res.redirect(307, `/teacher/exams/${req.params.id}/questions/import/preview`));

// ===== UPLOAD GAMBAR KE SOAL YANG SUDAH ADA =====
router.get('/exams/:id/questions/upload-images', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;
  try {
    const [[exam]] = await pool.query(
      `SELECT e.*, s.name AS subject_name FROM exams e JOIN subjects s ON s.id=e.subject_id
       WHERE e.id=:id AND (:isAdmin=1 OR e.teacher_id=:tid) LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );
    if (!exam) { req.flash('error', 'Ujian tidak ditemukan.'); return res.redirect('/teacher/exams'); }

    // Ambil soal beserta opsi dan gambarnya
    const [questions] = await pool.query(
      `SELECT q.id, q.question_text, q.question_image,
              json_agg(json_build_object('label', o.option_label, 'text', o.option_text, 'image', o.option_image) ORDER BY o.option_label) AS options
       FROM questions q
       LEFT JOIN options o ON o.question_id = q.id
       WHERE q.exam_id=:eid
       GROUP BY q.id, q.question_text, q.question_image
       ORDER BY q.id ASC;`,
      { eid: examId }
    );
    res.render('teacher/question_upload_images', { title: 'Upload Gambar Soal', exam, questions });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat halaman.');
    res.redirect(`/teacher/exams/${examId}`);
  }
});

router.post('/exams/:id/questions/upload-images',
  upload.any(),
  async (req, res) => {
    const user = req.session.user;
    const examId = req.params.id;
    try {
      const [[exam]] = await pool.query(
        `SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
        { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
      );
      if (!exam) { req.flash('error', 'Akses ditolak.'); return res.redirect('/teacher/exams'); }

      const uploadedFiles = (req.files || []).filter(f => f.fieldname === 'images' || f.mimetype.startsWith('image/'));
      if (!uploadedFiles.length) {
        req.flash('error', 'Tidak ada file gambar yang diupload.');
        return res.redirect(`/teacher/exams/${examId}/questions/upload-images`);
      }

      // Buat map: originalname → path tersimpan
      const fileMap = {};
      for (const f of uploadedFiles) {
        const orig = f.originalname.trim();
        const stored = `/public/uploads/questions/${f.filename}`;
        fileMap[orig] = stored;
        fileMap[orig.replace(/\.[^.]+$/, '')] = stored;
        // Juga map tanpa spasi
        fileMap[orig.replace(/\s+/g,'_')] = stored;
      }

      // Ambil semua soal ujian ini
      const [questions] = await pool.query(
        `SELECT id, question_image FROM questions WHERE exam_id=:eid;`,
        { eid: examId }
      );

      let updated = 0;

      // Update gambar soal (question_image)
      for (const q of questions) {
        const imgVal = (q.question_image || '').trim();
        if (imgVal && !imgVal.startsWith('http') && !imgVal.startsWith('/public/')) {
          const basename = path.basename(imgVal);
          const matchedPath = fileMap[basename] || fileMap[basename.replace(/\.[^.]+$/, '')] || null;
          if (matchedPath) {
            await pool.query(`UPDATE questions SET question_image=:img WHERE id=:id;`, { img: matchedPath, id: q.id });
            updated++;
          }
        }
      }

      // Update gambar opsi jawaban (option_image)
      // Ambil semua opsi ujian ini sekaligus
      const [allOpts] = await pool.query(
        `SELECT o.id, o.option_image, o.option_label, o.question_id
         FROM options o
         JOIN questions q ON q.id = o.question_id
         WHERE q.exam_id=:eid
         ORDER BY o.question_id ASC, o.option_label ASC;`,
        { eid: examId }
      );

      // Kelompokkan per question_id untuk pola q{N}_{label}
      const qOptsMap = {};
      for (const o of allOpts) {
        if (!qOptsMap[o.question_id]) qOptsMap[o.question_id] = {};
        qOptsMap[o.question_id][o.option_label] = o;
      }
      const qIds = Object.keys(qOptsMap);

      // 1. Cocokkan option_image yang sudah berisi nama file mentah
      for (const opt of allOpts) {
        const imgVal = (opt.option_image || '').trim();
        if (!imgVal || imgVal.startsWith('http') || imgVal.startsWith('/public/')) continue;
        const base = path.basename(imgVal);
        const matchedPath = fileMap[base]
          || fileMap[base.replace(/\.[^.]+$/, '')]
          || fileMap[base.toLowerCase()]
          || null;
        if (matchedPath) {
          await pool.query(`UPDATE options SET option_image=:img WHERE id=:id;`, { img: matchedPath, id: opt.id });
          updated++;
        }
      }

      // 2. Cocokkan pola nama file: q{N}_{label}.ext atau q{N}{label}.ext
      for (const [origName, storedPath] of Object.entries(fileMap)) {
        if (!origName.includes('.')) continue; // skip entry tanpa ekstensi
        const mQ = origName.match(/^q(\d+)[_-]?([a-eA-E])\.[^.]+$/i);
        if (!mQ) continue;
        const qIdx = parseInt(mQ[1]) - 1;
        const lbl = mQ[2].toUpperCase();
        const qid = qIds[qIdx];
        if (qid && qOptsMap[qid]?.[lbl] && !qOptsMap[qid][lbl].option_image?.startsWith('/public/')) {
          await pool.query(`UPDATE options SET option_image=:img WHERE id=:id;`, {
            img: storedPath, id: qOptsMap[qid][lbl].id
          });
          updated++;
        }
      }

      // Cocokkan berdasarkan pola nomor urut untuk gambar soal (question_image)
      const [allQ] = await pool.query(
        `SELECT id, question_image FROM questions WHERE exam_id=:eid ORDER BY id ASC;`,
        { eid: examId }
      );
      for (let i = 0; i < allQ.length; i++) {
        const q = allQ[i];
        if (q.question_image && q.question_image.startsWith('/public/')) continue;
        const patterns = [
          `q${i+1}.jpg`,`q${i+1}.png`,`q${i+1}.jpeg`,`q${i+1}.webp`,
          `soal${i+1}.jpg`,`soal${i+1}.png`,`${i+1}.jpg`,`${i+1}.png`
        ];
        for (const pat of patterns) {
          if (fileMap[pat]) {
            await pool.query(`UPDATE questions SET question_image=:img WHERE id=:id;`, { img: fileMap[pat], id: q.id });
            updated++;
            break;
          }
        }
      }

      req.flash('success', `Berhasil mengupdate ${updated} gambar soal.`);
      return res.redirect(`/teacher/exams/${examId}/questions/upload-images`);
    } catch (e) {
      console.error(e);
      req.flash('error', 'Gagal upload gambar: ' + e.message);
      return res.redirect(`/teacher/exams/${examId}/questions/upload-images`);
    }
  }
);

// Import soal dari Microsoft Word (DOCX)
// Format baku (contoh):
// 1. Pertanyaan...
// A. opsi
// B. opsi
// C. opsi
// D. opsi
// E. opsi
// KUNCI: B
// NILAI: 1
// (Gambar bisa disisipkan di bawah pertanyaan / di dalam paragraf pertanyaan)
router.post('/exams/:id/questions/import-word', uploadDocx.single('docx'), async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/teacher/exams');
  }

  const file = req.file;
  if (!file) {
    req.flash('error', 'File DOCX belum dipilih.');
    return res.redirect(`/teacher/exams/${examId}/import`);
  }

  try {
    // Convert DOCX to HTML and extract embedded images directly into uploads/questions
    const result = await mammoth.convertToHtml(
      { path: file.path },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const ext = (String(image.contentType || '').split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const fname = `${Date.now()}_${nanoid(10)}.${ext}`;
          const buf = await image.read('buffer');
          fs.writeFileSync(path.join(uploadDir, fname), buf);
          return { src: `/public/uploads/questions/${fname}` };
        })
      }
    );

    const html = result.value || '';
    const $ = cheerio.load(html);

    const blocks = [];
    // Mammoth biasanya menghasilkan <p> dan kadang <ul>/<ol>. Kita flatten agar urutan tetap.
    $('body')
      .children()
      .each((_, el) => {
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          $(el)
            .find('li')
            .each((__, li) => blocks.push(li));
        } else {
          blocks.push(el);
        }
      });

    const questions = [];
    let cur = null;

    const startRe = /^(\d+)\s*[\.)]\s*(.+)$/;
    const optRe = /^([A-E])\s*[\.)]\s*(.+)$/;
    const keyRe = /^\s*KUNCI\s*[:=]\s*([A-E])\s*$/i;
    const scoreRe = /^\s*(NILAI|POIN|POINTS?)\s*[:=]\s*(\d+)\s*$/i;

    const pushCur = () => {
      if (!cur) return;
      // normalize
      cur.question_text = String(cur.question_text || '').trim();
      for (const k of ['A', 'B', 'C', 'D', 'E']) cur.options[k] = String(cur.options[k] || '').trim();
      cur.correct = String(cur.correct || '').trim().toUpperCase();
      cur.points = Number(cur.points || 1) || 1;
      questions.push(cur);
      cur = null;
    };

    for (const el of blocks) {
      const $el = $(el);
      const textRaw = $el.text().replace(/\u00a0/g, ' ');
      const text = String(textRaw || '').trim();
      const imgs = $el
        .find('img')
        .map((_, img) => $(img).attr('src'))
        .get()
        .filter(Boolean);

      // skip truly empty blocks unless it contains image
      if (!text && imgs.length === 0) continue;

      const mStart = text.match(startRe);
      if (mStart) {
        // new question
        pushCur();
        cur = {
          question_text: mStart[2].trim(),
          question_image: imgs[0] || null,
          points: 1,
          correct: 'A',
          options: { A: '', B: '', C: '', D: '', E: '' }
        };
        // if there are multiple images in the same block, just keep the first for now
        continue;
      }

      if (!cur) {
        // ignore text before first question
        continue;
      }

      // attach image if present and question doesn't have image yet
      if (!cur.question_image && imgs.length) cur.question_image = imgs[0];

      const mOpt = text.match(optRe);
      if (mOpt) {
        cur.options[mOpt[1].toUpperCase()] = mOpt[2].trim();
        continue;
      }

      const mKey = text.match(keyRe);
      if (mKey) {
        cur.correct = mKey[1].toUpperCase();
        continue;
      }

      const mScore = text.match(scoreRe);
      if (mScore) {
        cur.points = Number(mScore[2] || 1) || 1;
        continue;
      }

      // otherwise treat as additional paragraph for question text
      if (text) {
        cur.question_text = `${cur.question_text}\n${text}`.trim();
      }
    }
    pushCur();

    if (!questions.length) {
      req.flash('error', 'Tidak ada soal yang terbaca dari DOCX. Pastikan format sesuai template.');
      return res.redirect(`/teacher/exams/${examId}/import`);
    }

    let inserted = 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const q of questions) {
        // minimal validation
        const A = q.options.A,
          B = q.options.B,
          C = q.options.C,
          D = q.options.D,
          E = q.options.E;
        const correct = String(q.correct || '').toUpperCase();
        if (!q.question_text) continue;
        if (!A || !B || !C || !D || !E) continue;
        if (!['A', 'B', 'C', 'D', 'E'].includes(correct)) continue;

        const [qRes] = await conn.query(
          `INSERT INTO questions (exam_id, question_text, question_image, points)
           VALUES (:exam_id,:question_text,:question_image,:points);`,
          {
            exam_id: examId,
            question_text: q.question_text,
            question_image: q.question_image || null,
            points: Number(q.points || 1) || 1
          }
        );
        const qid = qRes.insertId;

        const opts = [
          { label: 'A', text: A },
          { label: 'B', text: B },
          { label: 'C', text: C },
          { label: 'D', text: D },
          { label: 'E', text: E }
        ];
        for (const opt of opts) {
          await conn.query(
            `INSERT INTO options (question_id, option_label, option_text, is_correct)
             VALUES (:qid,:lbl,:txt,:isc);`,
            { qid, lbl: opt.label, txt: opt.text, isc: opt.label === correct ? 1 : 0 }
          );
        }
        inserted += 1;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    req.flash('success', `Import Word selesai. Berhasil menambahkan ${inserted} soal.`);
    await invalidateExamQuestionsCache(examId, req.app.locals.redisClient);
    return res.redirect(`/teacher/exams/${examId}`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal import Word. Pastikan file DOCX valid dan format sesuai template.');
    return res.redirect(`/teacher/exams/${examId}/import`);
  }
});


// Edit soal
router.get('/questions/:id/edit', async (req, res) => {
  const user = req.session.user;
  const qId = req.params.id;
  const isAdmin = user.role === 'ADMIN';

  const [[q]] = await pool.query(
    `SELECT q.id, q.exam_id, q.question_text, q.question_image, q.question_pdf, q.points, q.question_type, e.title AS exam_title
     FROM questions q
     JOIN exams e ON e.id=q.exam_id
     WHERE q.id=:qid AND (:isAdmin=1 OR e.teacher_id=:tid)
     LIMIT 1;`,
    { qid: qId, tid: user.id, isAdmin: isAdmin ? 1 : 0 }
  );
  if (!q) {
    req.flash('error', 'Akses ditolak / soal tidak ditemukan.');
    return res.redirect('/teacher/exams');
  }

  const [opts] = await pool.query(
    `SELECT option_label, option_text, option_image, is_correct
     FROM options
     WHERE question_id=:qid
     ORDER BY option_label ASC;`,
    { qid: qId }
  );

  const byLabel = {};
  const byLabelImage = {};
  let correct = 'A';
  let correctLabels = []; // untuk COMPLEX
  for (const o of opts) {
    byLabel[o.option_label] = o.option_text;
    byLabelImage[o.option_label] = o.option_image || null;
    if (o.is_correct) {
      correct = o.option_label; // last correct (MCQ/TRUE_FALSE)
      correctLabels.push(o.option_label);
    }
  }

  res.render('teacher/question_edit', {
    title: 'Edit Soal',
    user,
    exam: { id: q.exam_id, title: q.exam_title },
    question: {
      id: q.id,
      question_text: q.question_text,
      question_image: q.question_image,
      question_pdf: q.question_pdf,
      points: q.points,
      question_type: q.question_type || 'MCQ'
    },
    options: byLabel,
    option_images: byLabelImage,
    correct_label: correct,
    correct_labels: correctLabels
  });
});

router.put('/questions/:id', upload.fields([
  { name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }, { name: 'file', maxCount: 1 },
  { name: 'option_image_a', maxCount: 1 }, { name: 'option_image_b', maxCount: 1 },
  { name: 'option_image_c', maxCount: 1 }, { name: 'option_image_d', maxCount: 1 },
  { name: 'option_image_e', maxCount: 1 }
]), async (req, res) => {
  const user = req.session.user;
  const qId = req.params.id;
  let { question_text, points, a, b, c, d, e, correct, remove_image, remove_pdf, question_type } = req.body;
  const qtype = question_type || 'MCQ';

  if (!question_text) {
    req.flash('error', 'Pertanyaan wajib diisi.');
    return res.redirect(`/teacher/questions/${qId}/edit`);
  }

  // Auto-strip gambar base64 inline dari question_text dan opsi
  // Base64 gambar bisa mencapai jutaan karakter dan memberatkan server/DB
  function stripBase64Images(html) {
    if (!html) return html;
    return html.replace(/<img[^>]+src=["']data:image\/[^"']+["'][^>]*>/gi,
      '<span style="color:red;font-size:11px">[gambar dihapus - gunakan upload gambar]</span>');
  }
  if (question_text && question_text.includes('data:image/')) {
    question_text = stripBase64Images(question_text);
    req.flash('info', 'Gambar yang di-paste langsung dihapus otomatis. Gunakan tombol Upload Gambar untuk menyisipkan gambar.');
  }
  a = stripBase64Images(a);
  b = stripBase64Images(b);
  c = stripBase64Images(c);
  d = stripBase64Images(d);
  e = stripBase64Images(e);

  // Kunci jawaban parsing
  let correctLabels = [];
  if (qtype === 'COMPLEX' || qtype === 'CHECKBOX') {
    const rawCorrect = req.body.correct;
    if (Array.isArray(rawCorrect)) {
      correctLabels = [...new Set(rawCorrect.map(s => s.trim().toUpperCase()).filter(Boolean))];
    } else if (rawCorrect) {
      correctLabels = [...new Set(String(rawCorrect).split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
    }
  } else if (qtype === 'TRUE_FALSE') {
    const rawCorrect = req.body.correct;
    const parsed = Array.isArray(rawCorrect) ? rawCorrect[0] : String(rawCorrect || 'A');
    correctLabels = [parsed.trim().toUpperCase()];
  } else {
    // MCQ: ambil nilai pertama saja (antisipasi duplikat)
    const rawCorrect = req.body.correct;
    if (Array.isArray(rawCorrect)) {
      correctLabels = [rawCorrect[0].trim().toUpperCase()];
    } else if (rawCorrect) {
      // Antisipasi "A,A" atau "B,A" — ambil karakter pertama saja
      const first = String(rawCorrect).split(',')[0].trim().toUpperCase();
      correctLabels = [first];
    }
  }
  console.log(`[EDIT QUESTION] qtype=${qtype}, raw_correct=${JSON.stringify(req.body.correct)}, correctLabels=${JSON.stringify(correctLabels)}`);

  const [[row]] = await pool.query(
    `SELECT q.id, q.exam_id, q.question_image, q.question_pdf
     FROM questions q
     JOIN exams ex ON ex.id=q.exam_id
     WHERE q.id=:qid AND (:isAdmin=1 OR ex.teacher_id=:tid)
     LIMIT 1;`,
    { qid: qId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );
  if (!row) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/teacher/exams');
  }

  // Handle image upload
  const imageFile = req.files && req.files.image ? req.files.image[0] : null;
  const newImage = imageFile ? `/public/uploads/questions/${path.basename(imageFile.filename)}` : null;
  let imageToSave = row.question_image;
  if (remove_image) imageToSave = null;
  if (newImage) imageToSave = newImage;

  // Handle PDF upload
  const pdfFile = req.files && req.files.pdf ? req.files.pdf[0] : null;
  const newPdf = pdfFile ? `/public/uploads/questions/${path.basename(pdfFile.filename)}` : null;
  let pdfToSave = row.question_pdf;
  if (remove_pdf) pdfToSave = null;
  if (newPdf) pdfToSave = newPdf;

  // Handle gambar per opsi jawaban (A-E)
  const optImageFiles = {};
  const removeOptImages = req.body.remove_option_image || {};
  for (const lbl of ['a','b','c','d','e']) {
    const fieldName = `option_image_${lbl}`;
    const f = req.files && req.files[fieldName] ? req.files[fieldName][0] : null;
    optImageFiles[lbl.toUpperCase()] = f ? `/public/uploads/questions/${path.basename(f.filename)}` : null;
  }

  const corr = String(correct || '').toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE questions
       SET question_text=:qt, points=:pts, question_image=:img, question_pdf=:pdf, question_type=:qtype
       WHERE id=:qid;`,
      { qt: question_text, pts: Number(points || 1), img: imageToSave, pdf: pdfToSave, qtype, qid: qId }
    );

    const optsToUpsert = qtype === 'TRUE_FALSE'
      ? [['A', a || 'Benar'], ['B', b || 'Salah']]
      : [['A',a],['B',b],['C',c],['D',d],['E', e||'']];

    for (const [lbl, txt] of optsToUpsert) {
      if (!txt) continue;
      // Dapatkan gambar opsi yang sudah ada di DB
      const [existingOpts] = await conn.query(
        `SELECT option_label, option_image FROM options WHERE question_id=:qid`,
        { qid: qId }
      );
      const existingOptImages = {};
      for (const o of existingOpts) existingOptImages[o.option_label] = o.option_image;

      await conn.query(
        `INSERT INTO options (question_id, option_label, option_text, option_image, is_correct)
         VALUES (:qid,:lbl,:txt,:img,:isc)
         ON CONFLICT (question_id, option_label) DO UPDATE SET
           option_text=EXCLUDED.option_text,
           option_image=EXCLUDED.option_image,
           is_correct=EXCLUDED.is_correct;`,
        {
          qid: qId, lbl, txt,
          img: optImageFiles[lbl]
            ? optImageFiles[lbl]
            : (removeOptImages[lbl] ? null : (existingOptImages[lbl] || null)),
          isc: correctLabels.includes(lbl) ? 1 : 0
        }
      );
    }

    await conn.commit();
    req.flash('success', 'Soal berhasil diperbarui.');
    await invalidateExamQuestionsCache(row.exam_id, req.app.locals.redisClient);
  } catch (e2) {
    await conn.rollback();
    console.error('Error updating question:', e2);
    req.flash('error', 'Gagal mengedit soal. Error: ' + e2.message);
  } finally {
    conn.release();
  }

  const redirectBase = user.role === 'ADMIN' ? '/admin/exams' : '/teacher/exams';
  return res.redirect(`${redirectBase}/${row.exam_id}`);
});

router.delete('/questions/:id', async (req, res) => {
  const user = req.session.user;
  const qId = req.params.id;

  const [[row]] = await pool.query(
    `SELECT q.id, q.exam_id, q.question_image, q.question_pdf
     FROM questions q
     JOIN exams e ON e.id=q.exam_id
     WHERE q.id=:qid AND (:isAdmin=1 OR e.teacher_id=:tid)
     LIMIT 1;`,
    { qid: qId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );

  if (!row) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/teacher/exams');
  }

  // Ambil gambar opsi sebelum dihapus
  const [oImages] = await pool.query(
    `SELECT option_image FROM options WHERE question_id=:qid`, { qid: qId }
  );

  try {
    await pool.query(`DELETE FROM questions WHERE id=:id;`, { id: qId });

    // Hapus file gambar dari disk
    const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(__dirname, '..', 'public', 'uploads');
    const deleteFile = (filePath) => {
      if (!filePath || !filePath.startsWith('/public/')) return;
      try {
        const abs = path.join(UPLOAD_ROOT, '..', filePath);
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) {}
    };
    deleteFile(row.question_image);
    deleteFile(row.question_pdf);
    for (const o of oImages) deleteFile(o.option_image);

    req.flash('success', 'Soal dihapus.');
    await invalidateExamQuestionsCache(row.exam_id, req.app.locals.redisClient);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus soal.');
  }
  const deleteRedirectBase = user.role === 'ADMIN' ? '/admin/exams' : '/teacher/exams';
  res.redirect(`${deleteRedirectBase}/${row.exam_id}`);
});

router.post('/exams/:id/regenerate-code', async (req, res) => {
  const user = req.session.user;
  try {
    const newCode = nanoid(6).toUpperCase();
    await pool.query(`UPDATE exams SET access_code=:code WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, {
      code: newCode,
      id: req.params.id,
      tid: user.id
    });
    req.flash('success', `Kode akses baru: ${newCode}`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal membuat kode akses baru.');
  }
  res.redirect(`/teacher/exams/${req.params.id}`);
});

// Reset hasil ujian (hapus semua attempts + jawaban untuk suatu ujian)
// attempt_answers akan terhapus otomatis via ON DELETE CASCADE.
router.post('/exams/:id/reset-results', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  const [[exam]] = await pool.query(
    `SELECT id, title, is_published
     FROM exams
     WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid)
     LIMIT 1;`,
    { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
  );

  if (!exam) {
    req.flash('error', 'Akses ditolak. Ujian tidak ditemukan.');
    return res.redirect('/teacher/exams');
  }

  const [[cntRow]] = await pool.query(`SELECT COUNT(*) AS cnt FROM attempts WHERE exam_id=:id;`, { id: examId });
  const cnt = Number(cntRow?.cnt || 0);

  if (cnt === 0) {
    req.flash('success', 'Tidak ada hasil ujian yang perlu di-reset.');
    return res.redirect(`/teacher/exams/${examId}`);
  }

  try {
    await pool.query(`DELETE FROM attempts WHERE exam_id=:id;`, { id: examId });
    req.flash(
      'success',
      `Berhasil reset ${cnt} hasil ujian untuk: ${exam.title}. Siswa dapat mengulang sesuai batas attempt.`
    );
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal reset hasil ujian.');
  }

  return res.redirect(`/teacher/exams/${examId}`);
});

// Reset nilai individual per attempt
router.post('/attempts/:id/reset', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;

  // Verify ownership: attempt must belong to an exam owned by this teacher
  const [[attempt]] = await pool.query(
    `SELECT a.id, a.exam_id, e.title AS exam_title, u.full_name AS student_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     WHERE a.id=:aid AND e.teacher_id=:tid
     LIMIT 1;`,
    { aid: attemptId, tid: user.id }
  );

  if (!attempt) {
    req.flash('error', 'Akses ditolak. Hasil ujian tidak ditemukan.');
    return res.redirect('/teacher/grades');
  }

  try {
    // Delete attempt (attempt_answers will be deleted automatically via CASCADE)
    await pool.query(`DELETE FROM attempts WHERE id=:id;`, { id: attemptId });
    req.flash(
      'success',
      `Berhasil reset nilai ${attempt.student_name} untuk ujian: ${attempt.exam_title}. Siswa dapat mengulang ujian.`
    );
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal reset nilai.');
  }

  return res.redirect('/teacher/grades');
});

// Bulk reset nilai (reset multiple attempts)
router.post('/attempts/bulk-reset', async (req, res) => {
  const user = req.session.user;
  
  // Debug logging
  console.log('=== BULK RESET DEBUG ===');
  console.log('req.body:', req.body);
  console.log('req.body keys:', Object.keys(req.body));
  
  let attempt_ids = req.body['attempt_ids[]'] || req.body.attempt_ids || [];
  
  console.log('attempt_ids raw:', attempt_ids);
  console.log('attempt_ids type:', typeof attempt_ids);
  console.log('attempt_ids isArray:', Array.isArray(attempt_ids));
  
  // Ensure it's an array
  if (!Array.isArray(attempt_ids)) {
    attempt_ids = [attempt_ids];
  }
  
  // Filter out empty values
  attempt_ids = attempt_ids.filter(id => id && id.toString().trim() !== '');
  
  console.log('attempt_ids filtered:', attempt_ids);
  
  if (attempt_ids.length === 0) {
    console.log('No attempt_ids found, redirecting with error');
    req.flash('error', 'Tidak ada nilai yang dipilih untuk direset.');
    return res.redirect('/teacher/grades');
  }

  // Convert to integers and filter valid IDs
  const validIds = attempt_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  console.log('validIds:', validIds);
  
  if (validIds.length === 0) {
    console.log('No valid IDs found');
    req.flash('error', 'Tidak ada ID attempt yang valid.');
    return res.redirect('/teacher/grades');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    // Verify ownership: all attempts must belong to exams owned by this teacher
    const placeholders = validIds.map(() => '?').join(',');
    const [attempts] = await conn.query(
      `SELECT a.id, e.title AS exam_title, u.full_name AS student_name
       FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       JOIN users u ON u.id=a.student_id
       WHERE a.id IN (${placeholders}) AND e.teacher_id=?;`,
      [...validIds, user.id]
    );
    
    console.log('Found attempts:', attempts.length, 'Expected:', validIds.length);
    
    if (attempts.length !== validIds.length) {
      await conn.rollback();
      req.flash('error', 'Akses ditolak. Beberapa attempt tidak ditemukan atau bukan milik Anda.');
      return res.redirect('/teacher/grades');
    }
    
    // Delete attempts (attempt_answers will be deleted automatically via CASCADE)
    const [result] = await conn.query(
      `DELETE FROM attempts WHERE id IN (${placeholders});`,
      validIds
    );
    
    deleted = result.affectedRows || 0;
    console.log('Deleted attempts:', deleted);
    
    await conn.commit();
    req.flash('success', `Berhasil reset ${deleted} nilai siswa. Siswa dapat mengulang ujian.`);
  } catch (e) {
    await conn.rollback();
    console.error('Bulk reset error:', e);
    req.flash('error', `Gagal reset nilai. Error: ${e.message}`);
  } finally {
    conn.release();
  }
  
  res.redirect('/teacher/grades');
});

// ===== UNLOCK TOKEN - Lihat siswa terkunci & generate token =====
router.get('/violations/locked', async (req, res) => {
  const user = req.session.user;
  try {
    const [locked] = await pool.query(
      `SELECT a.id AS attempt_id, a.unlock_token, a.locked_at, a.unlock_count,
              u.full_name AS student_name, u.username,
              c.name AS class_name,
              e.title AS exam_title, e.id AS exam_id,
              COUNT(av.id) AS violation_count
       FROM attempts a
       JOIN users u ON u.id = a.student_id
       JOIN exams e ON e.id = a.exam_id
       LEFT JOIN classes c ON c.id = u.class_id
       LEFT JOIN attempt_violations av ON av.attempt_id = a.id
       WHERE a.is_locked = true AND a.status = 'IN_PROGRESS'
         AND (:isAdmin=1 OR e.teacher_id=:tid)
       GROUP BY a.id, u.full_name, u.username, c.name, e.title, e.id
       ORDER BY a.locked_at DESC;`,
      { tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );
    res.render('teacher/violations_locked', { title: 'Siswa Terkunci', locked });
  } catch(e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data.');
    res.redirect('/teacher/grades');
  }
});

// Setujui / buka kunci siswa langsung (tanpa token)
router.post('/violations/unlock/:attemptId', async (req, res) => {
  const user = req.session.user;
  const { attemptId } = req.params;
  try {
    const [[attempt]] = await pool.query(
      `SELECT a.id FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id=:aid AND a.is_locked=true
         AND (:isAdmin=1 OR e.teacher_id=:tid) LIMIT 1;`,
      { aid: attemptId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );
    if (!attempt) return res.json({ ok: false, message: 'Attempt tidak ditemukan.' });

    await pool.query(
      `UPDATE attempts SET is_locked=false, unlock_token=null, unlock_count=unlock_count+1, locked_at=now() WHERE id=:aid;`,
      { aid: attemptId }
    );
    return res.json({ ok: true });
  } catch(e) {
    console.error(e);
    return res.json({ ok: false, message: e.message });
  }
});

// Setujui massal - buka kunci banyak siswa sekaligus
router.post('/violations/unlock-bulk', async (req, res) => {
  const user = req.session.user;
  let ids = req.body.attempt_ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return res.json({ ok: false, message: 'Tidak ada siswa dipilih.' });
  try {
    // Validasi: hanya attempt yang boleh diakses guru ini
    const placeholders = ids.map((_, i) => `:id${i}`).join(',');
    const paramObj = { tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 };
    ids.forEach((id, i) => { paramObj[`id${i}`] = id; });
    const [valid] = await pool.query(
      `SELECT a.id FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       WHERE a.id IN (${placeholders}) AND a.is_locked=true
         AND (:isAdmin=1 OR e.teacher_id=:tid);`,
      paramObj
    );
    const validIds = valid.map(r => r.id);
    if (!validIds.length) return res.json({ ok: false, message: 'Tidak ada attempt valid.' });

    const ph2 = validIds.map((_, i) => `:vid${i}`).join(',');
    const p2 = {};
    validIds.forEach((id, i) => { p2[`vid${i}`] = id; });
    await pool.query(
      `UPDATE attempts SET is_locked=false, unlock_token=null, unlock_count=unlock_count+1, locked_at=now()
       WHERE id IN (${ph2});`,
      p2
    );
    return res.json({ ok: true, count: validIds.length });
  } catch(e) {
    console.error(e);
    return res.json({ ok: false, message: e.message });
  }
});

// Daftar nilai: attempts for teacher's exams (filterable)
router.get('/grades', async (req, res) => {
  const user = req.session.user;
  const exam_id = (req.query.exam_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const status = (req.query.status || '').trim();
  const result = (req.query.result || '').trim();
  const q = (req.query.q || '').trim();
  const page = parseInt(req.query.page) || 1;
  // Jika filter kelas dipilih, tampilkan semua sekaligus (tidak perlu paging)
  const defaultLimit = class_id ? 999 : 10;
  const limit = parseInt(req.query.limit) || defaultLimit;
  const offset = (page - 1) * limit;

  const [exams] = await pool.query(
    `SELECT id, title FROM exams WHERE teacher_id=$1 ORDER BY id DESC`,
    [user.id]
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY ${CLASS_ORDER_SQL}`);

  const where = ['e.teacher_id=$1'];
  const params = [user.id];

  if (exam_id)  { params.push(exam_id);  where.push(`e.id=$${params.length}`); }
  if (class_id) { params.push(class_id); where.push(`u.class_id=$${params.length}`); }
  if (status)   { params.push(status);   where.push(`a.status=$${params.length}`); }
  if (result === 'LULUS')       where.push(`a.status='SUBMITTED' AND a.score >= e.pass_score`);
  if (result === 'TIDAK_LULUS') where.push(`a.status='SUBMITTED' AND a.score < e.pass_score`);
  if (q) { params.push('%' + q + '%'); where.push(`(u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`); }

  const whereClause = where.join(' AND ');

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${whereClause}`,
    params
  );
  const total = countResult[0][0]?.total || 0;

  // Get paginated data
  const rowsResult = await pool.query(
    `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
            e.id AS exam_id, e.title AS exam_title, e.pass_score,
            u.full_name AS student_name, u.username,
            c.name AS class_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${whereClause}
     ORDER BY
       CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END ASC,
       regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
       (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST,
       u.full_name ASC, a.id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const rows = rowsResult[0] || [];

  const rows2 = rows.map((r) => ({
    ...r,
    is_pass: r.status === 'SUBMITTED' ? Number(r.score) >= Number(r.pass_score) : 0
  }));

  // ── Statistik & siswa belum mengerjakan (hanya jika filter exam_id dipilih) ──
  let examStats = null;
  let notYetRows = [];

  try {
    if (exam_id) {
      // ── Mode: filter ujian tertentu ──
      const statsRes = await pool.query(`
        SELECT
          COUNT(DISTINCT u.id) AS total_siswa,
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'SUBMITTED') AS sudah_submit,
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'IN_PROGRESS') AS sedang_kerjakan,
          COUNT(DISTINCT a.student_id) AS sudah_mulai,
          ROUND(AVG(a.score) FILTER (WHERE a.status = 'SUBMITTED'), 1) AS avg_nilai,
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'SUBMITTED' AND a.score >= e.pass_score) AS lulus,
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'SUBMITTED' AND a.score < e.pass_score) AS tidak_lulus
        FROM exams e
        JOIN exam_classes ec ON ec.exam_id = e.id
        JOIN users u ON u.class_id = ec.class_id AND u.role = 'STUDENT' AND u.is_active = true
        LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = u.id
        WHERE e.id = $1 AND e.teacher_id = $2
      `, [exam_id, user.id]);

      const st = statsRes[0][0];
      if (st) {
        const totalSiswa = Number(st.total_siswa) || 0;
        const sudahMulai = Number(st.sudah_mulai) || 0;
        examStats = {
          total_siswa:       totalSiswa,
          sudah_submit:      Number(st.sudah_submit) || 0,
          sedang_kerjakan:   Number(st.sedang_kerjakan) || 0,
          belum_mengerjakan: totalSiswa - sudahMulai,
          avg_nilai:         st.avg_nilai ? parseFloat(st.avg_nilai) : 0,
          lulus:             Number(st.lulus) || 0,
          tidak_lulus:       Number(st.tidak_lulus) || 0,
        };
      }

      // Daftar siswa BELUM mengerjakan ujian tertentu
      const notYetRes = await pool.query(`
        SELECT u.id, u.full_name, u.username, c.name AS class_name
        FROM exams e
        JOIN exam_classes ec ON ec.exam_id = e.id
        JOIN users u ON u.class_id = ec.class_id AND u.role = 'STUDENT' AND u.is_active = true
        LEFT JOIN classes c ON c.id = u.class_id
        WHERE e.id = $1 AND e.teacher_id = $2
          AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.exam_id = e.id AND a.student_id = u.id)
          ${class_id ? `AND u.class_id = $3` : ''}
        ORDER BY
          CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END ASC,
          regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
          (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST,
          u.full_name ASC
      `, class_id ? [exam_id, user.id, class_id] : [exam_id, user.id]);
      notYetRows = notYetRes[0] || [];

    } else {
      // ── Mode: semua ujian guru (tampilan awal / tanpa filter ujian) ──
      const statsRes = await pool.query(`
        SELECT
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'SUBMITTED') AS sudah_submit,
          COUNT(DISTINCT a.student_id) FILTER (WHERE a.status = 'IN_PROGRESS') AS sedang_kerjakan,
          ROUND(AVG(a.score) FILTER (WHERE a.status = 'SUBMITTED'), 1) AS avg_nilai,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'SUBMITTED' AND a.score >= e.pass_score) AS lulus,
          COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'SUBMITTED' AND a.score < e.pass_score) AS tidak_lulus,
          COUNT(DISTINCT e.id) AS total_ujian
        FROM exams e
        LEFT JOIN attempts a ON a.exam_id = e.id
        WHERE e.teacher_id = $1
      `, [user.id]);

      const st = statsRes[0][0];
      if (st) {
        examStats = {
          total_siswa:       Number(total),  // total attempt rows sesuai filter aktif
          sudah_submit:      Number(st.sudah_submit) || 0,
          sedang_kerjakan:   Number(st.sedang_kerjakan) || 0,
          belum_mengerjakan: null,           // tidak relevan tanpa filter ujian
          avg_nilai:         st.avg_nilai ? parseFloat(st.avg_nilai) : 0,
          lulus:             Number(st.lulus) || 0,
          tidak_lulus:       Number(st.tidak_lulus) || 0,
          total_ujian:       Number(st.total_ujian) || 0,
          mode_semua:        true,           // flag untuk view
        };
      }
    }
  } catch (e) {
    console.error('Grades stats error (teacher):', e.message);
  }

  res.render('teacher/grades', {
    title: 'Daftar Nilai',
    rows: rows2,
    exams,
    classes,
    filters: { exam_id, class_id, status, result, q },
    pagination: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit)
    },
    examStats,
    notYetRows
  });
});

// Detail attempt untuk guru (review jawaban siswa)
router.get('/attempts/:id', async (req, res) => {
  const user = req.session.user;
  const attemptId = req.params.id;

  const [[attempt]] = await pool.query(
    `SELECT a.*, e.id AS exam_id, e.title AS exam_title, e.pass_score,
            u.full_name AS student_name, u.username,
            c.name AS class_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE a.id=:aid AND e.teacher_id=:tid
     LIMIT 1;`,
    { aid: attemptId, tid: user.id }
  );

  if (!attempt) {
    return res.status(404).render('error', { title: 'Tidak ditemukan', message: 'Attempt tidak ditemukan.', user });
  }

  const [ans] = await pool.query(
    `SELECT aa.question_id, aa.option_id AS chosen_option_id, aa.is_correct,
            q.question_text, q.question_image, q.points
     FROM attempt_answers aa
     JOIN questions q ON q.id=aa.question_id
     WHERE aa.attempt_id=:aid
     ORDER BY aa.id ASC;`,
    { aid: attemptId }
  );

  const qids = ans.map((a) => a.question_id);
  let optionsMap = {};
  if (qids.length) {
    const [opts] = await pool.query(
      `SELECT id, question_id, option_label, option_text, is_correct
       FROM options
       WHERE question_id IN (${qids.map(() => '?').join(',')})
       ORDER BY question_id ASC, option_label ASC;`,
      qids
    );
    for (const o of opts) {
      if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
      optionsMap[o.question_id].push(o);
    }
  }

  const answers = ans.map((a) => {
    const opts = optionsMap[a.question_id] || [];
    const correct = opts.find((o) => o.is_correct === 1) || null;
    return {
      ...a,
      options: opts,
      correct_option_id: correct ? correct.id : null
    };
  });

  // Ambil log pelanggaran anti-cheat (jika tabel tersedia)
  let violations = [];
  try {
    const [vrows] = await pool.query(
      `SELECT violation_type, details, created_at
       FROM attempt_violations
       WHERE attempt_id=:aid
       ORDER BY id ASC
       LIMIT 300;`,
      { aid: attemptId }
    );
    violations = vrows || [];
  } catch (e) {
    // Jika belum migrate, abaikan
    violations = [];
  }

  res.render('teacher/attempt_detail', {
    title: 'Detail Nilai',
    attempt,
    exam: { id: attempt.exam_id, title: attempt.exam_title, pass_score: attempt.pass_score },
    student: { full_name: attempt.student_name, username: attempt.username, class_name: attempt.class_name },
    answers,
    violations
  });
});

// Rekap siswa yang sudah melihat materi
router.get('/material-views', async (req, res) => {
  const user = req.session.user;
  const material_id = (req.query.material_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const q = (req.query.q || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Pagination for not viewed students — pakai limit yang sama
  const notViewedPage = parseInt(req.query.not_viewed_page) || 1;
  const notViewedLimit = limit; // ikuti limit dari filter
  const notViewedOffset = (notViewedPage - 1) * notViewedLimit;

  // Get teacher's materials for filter
  const [materials] = await pool.query(
    `SELECT id, title FROM materials WHERE teacher_id=:tid ORDER BY id DESC;`,
    { tid: user.id }
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY ${CLASS_ORDER_SQL};`);

  const where = ['m.teacher_id=:tid']; // tampilkan semua yang sudah buka, tidak hanya yang selesai
  const params = { tid: user.id };

  if (material_id) {
    where.push('m.id=:material_id');
    params.material_id = material_id;
  }
  if (class_id) {
    where.push('u.class_id=:class_id');
    params.class_id = class_id;
  }
  if (q) {
    where.push('(u.full_name LIKE :q OR u.username LIKE :q)');
    params.q = '%' + q + '%';
  }

  // Count total viewed
  const [[countViewedRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM material_reads mv
     JOIN materials m ON m.id=mv.material_id
     JOIN users u ON u.id=mv.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')};`,
    params
  );
  const total = parseInt(countViewedRow?.cnt) || 0;

  // Get paginated viewed data
  const [rows] = await pool.query(
    `SELECT mv.id, mv.first_opened_at AS opened_at, mv.completed_at,
            CASE WHEN mv.completed_at IS NOT NULL THEN true ELSE false END AS is_completed,
            m.id AS material_id, m.title AS material_title,
            u.full_name AS student_name, u.username,
            c.name AS class_name
     FROM material_reads mv
     JOIN materials m ON m.id=mv.material_id
     JOIN users u ON u.id=mv.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.name ASC, u.full_name ASC
     LIMIT :limit OFFSET :offset;`,
    { ...params, limit, offset }
  );

  // Get students who haven't viewed - with pagination
  let notViewedStudents = [];
  let notViewedTotal = 0;
  
  if (material_id) {
    // Ambil class_id dari tabel materials
    const [[materialInfo]] = await pool.query(
      `SELECT class_id FROM materials WHERE id=:material_id LIMIT 1;`,
      { material_id }
    );
    
    // Get for specific material - only students from material's class
    const notViewedWhere = ["u.role='STUDENT'", 'u.is_active=true'];
    const notViewedParams = { material_id };
    
    // Filter by kelas dari material
    if (materialInfo && materialInfo.class_id && !class_id) {
      notViewedWhere.push('u.class_id=:material_class_id');
      notViewedParams.material_class_id = materialInfo.class_id;
    }
    
    // Additional filter from user selection
    if (class_id) {
      notViewedWhere.push('u.class_id=:class_id');
      notViewedParams.class_id = class_id;
    }
    
    if (q) {
      notViewedWhere.push('(u.full_name LIKE :q OR u.username LIKE :q)');
      notViewedParams.q = '%' + q + '%';
    }
    
    // Count total not viewed (specific material)
    const [[countRow1]] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${notViewedWhere.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM material_reads mv
           WHERE mv.student_id=u.id AND mv.material_id=:material_id
         );`,
      notViewedParams
    );
    notViewedTotal = parseInt(countRow1?.cnt) || 0;
    
    // Get paginated not viewed data
    [notViewedStudents] = await pool.query(
      `SELECT u.id, u.full_name AS student_name, u.username,
              c.name AS class_name,
              (SELECT title FROM materials WHERE id=:material_id) AS material_title
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${notViewedWhere.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM material_reads mv
           WHERE mv.student_id=u.id AND mv.material_id=:material_id
         )
       ORDER BY c.name ASC, u.full_name ASC
       LIMIT :limit OFFSET :offset;`,
      { ...notViewedParams, limit: notViewedLimit, offset: notViewedOffset }
    );
  } else {
    // Get students who haven't viewed ANY material from this teacher
    const notViewedWhere = ["u.role='STUDENT'", 'u.is_active=true'];
    const notViewedParams = { tid: user.id };
    
    if (class_id) {
      notViewedWhere.push('u.class_id=:class_id');
      notViewedParams.class_id = class_id;
    }
    
    if (q) {
      notViewedWhere.push('(u.full_name LIKE :q OR u.username LIKE :q)');
      notViewedParams.q = '%' + q + '%';
    }
    
    // Count total not viewed (all materials)
    const [[countRow2]] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${notViewedWhere.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM material_reads mv
           JOIN materials m ON m.id=mv.material_id
           WHERE mv.student_id=u.id AND m.teacher_id=:tid
         );`,
      notViewedParams
    );
    notViewedTotal = parseInt(countRow2?.cnt) || 0;
    
    // Get paginated not viewed data
    [notViewedStudents] = await pool.query(
      `SELECT u.id, u.full_name AS student_name, u.username,
              c.name AS class_name,
              'Semua Materi' AS material_title
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${notViewedWhere.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM material_reads mv
           JOIN materials m ON m.id=mv.material_id
           WHERE mv.student_id=u.id AND m.teacher_id=:tid
         )
       ORDER BY c.name ASC, u.full_name ASC
       LIMIT :limit OFFSET :offset;`,
      { ...notViewedParams, limit: notViewedLimit, offset: notViewedOffset }
    );
  }

  res.render('teacher/material_views', {
    title: 'Rekap Siswa Lihat Materi',
    rows,
    materials,
    classes,
    filters: { material_id, class_id, q },
    notViewedCount: notViewedTotal,
    notViewedStudents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    notViewedPagination: {
      page: notViewedPage,
      limit: notViewedLimit,
      total: notViewedTotal,
      totalPages: Math.ceil(notViewedTotal / notViewedLimit)
    }
  });
});

// Siswa yang belum melihat materi
router.get('/material-not-viewed', async (req, res) => {
  try {
    const user = req.session.user;
    const material_id = (req.query.material_id || '').trim();
    const class_id = (req.query.class_id || '').trim();
    const q = (req.query.q || '').trim();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get teacher's materials for filter
    const [materials] = await pool.query(
      `SELECT id, title FROM materials WHERE teacher_id=:tid ORDER BY id DESC;`,
      { tid: user.id }
    );
    const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY ${CLASS_ORDER_SQL};`);

    console.log('Teacher ID:', user.id);
    console.log('Materials count:', materials.length);
    console.log('Filter - material_id:', material_id, 'class_id:', class_id);

    const where = ["u.role='STUDENT'", 'u.is_active=true'];
    const params = { tid: user.id };

    if (class_id) {
      where.push('u.class_id=:class_id');
      params.class_id = class_id;
    }
    if (q) {
      where.push('(u.full_name LIKE :q OR u.username LIKE :q)');
      params.q = '%' + q + '%';
    }

    // If material_id is specified, find students who haven't viewed that specific material
    // Otherwise, find students who haven't viewed ANY material from this teacher
    let query, countQuery;
    if (material_id) {
      params.material_id = material_id;
      
      countQuery = `
        SELECT COUNT(*) AS total
        FROM users u
        LEFT JOIN classes c ON c.id=u.class_id
        WHERE ${where.join(' AND ')}
          AND NOT EXISTS (
            SELECT 1 FROM material_reads mv
            WHERE mv.student_id=u.id AND mv.material_id=:material_id
          );
      `;

      query = `
        SELECT u.id, u.full_name AS student_name, u.username,
               c.name AS class_name,
               :material_id AS material_id,
               (SELECT title FROM materials WHERE id=:material_id) AS material_title
        FROM users u
        LEFT JOIN classes c ON c.id=u.class_id
        WHERE ${where.join(' AND ')}
          AND NOT EXISTS (
            SELECT 1 FROM material_reads mv
            WHERE mv.student_id=u.id AND mv.material_id=:material_id
          )
        ORDER BY u.full_name ASC
        LIMIT :limit OFFSET :offset;
      `;
    } else {
      // Find students who haven't viewed ANY material from this teacher
      countQuery = `
        SELECT COUNT(*) AS total
        FROM users u
        LEFT JOIN classes c ON c.id=u.class_id
        WHERE ${where.join(' AND ')}
          AND NOT EXISTS (
            SELECT 1 FROM material_reads mv
            JOIN materials m ON m.id=mv.material_id
            WHERE mv.student_id=u.id AND m.teacher_id=:tid
          );
      `;

      query = `
        SELECT u.id, u.full_name AS student_name, u.username,
               c.name AS class_name,
               NULL AS material_id,
               'Semua Materi' AS material_title
        FROM users u
        LEFT JOIN classes c ON c.id=u.class_id
        WHERE ${where.join(' AND ')}
          AND NOT EXISTS (
            SELECT 1 FROM material_reads mv
            JOIN materials m ON m.id=mv.material_id
            WHERE mv.student_id=u.id AND m.teacher_id=:tid
          )
        ORDER BY u.full_name ASC
        LIMIT :limit OFFSET :offset;
      `;
    }

    console.log('Query params:', params);

    // Count total
    const [[{ total }]] = await pool.query(countQuery, params);
    console.log('Total students not viewed:', total);

    // Get paginated data
    const [rows] = await pool.query(query, { ...params, limit, offset });
    console.log('Rows returned:', rows.length);

    res.render('teacher/material_not_viewed', {
      title: 'Siswa Belum Lihat Materi',
      rows,
      materials,
      classes,
      filters: { material_id, class_id, q },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error material-not-viewed:', err);
    req.flash('error', 'Gagal memuat data siswa yang belum melihat materi');
    res.redirect('/teacher');
  }
});

// ===== ASSIGNMENTS (TUGAS UPLOAD) =====

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

// ===== PEMANTAUAN TUGAS GURU =====
router.get('/assignments/monitoring', async (req, res) => {
  const user = req.session.user;
  const assignment_id = req.query.assignment_id || '';
  const class_id = req.query.class_id || '';

  const [myAssignments] = await pool.query(
    `SELECT a.id, a.title FROM assignments a WHERE a.teacher_id=:tid ORDER BY a.created_at DESC;`,
    { tid: user.id }
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY ${CLASS_ORDER_SQL};`);

  let submissions = [];
  if (assignment_id) {
    [submissions] = await pool.query(
      `SELECT u.id AS student_id, u.full_name AS student_name, u.username,
              c.name AS class_name,
              sub.id AS submission_id, sub.file_path, sub.file_name,
              sub.link_url, sub.notes, sub.submitted_at, sub.score, sub.feedback
       FROM users u
       INNER JOIN assignment_classes ac ON ac.class_id=u.class_id AND ac.assignment_id=:aid
       LEFT JOIN classes c ON c.id=u.class_id
       LEFT JOIN assignment_submissions sub ON sub.assignment_id=:aid AND sub.student_id=u.id
       WHERE u.role='STUDENT' AND u.is_active=true
         ${class_id ? 'AND u.class_id=:cid' : ''}
       ORDER BY c.name ASC, u.full_name ASC;`,
      { aid: assignment_id, ...(class_id ? { cid: class_id } : {}) }
    );
  }

  const total = submissions.length;
  const submitted = submissions.filter(s => s.submission_id).length;
  const graded = submissions.filter(s => s.score !== null).length;

  res.render('teacher/assignment_monitoring', {
    title: 'Pemantauan Tugas',
    myAssignments, classes, submissions,
    filters: { assignment_id, class_id },
    stats: { total, submitted, notSubmitted: total - submitted, graded }
  });
});

// List assignments
router.get('/assignments', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    
    const [assignments] = await pool.query(
      `SELECT 
        a.id, a.title, a.description, a.due_date, a.max_score, 
        a.is_published, a.created_at,
        s.name AS subject_name,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS class_names,
        COUNT(DISTINCT ac.class_id) AS class_count,
        (SELECT COUNT(*) FROM assignment_submissions asub WHERE asub.assignment_id = a.id) AS submission_count,
        (SELECT COUNT(DISTINCT u.id) 
         FROM users u 
         INNER JOIN assignment_classes ac2 ON ac2.class_id = u.class_id 
         WHERE ac2.assignment_id = a.id AND u.role = 'STUDENT' AND u.is_active = true) AS total_students
       FROM assignments a
       LEFT JOIN subjects s ON s.id = a.subject_id
       LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
       LEFT JOIN classes c ON c.id = ac.class_id
       WHERE a.teacher_id = :teacherId
       GROUP BY a.id, a.title, a.description, a.due_date, a.max_score, a.is_published, a.created_at, s.name
       ORDER BY a.created_at DESC;`,
      { teacherId }
    );
    
    // Calculate percentage for each assignment
    assignments.forEach(a => {
      a.submission_percentage = a.total_students > 0 
        ? Math.round((a.submission_count / a.total_students) * 100) 
        : 0;
    });
    
    res.render('teacher/assignments', {
      title: 'Tugas Saya',
      assignments
    });
  } catch (err) {
    console.error('Error loading assignments:', err);
    req.flash('error', 'Gagal memuat daftar tugas');
    res.redirect('/teacher');
  }
});

// New assignment form
router.get('/assignments/new', async (req, res) => {
  try {
    const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY ${CLASS_ORDER_SQL};`);
    
    res.render('teacher/assignment_new', {
      title: 'Buat Tugas Baru',
      subjects,
      classes
    });
  } catch (err) {
    console.error('Error loading new assignment form:', err);
    req.flash('error', 'Gagal membuka form tugas baru');
    res.redirect('/teacher/assignments');
  }
});

// Create assignment
router.post('/assignments', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const teacherId = req.session.user.id;
    const { subject_id, title, description, class_ids, due_date, max_score, allow_late_submission, is_published } = req.body;
    
    // Validate class_ids
    if (!class_ids || (Array.isArray(class_ids) && class_ids.length === 0)) {
      req.flash('error', 'Pilih minimal 1 kelas untuk tugas ini');
      return res.redirect('/teacher/assignments/new');
    }
    
    // Ensure class_ids is array
    const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];
    
    // Debug logging
    console.log('Creating assignment with data:', {
      subject_id,
      teacher_id: teacherId,
      title,
      class_ids: classIdsArray,
      due_date,
      max_score,
      allow_late_submission,
      is_published
    });
    
    // Insert assignment (without class_id for now, keep for backward compatibility)
    const [result] = await connection.query(
      `INSERT INTO assignments 
       (subject_id, teacher_id, title, description, class_id, due_date, max_score, allow_late_submission, is_published)
       VALUES (:subject_id, :teacher_id, :title, :description, NULL, :due_date, :max_score, :allow_late, :is_published);`,
      {
        subject_id: subject_id || null,
        teacher_id: teacherId,
        title,
        description: description || null,
        due_date: due_date || null,
        max_score: max_score || 100,
        allow_late: allow_late_submission ? true : false,
        is_published: is_published ? true : false
      }
    );
    
    const assignmentId = result.insertId;
    console.log('Assignment created successfully, ID:', assignmentId);
    
    // Insert into assignment_classes junction table
    for (const classId of classIdsArray) {
      await connection.query(
        `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
        [assignmentId, classId]
      );
    }
    console.log('Assignment linked to', classIdsArray.length, 'classes');
    
    // Send notification if published
    if (is_published) {
      try {
        for (const classId of classIdsArray) {
          console.log('Sending notification to class:', classId);
          await createNotificationForClass(
            classId,
            'ASSIGNMENT',
            `Tugas Baru: ${title}`,
            `Guru telah memberikan tugas baru. Deadline: ${due_date ? new Date(due_date).toLocaleDateString('id-ID') : 'Tidak ada'}`,
            assignmentId
          );
        }
        console.log('Notifications sent successfully');
      } catch (notifErr) {
        console.error('Error sending notification:', notifErr);
        // Don't fail the whole operation if notification fails
      }
    }
    
    await connection.commit();
    req.flash('success', `Tugas berhasil dibuat untuk ${classIdsArray.length} kelas`);
    res.redirect('/teacher/assignments');
  } catch (err) {
    await connection.rollback();
    console.error('Error creating assignment:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      sql: err.sql
    });
    req.flash('error', `Gagal membuat tugas: ${err.message}`);
    res.redirect('/teacher/assignments/new');
  } finally {
    connection.release();
  }
});

// View assignment detail & submissions
router.get('/assignments/:id', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const assignmentId = req.params.id;
    
    const [[assignment]] = await pool.query(
      `SELECT 
        a.*, 
        s.name AS subject_name
       FROM assignments a
       LEFT JOIN subjects s ON s.id = a.subject_id
       WHERE a.id = :id AND a.teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }

    // Ambil daftar kelas dari assignment_classes
    const [assignmentClasses] = await pool.query(
      `SELECT c.id, c.name FROM assignment_classes ac
       JOIN classes c ON c.id = ac.class_id
       WHERE ac.assignment_id = :aid
       ORDER BY c.name ASC`,
      { aid: assignmentId }
    );
    assignment.class_names = assignmentClasses.map(c => c.name).join(', ') || 'Semua Kelas';
    assignment.class_ids   = assignmentClasses.map(c => c.id);
    
    const [submissions] = await pool.query(
      `SELECT 
        sub.*,
        u.full_name AS student_name,
        u.username AS student_username,
        c.name AS class_name
       FROM assignment_submissions sub
       JOIN users u ON u.id = sub.student_id
       LEFT JOIN classes c ON c.id = u.class_id
       WHERE sub.assignment_id = :assignmentId
       ORDER BY u.full_name ASC;`,
      { assignmentId }
    );
    
    // Calculate total students from assignment_classes
    const [[totalStudents]] = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM users u
       INNER JOIN assignment_classes ac ON ac.class_id = u.class_id AND ac.assignment_id = :aid
       WHERE u.role = 'STUDENT' AND u.is_active = true`,
      { aid: assignmentId }
    );
    
    assignment.total_students = totalStudents.total || 0;
    assignment.submission_count = submissions.length;
    assignment.submission_percentage = assignment.total_students > 0 
      ? Math.round((assignment.submission_count / assignment.total_students) * 100) 
      : 0;
    
    res.render('teacher/assignment_detail', {
      title: assignment.title,
      assignment,
      submissions
    });
  } catch (err) {
    console.error('Error loading assignment detail:', err);
    req.flash('error', 'Gagal memuat detail tugas');
    res.redirect('/teacher/assignments');
  }
});

// Edit assignment form
router.get('/assignments/:id/edit', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const assignmentId = req.params.id;
    
    const [[assignment]] = await pool.query(
      `SELECT * FROM assignments WHERE id = :id AND teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }
    
    // Get selected classes for this assignment
    const [selectedClasses] = await pool.query(
      `SELECT class_id FROM assignment_classes WHERE assignment_id = ?`,
      [assignmentId]
    );
    assignment.selected_class_ids = selectedClasses.map(sc => sc.class_id);
    
    const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY ${CLASS_ORDER_SQL};`);
    
    res.render('teacher/assignment_edit', {
      title: `Edit: ${assignment.title}`,
      assignment,
      subjects,
      classes
    });
  } catch (err) {
    console.error('Error loading edit assignment form:', err);
    req.flash('error', 'Gagal membuka form edit tugas');
    res.redirect('/teacher/assignments');
  }
});

// Update assignment
router.post('/assignments/:id/update', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const teacherId = req.session.user.id;
    const assignmentId = req.params.id;
    const { subject_id, title, description, class_ids, due_date, max_score, allow_late_submission, is_published } = req.body;
    
    // Validate class_ids
    if (!class_ids || (Array.isArray(class_ids) && class_ids.length === 0)) {
      req.flash('error', 'Pilih minimal 1 kelas untuk tugas ini');
      return res.redirect(`/teacher/assignments/${assignmentId}/edit`);
    }
    
    // Ensure class_ids is array
    const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];
    
    // Verify ownership
    const [[existing]] = await connection.query(
      `SELECT id FROM assignments WHERE id = :id AND teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!existing) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }
    
    // Update assignment
    await connection.query(
      `UPDATE assignments 
       SET subject_id = :subject_id,
           title = :title,
           description = :description,
           due_date = :due_date,
           max_score = :max_score,
           allow_late_submission = :allow_late,
           is_published = :is_published
       WHERE id = :id AND teacher_id = :teacherId;`,
      {
        subject_id: subject_id || null,
        title,
        description: description || null,
        due_date: due_date || null,
        max_score: max_score || 100,
        allow_late: allow_late_submission ? true : false,
        is_published: is_published ? true : false,
        id: assignmentId,
        teacherId
      }
    );
    
    // Delete existing class assignments
    await connection.query(
      `DELETE FROM assignment_classes WHERE assignment_id = ?`,
      [assignmentId]
    );
    
    // Insert new class assignments
    for (const classId of classIdsArray) {
      await connection.query(
        `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
        [assignmentId, classId]
      );
    }
    
    await connection.commit();
    req.flash('success', `Tugas berhasil diperbarui untuk ${classIdsArray.length} kelas`);
    res.redirect('/teacher/assignments');
  } catch (err) {
    await connection.rollback();
    console.error('Error updating assignment:', err);
    req.flash('error', 'Gagal memperbarui tugas');
    res.redirect(`/teacher/assignments/${req.params.id}/edit`);
  } finally {
    connection.release();
  }
});

// Grade submission
router.post('/assignments/:id/submissions/:submissionId/grade', async (req, res) => {
  const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';
  try {
    const teacherId = req.session.user.id;
    const { score, feedback } = req.body;
    
    await pool.query(
      `UPDATE assignment_submissions 
       SET score = :score, feedback = :feedback, graded_at = NOW(), graded_by = :teacherId
       WHERE id = :submissionId;`,
      {
        score: (score !== '' && score !== null && score !== undefined) ? Number(score) : null,
        feedback: feedback || null,
        teacherId: parseInt(teacherId),
        submissionId: parseInt(req.params.submissionId)
      }
    );
    
    if (isAjax) return res.json({ ok: true, score: score !== '' ? Number(score) : null, feedback: feedback || null });
    req.flash('success', 'Nilai berhasil disimpan');
    res.redirect(`/teacher/assignments/${req.params.id}`);
  } catch (err) {
    console.error('Error grading submission:', err);
    const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';
    if (isAjax) return res.json({ ok: false, message: err.message });
    req.flash('error', 'Gagal menyimpan nilai');
    res.redirect(`/teacher/assignments/${req.params.id}`);
  }
});

// Reset individual submission
router.post('/assignments/submissions/:submissionId/reset', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const submissionId = req.params.submissionId;
    
    // Verify ownership
    const [[submission]] = await pool.query(
      `SELECT sub.*, a.teacher_id, a.id as assignment_id
       FROM assignment_submissions sub
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.id = :submissionId AND a.teacher_id = :teacherId;`,
      { submissionId, teacherId }
    );
    
    if (!submission) {
      req.flash('error', 'Submission tidak ditemukan atau Anda tidak memiliki akses');
      return res.redirect('/teacher/assignments');
    }
    
    // Delete file if exists
    if (submission.file_path) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', '..', submission.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    // Delete submission
    await pool.query(
      `DELETE FROM assignment_submissions WHERE id = :submissionId;`,
      { submissionId }
    );
    
    req.flash('success', 'Submission berhasil direset');
    res.redirect(`/teacher/assignments/${submission.assignment_id}`);
  } catch (err) {
    console.error('Error resetting submission:', err);
    req.flash('error', 'Gagal mereset submission');
    res.redirect('/teacher/assignments');
  }
});

// Reset all submissions for an assignment
router.post('/assignments/:id/reset-all', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const assignmentId = req.params.id;
    
    // Verify ownership
    const [[assignment]] = await pool.query(
      `SELECT * FROM assignments WHERE id = :id AND teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }
    
    // Get all submissions to delete files
    const [submissions] = await pool.query(
      `SELECT file_path FROM assignment_submissions WHERE assignment_id = :assignmentId AND file_path IS NOT NULL;`,
      { assignmentId }
    );
    
    // Delete all files
    const fs = require('fs');
    const path = require('path');
    let deletedFiles = 0;
    
    for (const sub of submissions) {
      if (sub.file_path) {
        const filePath = path.join(__dirname, '..', '..', sub.file_path);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            deletedFiles++;
          }
        } catch (fileErr) {
          console.error('Error deleting file:', fileErr);
        }
      }
    }
    
    // Delete all submissions
    const [result] = await pool.query(
      `DELETE FROM assignment_submissions WHERE assignment_id = :assignmentId;`,
      { assignmentId }
    );
    
    req.flash('success', `Berhasil mereset ${result.affectedRows} submission dan menghapus ${deletedFiles} file`);
    res.redirect(`/teacher/assignments/${assignmentId}`);
  } catch (err) {
    console.error('Error resetting all submissions:', err);
    req.flash('error', 'Gagal mereset submission');
    res.redirect(`/teacher/assignments/${req.params.id}`);
  }
});

// Toggle publish
router.post('/assignments/:id/toggle-publish', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const assignmentId = req.params.id;
    
    const [[assignment]] = await pool.query(
      `SELECT * FROM assignments WHERE id = :id AND teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }
    
    const newStatus = assignment.is_published ? 0 : 1;
    
    await pool.query(
      `UPDATE assignments SET is_published = :status WHERE id = :id;`,
      { status: newStatus, id: assignmentId }
    );
    
    // Send notification if publishing — DIHAPUS
    // Notifikasi hanya dibuat manual oleh guru

    req.flash('success', newStatus ? 'Tugas dipublikasi' : 'Tugas di-unpublish');
    res.redirect('/teacher/assignments');
  } catch (err) {
    console.error('Error toggling publish:', err);
    req.flash('error', 'Gagal mengubah status publikasi');
    res.redirect('/teacher/assignments');
  }
});

// Delete assignment
router.delete('/assignments/:id', async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    
    await pool.query(
      `DELETE FROM assignments WHERE id = :id AND teacher_id = :teacherId;`,
      { id: req.params.id, teacherId }
    );
    
    req.flash('success', 'Tugas berhasil dihapus');
    res.redirect('/teacher/assignments');
  } catch (err) {
    console.error('Error deleting assignment:', err);
    req.flash('error', 'Gagal menghapus tugas');
    res.redirect('/teacher/assignments');
  }
});

module.exports = router;


// ===== AGENDA GURU =====
router.get('/agenda', async (req, res) => {
  const user = req.session.user;
  const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  const [agendas] = await pool.query(
    `SELECT * FROM agendas WHERE teacher_id=:tid
     AND EXTRACT(MONTH FROM agenda_date)=:bulan AND EXTRACT(YEAR FROM agenda_date)=:tahun
     ORDER BY agenda_date ASC, start_time ASC;`,
    { tid: user.id, bulan, tahun }
  );
  const [upcoming] = await pool.query(
    `SELECT * FROM agendas WHERE teacher_id=:tid
     AND agenda_date >= CURRENT_DATE AND agenda_date <= CURRENT_DATE + 7
     ORDER BY agenda_date ASC, start_time ASC LIMIT 5;`,
    { tid: user.id }
  );
  res.render('teacher/agenda', { title: 'Agenda Saya', agendas, upcoming, bulan, tahun });
});

router.post('/agenda', async (req, res) => {
  const user = req.session.user;
  const { title, description, agenda_date, start_time, end_time, category } = req.body;
  try {
    await pool.query(
      `INSERT INTO agendas (teacher_id, title, description, agenda_date, start_time, end_time, category)
       VALUES (:tid,:title,:desc,:date,:start,:end,:cat);`,
      { tid: user.id, title, desc: description||null, date: agenda_date,
        start: start_time||null, end: end_time||null, cat: category||'UMUM' }
    );
    req.flash('success', 'Agenda ditambahkan.');
  } catch(e) { console.error(e); req.flash('error', 'Gagal menambahkan agenda.'); }
  res.redirect('/teacher/agenda');
});

router.post('/agenda/:id/edit', async (req, res) => {
  const user = req.session.user;
  const { title, description, agenda_date, start_time, end_time, category, status } = req.body;
  try {
    await pool.query(
      `UPDATE agendas SET title=:title, description=:desc, agenda_date=:date,
       start_time=:start, end_time=:end, category=:cat, status=:status
       WHERE id=:id AND teacher_id=:tid;`,
      { title, desc: description||null, date: agenda_date, start: start_time||null,
        end: end_time||null, cat: category||'UMUM', status: status||'AKTIF',
        id: req.params.id, tid: user.id }
    );
    req.flash('success', 'Agenda diperbarui.');
  } catch(e) { console.error(e); req.flash('error', 'Gagal memperbarui agenda.'); }
  res.redirect('/teacher/agenda');
});

router.post('/agenda/:id/delete', async (req, res) => {
  const user = req.session.user;
  try {
    await pool.query(`DELETE FROM agendas WHERE id=:id AND teacher_id=:tid;`,
      { id: req.params.id, tid: user.id });
    req.flash('success', 'Agenda dihapus.');
  } catch(e) { req.flash('error', 'Gagal menghapus.'); }
  res.redirect('/teacher/agenda');
});

// ===== EXPORT SOAL KE EXCEL =====
router.get('/exams/:id/questions/export', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;
  try {
    const [[exam]] = await pool.query(
      `SELECT e.id, e.title, s.name AS subject_name FROM exams e
       JOIN subjects s ON s.id=e.subject_id
       WHERE e.id=:id AND (:isAdmin=1 OR e.teacher_id=:tid) LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );
    if (!exam) { req.flash('error', 'Ujian tidak ditemukan.'); return res.redirect('/teacher/exams'); }

    const [questions] = await pool.query(
      `SELECT q.id, q.question_text, q.question_image, q.points, q.question_type FROM questions q
       WHERE q.exam_id=:eid ORDER BY q.id ASC;`,
      { eid: examId }
    );

    const [options] = await pool.query(
      `SELECT o.question_id, o.option_label, o.option_text, o.option_image, o.is_correct
       FROM options o
       JOIN questions q ON q.id=o.question_id
       WHERE q.exam_id=:eid ORDER BY o.question_id ASC, o.option_label ASC;`,
      { eid: examId }
    );

    // Map opsi per soal
    const optMap = {};
    for (const o of options) {
      if (!optMap[o.question_id]) optMap[o.question_id] = {};
      optMap[o.question_id][o.option_label] = {
        text: o.option_text || '',
        image: o.option_image || '',
        correct: o.is_correct
      };
    }

    // Helper: ambil nama file asli (tanpa prefix timestamp) dari path tersimpan
    // File tersimpan: "1712345678_nama_asli.jpg" → kembalikan "nama_asli.jpg"
    // Jika URL eksternal, kembalikan URL utuh
    const getImageRef = (p) => {
      if (!p) return '';
      const v = String(p).trim();
      if (!v) return '';
      if (/^https?:\/\//i.test(v)) return v; // URL eksternal tetap utuh
      const base = path.basename(v);
      // Hapus prefix timestamp: "1712345678_" di awal nama file
      const withoutTs = base.replace(/^\d{10,13}_/, '');
      return withoutTs || base;
    };

    // Kumpulkan semua gambar yang dipakai (untuk sheet Daftar Gambar)
    // imgList: [['Nama File (untuk Excel)', 'URL Download', 'Dipakai di']]
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
        const appUrl = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000';
        const downloadUrl = `${appUrl}/public/uploads/questions/${base}`;
        imgList.push([displayName, downloadUrl, usedIn]);
      }
    };

    // Buat data dengan header SAMA PERSIS dengan template import
    const stripHtml = (html) => {
      if (!html) return '';
      return String(html)
        .replace(/<br\s*\/?>/gi, '\n')       // br → newline
        .replace(/<\/p>/gi, '\n')             // /p → newline
        .replace(/<\/li>/gi, '\n')            // /li → newline
        .replace(/<[^>]+>/g, '')              // hapus semua tag HTML
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')           // max 2 newline berturut
        .trim();
    };

    const rows = questions.map((q, idx) => {
      const opts = optMap[q.id] || {};
      const qtype = q.question_type || 'MCQ';
      const correctEntries = Object.entries(opts).filter(([,v]) => v.correct).map(([lbl]) => lbl);
      const correctStr = correctEntries.join(',');
      const qText = stripHtml(q.question_text);

      // Kumpulkan gambar untuk sheet Daftar Gambar
      if (q.question_image) addImg(q.question_image, `Soal no.${idx+1}`);
      if (opts['A']?.image) addImg(opts['A'].image, `Soal no.${idx+1} opsi A`);
      if (opts['B']?.image) addImg(opts['B'].image, `Soal no.${idx+1} opsi B`);
      if (opts['C']?.image) addImg(opts['C'].image, `Soal no.${idx+1} opsi C`);
      if (opts['D']?.image) addImg(opts['D'].image, `Soal no.${idx+1} opsi D`);
      if (opts['E']?.image) addImg(opts['E'].image, `Soal no.${idx+1} opsi E`);

      return {
        'question_text': qText,
        'image': getImageRef(q.question_image),
        'points': q.points || 1,
        'correct': correctStr,
        'question_type': qtype,
        'A': stripHtml(opts['A']?.text),
        'B': stripHtml(opts['B']?.text),
        'C': stripHtml(opts['C']?.text),
        'D': stripHtml(opts['D']?.text),
        'E': stripHtml(opts['E']?.text),
        'image_a': getImageRef(opts['A']?.image),
        'image_b': getImageRef(opts['B']?.image),
        'image_c': getImageRef(opts['C']?.image),
        'image_d': getImageRef(opts['D']?.image),
        'image_e': getImageRef(opts['E']?.image),
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['question_text','image','points','correct','question_type','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e']
    });
    ws['!cols'] = [
      {wch:60}, // question_text
      {wch:25}, // image
      {wch:8},  // points
      {wch:12}, // correct
      {wch:12}, // question_type
      {wch:35}, // A
      {wch:35}, // B
      {wch:35}, // C
      {wch:35}, // D
      {wch:35}, // E
      {wch:25}, // image_a
      {wch:25}, // image_b
      {wch:25}, // image_c
      {wch:25}, // image_d
      {wch:25}, // image_e
    ];

    const panduan = [
      ['PANDUAN IMPORT SOAL'],[''],
      ['Kolom','Keterangan'],
      ['question_text','Teks soal (wajib)'],
      ['image','Nama file gambar soal (opsional, contoh: gambar1.jpg)'],
      ['points','Poin soal (default: 1)'],
      ['correct','Kunci jawaban: A/B/C/D/E (wajib)'],
      ['A','Teks opsi A (wajib)'],
      ['B','Teks opsi B (wajib)'],
      ['C','Teks opsi C (wajib)'],
      ['D','Teks opsi D (wajib)'],
      ['E','Teks opsi E (wajib)'],
      ['image_a','Nama file gambar opsi A (opsional)'],
      ['image_b','Nama file gambar opsi B (opsional)'],
      ['image_c','Nama file gambar opsi C (opsional)'],
      ['image_d','Nama file gambar opsi D (opsional)'],
      ['image_e','Nama file gambar opsi E (opsional)'],
      [''],['Catatan:'],
      ['- File ini bisa langsung diimport ulang ke ujian lain tanpa perlu edit'],
      ['- Kolom gambar berisi nama file asli (tanpa prefix timestamp)'],
      ['- Lihat sheet "Daftar Gambar" untuk download gambar yang dibutuhkan'],
      ['- Upload gambar via menu "Upload Gambar Soal" sebelum/sesudah import'],
      ['- Saat upload gambar, gunakan nama file yang sama dengan yang ada di kolom image'],
    ];
    const wsPanduan = XLSX.utils.aoa_to_sheet(panduan);
    wsPanduan['!cols'] = [{wch:15},{wch:70}];

    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    // Tambahkan sheet Daftar Gambar jika ada gambar
    if (imgList.length > 1) {
      const wsImg = XLSX.utils.aoa_to_sheet(imgList);
      wsImg['!cols'] = [{wch:35},{wch:70},{wch:25}];
      XLSX.utils.book_append_sheet(wb, wsImg, 'Daftar Gambar');
    }
    XLSX.utils.book_append_sheet(wb, wsPanduan, 'Panduan');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeName = exam.title.replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'_').slice(0,50);

    // Jika ada gambar → buat ZIP berisi Excel + folder gambar
    if (imgSeen.size > 0) {
      const JSZip = require('jszip');
      const zip = new JSZip();
      const xlsxName = `soal_${safeName}.xlsx`;
      zip.file(xlsxName, xlsxBuffer);

      // Tambahkan setiap file gambar ke folder 'gambar/' dalam ZIP
      const imgFolder = zip.folder('gambar');
      for (const base of imgSeen) {
        const absPath = path.join(uploadDir, base);
        if (fs.existsSync(absPath)) {
          const displayName = base.replace(/^\d{10,13}_/, '');
          imgFolder.file(displayName, fs.readFileSync(absPath));
        }
      }

      // Tambahkan README panduan import
      zip.file('PANDUAN_IMPORT.txt',
        `PANDUAN IMPORT SOAL DENGAN GAMBAR\n` +
        `===================================\n\n` +
        `1. File Excel: ${xlsxName}\n` +
        `   - Kolom image, image_a-image_e berisi nama file gambar\n\n` +
        `2. Folder gambar/\n` +
        `   - Berisi semua file gambar yang dipakai soal\n\n` +
        `CARA IMPORT:\n` +
        `1. Import file Excel ke ujian/bank soal yang diinginkan\n` +
        `2. Buka menu "Upload Gambar Soal"\n` +
        `3. Pilih semua file dari folder gambar/ dan upload sekaligus\n` +
        `4. Sistem akan mencocokkan gambar secara otomatis\n`
      );

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const zipName = `soal_${safeName}_dengan_gambar.zip`;
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
      res.setHeader('Content-Type', 'application/zip');
      res.send(zipBuffer);
    } else {
      // Tidak ada gambar → kirim Excel saja
      const filename = `soal_${safeName}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(xlsxBuffer);
    }
  } catch(e) {
    console.error(e);
    req.flash('error', 'Gagal export soal: ' + e.message);
    res.redirect(`/teacher/exams/${examId}`);
  }
});

// Download Excel siswa belum mengerjakan (untuk guru)
router.get('/grades/download-not-yet', async (req, res) => {
  const user     = req.session.user;
  const exam_id  = (req.query.exam_id  || '').trim();
  const class_id = (req.query.class_id || '').trim();
  if (!exam_id) return res.redirect('/teacher/grades');

  try {
    // Pastikan ujian milik guru ini
    const examRes = await pool.query(`SELECT title FROM exams WHERE id=$1 AND teacher_id=$2 LIMIT 1`, [exam_id, user.id]);
    const examTitle = examRes[0][0]?.title;
    if (!examTitle) return res.redirect('/teacher/grades');

    const notYetRes = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END,
            regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
            (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST,
            u.full_name ASC
        ) AS no,
        c.name AS kelas,
        u.full_name AS nama_siswa,
        u.username
      FROM exams e
      JOIN exam_classes ec ON ec.exam_id = e.id
      JOIN users u ON u.class_id = ec.class_id AND u.role = 'STUDENT' AND u.is_active = true
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE e.id = $1 AND e.teacher_id = $2
        AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.exam_id = e.id AND a.student_id = u.id)
        ${class_id ? 'AND u.class_id = $3' : ''}
      ORDER BY
        CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END ASC,
        regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
        (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST,
        u.full_name ASC
    `, class_id ? [exam_id, user.id, class_id] : [exam_id, user.id]);

    const rows = notYetRes[0] || [];
    if (!rows.length) {
      req.flash('success', 'Semua siswa sudah mengerjakan ujian ini.');
      return res.redirect(`/teacher/grades?exam_id=${exam_id}`);
    }

    const data = rows.map(r => ({
      'No':         r.no,
      'Kelas':      r.kelas || '-',
      'Nama Siswa': r.nama_siswa,
      'Username':   r.username,
      'Status':     'Belum Mengerjakan',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{wch:5},{wch:14},{wch:35},{wch:25},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws, 'Belum Mengerjakan');

    const now    = new Date().toISOString().slice(0,10);
    const safe   = examTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0,30);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="belum_mengerjakan_${safe}_${now}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error('Teacher download not-yet error:', e.message);
    req.flash('error', 'Gagal mengunduh: ' + e.message);
    res.redirect(`/teacher/grades?exam_id=${exam_id}`);
  }
});

// Download Excel daftar nilai
router.get('/grades/download', async (req, res) => {
  const user = req.session.user;
  const exam_id = (req.query.exam_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const q = (req.query.q || '').trim();

  const where = ['e.teacher_id=$1'];
  const params = [user.id];

  if (exam_id)  { params.push(exam_id);  where.push(`e.id=$${params.length}`); }
  if (class_id) { params.push(class_id); where.push(`u.class_id=$${params.length}`); }
  if (q) { params.push('%' + q + '%'); where.push(`(u.full_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`); }

  try {
    // Get all data (no pagination for export)
    const [rows] = await pool.query(
      `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
              a.correct_count, a.wrong_count, a.total_points,
              e.id AS exam_id, e.title AS exam_title, e.pass_score, e.duration_minutes,
              (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) AS total_questions,
              u.full_name AS student_name, u.username,
              c.name AS class_name
       FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       JOIN users u ON u.id=a.student_id
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END ASC,
         regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
         (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST,
         u.full_name ASC, a.id DESC;`,
      params
    );

    if (rows.length === 0) {
      req.flash('error', 'Tidak ada data untuk diexport');
      return res.redirect('/teacher/grades');
    }

    // Prepare Excel data
    const workbook = XLSX.utils.book_new();
    
    // Sheet 1: Daftar Nilai
    const data = rows.map((r, idx) => {
      const isSubmitted = r.status === 'SUBMITTED';
      const totalQ    = Number(r.total_questions || 0);
      const correct   = Number(r.correct_count   || 0);
      const wrong     = Number(r.wrong_count      || 0);
      const pctBenar  = totalQ > 0 ? ((correct / totalQ) * 100).toFixed(1) + '%' : '-';
      const duration  = r.finished_at && r.started_at
        ? Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 60000)
        : 0;

      return {
        'No':             idx + 1,
        'Kelas':          r.class_name || '-',
        'Nama Siswa':     r.student_name,
        'Username':       r.username,
        'Ujian':          r.exam_title,
        'Status':         isSubmitted ? 'Selesai' : r.status === 'IN_PROGRESS' ? 'Sedang Mengerjakan' : 'Belum Mulai',
        'Nilai':          isSubmitted ? r.score : '-',
        'Passing Score':  r.pass_score,
        'Keterangan':     isSubmitted ? (Number(r.score) >= Number(r.pass_score) ? 'LULUS' : 'TIDAK LULUS') : '-',
        'Total Soal':     totalQ || '-',
        'Jawaban Benar':  isSubmitted ? correct : '-',
        'Jawaban Salah':  isSubmitted ? wrong   : '-',
        '% Benar':        isSubmitted ? pctBenar : '-',
        'Durasi (menit)': duration > 0 ? duration : '-',
        'Mulai':          r.started_at  ? new Date(r.started_at).toLocaleString('id-ID')  : '-',
        'Selesai':        r.finished_at ? new Date(r.finished_at).toLocaleString('id-ID') : '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 14 }, // Kelas
      { wch: 28 }, // Nama
      { wch: 18 }, // Username
      { wch: 30 }, // Ujian
      { wch: 18 }, // Status
      { wch: 8 },  // Nilai
      { wch: 13 }, // Passing Score
      { wch: 13 }, // Keterangan
      { wch: 10 }, // Total Soal
      { wch: 14 }, // Jawaban Benar
      { wch: 14 }, // Jawaban Salah
      { wch: 10 }, // % Benar
      { wch: 13 }, // Durasi
      { wch: 20 }, // Mulai
      { wch: 20 }  // Selesai
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar Nilai');

    // Sheet 2: Statistik (jika ada filter ujian tertentu)
    if (exam_id) {
      const [[examInfo]] = await pool.query(
        `SELECT e.title, e.pass_score, e.duration_minutes,
                COUNT(DISTINCT a.student_id) AS total_students,
                COUNT(CASE WHEN a.status='SUBMITTED' THEN 1 END) AS submitted_count,
                AVG(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS avg_score,
                MAX(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS max_score,
                MIN(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS min_score,
                COUNT(CASE WHEN a.status='SUBMITTED' AND a.score >= e.pass_score THEN 1 END) AS pass_count
         FROM exams e
         LEFT JOIN attempts a ON a.exam_id=e.id
         WHERE e.id=:exam_id AND e.teacher_id=:tid
         GROUP BY e.id;`,
        { exam_id, tid: user.id }
      );

      if (examInfo) {
        const statsData = [
          { 'Keterangan': 'Judul Ujian',              'Nilai': examInfo.title },
          { 'Keterangan': 'Passing Score',             'Nilai': examInfo.pass_score },
          { 'Keterangan': 'Durasi (menit)',            'Nilai': examInfo.duration_minutes },
          { 'Keterangan': '',                          'Nilai': '' },
          { 'Keterangan': 'Total Siswa Mengerjakan',   'Nilai': examInfo.total_students },
          { 'Keterangan': 'Sudah Submit',              'Nilai': examInfo.submitted_count },
          { 'Keterangan': 'Lulus',                     'Nilai': examInfo.pass_count },
          { 'Keterangan': 'Tidak Lulus',               'Nilai': Number(examInfo.submitted_count) - Number(examInfo.pass_count) },
          { 'Keterangan': '',                          'Nilai': '' },
          { 'Keterangan': 'Nilai Rata-rata',           'Nilai': examInfo.avg_score ? Number(examInfo.avg_score).toFixed(2) : '-' },
          { 'Keterangan': 'Nilai Tertinggi',           'Nilai': examInfo.max_score || '-' },
          { 'Keterangan': 'Nilai Terendah',            'Nilai': examInfo.min_score || '-' },
          { 'Keterangan': 'Persentase Kelulusan',      'Nilai': examInfo.submitted_count > 0 ? ((examInfo.pass_count / examInfo.submitted_count) * 100).toFixed(1) + '%' : '-' },
          { 'Keterangan': 'Rata-rata Jawaban Benar',   'Nilai': examInfo.avg_correct != null ? Number(examInfo.avg_correct).toFixed(1) : '-' },
        ];
        const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
        statsWorksheet['!cols'] = [{ wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'Statistik');

        // Sheet 3: Rekap Per Kelas
        const [classRows] = await pool.query(
          `SELECT
             c.name AS kelas,
             COUNT(DISTINCT a.student_id) AS total_siswa,
             COUNT(CASE WHEN a.status='SUBMITTED' THEN 1 END) AS sudah_submit,
             COUNT(CASE WHEN a.status='SUBMITTED' AND a.score >= e.pass_score THEN 1 END) AS lulus,
             ROUND(AVG(CASE WHEN a.status='SUBMITTED' THEN a.score END),1) AS rata_nilai,
             MAX(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS nilai_max,
             MIN(CASE WHEN a.status='SUBMITTED' THEN a.score END) AS nilai_min,
             ROUND(AVG(CASE WHEN a.status='SUBMITTED' THEN a.correct_count END),1) AS rata_benar,
             ROUND(AVG(CASE WHEN a.status='SUBMITTED' THEN a.wrong_count END),1) AS rata_salah,
             COUNT(DISTINCT q.id) AS total_soal
           FROM attempts a
           JOIN exams e ON e.id=a.exam_id
           JOIN users u ON u.id=a.student_id
           LEFT JOIN classes c ON c.id=u.class_id
           LEFT JOIN questions q ON q.exam_id=e.id
           WHERE e.id=:exam_id AND e.teacher_id=:tid AND a.status='SUBMITTED'
           GROUP BY c.name
           ORDER BY
             CASE WHEN c.name ~* '^XII' THEN 3 WHEN c.name ~* '^XI' THEN 2 WHEN c.name ~* '^X' THEN 1 ELSE 4 END,
             regexp_replace(upper(COALESCE(c.name,'')), '^(XII|XI|X)\\s+', '') ASC,
             (regexp_match(c.name, '(\\d+)\\s*$'))[1]::int NULLS LAST;`,
          { exam_id, tid: user.id }
        );
        if (classRows.length > 0) {
          const classData = classRows.map((r, i) => ({
            'No':                i + 1,
            'Kelas':             r.kelas || '-',
            'Total Siswa':       r.total_siswa,
            'Sudah Submit':      r.sudah_submit,
            'Lulus':             r.lulus,
            'Tidak Lulus':       Number(r.sudah_submit) - Number(r.lulus),
            '% Kelulusan':       r.sudah_submit > 0 ? ((r.lulus / r.sudah_submit) * 100).toFixed(1) + '%' : '-',
            'Rata-rata Nilai':   r.rata_nilai != null ? Number(r.rata_nilai).toFixed(1) : '-',
            'Nilai Tertinggi':   r.nilai_max || '-',
            'Nilai Terendah':    r.nilai_min || '-',
            'Rata-rata Benar':   r.rata_benar != null ? Number(r.rata_benar).toFixed(1) : '-',
            'Rata-rata Salah':   r.rata_salah != null ? Number(r.rata_salah).toFixed(1) : '-',
            'Total Soal':        r.total_soal || '-',
          }));
          const wsKelas = XLSX.utils.json_to_sheet(classData);
          wsKelas['!cols'] = [{wch:5},{wch:15},{wch:12},{wch:13},{wch:8},{wch:12},{wch:12},{wch:15},{wch:15},{wch:15},{wch:15},{wch:15},{wch:10}];
          XLSX.utils.book_append_sheet(workbook, wsKelas, 'Rekap Per Kelas');
        }

        // Sheet 4: Analisis Soal (hanya jika filter ujian)
        const [soalRows] = await pool.query(
          `SELECT
             q.id AS soal_id,
             ROW_NUMBER() OVER (ORDER BY q.id ASC) AS no_soal,
             LEFT(REGEXP_REPLACE(q.question_text, '<[^>]+>', '', 'g'), 120) AS teks_soal,
             q.points,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE a.status='SUBMITTED') AS total_jawab,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE aa.is_correct=true AND a.status='SUBMITTED') AS benar,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE aa.is_correct=false AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS salah,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE aa.option_id IS NULL AND a.status='SUBMITTED') AS tidak_jawab,
             ROUND(
               100.0 * COUNT(DISTINCT aa.attempt_id) FILTER (WHERE aa.is_correct=true AND a.status='SUBMITTED')
               / NULLIF(COUNT(DISTINCT aa.attempt_id) FILTER (WHERE a.status='SUBMITTED'), 0)
             , 1) AS pct_benar,
             -- Distribusi pilihan per opsi
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE o.option_label='A' AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS pilih_a,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE o.option_label='B' AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS pilih_b,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE o.option_label='C' AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS pilih_c,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE o.option_label='D' AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS pilih_d,
             COUNT(DISTINCT aa.attempt_id) FILTER (WHERE o.option_label='E' AND a.status='SUBMITTED' AND aa.option_id IS NOT NULL) AS pilih_e,
             -- Kunci jawaban
             STRING_AGG(DISTINCT o2.option_label, ',' ORDER BY o2.option_label) FILTER (WHERE o2.is_correct=true) AS kunci
           FROM questions q
           JOIN attempts a ON a.exam_id=q.exam_id AND a.status='SUBMITTED'
           LEFT JOIN attempt_answers aa ON aa.question_id=q.id AND aa.attempt_id=a.id
           LEFT JOIN options o ON o.id=aa.option_id
           LEFT JOIN options o2 ON o2.question_id=q.id
           WHERE q.exam_id=:exam_id AND a.exam_id=:exam_id
             AND (:tid::int IS NULL OR a.exam_id IN (SELECT id FROM exams WHERE teacher_id=:tid))
           GROUP BY q.id, q.question_text, q.points
           ORDER BY q.id ASC;`,
          { exam_id, tid: user.id }
        );
        if (soalRows.length > 0) {
          const soalData = soalRows.map(r => {
            const pct = r.pct_benar != null ? Number(r.pct_benar).toFixed(1) + '%' : '-';
            const tingkat = r.pct_benar == null ? '-'
              : r.pct_benar >= 70 ? 'Mudah'
              : r.pct_benar >= 30 ? 'Sedang'
              : 'Sulit';
            return {
              'No':           r.no_soal,
              'Teks Soal':    r.teks_soal || '-',
              'Poin':         r.points,
              'Kunci':        r.kunci || '-',
              'Total Jawab':  r.total_jawab,
              'Benar':        r.benar,
              'Salah':        r.salah,
              'Tdk Jawab':    r.tidak_jawab,
              '% Benar':      pct,
              'Tingkat':      tingkat,
              'Pilih A':      r.pilih_a || 0,
              'Pilih B':      r.pilih_b || 0,
              'Pilih C':      r.pilih_c || 0,
              'Pilih D':      r.pilih_d || 0,
              'Pilih E':      r.pilih_e || 0,
            };
          });
          const wsSoal = XLSX.utils.json_to_sheet(soalData);
          wsSoal['!cols'] = [
            {wch:5},{wch:60},{wch:6},{wch:8},{wch:12},{wch:8},{wch:8},{wch:10},
            {wch:10},{wch:8},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9}
          ];
          XLSX.utils.book_append_sheet(workbook, wsSoal, 'Analisis Soal');
        }
      }
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = exam_id 
      ? `Nilai_${rows[0]?.exam_title.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`
      : `Daftar_Nilai_${timestamp}.xlsx`;

    // Send file
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('Error downloading grades:', error);
    req.flash('error', 'Gagal download Excel: ' + error.message);
    res.redirect('/teacher/grades');
  }
});

module.exports = router;


// GET Export Exam Questions to Excel
router.get('/exams/:id/export', async (req, res) => {
  const user = req.session.user;
  const examId = req.params.id;

  try {
    // Get exam data
    const [[exam]] = await pool.query(
      `SELECT e.*, s.name as subject_name 
       FROM exams e
       JOIN subjects s ON e.subject_id = s.id
       WHERE e.id = :id AND e.teacher_id = :tid LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/teacher/exams');
    }

    // Get questions with options
    const [questions] = await pool.query(
      `SELECT q.*, 
        (SELECT GROUP_CONCAT(
          CONCAT(o.option_label, '|', o.option_text, '|', o.is_correct)
          ORDER BY o.option_label SEPARATOR ';;'
        ) FROM options o WHERE o.question_id = q.id) as options_data
       FROM questions q
       WHERE q.exam_id = :exam_id
       ORDER BY q.id ASC;`,
      { exam_id: examId }
    );

    // Prepare data for Excel
    const excelData = [];
    
    // Add header info
    excelData.push(['SOAL UJIAN']);
    excelData.push(['Judul Ujian', exam.title]);
    excelData.push(['Mata Pelajaran', exam.subject_name]);
    excelData.push(['Durasi', `${exam.duration_minutes} menit`]);
    excelData.push(['Passing Score', exam.pass_score]);
    excelData.push(['Total Soal', questions.length]);
    excelData.push([]); // Empty row
    
    // Add table header
    excelData.push([
      'No',
      'Soal',
      'Opsi A',
      'Opsi B',
      'Opsi C',
      'Opsi D',
      'Opsi E',
      'Jawaban Benar',
      'Poin'
    ]);

    // Add questions
    questions.forEach((q, index) => {
      const options = {};
      let correctAnswer = '';
      
      if (q.options_data) {
        const optionsArray = q.options_data.split(';;');
        optionsArray.forEach(opt => {
          const [label, text, isCorrect] = opt.split('|');
          options[label] = text;
          if (isCorrect === '1') {
            correctAnswer = label;
          }
        });
      }

      excelData.push([
        index + 1,
        q.question_text,
        options['A'] || '',
        options['B'] || '',
        options['C'] || '',
        options['D'] || '',
        options['E'] || '',
        correctAnswer,
        q.points || 1
      ]);
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },   // No
      { wch: 50 },  // Soal
      { wch: 30 },  // Opsi A
      { wch: 30 },  // Opsi B
      { wch: 30 },  // Opsi C
      { wch: 30 },  // Opsi D
      { wch: 30 },  // Opsi E
      { wch: 10 },  // Jawaban Benar
      { wch: 8 }    // Poin
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Soal Ujian');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for download
    const filename = `Soal_${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Send file
    res.send(buffer);

  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal export soal ujian.');
    res.redirect(`/teacher/exams/${examId}`);
  }
});

// ===== RAPORT TENGAH SEMESTER =====

// GET /teacher/raport - daftar periode aktif + mapel yang diampu guru ini (via raport_subject_classes)
router.get('/raport', async (req, res) => {
  const user = req.session.user;
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id       AS period_id,
        p.name     AS period_name,
        p.semester,
        p.school_year,
        rs.id      AS subject_id,
        rs.subject_name,
        rsg.name   AS group_name,
        rsc.class_id,
        c.name     AS class_name,
        rsc.id     AS sc_id
      FROM raport_periods p
      JOIN raport_subject_groups rsg ON rsg.period_id = p.id
      JOIN raport_subjects rs ON rs.group_id = rsg.id
      JOIN raport_subject_classes rsc ON rsc.raport_subject_id = rs.id
      JOIN classes c ON c.id = rsc.class_id
      WHERE p.is_active = true
        AND rsc.teacher_id = $1
      ORDER BY p.created_at DESC, rsg.sort_order ASC, rs.sort_order ASC, c.name ASC
    `, [user.id]);

    // Bangun nested per periode
    const periodMap = new Map();
    for (const row of rows) {
      if (!periodMap.has(row.period_id)) {
        periodMap.set(row.period_id, {
          id:           row.period_id,
          name:         row.period_name,
          semester:     row.semester,
          school_year:  row.school_year,
          subjects:     []
        });
      }
      // Setiap kombinasi subject + class menjadi 1 entry
      periodMap.get(row.period_id).subjects.push({
        subject_id:   row.subject_id,
        subject_name: row.subject_name,
        group_name:   row.group_name,
        class_id:     row.class_id,
        class_name:   row.class_name
      });
    }
    const periods = [...periodMap.values()];

    // Hitung status per (subject_id, class_id): ada TP? ada nilai?
    if (rows.length > 0) {
      // Ambil subject_id unik yang guru ini ampu
      const subjectIds = [...new Set(rows.map(r => r.subject_id))];
      const classIds   = [...new Set(rows.map(r => r.class_id))];
      const periodIds  = [...new Set(rows.map(r => r.period_id))];

      // Jumlah TP per subject (class-specific or null)
      const phS = subjectIds.map((_, i) => `$${i + 1}`).join(',');
      const phC = classIds.map((_, i)   => `$${subjectIds.length + i + 1}`).join(',');
      const [tpRows] = await pool.query(
        `SELECT raport_subject_id AS subject_id, class_id, COUNT(*) AS tp_count
         FROM raport_subject_kd
         WHERE raport_subject_id IN (${phS})
           AND (class_id IN (${phC}) OR class_id IS NULL)
         GROUP BY raport_subject_id, class_id`,
        [...subjectIds, ...classIds]
      );
      // key: `${subject_id}_${class_id}` -> tp_count (class_id=null treated per subject)
      const tpMap = {};
      for (const t of tpRows) {
        // null class_id TP berlaku untuk semua kelas mapel ini
        if (t.class_id === null) {
          for (const cid of classIds) tpMap[`${t.subject_id}_${cid}`] = (tpMap[`${t.subject_id}_${cid}`] || 0) + Number(t.tp_count);
        } else {
          const k = `${t.subject_id}_${t.class_id}`;
          tpMap[k] = (tpMap[k] || 0) + Number(t.tp_count);
        }
      }

      // Jumlah siswa yang sudah ada nilai raport_scores per (period, subject, class)
      // Hanya dari user NISN plain (sistem baru) untuk akurasi indikator
      const phP = periodIds.map((_, i) => `$${i + 1}`).join(',');
      const phS2 = subjectIds.map((_, i) => `$${periodIds.length + i + 1}`).join(',');
      const [scoreRows] = await pool.query(
        `SELECT rs.period_id, rs.raport_subject_id AS subject_id, u.class_id,
                COUNT(*) AS scored_count
         FROM raport_scores rs
         JOIN users u ON u.id = rs.student_id
         WHERE rs.period_id IN (${phP})
           AND rs.raport_subject_id IN (${phS2})
           AND rs.score IS NOT NULL
           AND u.username NOT LIKE '%@%'
           AND u.class_id IS NOT NULL
         GROUP BY rs.period_id, rs.raport_subject_id, u.class_id`,
        [...periodIds, ...subjectIds]
      );
      const scoreMap = {};
      for (const r of scoreRows) scoreMap[`${r.period_id}_${r.subject_id}_${r.class_id}`] = Number(r.scored_count);

      // Tempelkan status ke tiap subject entry
      // Ambil juga total siswa NISN plain per kelas untuk cek kelengkapan
      const classIdsList = [...new Set(rows.map(r => r.class_id))];
      const totalPerKelas = {};
      if (classIdsList.length > 0) {
        const phCls = classIdsList.map((_, i) => `$${i + 1}`).join(',');
        const [totalRows] = await pool.query(
          `SELECT class_id, COUNT(*) AS total FROM users
           WHERE role = 'STUDENT' AND is_active = true
             AND class_id IN (${phCls})
             AND username NOT LIKE '%@%'
           GROUP BY class_id`,
          classIdsList
        );
        for (const r of totalRows) totalPerKelas[r.class_id] = Number(r.total);
      }

      // status: 'green' = ada TP + semua nilai sudah diisi
      //         'yellow' = ada TP tapi nilai belum/baru sebagian
      //         'red'    = belum ada TP (dan belum isi nilai sama sekali)
      for (const period of periods) {
        for (const s of period.subjects) {
          const hasTp      = (tpMap[`${s.subject_id}_${s.class_id}`] || 0) > 0;
          const scored     = scoreMap[`${period.id}_${s.subject_id}_${s.class_id}`] || 0;
          const totalSiswa = totalPerKelas[s.class_id] || 0;

          if (!hasTp) {
            // Belum ada TP → merah (belum mulai sama sekali)
            s.status = 'red';
          } else if (totalSiswa > 0 && scored >= totalSiswa) {
            // Ada TP + semua siswa sudah diisi → hijau
            s.status = 'green';
          } else {
            // Ada TP tapi nilai belum/baru sebagian → kuning
            s.status = 'yellow';
          }
        }
      }
    }

    // Cek apakah guru ini adalah wali kelas
    const [[homeroomClass]] = await pool.query(`
      SELECT id, name AS class_name, homeroom_teacher_nip
      FROM classes
      WHERE homeroom_teacher_name = (SELECT full_name FROM users WHERE id = $1 LIMIT 1)
         OR homeroom_teacher_nip = (SELECT username FROM users WHERE id = $1 LIMIT 1)
      LIMIT 1
    `, [user.id]).catch(() => [[null]]);

    // Ambil periode aktif untuk print wali kelas
    const [[activePeriod]] = await pool.query(`
      SELECT id, name, semester, school_year FROM raport_periods WHERE is_active = true LIMIT 1
    `).catch(() => [[null]]);

    res.render('teacher/raport', { title: 'Raport Tengah Semester', user, periods, homeroomClass: homeroomClass || null, activePeriod: activePeriod || null });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data raport.');
    res.redirect('/teacher');
  }
});

// GET /teacher/raport/:period_id/print-kelas - cetak raport kelas wali (wali kelas only)
router.get('/raport/:period_id/print-kelas', async (req, res) => {
  const user = req.session.user;
  const { period_id } = req.params;
  try {
    // Cari kelas yang guru ini jadi wali kelasnya
    const [[homeroomClass]] = await pool.query(`
      SELECT id, name FROM classes
      WHERE homeroom_teacher_name = (SELECT full_name FROM users WHERE id = $1 LIMIT 1)
         OR homeroom_teacher_nip = (SELECT username FROM users WHERE id = $1 LIMIT 1)
      LIMIT 1
    `, [user.id]);

    if (!homeroomClass) {
      req.flash('error', 'Anda tidak terdaftar sebagai wali kelas manapun.');
      return res.redirect('/teacher/raport');
    }

    const [[period]] = await pool.query(`SELECT * FROM raport_periods WHERE id = $1`, [period_id]);
    if (!period) return res.status(404).send('Periode tidak ditemukan.');

    // Ambil semua siswa di kelas ini — prioritaskan user NISN plain (tanpa @domain)
    const [students] = await pool.query(`
      SELECT u.id, u.full_name, u.username, u.tanggal_lahir, u.tempat_lahir,
             c.name AS class_name, u.class_id,
             c.homeroom_teacher_name, c.homeroom_teacher_nip
      FROM users u
      JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'STUDENT' AND u.is_active = true AND u.class_id = $1
        AND u.username NOT LIKE '%@%'
      ORDER BY u.full_name ASC
    `, [homeroomClass.id]);

    if (!students.length) {
      req.flash('error', 'Belum ada siswa aktif di kelas ini.');
      return res.redirect('/teacher/raport');
    }

    // Ambil mapel + nilai untuk semua siswa di kelas ini
    const [scoreRows] = await pool.query(`
      SELECT rs.id AS subject_id, rs.subject_name, rsg.id AS group_id, rsg.name AS group_name,
             rs.sort_order AS subject_order, rsg.sort_order AS group_order,
             sc.student_id, sc.score, sc.notes
      FROM raport_subjects rs
      JOIN raport_subject_groups rsg ON rsg.id = rs.group_id AND rsg.period_id = $1
      JOIN raport_subject_classes rsc ON rsc.raport_subject_id = rs.id AND rsc.class_id = $2
      LEFT JOIN raport_scores sc ON sc.raport_subject_id = rs.id
        AND sc.period_id = $1 AND sc.student_id = ANY($3::int[])
      ORDER BY rsg.sort_order ASC, rs.sort_order ASC
    `, [period_id, homeroomClass.id, students.map(s => s.id)]);

    // Bangun groups per siswa
    const groupMapTemplate = new Map();
    for (const row of scoreRows) {
      if (!groupMapTemplate.has(row.group_id)) {
        groupMapTemplate.set(row.group_id, { id: row.group_id, name: row.group_name, subjects: [] });
      }
      const grp = groupMapTemplate.get(row.group_id);
      if (!grp.subjects.find(s => s.id === row.subject_id)) {
        grp.subjects.push({ id: row.subject_id, name: row.subject_name });
      }
    }

    const allStudents = students.map(stu => {
      const stuGroups = [...groupMapTemplate.values()].map(grp => ({
        id: grp.id,
        name: grp.name,
        subjects: grp.subjects.map(subj => {
          const sc = scoreRows.find(r => r.student_id === stu.id && r.subject_id === subj.id);
          return { id: subj.id, name: subj.name, score: sc ? sc.score : null, notes: sc ? sc.notes : null };
        })
      }));
      return { ...stu, groups: stuGroups };
    });

    // --- KD / TP injection untuk print-kelas ---
    const allSubjectIdsKelas = [...new Set(scoreRows.map(r => r.subject_id).filter(Boolean))];
    let kdMapKelas = {};
    let maxKdPerSubjectKelas = {};
    let kdNamesMapKelas = {}; // { subject_id: [kd_name, ...] }

    if (allSubjectIdsKelas.length > 0) {
      const stuIds = students.map(s => s.id);
      const phSub = allSubjectIdsKelas.map((_, i) => `$${i + 1}`).join(',');
      const phStu = stuIds.map((_, i) => `$${allSubjectIdsKelas.length + i + 1}`).join(',');

      const phClassKelas = `$${allSubjectIdsKelas.length + stuIds.length + 2}`;
      const [kdRowsKelas] = await pool.query(`
        SELECT rsk.id AS kd_id, rsk.kd_name, rsk.raport_subject_id AS subject_id,
               rsk.sort_order,
               ksc.student_id,
               ksc.score AS kd_score
        FROM raport_subject_kd rsk
        LEFT JOIN raport_kd_scores ksc
          ON ksc.kd_id = rsk.id
          AND ksc.period_id = $${allSubjectIdsKelas.length + stuIds.length + 1}
          AND ksc.student_id IN (${phStu})
        WHERE rsk.raport_subject_id IN (${phSub})
          AND (rsk.class_id = ${phClassKelas} OR rsk.class_id IS NULL)
        ORDER BY rsk.raport_subject_id ASC, rsk.sort_order ASC, rsk.id ASC
      `, [...allSubjectIdsKelas, ...stuIds, period_id, homeroomClass.id]);

      const kdCountPerSubject = {};
      for (const kd of kdRowsKelas) {
        if (!kdCountPerSubject[kd.subject_id]) kdCountPerSubject[kd.subject_id] = new Set();
        kdCountPerSubject[kd.subject_id].add(kd.kd_id);
        if (!kdNamesMapKelas[kd.subject_id]) kdNamesMapKelas[kd.subject_id] = [];
        if (!kdNamesMapKelas[kd.subject_id].includes(kd.kd_name)) {
          kdNamesMapKelas[kd.subject_id].push(kd.kd_name);
        }
      }
      for (const [sid, kdSet] of Object.entries(kdCountPerSubject)) {
        maxKdPerSubjectKelas[sid] = kdSet.size;
      }

      for (const kd of kdRowsKelas) {
        if (kd.student_id == null) continue;
        if (!kdMapKelas[kd.subject_id]) kdMapKelas[kd.subject_id] = {};
        if (!kdMapKelas[kd.subject_id][kd.student_id]) kdMapKelas[kd.subject_id][kd.student_id] = [];
        kdMapKelas[kd.subject_id][kd.student_id].push({
          kd_id: kd.kd_id,
          kd_name: kd.kd_name,
          score: kd.kd_score
        });
      }
    }

    const globalMaxKdKelas = Object.values(maxKdPerSubjectKelas).length > 0
      ? Math.max(...Object.values(maxKdPerSubjectKelas)) : 0;

    // Bangun kdNames dari label custom admin (raport_tp_labels), fallback "TP N"
    const [tpLabelRowsKelas] = await pool.query(`SELECT tp_index, label FROM raport_tp_labels WHERE period_id = $1 ORDER BY tp_index ASC`, [period_id]);
    const tpLabelsMapKelas = {};
    for (const r of tpLabelRowsKelas) tpLabelsMapKelas[r.tp_index] = r.label;
    const kdNamesKelas = [];
    for (let ki = 0; ki < globalMaxKdKelas; ki++) {
      kdNamesKelas.push(tpLabelsMapKelas[ki + 1] || `TP ${ki + 1}`);
    }

    for (const stu of allStudents) {
      for (const grp of stu.groups) {
        for (const subj of grp.subjects) {
          subj.kdScores = (kdMapKelas[subj.id] && kdMapKelas[subj.id][stu.id]) || [];
        }
      }
    }
    // --- end KD injection ---

    // Ambil kepala sekolah dari DB
    const schoolInfo = {
      name: process.env.SCHOOL_NAME || 'SMK NEGERI 1 KRAS',
      address: process.env.SCHOOL_ADDRESS || 'Demangan Setonorejo Kras Kediri Kode Pos 64172',
      headerLine1: process.env.SCHOOL_HEADER1 || 'PEMERINTAH PROVINSI JAWA TIMUR',
      headerLine2: process.env.SCHOOL_HEADER2 || 'DINAS PENDIDIKAN',
      headerLine3: process.env.SCHOOL_HEADER3 || 'SEKOLAH MENENGAH KEJURUAN NEGERI 1',
      schoolShortName: process.env.SCHOOL_SHORT_NAME || 'KRAS',
      city: process.env.SCHOOL_CITY || 'KEDIRI',
      email: process.env.SCHOOL_EMAIL || 'smkn1kras@gmail.com',
      website: process.env.SCHOOL_WEB || process.env.SCHOOL_WEBSITE || 'http://www.smkn1kras.sch.id',
      principalName: process.env.PRINCIPAL_NAME || '',
      principalNip: process.env.PRINCIPAL_NIP || '',
      logoPath: process.env.SCHOOL_LOGO || null
    };
    try {
      const [[principal]] = await pool.query(
        `SELECT full_name, username FROM users WHERE role='PRINCIPAL' AND is_active=true LIMIT 1`
      );
      if (principal) {
        schoolInfo.principalName = principal.full_name;
        schoolInfo.principalNip  = (principal.username || '').split('@')[0];
      }
    } catch(_) {}

    res.render('admin/raport_print', {
      title: `Raport ${homeroomClass.name} - ${period.name}`,
      layout: false,
      student: null,
      period,
      groups: allStudents[0]?.groups || [],
      schoolInfo,
      multiStudent: true,
      allStudents,
      globalMaxKd: globalMaxKdKelas || 0,
      kdNames: kdNamesKelas || []
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal cetak raport: ' + e.message);
    res.redirect('/teacher/raport');
  }
});

// GET /teacher/raport/:period_id/print-siswa/:student_id - cetak raport 1 siswa (wali kelas)
router.get('/raport/:period_id/print-siswa/:student_id', async (req, res) => {
  const user = req.session.user;
  const { period_id, student_id } = req.params;
  try {
    // Validasi: guru harus wali kelas dari kelas siswa ini
    const [[stu]] = await pool.query(`
      SELECT u.id, u.full_name, u.username, u.tanggal_lahir, u.tempat_lahir,
             c.name AS class_name, u.class_id,
             c.homeroom_teacher_name, c.homeroom_teacher_nip
      FROM users u JOIN classes c ON c.id = u.class_id
      WHERE u.id = $1 AND u.role = 'STUDENT'
    `, [student_id]);

    if (!stu) return res.status(404).send('Siswa tidak ditemukan.');

    // Cek wali kelas
    const [[hc]] = await pool.query(`
      SELECT id FROM classes
      WHERE id = $1 AND (
        homeroom_teacher_name = (SELECT full_name FROM users WHERE id = $2 LIMIT 1)
        OR homeroom_teacher_nip = (SELECT username FROM users WHERE id = $2 LIMIT 1)
      )
    `, [stu.class_id, user.id]);

    if (!hc && user.role !== 'ADMIN') {
      req.flash('error', 'Anda bukan wali kelas dari siswa ini.');
      return res.redirect('/teacher/raport');
    }

    const [[period]] = await pool.query(`SELECT * FROM raport_periods WHERE id = $1`, [period_id]);
    if (!period) return res.status(404).send('Periode tidak ditemukan.');

    const [scoreRows] = await pool.query(`
      SELECT rsg.id AS group_id, rsg.name AS group_name, rsg.sort_order AS g_order,
             rs.id AS subject_id, rs.subject_name, rs.sort_order AS s_order,
             sc.score, sc.notes
      FROM raport_subject_groups rsg
      JOIN raport_subjects rs ON rs.group_id = rsg.id AND rsg.period_id = $1
      JOIN raport_subject_classes rsc ON rsc.raport_subject_id = rs.id AND rsc.class_id = $3
      LEFT JOIN raport_scores sc ON sc.raport_subject_id = rs.id
        AND sc.period_id = $1 AND sc.student_id = $2
      ORDER BY rsg.sort_order ASC, rs.sort_order ASC
    `, [period_id, student_id, stu.class_id]);

    const groupMap = new Map();
    for (const r of scoreRows) {
      if (!groupMap.has(r.group_id)) groupMap.set(r.group_id, { id: r.group_id, name: r.group_name, subjects: [] });
      groupMap.get(r.group_id).subjects.push({ id: r.subject_id, name: r.subject_name, score: r.score, notes: r.notes });
    }
    const groups = [...groupMap.values()];

    // --- KD / TP injection untuk print-siswa ---
    const subjectIdsSiswa = [...new Set(scoreRows.map(r => r.subject_id).filter(Boolean))];
    let kdMapSiswa = {};
    let maxKdSiswa = {};

    if (subjectIdsSiswa.length > 0) {
      const ph = subjectIdsSiswa.map((_, i) => `$${i + 3}`).join(',');
      const phClassSiswa = `$${subjectIdsSiswa.length + 3}`;
      const [kdRowsSiswa] = await pool.query(`
        SELECT rsk.id AS kd_id, rsk.kd_name, rsk.raport_subject_id AS subject_id,
               rsk.sort_order,
               ksc.score AS kd_score
        FROM raport_subject_kd rsk
        LEFT JOIN raport_kd_scores ksc ON ksc.kd_id = rsk.id
          AND ksc.student_id = $1 AND ksc.period_id = $2
        WHERE rsk.raport_subject_id IN (${ph})
          AND (rsk.class_id = ${phClassSiswa} OR rsk.class_id IS NULL)
        ORDER BY rsk.raport_subject_id ASC, rsk.sort_order ASC, rsk.id ASC
      `, [student_id, period_id, ...subjectIdsSiswa, stu.class_id]);

      for (const kd of kdRowsSiswa) {
        if (!kdMapSiswa[kd.subject_id]) kdMapSiswa[kd.subject_id] = [];
        kdMapSiswa[kd.subject_id].push({ kd_id: kd.kd_id, kd_name: kd.kd_name, score: kd.kd_score });
        maxKdSiswa[kd.subject_id] = (maxKdSiswa[kd.subject_id] || 0) + 1;
      }
    }

    const globalMaxKdSiswa = Object.values(maxKdSiswa).length > 0
      ? Math.max(...Object.values(maxKdSiswa)) : 0;

    // Bangun kdNames dari label custom admin (raport_tp_labels), fallback "TP N"
    const [tpLabelRowsSiswa] = await pool.query(`SELECT tp_index, label FROM raport_tp_labels WHERE period_id = $1 ORDER BY tp_index ASC`, [period_id]);
    const tpLabelsMapSiswa = {};
    for (const r of tpLabelRowsSiswa) tpLabelsMapSiswa[r.tp_index] = r.label;
    const kdNamesSiswa = [];
    for (let ki = 0; ki < globalMaxKdSiswa; ki++) {
      kdNamesSiswa.push(tpLabelsMapSiswa[ki + 1] || `TP ${ki + 1}`);
    }

    for (const grp of groups) {
      for (const subj of grp.subjects) {
        subj.kdScores = kdMapSiswa[subj.id] || [];
      }
    }
    // --- end KD injection ---

    const schoolInfo = {
      name: process.env.SCHOOL_NAME || 'SMK NEGERI 1 KRAS',
      address: process.env.SCHOOL_ADDRESS || 'Demangan Setonorejo Kras Kediri Kode Pos 64172',
      headerLine1: process.env.SCHOOL_HEADER1 || 'PEMERINTAH PROVINSI JAWA TIMUR',
      headerLine2: process.env.SCHOOL_HEADER2 || 'DINAS PENDIDIKAN',
      headerLine3: process.env.SCHOOL_HEADER3 || 'SEKOLAH MENENGAH KEJURUAN NEGERI 1',
      schoolShortName: process.env.SCHOOL_SHORT_NAME || 'KRAS',
      city: process.env.SCHOOL_CITY || 'KEDIRI',
      email: process.env.SCHOOL_EMAIL || 'smkn1kras@gmail.com',
      website: process.env.SCHOOL_WEB || process.env.SCHOOL_WEBSITE || 'http://www.smkn1kras.sch.id',
      principalName: process.env.PRINCIPAL_NAME || '',
      principalNip: process.env.PRINCIPAL_NIP || '',
      logoPath: process.env.SCHOOL_LOGO || null
    };
    try {
      const [[principal]] = await pool.query(
        `SELECT full_name, username FROM users WHERE role='PRINCIPAL' AND is_active=true LIMIT 1`
      );
      if (principal) { schoolInfo.principalName = principal.full_name; schoolInfo.principalNip = (principal.username||'').split('@')[0]; }
    } catch(_) {}

    res.render('admin/raport_print', {
      title: `Raport ${stu.full_name}`,
      layout: false,
      student: { ...stu, groups },
      period,
      groups,
      schoolInfo,
      multiStudent: false,
      allStudents: [],
      globalMaxKd: globalMaxKdSiswa || 0,
      kdNames: kdNamesSiswa || []
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal cetak raport: ' + e.message);
    res.redirect('/teacher/raport');
  }
});

// GET /teacher/raport/:period_id/kelas-siswa - daftar siswa kelas wali untuk cetak per siswa
router.delete('/raport/kd/:kd_id', async (req, res) => {
  const user = req.session.user;
  try {
    // Validasi guru berhak atas KD ini (ADMIN bisa hapus KD siapapun)
    const isAdmin = user.role === 'ADMIN';
    const [[kd]] = await pool.query(`
      SELECT rsk.id FROM raport_subject_kd rsk
      JOIN raport_subjects rs ON rs.id = rsk.raport_subject_id
      JOIN raport_subject_classes rsc ON rsc.raport_subject_id = rs.id
      WHERE rsk.id = $1 AND ($2 = true OR rsc.teacher_id = $3)
      LIMIT 1
    `, [req.params.kd_id, isAdmin, user.id]);
    if (!kd) return res.status(403).json({ ok: false, message: 'Akses ditolak.' });

    // Cek berapa nilai yang akan ikut terhapus
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM raport_kd_scores WHERE kd_id = $1`,
      [req.params.kd_id]
    );
    const nilaiCount = parseInt(countRow?.cnt || 0);

    await pool.query(`DELETE FROM raport_subject_kd WHERE id = $1`, [req.params.kd_id]);
    res.json({ ok: true, nilaiHapus: nilaiCount });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// POST /teacher/raport/:period_id/:subject_id/kd - tambah KD baru
router.post('/raport/:period_id/:subject_id/kd', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id } = req.params;
  const { kd_name, sort_order, class_id } = req.body;
  try {
    const [[scRow]] = await pool.query(`
      SELECT rsc.id FROM raport_subject_classes rsc
      JOIN raport_subjects rs ON rs.id = rsc.raport_subject_id
      JOIN raport_periods rp ON rp.id = rs.period_id
      WHERE rs.id = $1 AND rsc.teacher_id = $2 AND rs.period_id = $3 AND rp.is_active = true
    `, [subject_id, user.id, period_id]);
    if (!scRow) {
      req.flash('error', 'Akses ditolak atau periode sudah tidak aktif.');
      return res.redirect('/teacher/raport');
    }
    // Validasi class_id: harus terdaftar di raport_subject_classes untuk subject ini
    if (class_id) {
      const [[classRow]] = await pool.query(`
        SELECT id FROM raport_subject_classes
        WHERE raport_subject_id = $1 AND class_id = $2
      `, [subject_id, class_id]);
      if (!classRow) {
        req.flash('error', 'Kelas tidak valid untuk mata pelajaran ini.');
        return res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
      }
    }
    if (!kd_name || !kd_name.trim()) {
      req.flash('error', 'Nama KD tidak boleh kosong.');
      return res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
    }
    await pool.query(
      `INSERT INTO raport_subject_kd (raport_subject_id, kd_name, sort_order, class_id) VALUES ($1, $2, $3, $4)`,
      [subject_id, kd_name.trim(), parseInt(sort_order) || 0, class_id || null]
    );
    req.flash('success', 'KD berhasil ditambahkan.');
  } catch(e) {
    console.error(e);
    req.flash('error', 'Gagal menambah KD: ' + e.message);
  }
  res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
});

// GET /teacher/raport/:period_id/:subject_id/:class_id - form input nilai
router.get('/raport/:period_id/:subject_id/:class_id', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id, class_id } = req.params;
  try {
    // Validasi: guru harus terdaftar di raport_subject_classes untuk subject + class ini
    const [[scRow]] = await pool.query(`
      SELECT rsc.id, rs.subject_name, rsg.name AS group_name,
             p.name AS period_name, p.semester, p.school_year,
             c.name AS class_name
      FROM raport_subject_classes rsc
      JOIN raport_subjects rs  ON rs.id  = rsc.raport_subject_id
      JOIN raport_subject_groups rsg ON rsg.id = rs.group_id
      JOIN raport_periods p    ON p.id   = rsg.period_id
      JOIN classes c           ON c.id   = rsc.class_id
      WHERE rsc.raport_subject_id = $1
        AND rsc.class_id          = $2
        AND rsc.teacher_id        = $3
        AND p.id                  = $4
    `, [subject_id, class_id, user.id, period_id]);

    if (!scRow) {
      req.flash('error', 'Mata pelajaran tidak ditemukan atau Anda tidak berwenang untuk kelas ini.');
      return res.redirect('/teacher/raport');
    }

    // Ambil KD untuk subject ini (filter per kelas, TP lama ber-class_id NULL tetap muncul)
    const [kdList] = await pool.query(
      `SELECT id, kd_name, sort_order FROM raport_subject_kd
       WHERE raport_subject_id = $1 AND (class_id = $2 OR class_id IS NULL)
       ORDER BY sort_order ASC, id ASC`,
      [subject_id, class_id]
    );

    // Ambil siswa kelas ini beserta nilai akhir yang sudah ada
    // Hanya user NISN plain (sistem baru)
    const [students] = await pool.query(`
      SELECT u.id, u.full_name, u.username,
             c.name AS class_name,
             sc.score AS final_score, sc.notes
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN raport_scores sc
        ON sc.student_id        = u.id
        AND sc.period_id         = $1
        AND sc.raport_subject_id = $2
      WHERE u.role      = 'STUDENT'
        AND u.is_active = true
        AND u.class_id  = $3
        AND u.username NOT LIKE '%@%'
      ORDER BY u.full_name ASC
    `, [period_id, subject_id, class_id]);

    // Ambil semua nilai KD untuk siswa di kelas ini
    const studentIds = students.map(s => s.id);
    let kdScoreMap = {};
    if (studentIds.length > 0 && kdList.length > 0) {
      const placeholders = studentIds.map((_, i) => `$${i + 3}`).join(',');
      const [kdScores] = await pool.query(`
        SELECT student_id, kd_id, score
        FROM raport_kd_scores
        WHERE period_id = $1 AND raport_subject_id = $2
          AND student_id IN (${placeholders})
      `, [period_id, subject_id, ...studentIds]);
      for (const ks of kdScores) {
        if (!kdScoreMap[ks.student_id]) kdScoreMap[ks.student_id] = {};
        kdScoreMap[ks.student_id][ks.kd_id] = ks.score;
      }
    }

    res.render('teacher/raport_scores', {
      title:      'Input Nilai Raport',
      user,
      subject:    scRow,
      period_id,
      subject_id,
      class_id,
      students,
      kdList,
      kdScoreMap
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data nilai.');
    res.redirect('/teacher/raport');
  }
});

// POST /teacher/raport/:period_id/:subject_id/:class_id - simpan nilai (bulk upsert, mendukung KD)
router.post('/raport/:period_id/:subject_id/:class_id', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id, class_id } = req.params;
  const conn = await pool.getConnection();
  try {
    // Validasi kepemilikan mapel+kelas
    const [[scRow]] = await pool.query(
      `SELECT rsc.id FROM raport_subject_classes rsc
       WHERE rsc.raport_subject_id = $1 AND rsc.class_id = $2 AND rsc.teacher_id = $3`,
      [subject_id, class_id, user.id]
    );
    if (!scRow) {
      req.flash('error', 'Akses ditolak.');
      return res.redirect('/teacher/raport');
    }

    // Ambil daftar KD aktif untuk mapel ini
    const [kdList] = await pool.query(
      `SELECT id FROM raport_subject_kd WHERE raport_subject_id = $1 AND (class_id = $2 OR class_id IS NULL)`,
      [subject_id, class_id]
    );
    const kdIds = kdList.map(k => k.id);

    // Ambil daftar student_id yang valid di kelas ini (keamanan)
    const [validStudents] = await pool.query(
      `SELECT id FROM users WHERE role = 'STUDENT' AND is_active = true AND class_id = $1
       AND username NOT LIKE '%@%'`,
      [class_id]
    );
    const validIds = new Set(validStudents.map(s => String(s.id)));

    const kdScoresBody = req.body.kd_scores || {};
    const notesBody    = req.body.notes || {};

    await conn.beginTransaction();

    for (const studentId of validIds) {
      const kdValues = kdScoresBody[studentId] || {};

      let totalScore = 0, countScore = 0;

      for (const kdId of kdIds) {
        const raw = kdValues[String(kdId)];
        // Kalau field tidak dikirim sama sekali (undefined), skip — jangan hapus nilai yang sudah ada
        if (raw === undefined) continue;
        const score = (raw !== '' && raw !== null) ? parseFloat(raw) : null;
        if (score !== null && !isNaN(score) && score >= 0 && score <= 100) {
          await conn.query(`
            INSERT INTO raport_kd_scores (period_id, student_id, raport_subject_id, kd_id, score, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (period_id, student_id, kd_id)
            DO UPDATE SET score = EXCLUDED.score, updated_by = EXCLUDED.updated_by, updated_at = NOW()
          `, [period_id, studentId, subject_id, kdId, score, user.id]);
          totalScore += score;
          countScore++;
        } else {
          // raw dikirim tapi kosong — guru sengaja kosongkan, hapus nilai
          await conn.query(
            `DELETE FROM raport_kd_scores WHERE period_id = $1 AND student_id = $2 AND kd_id = $3`,
            [period_id, studentId, kdId]
          );
        }
      }

      // Hitung rata-rata dari SEMUA nilai TP di DB (bukan hanya yang dikirim form)
      const [allKdScores] = await conn.query(`
        SELECT score FROM raport_kd_scores
        WHERE period_id = $1 AND student_id = $2 AND raport_subject_id = $3
          AND score IS NOT NULL
      `, [period_id, studentId, subject_id]);
      let finalScore = null;
      if (allKdScores.length > 0) {
        const sum = allKdScores.reduce((a, r) => a + parseFloat(r.score), 0);
        finalScore = Math.round((sum / allKdScores.length) * 100) / 100;
      }
      const notes = notesBody[studentId] || null;

      await conn.query(`
        INSERT INTO raport_scores (period_id, student_id, raport_subject_id, score, notes, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (period_id, student_id, raport_subject_id)
        DO UPDATE SET score = EXCLUDED.score, notes = EXCLUDED.notes,
                      updated_by = EXCLUDED.updated_by, updated_at = NOW()
      `, [period_id, studentId, subject_id, finalScore, notes, user.id]);
    }

    await conn.commit();
    req.flash('success', 'Nilai berhasil disimpan.');
    res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menyimpan: ' + e.message);
    res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
  } finally {
    conn.release();
  }
});


// GET /teacher/raport/:period_id/:subject_id/:class_id/export - download template Excel nilai
router.get('/raport/:period_id/:subject_id/:class_id/export', async (req, res) => {
  const user = req.session.user;
  const { period_id, subject_id, class_id } = req.params;
  try {
    // Validasi guru berhak akses
    const [[scRow]] = await pool.query(`
      SELECT rsc.id, rs.subject_name, p.name AS period_name,
             p.semester, p.school_year, c.name AS class_name
      FROM raport_subject_classes rsc
      JOIN raport_subjects rs  ON rs.id  = rsc.raport_subject_id
      JOIN raport_subject_groups rsg ON rsg.id = rs.group_id
      JOIN raport_periods p    ON p.id   = rsg.period_id
      JOIN classes c           ON c.id   = rsc.class_id
      WHERE rsc.raport_subject_id = $1
        AND rsc.class_id          = $2
        AND rsc.teacher_id        = $3
        AND p.id                  = $4
    `, [subject_id, class_id, user.id, period_id]);

    if (!scRow) {
      req.flash('error', 'Akses ditolak.');
      return res.redirect('/teacher/raport');
    }

    // Ambil siswa kelas beserta nilai yang sudah ada — hanya user NISN plain
    const [students] = await pool.query(`
      SELECT u.id, u.full_name, u.username,
             sc.score, sc.notes
      FROM users u
      LEFT JOIN raport_scores sc
        ON sc.student_id = u.id
        AND sc.period_id = $1
        AND sc.raport_subject_id = $2
      WHERE u.role = 'STUDENT' AND u.is_active = true AND u.class_id = $3
        AND u.username NOT LIKE '%@%'
      ORDER BY u.full_name ASC
    `, [period_id, subject_id, class_id]);

    // Ambil KD untuk subject ini
    const [kdList] = await pool.query(
      `SELECT id, kd_name FROM raport_subject_kd WHERE raport_subject_id = $1 AND (class_id = $2 OR class_id IS NULL) ORDER BY sort_order ASC, id ASC`,
      [subject_id, class_id]
    );

    let kdScoreMap = {};
    if (kdList.length > 0 && students.length > 0) {
      const sIds = students.map(s => s.id);
      const ph = sIds.map((_, i) => `$${i + 3}`).join(',');
      const [kdScores] = await pool.query(`
        SELECT student_id, kd_id, score FROM raport_kd_scores
        WHERE period_id = $1 AND raport_subject_id = $2 AND student_id IN (${ph})
      `, [period_id, subject_id, ...sIds]);
      for (const ks of kdScores) {
        if (!kdScoreMap[ks.student_id]) kdScoreMap[ks.student_id] = {};
        kdScoreMap[ks.student_id][ks.kd_id] = ks.score;
      }
    }

    // Buat workbook Excel
    const wb = XLSX.utils.book_new();

    // Baris 1: info mapel
    const infoRow = [`Mata Pelajaran: ${scRow.subject_name} | Kelas: ${scRow.class_name} | Periode: ${scRow.period_name} ${scRow.semester === 1 ? 'Ganjil' : 'Genap'} ${scRow.school_year}`];

    let headerRow, dataRows, colWidths;
    if (kdList.length > 0) {
      headerRow = ['No', 'ID Siswa', 'Nama Siswa', 'NISN',
        ...kdList.map(kd => kd.kd_name), 'Rata-rata', 'Keterangan'];
      dataRows = students.map((s, idx) => {
        const kdValues = kdList.map(kd => {
          const v = kdScoreMap[s.id] && kdScoreMap[s.id][kd.id];
          return (v !== undefined && v !== null) ? Number(v) : '';
        });
        // Hitung rata-rata dari kd_scores yang ada di template (bukan dari raport_scores)
        // supaya sinkron dengan nilai TP yang aktif saat ini
        const validKdVals = kdValues.filter(v => v !== '' && !isNaN(v));
        const avgVal = validKdVals.length > 0
          ? Math.round((validKdVals.reduce((a, b) => a + b, 0) / validKdVals.length) * 100) / 100
          : '';
        return [idx + 1, s.id, s.full_name,
          String(s.username || '').split('@')[0],
          ...kdValues,
          avgVal,
          s.notes || ''
        ];
      });
      colWidths = [
        { wch: 5 }, { wch: 10 }, { wch: 30 }, { wch: 15 },
        ...kdList.map(() => ({ wch: 12 })),
        { wch: 12 }, { wch: 25 }
      ];
    } else {
      headerRow = ['No', 'ID Siswa', 'Nama Siswa', 'NISN', 'Nilai (0-100)', 'Keterangan'];
      dataRows = students.map((s, idx) => [
        idx + 1,
        s.id,
        s.full_name,
        String(s.username || '').split('@')[0],
        s.score !== null && s.score !== undefined ? Math.round(Number(s.score) * 100) / 100 : '',
        s.notes || ''
      ]);
      colWidths = [
        { wch: 5 }, { wch: 10 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 25 }
      ];
    }

    const aoa = [infoRow, headerRow, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Lebar kolom
    ws['!cols'] = colWidths;

    // Freeze pane: beku 2 baris header
    ws['!freeze'] = { xSplit: 0, ySplit: 2, topLeftCell: 'A3', activeCell: 'A3', sqref: 'A3' };

    XLSX.utils.book_append_sheet(wb, ws, 'Nilai');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const safeName = (name) => String(name || '').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `nilai_${safeName(scRow.subject_name)}_${safeName(scRow.class_name)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal export nilai: ' + e.message);
    res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
  }
});

// Multer untuk import nilai (memory storage, tidak simpan ke disk)
const uploadRaportExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file Excel (.xlsx/.xls) yang diizinkan'));
    }
  }
});

// POST /teacher/raport/:period_id/:subject_id/:class_id/import - import nilai dari Excel
router.post('/raport/:period_id/:subject_id/:class_id/import',
  uploadRaportExcel.single('nilai_file'),
  async (req, res) => {
    const user = req.session.user;
    const { period_id, subject_id, class_id } = req.params;
    try {
      // Validasi akses — sama persis dengan route GET dan export (sertakan period_id)
      const [[scRow]] = await pool.query(`
        SELECT rsc.id FROM raport_subject_classes rsc
        JOIN raport_subjects rs ON rs.id = rsc.raport_subject_id
        WHERE rsc.raport_subject_id = $1
          AND rsc.class_id          = $2
          AND rsc.teacher_id        = $3
          AND rs.period_id          = $4
      `, [subject_id, class_id, user.id, period_id]);
      if (!scRow) {
        req.flash('error', 'Akses ditolak.');
        return res.redirect('/teacher/raport');
      }

      if (!req.file) {
        req.flash('error', 'Tidak ada file yang diunggah.');
        return res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
      }

      // Ambil KD aktif untuk mapel ini
      const [activeKds] = await pool.query(
        `SELECT id, kd_name FROM raport_subject_kd WHERE raport_subject_id = $1 AND (class_id = $2 OR class_id IS NULL) ORDER BY sort_order ASC, id ASC`,
        [subject_id, class_id]
      );
      const hasKd = activeKds.length > 0;

      // Parse Excel dari buffer
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // rows[0] = info mapel (skip), rows[1] = header (skip), rows[2..] = data siswa
      if (!rows || rows.length < 3) {
        req.flash('error', 'File Excel tidak memiliki data siswa (minimal 1 baris data).');
        return res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
      }

      // Ambil set student_id valid di kelas ini (keamanan) — hanya NISN plain
      const [validStudents] = await pool.query(
        `SELECT id FROM users WHERE role = 'STUDENT' AND is_active = true AND class_id = $1
         AND username NOT LIKE '%@%'`,
        [class_id]
      );
      const validStudentIds = new Set(validStudents.map(s => String(s.id)));

      // Kumpulkan baris valid dulu sebelum eksekusi
      const upsertRows = [];       // untuk raport_scores (nilai akhir)
      const upsertKdRows = [];     // untuk raport_kd_scores (nilai per TP)
      let skipCount = 0;

      // Format kolom tergantung ada TP atau tidak:
      // Tanpa TP: [No, ID, Nama, NISN, Nilai, Keterangan]
      // Dengan TP: [No, ID, Nama, NISN, TP1, TP2, ..., Rata-rata, Keterangan]
      const kdStartCol = 4; // kolom TP mulai dari index 4

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row[1] && row[1] !== 0) { skipCount++; continue; }
        const studentId = parseInt(row[1]);
        if (!studentId || isNaN(studentId)) { skipCount++; continue; }
        if (!validStudentIds.has(String(studentId))) { skipCount++; continue; }

        if (hasKd) {
          // Ambil nilai per TP
          let kdSum = 0, kdCount = 0;
          for (let k = 0; k < activeKds.length; k++) {
            const rawKd = row[kdStartCol + k];
            const kdScore = (rawKd !== '' && rawKd !== undefined && rawKd !== null)
              ? parseFloat(rawKd) : null;
            if (kdScore !== null && !isNaN(kdScore) && kdScore >= 0 && kdScore <= 100) {
              upsertKdRows.push([period_id, studentId, subject_id, activeKds[k].id, kdScore, user.id]);
              kdSum += kdScore;
              kdCount++;
            }
          }
          // Rata-rata dari kolom atau hitung sendiri
          const avgColIdx = kdStartCol + activeKds.length;
          const notesColIdx = avgColIdx + 1;
          const avgScore = kdCount > 0 ? Math.round((kdSum / kdCount) * 100) / 100 : null;
          const notes = String(row[notesColIdx] || '').trim() || null;
          upsertRows.push([period_id, studentId, subject_id, avgScore, notes, user.id]);
        } else {
          // Tanpa TP: kolom nilai di index 4
          const rawScore = row[4];
          const score = (rawScore !== '' && rawScore !== undefined && rawScore !== null)
            ? parseFloat(rawScore) : null;
          if (score !== null && (isNaN(score) || score < 0 || score > 100)) { skipCount++; continue; }
          upsertRows.push([period_id, studentId, subject_id, score, String(row[5] || '').trim() || null, user.id]);
        }
      }

      // Eksekusi semua dalam satu transaksi — all-or-nothing
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        // Simpan nilai akhir (raport_scores)
        for (const params of upsertRows) {
          await conn.query(`
            INSERT INTO raport_scores (period_id, student_id, raport_subject_id, score, notes, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (period_id, student_id, raport_subject_id)
            DO UPDATE SET score = EXCLUDED.score, notes = EXCLUDED.notes,
                          updated_by = EXCLUDED.updated_by, updated_at = NOW()
          `, params);
        }
        // Simpan nilai per TP (raport_kd_scores) jika ada
        for (const params of upsertKdRows) {
          // [period_id, studentId, subject_id, kd_id, kdScore, user.id]
          await conn.query(`
            INSERT INTO raport_kd_scores (period_id, student_id, raport_subject_id, kd_id, score, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (period_id, student_id, kd_id)
            DO UPDATE SET score = EXCLUDED.score, raport_subject_id = EXCLUDED.raport_subject_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()
          `, params);
        }
        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        throw txErr;
      } finally {
        conn.release();
      }

      const successCount = upsertRows.length;
      const kdCount = upsertKdRows.length;
      req.flash('success', `Import berhasil: ${successCount} nilai tersimpan${kdCount > 0 ? `, ${kdCount} nilai TP` : ''}${skipCount > 0 ? `, ${skipCount} baris dilewati` : ''}.`);
      res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);

    } catch (e) {
      console.error(e);
      req.flash('error', 'Gagal import nilai: ' + e.message);
      res.redirect(`/teacher/raport/${period_id}/${subject_id}/${class_id}`);
    }
  }
);

