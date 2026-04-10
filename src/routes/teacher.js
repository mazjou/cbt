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

const router = express.Router();
router.use(requireRole('TEACHER', 'ADMIN'));

// Helper: admin bisa akses semua data, teacher hanya miliknya sendiri
// Gunakan di query: WHERE (:isAdmin=1 OR e.teacher_id=:tid)
function teacherFilter(user) {
  return {
    tid: user.id,
    isAdmin: user.role === 'ADMIN' ? 1 : 0
  };
}

// Upload config (gambar soal & import)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'questions');
fs.mkdirSync(uploadDir, { recursive: true });

// Upload config untuk materi (DOCX -> HTML + gambar)
const materialsDir = path.join(__dirname, '..', 'public', 'uploads', 'materials');
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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
});

const uploadDocx = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB docx
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

const uploadMaterials = multer({
  storage: storageMaterialsUpload,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB (DOCX/PDF)
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
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const base = path.basename(v);
    const hit = uploaded.find(u => u.originalname === base) ||
                uploaded.find(u => u.originalname.replace(/\s+/g,'_') === base);
    if (hit) return `/public/uploads/questions/${path.basename(hit.filename)}`;
    const abs = path.join(uploadDir, base);
    if (fs.existsSync(abs)) return `/public/uploads/questions/${base}`;
    // Simpan nama file, akan diupload belakangan
    return base;
  }

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const reasons = [];

    const question_text = String(pickRowValue(row, ['question_text', 'question', 'soal', 'pertanyaan'])).trim();
    const pointsRaw = pickRowValue(row, ['points', 'poin', 'score']);
    const points = Number(pointsRaw || 1) || 1;
    const correct = String(pickRowValue(row, ['correct', 'kunci', 'answer', 'jawaban_benar'])).trim().toUpperCase();

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
    if (!A || !B || !C || !D || !E) reasons.push('Opsi A–E wajib terisi');
    if (!['A', 'B', 'C', 'D', 'E'].includes(correct)) reasons.push('Kunci (correct) harus A/B/C/D/E');
    if (!Number.isFinite(points) || points <= 0) reasons.push('Points harus angka > 0');

    const item = {
      rowNo, question_text, question_image, points, correct,
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
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);
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
    embed_url = String(pdf_url || '').trim();
    if (!embed_url) {
      req.flash('error', 'Link PDF kosong. Isi URL PDF (http/https) atau upload file PDF.');
      return res.redirect('/teacher/materials/new');
    }
    if (!/^https?:\/\//i.test(embed_url) && !embed_url.startsWith('/public/')) {
      req.flash('error', 'Link PDF harus berupa URL http/https atau path lokal yang diawali /public/.');
      return res.redirect('/teacher/materials/new');
    }
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

    await pool.query(
      `INSERT INTO materials (subject_id, teacher_id, title, description, content_html, class_id, embed_type, embed_url, is_published, auto_complete_minutes)
       VALUES (:subject_id,:teacher_id,:title,:description,:content_html,:class_id,:embed_type,:embed_url,0,:auto_complete_minutes);`,
      {
        subject_id,
        teacher_id: user.id,
        title,
        description: description || null,
        content_html: html,
        class_id: class_id || null,
        embed_type,
        embed_url,
        auto_complete_minutes: autoCompleteValue
      }
    );
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
      `UPDATE materials SET is_published = IF(is_published=true,0,1)
       WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`,
      { id: req.params.id, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    // Kirim notifikasi jika materi baru dipublish
    if (!wasPublished) {
      try {
        const className = material.class_name || 'Semua Kelas';
        await createNotificationForClass({
          classId: material.class_id,
          title: `Materi Baru: ${material.title}`,
          message: `Guru telah mempublish materi baru "${material.title}" untuk mata pelajaran ${material.subject_name} (${className})`,
          type: 'MATERIAL',
          referenceId: material.id
        });
      } catch (notifError) {
        // Log error tapi jangan gagalkan proses publish
        console.error('Error sending notification:', notifError);
      }
    }

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

  const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);
  res.render('teacher/material_edit', { title: `Edit Materi: ${material.title}`, material, subjects, classes });
});

router.put('/materials/:id', uploadMaterials.fields([{ name: 'docx', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const materialId = req.params.id;
  const { subject_id, title, description, class_id, content_html, embed_mode, youtube_url, pdf_url, auto_complete_minutes } = req.body;

  const [[existing]] = await pool.query(
    `SELECT * FROM materials WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
    { id: materialId, tid: user.id }
  );
  if (!existing) {
    req.flash('error', 'Materi tidak ditemukan.');
    return res.redirect('/teacher/materials');
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
    embed_url = String(pdf_url || '').trim();
    if (!embed_url) {
      req.flash('error', 'Link PDF kosong. Isi URL PDF (http/https) atau upload file PDF.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
    if (!/^https?:\/\//i.test(embed_url) && !embed_url.startsWith('/public/')) {
      req.flash('error', 'Link PDF harus berupa URL http/https atau path lokal yang diawali /public/.');
      return res.redirect(`/teacher/materials/${materialId}/edit`);
    }
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
       WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`,
      {
        subject_id,
        title,
        description: description || null,
        content_html: html,
        class_id: class_id || null,
        embed_type,
        embed_url,
        auto_complete_minutes: autoCompleteValue,
        id: materialId,
        tid: user.id
      }
    );

    req.flash('success', 'Materi diperbarui.');
    return res.redirect(`/teacher/materials/${materialId}`);
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
            COUNT(DISTINCT ec2.class_id) AS exam_class_count
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
  const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);
  res.render('teacher/exam_new', { title: 'Buat Ujian', subjects, classes });
});

router.post('/exams', async (req, res) => {
  const user = req.session.user;
  const {
    subject_id,
    title,
    description,
    class_ids, // Changed from class_id to class_ids (array)
    start_at,
    end_at,
    duration_minutes,
    pass_score,
    max_attempts,
    shuffle_questions,
    shuffle_options,
    access_code,
    show_score_to_student,
    show_review_to_student
  } = req.body;

  try {
    // Insert exam
    const [result] = await pool.query(
      `INSERT INTO exams
        (subject_id, teacher_id, title, description, class_id, start_at, end_at, duration_minutes, pass_score, max_attempts, shuffle_questions, shuffle_options, access_code, show_score_to_student, show_review_to_student, is_published)
       VALUES
        (:subject_id,:teacher_id,:title,:description,NULL,:start_at,:end_at,:duration_minutes,:pass_score,:max_attempts,:shuffle_questions,:shuffle_options,:access_code,:show_score_to_student,:show_review_to_student,:is_published);`,
      {
        subject_id,
        teacher_id: user.id,
        title,
        description: description || null,
        start_at: start_at || null,
        end_at: end_at || null,
        duration_minutes: Number(duration_minutes || 60),
        pass_score: Number(pass_score || 75),
        max_attempts: Number(max_attempts || 1),
        shuffle_questions: shuffle_questions ? true : false,
        shuffle_options: shuffle_options ? true : false,
        access_code: access_code || null,
        show_score_to_student: show_score_to_student ? true : false,
        show_review_to_student: show_review_to_student ? true : false,
        is_published: false
      }
    );

    const examId = result.insertId;

    // Insert exam_classes if class_ids provided
    if (class_ids && class_ids.length > 0) {
      const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];
      
      for (const classId of classIdsArray) {
        if (classId) {
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id) VALUES (:exam_id, :class_id);`,
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

    const wasPublished = exam.is_published === 1;

    await pool.query(`UPDATE exams SET is_published = IF(is_published=true,0,1) WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, {
      id: req.params.id,
      tid: user.id
    });

    // Kirim notifikasi jika ujian baru dipublish
    if (!wasPublished) {
      try {
        // Get class IDs for this exam
        const [examClasses] = await pool.query(
          `SELECT ec.class_id, c.name AS class_name
           FROM exam_classes ec
           JOIN classes c ON c.id=ec.class_id
           WHERE ec.exam_id=:exam_id;`,
          { exam_id: exam.id }
        );

        if (examClasses.length > 0) {
          const classIds = examClasses.map(ec => ec.class_id);
          const classNames = examClasses.map(ec => ec.class_name).join(', ');
          
          await createNotificationForMultipleClasses({
            classIds,
            title: `Ujian Baru: ${exam.title}`,
            message: `Guru telah mempublish ujian baru "${exam.title}" untuk mata pelajaran ${exam.subject_name} (${classNames})`,
            type: 'EXAM',
            referenceId: exam.id
          });
        } else if (exam.class_id) {
          // Fallback untuk exam dengan single class_id (backward compatibility)
          await createNotificationForClass({
            classId: exam.class_id,
            title: `Ujian Baru: ${exam.title}`,
            message: `Guru telah mempublish ujian baru "${exam.title}" untuk mata pelajaran ${exam.subject_name}`,
            type: 'EXAM',
            referenceId: exam.id
          });
        }
      } catch (notifError) {
        // Log error tapi jangan gagalkan proses publish
        console.error('Error sending notification:', notifError);
      }
    }

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
    const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);

    // Get selected classes for this exam
    const [examClasses] = await pool.query(
      `SELECT class_id FROM exam_classes WHERE exam_id=:exam_id;`,
      { exam_id: examId }
    );
    const selectedClassIds = examClasses.map(ec => ec.class_id);

    res.render('teacher/exam_edit', {
      title: 'Edit Ujian',
      exam,
      subjects,
      classes,
      selectedClassIds
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
    subject_id,
    title,
    description,
    class_ids,
    start_at,
    end_at,
    duration_minutes,
    pass_score,
    max_attempts,
    shuffle_questions,
    shuffle_options,
    access_code,
    show_score_to_student,
    show_review_to_student
  } = req.body;

  try {
    // Verify ownership
    const [[exam]] = await pool.query(
      `SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
      { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/teacher/exams');
    }

    // Update exam
    await pool.query(
      `UPDATE exams SET
        subject_id=:subject_id,
        title=:title,
        description=:description,
        start_at=:start_at,
        end_at=:end_at,
        duration_minutes=:duration_minutes,
        pass_score=:pass_score,
        max_attempts=:max_attempts,
        shuffle_questions=:shuffle_questions,
        shuffle_options=:shuffle_options,
        access_code=:access_code,
        show_score_to_student=:show_score_to_student,
        show_review_to_student=:show_review_to_student
       WHERE id=:id;`,
      {
        id: examId,
        subject_id,
        title,
        description: description || null,
        start_at: start_at || null,
        end_at: end_at || null,
        duration_minutes: Number(duration_minutes || 60),
        pass_score: Number(pass_score || 75),
        max_attempts: Number(max_attempts || 1),
        shuffle_questions: shuffle_questions ? true : false,
        shuffle_options: shuffle_options ? true : false,
        access_code: access_code || null,
        show_score_to_student: show_score_to_student ? true : false,
        show_review_to_student: show_review_to_student ? true : false
      }
    );

    // Update exam_classes
    // First, delete existing class associations
    await pool.query(`DELETE FROM exam_classes WHERE exam_id=:exam_id;`, { exam_id: examId });

    // Then insert new ones
    if (class_ids && class_ids.length > 0) {
      const classIdsArray = Array.isArray(class_ids) ? class_ids : [class_ids];
      
      for (const classId of classIdsArray) {
        if (classId) {
          await pool.query(
            `INSERT INTO exam_classes (exam_id, class_id) VALUES (:exam_id, :class_id);`,
            { exam_id: examId, class_id: classId }
          );
        }
      }
    }

    req.flash('success', 'Ujian berhasil diperbarui.');
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
      `SELECT id, option_label, option_text, is_correct
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

  res.render('teacher/exam_detail', { title: `Ujian: ${exam.title}`, exam, questions });
});

router.post('/exams/:id/questions', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const { question_text, points, a, b, c, d, e, correct } = req.body;
  const examId = req.params.id;

  // Validate required fields
  if (!question_text || !a || !b || !c || !d || !e || !correct) {
    console.error('Missing required fields:', { question_text: !!question_text, a: !!a, b: !!b, c: !!c, d: !!d, e: !!e, correct: !!correct });
    req.flash('error', 'Semua field harus diisi (pertanyaan dan 5 opsi jawaban).');
    return res.redirect(`/teacher/exams/${examId}`);
  }

  // verify ownership
  const [[ok]] = await pool.query(`SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid);`, { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 });
  if (!ok) {
    req.flash('error', 'Akses ditolak.');
    return res.redirect('/teacher/exams');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Handle file uploads
    const imageFile = req.files && req.files.image ? req.files.image[0] : null;
    const pdfFile = req.files && req.files.pdf ? req.files.pdf[0] : null;
    
    const [qRes] = await conn.query(
      `INSERT INTO questions (exam_id, question_text, question_image, question_pdf, points)
       VALUES (:exam_id,:question_text,:question_image,:question_pdf,:points);`,
      {
        exam_id: examId,
        question_text,
        question_image: imageFile ? `/public/uploads/questions/${path.basename(imageFile.filename)}` : null,
        question_pdf: pdfFile ? `/public/uploads/questions/${path.basename(pdfFile.filename)}` : null,
        points: Number(points || 1)
      }
    );
    const questionId = qRes.insertId;

    const options = [
      { label: 'A', text: a },
      { label: 'B', text: b },
      { label: 'C', text: c },
      { label: 'D', text: d },
      { label: 'E', text: e }
    ];

    for (const opt of options) {
      await conn.query(
        `INSERT INTO options (question_id, option_label, option_text, is_correct)
         VALUES (:qid,:lbl,:txt,:isc);`,
        {
          qid: questionId,
          lbl: opt.label,
          txt: opt.text,
          isc: opt.label === String(correct).toUpperCase() ? 1 : 0
        }
      );
    }

    await conn.commit();
    req.flash('success', 'Soal ditambahkan.');
  } catch (e) {
    await conn.rollback();
    console.error('Error adding question:', e);
    req.flash('error', 'Gagal menambahkan soal. Error: ' + e.message);
  } finally {
    conn.release();
  }

  res.redirect(`/teacher/exams/${examId}`);
});

router.get('/exams/:id/import', async (req, res) => {
  const user = req.session.user;
  const [[exam]] = await pool.query(`SELECT id, title FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`, {
    id: req.params.id,
    tid: user.id
  });
  if (!exam) {
    req.flash('error', 'Ujian tidak ditemukan.');
    return res.redirect('/teacher/exams');
  }
  res.render('teacher/question_import', { title: 'Import Soal', exam });
});

// Import soal dari Microsoft Word (.docx) dengan format baku
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

      // KUNCI:
      const mKey = t.match(/^\s*KUNCI\s*[:=]\s*([A-E])\s*$/i);
      if (mKey) { cur.correct = mKey[1].toUpperCase(); lastLabel = null; continue; }

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
      const corr = String(q.correct || '').trim().toUpperCase();
      const A = String(q.options.A || '').trim();
      const B = String(q.options.B || '').trim();
      const C = String(q.options.C || '').trim();
      const D = String(q.options.D || '').trim();
      const E = String(q.options.E || '').trim();

      if (!qt && !q.question_image) reasons.push('Teks soal kosong');
      if (!A || !B || !C || !D || !E) reasons.push('Opsi A–E wajib terisi (boleh gambar saja jika ada)');
      if (!['A','B','C','D','E'].includes(corr)) reasons.push('KUNCI harus A/B/C/D/E');

      const item = {
        rowNo: idx + 1,
        question_text: qt || '(gambar)',
        question_image: q.question_image,
        points: q.points,
        correct: corr,
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
      const wb = XLSX.readFile(file.path, { cellDates: true });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        req.flash('error', 'File kosong / tidak ada data.');
        return res.redirect(`/teacher/exams/${examId}/import`);
      }

      const { preview, errors } = buildImportPreview(rows, req.files?.images || []);
      const importId = nanoid(12);
      req.session.importPreview = { importId, examId: String(examId), preview, errors, createdAt: Date.now() };

      const [[exam]] = await pool.query(`SELECT id, title FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`, {
        id: examId,
        tid: user.id
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
    for (const r of rows) {
      const [qRes] = await conn.query(
        `INSERT INTO questions (exam_id, question_text, question_image, points)
         VALUES (:exam_id,:question_text,:question_image,:points);`,
        {
          exam_id: examId,
          question_text: r.question_text,
          question_image: r.question_image || null,
          points: Number(r.points || 1) || 1
        }
      );
      const qid = qRes.insertId;
      const opts = [
        { label: 'A', text: r.options?.A, img: r.option_images?.A || null },
        { label: 'B', text: r.options?.B, img: r.option_images?.B || null },
        { label: 'C', text: r.options?.C, img: r.option_images?.C || null },
        { label: 'D', text: r.options?.D, img: r.option_images?.D || null },
        { label: 'E', text: r.options?.E, img: r.option_images?.E || null }
      ];
      for (const opt of opts) {
        await conn.query(
          `INSERT INTO options (question_id, option_label, option_text, option_image, is_correct)
           VALUES (:qid,:lbl,:txt,:img,:isc);`,
          { qid, lbl: opt.label, txt: opt.text || '', img: opt.img, isc: opt.label === r.correct ? 1 : 0 }
        );
      }
      inserted += 1;
    }
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
  upload.fields([{ name: 'images', maxCount: 100 }]),
  async (req, res) => {
    const user = req.session.user;
    const examId = req.params.id;
    try {
      const [[exam]] = await pool.query(
        `SELECT id FROM exams WHERE id=:id AND (:isAdmin=1 OR teacher_id=:tid) LIMIT 1;`,
        { id: examId, tid: user.id, isAdmin: user.role === 'ADMIN' ? 1 : 0 }
      );
      if (!exam) { req.flash('error', 'Akses ditolak.'); return res.redirect('/teacher/exams'); }

      const uploadedFiles = req.files?.images || [];
      if (!uploadedFiles.length) {
        req.flash('error', 'Tidak ada file gambar yang diupload.');
        return res.redirect(`/teacher/exams/${examId}/questions/upload-images`);
      }

      // Buat map: originalname → path tersimpan
      const fileMap = {};
      for (const f of uploadedFiles) {
        fileMap[f.originalname.trim()] = `/public/uploads/questions/${f.filename}`;
        fileMap[f.originalname.trim().replace(/\.[^.]+$/, '')] = `/public/uploads/questions/${f.filename}`;
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
      const [options] = await pool.query(
        `SELECT o.id, o.option_image, o.option_label FROM options o
         JOIN questions q ON q.id = o.question_id
         WHERE q.exam_id=:eid;`,
        { eid: examId }
      );
      for (const opt of options) {
        const imgVal = (opt.option_image || '').trim();
        if (imgVal && !imgVal.startsWith('http') && !imgVal.startsWith('/public/')) {
          const basename = path.basename(imgVal);
          const matchedPath = fileMap[basename] || fileMap[basename.replace(/\.[^.]+$/, '')] || null;
          if (matchedPath) {
            await pool.query(`UPDATE options SET option_image=:img WHERE id=:id;`, { img: matchedPath, id: opt.id });
            updated++;
          }
        }
      }

      // Cocokkan berdasarkan pola nomor urut untuk soal tanpa gambar
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
    `SELECT q.id, q.exam_id, q.question_text, q.question_image, q.question_pdf, q.points, e.title AS exam_title
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
    `SELECT option_label, option_text, is_correct
     FROM options
     WHERE question_id=:qid
     ORDER BY option_label ASC;`,
    { qid: qId }
  );

  const byLabel = {};
  let correct = 'A';
  for (const o of opts) {
    byLabel[o.option_label] = o.option_text;
    if (o.is_correct) correct = o.option_label;
  }

  res.render('teacher/question_edit', {
    title: 'Edit Soal',
    user,
    exam: {
      id: q.exam_id,
      title: q.exam_title
    },
    question: {
      id: q.id,
      question_text: q.question_text,
      question_image: q.question_image,
      question_pdf: q.question_pdf,
      points: q.points
    },
    options: byLabel,
    correct_label: correct
  });
});

router.put('/questions/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  const user = req.session.user;
  const qId = req.params.id;
  const { question_text, points, a, b, c, d, e, correct, remove_image, remove_pdf } = req.body;

  // Validate required fields
  if (!question_text || !a || !b || !c || !d || !e || !correct) {
    console.error('Missing required fields:', { question_text: !!question_text, a: !!a, b: !!b, c: !!c, d: !!d, e: !!e, correct: !!correct });
    req.flash('error', 'Semua field harus diisi (pertanyaan dan 5 opsi jawaban).');
    return res.redirect(`/teacher/questions/${qId}/edit`);
  }

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

  const corr = String(correct || '').toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE questions
       SET question_text=:qt, points=:pts, question_image=:img, question_pdf=:pdf
       WHERE id=:qid;`,
      { qt: question_text, pts: Number(points || 1), img: imageToSave, pdf: pdfToSave, qid: qId }
    );

    const opts = [
      ['A', a],
      ['B', b],
      ['C', c],
      ['D', d],
      ['E', e]
    ];

    for (const [lbl, txt] of opts) {
      // upsert by unique (question_id, option_label)
      await conn.query(
        `INSERT INTO options (question_id, option_label, option_text, is_correct)
         VALUES (:qid,:lbl,:txt,:isc)
         ON CONFLICT (question_id, option_label) DO UPDATE SET option_text=EXCLUDED.option_text, is_correct=EXCLUDED.is_correct;`,
        { qid: qId, lbl, txt, isc: lbl === corr ? 1 : 0 }
      );
    }

    await conn.commit();
    req.flash('success', 'Soal berhasil diperbarui.');
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
    `SELECT q.id, q.exam_id
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

  try {
    await pool.query(`DELETE FROM questions WHERE id=:id;`, { id: qId });
    req.flash('success', 'Soal dihapus.');
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

// Daftar nilai: attempts for teacher's exams (filterable)
router.get('/grades', async (req, res) => {
  const user = req.session.user;
  const exam_id = (req.query.exam_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const status = (req.query.status || '').trim();
  const result = (req.query.result || '').trim();
  const q = (req.query.q || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  const [exams] = await pool.query(
    `SELECT id, title FROM exams WHERE teacher_id=:tid ORDER BY id DESC;`,
    { tid: user.id }
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);

  const where = ['e.teacher_id=:tid'];
  const params = { tid: user.id };

  if (exam_id) {
    where.push('e.id=:exam_id');
    params.exam_id = exam_id;
  }
  if (class_id) {
    where.push('u.class_id=:class_id');
    params.class_id = class_id;
  }
  if (status) {
    where.push('a.status=:status');
    params.status = status;
  }
  if (result && result === 'LULUS') {
    where.push('a.status="SUBMITTED" AND a.score >= e.pass_score');
  }
  if (result && result === 'TIDAK_LULUS') {
    where.push('a.status="SUBMITTED" AND a.score < e.pass_score');
  }
  if (q) {
    where.push('(u.full_name LIKE :q OR u.username LIKE :q)');
    params.q = '%' + q + '%';
  }

  // Count total
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')};`,
    params
  );

  // Get paginated data
  const [rows] = await pool.query(
    `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
            e.id AS exam_id, e.title AS exam_title, e.pass_score,
            u.full_name AS student_name, u.username,
            c.name AS class_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.id DESC
     LIMIT :limit OFFSET :offset;`,
    { ...params, limit, offset }
  );

  const rows2 = rows.map((r) => ({
    ...r,
    is_pass: r.status === 'SUBMITTED' ? Number(r.score) >= Number(r.pass_score) : 0
  }));

  res.render('teacher/grades', {
    title: 'Daftar Nilai',
    rows: rows2,
    exams,
    classes,
    filters: { exam_id, class_id, status, result, q },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
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
  
  // Pagination for not viewed students
  const notViewedPage = parseInt(req.query.not_viewed_page) || 1;
  const notViewedLimit = 10; // Fixed at 10 per page
  const notViewedOffset = (notViewedPage - 1) * notViewedLimit;

  // Get teacher's materials for filter
  const [materials] = await pool.query(
    `SELECT id, title FROM materials WHERE teacher_id=:tid ORDER BY id DESC;`,
    { tid: user.id }
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);

  const where = ['m.teacher_id=:tid', 'mv.completed_at IS NOT NULL'];
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
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM material_reads mv
     JOIN materials m ON m.id=mv.material_id
     JOIN users u ON u.id=mv.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')};`,
    params
  );

  // Get paginated viewed data
  const [rows] = await pool.query(
    `SELECT mv.id, mv.first_opened_at AS opened_at, mv.completed_at,
            m.id AS material_id, m.title AS material_title,
            u.full_name AS student_name, u.username,
            c.name AS class_name
     FROM material_reads mv
     JOIN materials m ON m.id=mv.material_id
     JOIN users u ON u.id=mv.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     WHERE ${where.join(' AND ')}
     ORDER BY mv.completed_at DESC
     LIMIT :limit OFFSET :offset;`,
    { ...params, limit, offset }
  );

  // Get students who haven't viewed - with pagination
  let notViewedStudents = [];
  let notViewedTotal = 0;
  
  if (material_id) {
    // Get material's class_id first
    const [[materialInfo]] = await pool.query(
      `SELECT class_id FROM materials WHERE id=:material_id LIMIT 1;`,
      { material_id }
    );
    
    // Get for specific material - only students from material's class
    const notViewedWhere = ["u.role='STUDENT'", 'u.is_active=true'];
    const notViewedParams = { material_id };
    
    // If material has specific class, filter by that class
    if (materialInfo && materialInfo.class_id) {
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
    
    // Count total not viewed
    const [[{ notViewedCount }]] = await pool.query(
      `SELECT COUNT(*) AS notViewedCount
       FROM users u
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${notViewedWhere.join(' AND ')}
         AND NOT EXISTS (
           SELECT 1 FROM material_reads mv
           WHERE mv.student_id=u.id AND mv.material_id=:material_id
         );`,
      notViewedParams
    );
    notViewedTotal = notViewedCount;
    
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
       ORDER BY u.full_name ASC
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
    
    // Count total not viewed
    const [[{ notViewedCount }]] = await pool.query(
      `SELECT COUNT(*) AS notViewedCount
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
    notViewedTotal = notViewedCount;
    
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
       ORDER BY u.full_name ASC
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
    const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);

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
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);

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
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
    
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
        s.name AS subject_name,
        c.name AS class_name
       FROM assignments a
       LEFT JOIN subjects s ON s.id = a.subject_id
       LEFT JOIN classes c ON c.id = a.class_id
       WHERE a.id = :id AND a.teacher_id = :teacherId;`,
      { id: assignmentId, teacherId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan');
      return res.redirect('/teacher/assignments');
    }
    
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
       ORDER BY sub.submitted_at DESC;`,
      { assignmentId }
    );
    
    // Calculate total students and percentage
    const [[totalStudents]] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM users 
       WHERE role = 'STUDENT' 
       AND (${assignment.class_id ? 'class_id = :classId' : '1=1'});`,
      { classId: assignment.class_id }
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
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
    
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
  try {
    const teacherId = req.session.user.id;
    const { score, feedback } = req.body;
    
    await pool.query(
      `UPDATE assignment_submissions 
       SET score = :score, feedback = :feedback, graded_at = NOW(), graded_by = :teacherId
       WHERE id = :submissionId;`,
      {
        score: score || null,
        feedback: feedback || null,
        teacherId,
        submissionId: req.params.submissionId
      }
    );
    
    req.flash('success', 'Nilai berhasil disimpan');
    res.redirect(`/teacher/assignments/${req.params.id}`);
  } catch (err) {
    console.error('Error grading submission:', err);
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
    
    // Send notification if publishing
    if (newStatus === 1 && assignment.class_id) {
      try {
        await createNotificationForClass(
          assignment.class_id,
          'ASSIGNMENT',
          `Tugas Baru: ${assignment.title}`,
          `Guru telah memberikan tugas baru. Deadline: ${assignment.due_date ? new Date(assignment.due_date).toLocaleDateString('id-ID') : 'Tidak ada'}`,
          assignmentId
        );
      } catch (notifError) {
        // Log error tapi jangan gagalkan proses publish
        console.error('Error sending notification:', notifError);
      }
    }
    
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

// Download Excel daftar nilai
router.get('/grades/download', async (req, res) => {
  const user = req.session.user;
  const exam_id = (req.query.exam_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const q = (req.query.q || '').trim();

  const where = ['e.teacher_id=:tid'];
  const params = { tid: user.id };

  if (exam_id) {
    where.push('e.id=:exam_id');
    params.exam_id = exam_id;
  }
  if (class_id) {
    where.push('u.class_id=:class_id');
    params.class_id = class_id;
  }
  if (q) {
    where.push('(u.full_name LIKE :q OR u.username LIKE :q)');
    params.q = '%' + q + '%';
  }

  try {
    // Get all data (no pagination for export)
    const [rows] = await pool.query(
      `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
              e.id AS exam_id, e.title AS exam_title, e.pass_score, e.duration_minutes,
              u.full_name AS student_name, u.username,
              c.name AS class_name
       FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       JOIN users u ON u.id=a.student_id
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.name ASC, u.full_name ASC, a.id DESC;`,
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
      const duration = r.finished_at && r.started_at 
        ? Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 60000) 
        : 0;
      
      return {
        'No': idx + 1,
        'Nama Siswa': r.student_name,
        'Username': r.username,
        'Kelas': r.class_name || '-',
        'Ujian': r.exam_title,
        'Status': r.status === 'SUBMITTED' ? 'Selesai' : r.status === 'IN_PROGRESS' ? 'Sedang Mengerjakan' : 'Belum Mulai',
        'Nilai': r.status === 'SUBMITTED' ? r.score : '-',
        'Passing Score': r.pass_score,
        'Keterangan': r.status === 'SUBMITTED' ? (Number(r.score) >= Number(r.pass_score) ? 'LULUS' : 'TIDAK LULUS') : '-',
        'Durasi (menit)': duration > 0 ? duration : '-',
        'Mulai': r.started_at ? new Date(r.started_at).toLocaleString('id-ID') : '-',
        'Selesai': r.finished_at ? new Date(r.finished_at).toLocaleString('id-ID') : '-'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },  // No
      { wch: 25 }, // Nama
      { wch: 15 }, // Username
      { wch: 15 }, // Kelas
      { wch: 30 }, // Ujian
      { wch: 18 }, // Status
      { wch: 8 },  // Nilai
      { wch: 12 }, // Passing Score
      { wch: 15 }, // Keterangan
      { wch: 12 }, // Durasi
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
          { 'Keterangan': 'Judul Ujian', 'Nilai': examInfo.title },
          { 'Keterangan': 'Passing Score', 'Nilai': examInfo.pass_score },
          { 'Keterangan': 'Durasi (menit)', 'Nilai': examInfo.duration_minutes },
          { 'Keterangan': '', 'Nilai': '' },
          { 'Keterangan': 'Total Siswa Mengerjakan', 'Nilai': examInfo.total_students },
          { 'Keterangan': 'Sudah Submit', 'Nilai': examInfo.submitted_count },
          { 'Keterangan': 'Lulus', 'Nilai': examInfo.pass_count },
          { 'Keterangan': 'Tidak Lulus', 'Nilai': examInfo.submitted_count - examInfo.pass_count },
          { 'Keterangan': '', 'Nilai': '' },
          { 'Keterangan': 'Nilai Rata-rata', 'Nilai': examInfo.avg_score ? Number(examInfo.avg_score).toFixed(2) : '-' },
          { 'Keterangan': 'Nilai Tertinggi', 'Nilai': examInfo.max_score || '-' },
          { 'Keterangan': 'Nilai Terendah', 'Nilai': examInfo.min_score || '-' },
          { 'Keterangan': 'Persentase Kelulusan', 'Nilai': examInfo.submitted_count > 0 ? ((examInfo.pass_count / examInfo.submitted_count) * 100).toFixed(2) + '%' : '-' }
        ];

        const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
        statsWorksheet['!cols'] = [{ wch: 30 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'Statistik');
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
