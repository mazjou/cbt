const express = require('express');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');
const { finalizeAttemptWithBackup } = require('../utils/submission-utils');

const router = express.Router();
router.use(requireRole('ADMIN'));

// Upload config for admin imports
const importDir = path.join(__dirname, '..', 'public', 'uploads', 'imports');
fs.mkdirSync(importDir, { recursive: true });

const storageImport = multer.diskStorage({
  destination: (req, file, cb) => cb(null, importDir),
  filename: (req, file, cb) => {
    const safe = String(file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 180);
    cb(null, `${Date.now()}_${safe}`);
  }
});

const uploadImport = multer({
  storage: storageImport,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

function pickRowValue(row, keys) {
  const lowered = {};
  for (const k of Object.keys(row || {})) lowered[String(k).trim().toLowerCase()] = row[k];
  for (const k of keys) {
    const v = lowered[String(k).trim().toLowerCase()];
    if (v !== undefined) return v;
  }
  return '';
}

function normalizeClassKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildStudentImportPreview(rows, classesMap, existingUsernamesSet) {
  const preview = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const reasons = [];

    const username = String(pickRowValue(row, ['username', 'user', 'nis', 'nisn', 'Username'])).trim();
    const full_name = String(pickRowValue(row, ['full_name', 'nama', 'name', 'nama_lengkap', 'Nama Lengkap', 'Nama', 'full name'])).trim();
    const classRaw = pickRowValue(row, ['class', 'kelas', 'class_code', 'kelas_kode', 'class_name', 'kelas_nama']);
    const classText = String(classRaw || '').trim();
    const passwordRaw = pickRowValue(row, ['password', 'pwd', 'pass']);
    const password = String(passwordRaw || '').trim();
    const nomor_peserta = String(pickRowValue(row, ['nomor_peserta', 'no_peserta', 'nomor', 'no_ujian']) || '').trim() || null;

    if (!username) reasons.push('Kolom username/nis wajib diisi');
    if (!full_name) reasons.push('Kolom full_name/nama wajib diisi');

    let class_id = null;
    if (classText) {
      const key = normalizeClassKey(classText);
      const hit = classesMap.get(key);
      if (hit) class_id = hit.id;
      else reasons.push(`Kelas tidak ditemukan: "${classText}" (gunakan kode/nama yang ada di menu Kelas)`);
    }

    const action = existingUsernamesSet.has(username) ? 'UPDATE' : 'INSERT';

    const item = {
      rowNo,
      username,
      full_name,
      classText: classText || '-',
      class_id,
      nomor_peserta,
      passwordProvided: Boolean(password),
      action
    };

    if (reasons.length) errors.push({ rowNo, reasons, snapshot: item });
    else preview.push({ ...item, password });
  });

  return { preview, errors };
}

function buildCodeNameImportPreview(rows, existingCodesSet) {
  const preview = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const reasons = [];

    const code = String(pickRowValue(row, ['code', 'kode'])).trim();
    const name = String(pickRowValue(row, ['name', 'nama'])).trim();

    if (!code) reasons.push('Kolom code/kode wajib diisi');
    if (!name) reasons.push('Kolom name/nama wajib diisi');

    const action = existingCodesSet.has(code) ? 'UPDATE' : 'INSERT';
    const item = { rowNo, code, name, action };

    if (reasons.length) errors.push({ rowNo, reasons, snapshot: item });
    else preview.push(item);
  });

  return { preview, errors };
}

function buildTeacherImportPreview(rows, existingUsernamesSet) {
  const preview = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const reasons = [];

    const username = String(pickRowValue(row, ['username', 'user', 'nip', 'nuptk', 'email', 'Username'])).trim();
    const full_name = String(pickRowValue(row, ['full_name', 'nama', 'name', 'nama_lengkap', 'Nama Lengkap', 'Nama', 'full name'])).trim();
    const passwordRaw = pickRowValue(row, ['password', 'pwd', 'pass']);
    const password = String(passwordRaw || '').trim();

    if (!username) reasons.push('Kolom username/nip wajib diisi');
    if (!full_name) reasons.push('Kolom full_name/nama wajib diisi');

    const action = existingUsernamesSet.has(username) ? 'UPDATE' : 'INSERT';
    const item = { rowNo, username, full_name, passwordProvided: Boolean(password), action };

    if (reasons.length) errors.push({ rowNo, reasons, snapshot: item });
    else preview.push({ ...item, password });
  });

  return { preview, errors };
}

router.get('/', (req, res) => {
  res.render('admin/index', { title: 'Panel Admin' });
});

// ===== REPORTS =====
router.get('/reports', async (req, res) => {
  try {
    // Parse filter parameters
    const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
    const exportExcel = req.query.export === 'excel';

    const filters = { start_date: startDate, end_date: endDate };

    // Get summary statistics
    const [[summaryRow]] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM exams WHERE created_at BETWEEN :startDate AND :endDate) as total_exams,
        (SELECT COUNT(*) FROM materials WHERE created_at BETWEEN :startDate AND :endDate) as total_materials,
        (SELECT COUNT(*) FROM assignments WHERE created_at BETWEEN :startDate AND :endDate) as total_assignments,
        (SELECT COUNT(*) FROM attempts WHERE created_at BETWEEN :startDate AND :endDate) as total_attempts,
        (SELECT COALESCE(AVG(score), 0) FROM attempts WHERE created_at BETWEEN :startDate AND :endDate AND score IS NOT NULL) as avg_score,
        (SELECT COUNT(*) FROM attempts WHERE created_at BETWEEN :startDate AND :endDate AND score >= (SELECT pass_score FROM exams WHERE id = attempts.exam_id)) as passed_attempts,
        (SELECT COUNT(*) FROM material_reads WHERE created_at BETWEEN :startDate AND :endDate) as total_material_reads,
        (SELECT COUNT(*) FROM assignment_submissions WHERE created_at BETWEEN :startDate AND :endDate) as total_submissions,
        (SELECT COUNT(DISTINCT student_id) FROM attempts WHERE created_at BETWEEN :startDate AND :endDate) as active_students,
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active = true) as total_students
    `, { startDate, endDate });

    const summary = {
      total_exams: summaryRow.total_exams || 0,
      total_materials: summaryRow.total_materials || 0,
      total_assignments: summaryRow.total_assignments || 0,
      total_attempts: summaryRow.total_attempts || 0,
      avg_score: parseFloat(summaryRow.avg_score) || 0,
      pass_rate: summaryRow.total_attempts > 0 ? Math.round((summaryRow.passed_attempts / summaryRow.total_attempts) * 100) : 0,
      total_material_reads: summaryRow.total_material_reads || 0,
      avg_reads_per_material: summaryRow.total_materials > 0 ? (summaryRow.total_material_reads / summaryRow.total_materials) : 0,
      total_submissions: summaryRow.total_submissions || 0,
      submission_rate: summaryRow.total_assignments > 0 ? Math.round((summaryRow.total_submissions / summaryRow.total_assignments) * 100) : 0,
      student_participation: summaryRow.total_students > 0 ? Math.round((summaryRow.active_students / summaryRow.total_students) * 100) : 0
    };

    // Get active teachers
    const [activeTeachers] = await pool.query(`
      SELECT 
        u.id, u.full_name,
        COUNT(DISTINCT e.id) as total_exams,
        COUNT(DISTINCT m.id) as total_materials,
        COUNT(DISTINCT a.id) as total_assignments,
        (COUNT(DISTINCT e.id) * 3 + COUNT(DISTINCT m.id) * 2 + COUNT(DISTINCT a.id) * 2) as activity_score
      FROM users u
      LEFT JOIN exams e ON e.teacher_id = u.id AND e.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN materials m ON m.teacher_id = u.id AND m.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN assignments a ON a.teacher_id = u.id AND a.created_at BETWEEN :startDate AND :endDate
      WHERE u.role = 'TEACHER' AND u.is_active = true
      GROUP BY u.id, u.full_name
      HAVING (COUNT(DISTINCT e.id) * 3 + COUNT(DISTINCT m.id) * 2 + COUNT(DISTINCT a.id) * 2) > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, { startDate, endDate });

    // Get active students
    const [activeStudents] = await pool.query(`
      SELECT 
        u.id, u.full_name, c.name as class_name,
        COUNT(DISTINCT at.id) as total_attempts,
        COUNT(DISTINCT asub.id) as total_submissions,
        COUNT(DISTINCT mr.id) as total_reads,
        (COUNT(DISTINCT at.id) * 3 + COUNT(DISTINCT asub.id) * 2 + COUNT(DISTINCT mr.id) * 1) as activity_score
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      WHERE u.role = 'STUDENT' AND u.is_active = true
      GROUP BY u.id, u.full_name, c.name
      HAVING (COUNT(DISTINCT at.id) * 3 + COUNT(DISTINCT asub.id) * 2 + COUNT(DISTINCT mr.id)) > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, { startDate, endDate });

    // Get active classes
    const [activeClassesRaw] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_exams,
        COUNT(DISTINCT asub_filtered.id) as total_assignments,
        COUNT(DISTINCT mr.id) as total_material_reads,
        COALESCE(AVG(at.score), 0) as avg_score,
        (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub_filtered.id) + COUNT(DISTINCT mr.id)) as total_activities,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 THEN 
            ROUND(((COUNT(DISTINCT at.student_id) + COUNT(DISTINCT asub_filtered.student_id) + COUNT(DISTINCT mr.student_id)) / (COUNT(DISTINCT u.id) * 3)) * 100)
          ELSE 0 
        END as participation_rate
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT' AND u.is_active = true
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN (
        SELECT asub.*, ac.class_id as target_class_id
        FROM assignment_submissions asub
        INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
        WHERE asub.created_at BETWEEN :startDate AND :endDate
      ) asub_filtered ON asub_filtered.student_id = u.id AND asub_filtered.target_class_id = c.id
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT u.id) > 0
      ORDER BY total_activities DESC, participation_rate DESC, c.name ASC
    `, { startDate, endDate });

    // Convert avg_score to numbers
    const activeClasses = activeClassesRaw.map(cls => ({
      ...cls,
      avg_score: parseFloat(cls.avg_score) || 0
    }));

    // Get popular subjects
    const [popularSubjectsRaw] = await pool.query(`
      SELECT 
        s.id, s.name as subject_name,
        COUNT(DISTINCT e.id) as total_exams,
        COUNT(DISTINCT m.id) as total_materials,
        COUNT(DISTINCT at.id) as total_attempts,
        COALESCE(AVG(at.score), 0) as avg_score
      FROM subjects s
      LEFT JOIN exams e ON e.subject_id = s.id AND e.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN materials m ON m.subject_id = s.id AND m.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN attempts at ON at.exam_id = e.id AND at.created_at BETWEEN :startDate AND :endDate
      GROUP BY s.id, s.name
      HAVING (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) > 0
      ORDER BY (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) DESC, avg_score DESC
      LIMIT 10
    `, { startDate, endDate });

    // Convert avg_score to numbers
    const popularSubjects = popularSubjectsRaw.map(subj => ({
      ...subj,
      avg_score: parseFloat(subj.avg_score) || 0
    }));

    // Export to Excel if requested
    if (exportExcel) {
      const wb = XLSX.utils.book_new();
      
      // Summary sheet
      const summaryData = [
        ['Metrik', 'Nilai'],
        ['Total Ujian', summary.total_exams],
        ['Total Materi', summary.total_materials],
        ['Total Tugas', summary.total_assignments],
        ['Total Percobaan Ujian', summary.total_attempts],
        ['Rata-rata Nilai', summary.avg_score.toFixed(2)],
        ['Tingkat Kelulusan (%)', summary.pass_rate],
        ['Total Pembacaan Materi', summary.total_material_reads],
        ['Rata-rata Pembacaan per Materi', summary.avg_reads_per_material.toFixed(2)],
        ['Total Pengumpulan Tugas', summary.total_submissions],
        ['Tingkat Pengumpulan Tugas (%)', summary.submission_rate],
        ['Partisipasi Siswa (%)', summary.student_participation]
      ];
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Ringkasan');

      // Active teachers sheet
      const teachersData = [
        ['Ranking', 'Nama Guru', 'Total Ujian', 'Total Materi', 'Total Tugas', 'Skor Aktivitas'],
        ...activeTeachers.map((teacher, index) => [
          index + 1,
          teacher.full_name,
          teacher.total_exams,
          teacher.total_materials,
          teacher.total_assignments,
          teacher.activity_score
        ])
      ];
      const teachersWs = XLSX.utils.aoa_to_sheet(teachersData);
      XLSX.utils.book_append_sheet(wb, teachersWs, 'Guru Teraktif');

      // Active students sheet
      const studentsData = [
        ['Ranking', 'Nama Siswa', 'Kelas', 'Total Ujian', 'Total Tugas', 'Skor Aktivitas'],
        ...activeStudents.map((student, index) => [
          index + 1,
          student.full_name,
          student.class_name || 'Tanpa Kelas',
          student.total_attempts,
          student.total_submissions,
          student.activity_score
        ])
      ];
      const studentsWs = XLSX.utils.aoa_to_sheet(studentsData);
      XLSX.utils.book_append_sheet(wb, studentsWs, 'Siswa Teraktif');

      // Active classes sheet
      const classesData = [
        ['Ranking', 'Nama Kelas', 'Total Siswa', 'Total Ujian', 'Total Tugas', 'Total Baca Materi', 'Total Aktivitas', 'Rata-rata Nilai', 'Partisipasi (%)'],
        ...activeClasses.map((classData, index) => [
          index + 1,
          classData.class_name,
          classData.total_students,
          classData.total_exams,
          classData.total_assignments,
          classData.total_material_reads,
          classData.total_activities,
          classData.avg_score.toFixed(2),
          classData.participation_rate
        ])
      ];
      const classesWs = XLSX.utils.aoa_to_sheet(classesData);
      XLSX.utils.book_append_sheet(wb, classesWs, 'Kelas Teraktif');

      // Popular subjects sheet
      const subjectsData = [
        ['Ranking', 'Mata Pelajaran', 'Total Ujian', 'Total Materi', 'Total Percobaan', 'Rata-rata Nilai'],
        ...popularSubjects.map((subject, index) => [
          index + 1,
          subject.subject_name,
          subject.total_exams,
          subject.total_materials,
          subject.total_attempts,
          subject.avg_score.toFixed(2)
        ])
      ];
      const subjectsWs = XLSX.utils.aoa_to_sheet(subjectsData);
      XLSX.utils.book_append_sheet(wb, subjectsWs, 'Mata Pelajaran Populer');

      // Generate buffer and send file
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `Rekap_LMS_${startDate}_${endDate}_${Date.now()}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    res.render('admin/reports', {
      title: 'Rekap Penggunaan LMS',
      filters,
      summary,
      activeTeachers,
      activeStudents,
      activeClasses,
      popularSubjects
    });

  } catch (error) {
    console.error('Error generating reports:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    req.flash('error', 'Gagal memuat laporan rekap: ' + error.message);
    res.redirect('/admin');
  }
});

// ===== CLASSES =====
router.get('/classes', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let whereClause = '';
  let queryParams = {};
  
  if (search) {
    whereClause = 'WHERE code LIKE :search OR name LIKE :search';
    queryParams.search = `%${search}%`;
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM classes ${whereClause}`,
    queryParams
  );

  const [classes] = await pool.query(
    `SELECT * FROM classes ${whereClause} ORDER BY id DESC LIMIT :limit OFFSET :offset;`,
    { ...queryParams, limit, offset }
  );

  const totalPages = Math.ceil(total / limit);

  res.render('admin/classes', { 
    title: 'Kelola Kelas', 
    classes,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    filters: {
      search
    }
  });
});

// Download classes as Excel
router.get('/classes/download', async (req, res) => {
  try {
    const [classes] = await pool.query(`SELECT code, name FROM classes ORDER BY name ASC;`);
    
    const data = classes.map(c => ({
      'code': c.code,
      'name': c.name
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Kelas');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="data_kelas_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengunduh data kelas.');
    res.redirect('/admin/classes');
  }
});

router.get('/classes/import', async (req, res) => {
  res.render('admin/classes_import', { title: 'Import Masal Kelas' });
});

router.post('/classes/import/preview', uploadImport.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'File import belum dipilih.');
    return res.redirect('/admin/classes/import');
  }

  try {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      req.flash('error', 'File kosong / tidak ada data.');
      return res.redirect('/admin/classes/import');
    }

    const [existing] = await pool.query(`SELECT code FROM classes;`);
    const existingCodesSet = new Set((existing || []).map((x) => x.code));

    const { preview, errors } = buildCodeNameImportPreview(rows, existingCodesSet);
    const importId = nanoid(12);

    req.session.classImportPreview = { importId, preview, errors, createdAt: Date.now() };
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}

    return res.render('admin/classes_import_preview', {
      title: 'Preview Import Kelas',
      importId,
      preview,
      errors
    });
  } catch (e) {
    console.error(e);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    req.flash('error', 'Gagal membaca file. Pastikan format Excel/CSV sesuai template.');
    return res.redirect('/admin/classes/import');
  }
});

router.get('/classes/import/errors.csv', async (req, res) => {
  const sess = req.session.classImportPreview;
  if (!sess || !Array.isArray(sess.errors)) return res.status(404).send('Tidak ada data error.');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="import_kelas_errors.csv"');
  res.write('row_no,reasons\n');
  for (const e of sess.errors) {
    const reasons = (e.reasons || []).join(' | ').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    res.write(`${e.rowNo},"${reasons}"\n`);
  }
  res.end();
});

router.post('/classes/import/commit', async (req, res) => {
  const { importId } = req.body;
  const sess = req.session.classImportPreview;

  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid / sudah kedaluwarsa. Silakan upload ulang.');
    return res.redirect('/admin/classes/import');
  }

  const items = Array.isArray(sess.preview) ? sess.preview : [];
  if (!items.length) {
    req.flash('error', 'Tidak ada data valid untuk di-import (periksa error).');
    return res.redirect('/admin/classes/import');
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (const it of items) {
      await conn.query(
        `INSERT INTO classes (code, name)
         VALUES (:code,:name)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name;`,
        { code: it.code, name: it.name }
      );
      if (it.action === 'UPDATE') updated += 1;
      else inserted += 1;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal commit import kelas. Coba ulangi / pecah file.');
    return res.redirect('/admin/classes/import');
  } finally {
    conn.release();
  }

  req.session.classImportPreview = null;
  req.flash('success', `Import kelas berhasil. Insert: ${inserted}, Update: ${updated}.`);
  return res.redirect('/admin/classes');
});

router.post('/classes', async (req, res) => {
  const { code, name } = req.body;
  try {
    await pool.query(`INSERT INTO classes (code, name) VALUES (:code,:name);`, { code, name });
    req.flash('success', 'Kelas ditambahkan.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menambahkan kelas (mungkin kode sudah ada).');
  }
  res.redirect('/admin/classes');
});

router.post('/classes/:id/update', async (req, res) => {
  const { code, name } = req.body;
  try {
    await pool.query(`UPDATE classes SET code=:code, name=:name WHERE id=:id;`, {
      id: req.params.id,
      code,
      name
    });
    req.flash('success', 'Kelas diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui kelas (mungkin kode sudah dipakai).');
  }
  res.redirect('/admin/classes');
});

// JSON endpoint untuk modal edit kelas (AJAX)
router.get('/classes/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, code, name FROM classes WHERE id=:id LIMIT 1;`, {
      id: req.params.id
    });
    const item = rows && rows[0];
    if (!item) return res.status(404).json({ ok: false, message: 'Kelas tidak ditemukan.' });
    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data kelas.' });
  }
});

// Update via AJAX untuk modal edit kelas
router.post('/classes/:id/ajax-update', async (req, res) => {
  const { code, name } = req.body || {};
  try {
    await pool.query(`UPDATE classes SET code=:code, name=:name WHERE id=:id;`, {
      id: req.params.id,
      code: String(code || '').trim(),
      name: String(name || '').trim()
    });
    const [rows] = await pool.query(`SELECT id, code, name FROM classes WHERE id=:id LIMIT 1;`, { id: req.params.id });
    return res.json({ ok: true, item: rows && rows[0] });
  } catch (e) {
    console.error(e);
    if (String(e && e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Kode kelas sudah dipakai.' });
    }
    return res.status(500).json({ ok: false, message: 'Gagal menyimpan perubahan kelas.' });
  }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM classes WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Kelas dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus kelas.');
  }
  res.redirect('/admin/classes');
});

// Bulk delete classes
router.post('/classes/bulk-delete', async (req, res) => {
  let class_ids = req.body.class_ids;
  
  if (typeof class_ids === 'string') {
    try {
      class_ids = JSON.parse(class_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/classes');
    }
  }
  
  if (!class_ids || !Array.isArray(class_ids) || class_ids.length === 0) {
    req.flash('error', 'Tidak ada kelas yang dipilih untuk dihapus.');
    return res.redirect('/admin/classes');
  }

  const validIds = class_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada ID kelas yang valid.');
    return res.redirect('/admin/classes');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map((_, i) => `$${i + 1}`).join(',');
    
    // Delete related data
    await conn.query(`UPDATE users SET class_id = NULL WHERE class_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM exam_classes WHERE class_id IN (${placeholders});`, validIds);
    
    // Try to delete from material_classes if table exists
    try {
      await conn.query(`DELETE FROM material_classes WHERE class_id IN (${placeholders});`, validIds);
    } catch (err) {
      // Table might not exist, skip silently
      console.log('material_classes table not found, skipping...');
    }
    
    // Delete classes
    const [result] = await conn.query(`DELETE FROM classes WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} kelas dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus kelas. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/classes');
});

// ===== SUBJECTS =====
router.get('/subjects', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let whereClause = '';
  let queryParams = {};
  
  if (search) {
    whereClause = 'WHERE code LIKE :search OR name LIKE :search';
    queryParams.search = `%${search}%`;
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM subjects ${whereClause}`,
    queryParams
  );

  const [subjects] = await pool.query(
    `SELECT * FROM subjects ${whereClause} ORDER BY id DESC LIMIT :limit OFFSET :offset;`,
    { ...queryParams, limit, offset }
  );

  const totalPages = Math.ceil(total / limit);

  res.render('admin/subjects', { 
    title: 'Kelola Mapel', 
    subjects,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    filters: {
      search
    }
  });
});

// Download subjects as Excel
router.get('/subjects/download', async (req, res) => {
  try {
    const [subjects] = await pool.query(`SELECT code, name FROM subjects ORDER BY name ASC;`);
    
    const data = subjects.map(s => ({
      'code': s.code,
      'name': s.name
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Mata Pelajaran');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="data_mata_pelajaran_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengunduh data mata pelajaran.');
    res.redirect('/admin/subjects');
  }
});

router.get('/subjects/import', async (req, res) => {
  res.render('admin/subjects_import', { title: 'Import Masal Mapel' });
});

router.post('/subjects/import/preview', uploadImport.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'File import belum dipilih.');
    return res.redirect('/admin/subjects/import');
  }

  try {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      req.flash('error', 'File kosong / tidak ada data.');
      return res.redirect('/admin/subjects/import');
    }

    const [existing] = await pool.query(`SELECT code FROM subjects;`);
    const existingCodesSet = new Set((existing || []).map((x) => x.code));

    const { preview, errors } = buildCodeNameImportPreview(rows, existingCodesSet);
    const importId = nanoid(12);

    req.session.subjectImportPreview = { importId, preview, errors, createdAt: Date.now() };
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}

    return res.render('admin/subjects_import_preview', {
      title: 'Preview Import Mapel',
      importId,
      preview,
      errors
    });
  } catch (e) {
    console.error(e);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    req.flash('error', 'Gagal membaca file. Pastikan format Excel/CSV sesuai template.');
    return res.redirect('/admin/subjects/import');
  }
});

router.get('/subjects/import/errors.csv', async (req, res) => {
  const sess = req.session.subjectImportPreview;
  if (!sess || !Array.isArray(sess.errors)) return res.status(404).send('Tidak ada data error.');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="import_mapel_errors.csv"');
  res.write('row_no,reasons\n');
  for (const e of sess.errors) {
    const reasons = (e.reasons || []).join(' | ').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    res.write(`${e.rowNo},"${reasons}"\n`);
  }
  res.end();
});

router.post('/subjects/import/commit', async (req, res) => {
  const { importId } = req.body;
  const sess = req.session.subjectImportPreview;

  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid / sudah kedaluwarsa. Silakan upload ulang.');
    return res.redirect('/admin/subjects/import');
  }

  const items = Array.isArray(sess.preview) ? sess.preview : [];
  if (!items.length) {
    req.flash('error', 'Tidak ada data valid untuk di-import (periksa error).');
    return res.redirect('/admin/subjects/import');
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (const it of items) {
      await conn.query(
        `INSERT INTO subjects (code, name)
         VALUES (:code,:name)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name;`,
        { code: it.code, name: it.name }
      );
      if (it.action === 'UPDATE') updated += 1;
      else inserted += 1;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal commit import mapel. Coba ulangi / pecah file.');
    return res.redirect('/admin/subjects/import');
  } finally {
    conn.release();
  }

  req.session.subjectImportPreview = null;
  req.flash('success', `Import mapel berhasil. Insert: ${inserted}, Update: ${updated}.`);
  return res.redirect('/admin/subjects');
});

router.post('/subjects', async (req, res) => {
  const { code, name } = req.body;
  try {
    await pool.query(`INSERT INTO subjects (code, name) VALUES (:code,:name);`, { code, name });
    req.flash('success', 'Mapel ditambahkan.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menambahkan mapel (mungkin kode sudah ada).');
  }
  res.redirect('/admin/subjects');
});

router.post('/subjects/:id/update', async (req, res) => {
  const { code, name } = req.body;
  try {
    await pool.query(`UPDATE subjects SET code=:code, name=:name WHERE id=:id;`, {
      id: req.params.id,
      code,
      name
    });
    req.flash('success', 'Mapel diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui mapel (mungkin kode sudah dipakai).');
  }
  res.redirect('/admin/subjects');
});

// JSON endpoint untuk modal edit mapel (AJAX)
router.get('/subjects/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, code, name FROM subjects WHERE id=:id LIMIT 1;`, {
      id: req.params.id
    });
    const item = rows && rows[0];
    if (!item) return res.status(404).json({ ok: false, message: 'Mapel tidak ditemukan.' });
    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data mapel.' });
  }
});

// Update via AJAX untuk modal edit mapel
router.post('/subjects/:id/ajax-update', async (req, res) => {
  const { code, name } = req.body || {};
  try {
    await pool.query(`UPDATE subjects SET code=:code, name=:name WHERE id=:id;`, {
      id: req.params.id,
      code: String(code || '').trim(),
      name: String(name || '').trim()
    });
    const [rows] = await pool.query(`SELECT id, code, name FROM subjects WHERE id=:id LIMIT 1;`, { id: req.params.id });
    return res.json({ ok: true, item: rows && rows[0] });
  } catch (e) {
    console.error(e);
    if (String(e && e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Kode mapel sudah dipakai.' });
    }
    return res.status(500).json({ ok: false, message: 'Gagal menyimpan perubahan mapel.' });
  }
});

// ===== TEACHERS =====
router.get('/teachers', async (req, res) => {
  const [teachers] = await pool.query(
    `SELECT id, username, full_name, role, is_active, created_at
     FROM users
     WHERE role='TEACHER'
     ORDER BY id DESC;`
  );
  res.render('admin/teachers', { title: 'Kelola Guru', teachers });
});

// Download teachers as Excel
router.get('/teachers/download', async (req, res) => {
  try {
    const [teachers] = await pool.query(
      `SELECT username, full_name, plain_password FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`
    );
    
    const data = teachers.map(t => ({
      'username': t.username,
      'full_name': t.full_name,
      // Gunakan plain_password jika ada, fallback ke username (default saat import)
      'password': t.plain_password || t.username
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Guru');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="data_guru_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengunduh data guru.');
    res.redirect('/admin/teachers');
  }
});

router.post('/teachers', async (req, res) => {
  const { username, full_name, password } = req.body;
  try {
    const password_hash = await bcrypt.hash(password || '123456', 10);
    await pool.query(
      `INSERT INTO users (username, full_name, role, class_id, password_hash, is_active)
       VALUES (:username,:full_name,'TEACHER',NULL,:password_hash,true);`,
      { username, full_name, password_hash }
    );
    req.flash('success', 'Guru ditambahkan.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menambahkan guru (mungkin username sudah ada).');
  }
  res.redirect('/admin/teachers');
});

router.post('/teachers/:id/update', async (req, res) => {
  const { username, full_name, is_active, password } = req.body;
  try {
    const setPassword = String(password || '').trim() ? 1 : 0;
    const password_hash = await bcrypt.hash(String(password || '123456').trim() || '123456', 10);
    await pool.query(
      `UPDATE users
       SET username=:username,
           full_name=:full_name,
           is_active=:is_active,
           password_hash=IF(:setPassword=1, :password_hash, password_hash)
       WHERE id=:id AND role='TEACHER';`,
      {
        id: req.params.id,
        username,
        full_name,
        is_active: Boolean(Number(is_active)),
        setPassword,
        password_hash
      }
    );
    req.flash('success', 'Data guru diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui guru (mungkin username sudah dipakai).');
  }
  res.redirect('/admin/teachers');
});

// JSON endpoint untuk modal edit guru (AJAX)
router.get('/teachers/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, is_active
       FROM users
       WHERE id=:id AND role='TEACHER'
       LIMIT 1;`,
      { id: req.params.id }
    );
    const item = rows && rows[0];
    if (!item) return res.status(404).json({ ok: false, message: 'Guru tidak ditemukan.' });
    return res.json({ ok: true, item });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data guru.' });
  }
});

// Update via AJAX untuk modal edit guru
router.post('/teachers/:id/ajax-update', async (req, res) => {
  const { username, full_name, is_active, new_password } = req.body || {};
  try {
    const setPassword = new_password && String(new_password).trim().length > 0 ? 1 : 0;
    const password_hash = setPassword ? await bcrypt.hash(String(new_password).trim(), 10) : null;

    await pool.query(
      `UPDATE users
       SET username=:username,
           full_name=:full_name,
           is_active=:is_active,
           password_hash=IF(:setPassword=1, :password_hash, password_hash)
       WHERE id=:id AND role='TEACHER';`,
      {
        id: req.params.id,
        username: String(username || '').trim(),
        full_name: String(full_name || '').trim(),
        is_active: String(is_active) === '1' || is_active === true,
        setPassword,
        password_hash
      }
    );

    const [rows] = await pool.query(
      `SELECT id, username, full_name, is_active
       FROM users
       WHERE id=:id AND role='TEACHER'
       LIMIT 1;`,
      { id: req.params.id }
    );

    return res.json({ ok: true, item: rows && rows[0] });
  } catch (e) {
    console.error(e);
    if (String(e && e.code) === 'ER_DUP_ENTRY') {
      return res.status(409).json({ ok: false, message: 'Username sudah dipakai pengguna lain.' });
    }
    return res.status(500).json({ ok: false, message: 'Gagal menyimpan perubahan guru.' });
  }
});

router.post('/teachers/:id/reset', async (req, res) => {
  try {
    const password_hash = await bcrypt.hash(req.body.new_password || '123456', 10);
    await pool.query(`UPDATE users SET password_hash=:ph WHERE id=:id AND role='TEACHER';`, {
      ph: password_hash,
      id: req.params.id
    });
    req.flash('success', 'Password guru direset.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal reset password.');
  }
  res.redirect('/admin/teachers');
});

router.post('/teachers/:id/toggle', async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET is_active = IF(is_active=true,0,1) WHERE id=:id AND role='TEACHER';`,
      { id: req.params.id }
    );
    req.flash('success', 'Status guru diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui status.');
  }
  res.redirect('/admin/teachers');
});

router.delete('/teachers/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id=:id AND role='TEACHER';`, { id: req.params.id });
    req.flash('success', 'Guru dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus guru.');
  }
  res.redirect('/admin/teachers');
});

router.get('/teachers/import', async (req, res) => {
  res.render('admin/teachers_import', { title: 'Import Masal Guru' });
});

router.post('/teachers/import/preview', uploadImport.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'File import belum dipilih.');
    return res.redirect('/admin/teachers/import');
  }

  try {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      req.flash('error', 'File kosong / tidak ada data.');
      return res.redirect('/admin/teachers/import');
    }

    const usernames = rows
      .map((r) => String(pickRowValue(r, ['username', 'user', 'nip', 'nuptk', 'email'])).trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(usernames));
    let existingUsernamesSet = new Set();
    if (uniq.length) {
      const placeholders = uniq.map(() => '?').join(',');
      const [exists] = await pool.query(`SELECT username FROM users WHERE username IN (${placeholders});`, uniq);
      existingUsernamesSet = new Set((exists || []).map((x) => x.username));
    }

    const { preview, errors } = buildTeacherImportPreview(rows, existingUsernamesSet);
    const importId = nanoid(12);
    req.session.teacherImportPreview = { importId, preview, errors, createdAt: Date.now() };

    try {
      fs.unlinkSync(file.path);
    } catch (_) {}

    return res.render('admin/teachers_import_preview', {
      title: 'Preview Import Guru',
      importId,
      preview,
      errors
    });
  } catch (e) {
    console.error(e);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    req.flash('error', 'Gagal membaca file. Pastikan format Excel/CSV sesuai template.');
    return res.redirect('/admin/teachers/import');
  }
});

router.get('/teachers/import/errors.csv', async (req, res) => {
  const sess = req.session.teacherImportPreview;
  if (!sess || !Array.isArray(sess.errors)) return res.status(404).send('Tidak ada data error.');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="import_guru_errors.csv"');
  res.write('row_no,reasons\n');
  for (const e of sess.errors) {
    const reasons = (e.reasons || []).join(' | ').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    res.write(`${e.rowNo},"${reasons}"\n`);
  }
  res.end();
});

router.post('/teachers/import/commit', async (req, res) => {
  const { importId } = req.body;
  const sess = req.session.teacherImportPreview;

  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid / sudah kedaluwarsa. Silakan upload ulang.');
    return res.redirect('/admin/teachers/import');
  }

  const items = Array.isArray(sess.preview) ? sess.preview : [];
  if (!items.length) {
    req.flash('error', 'Tidak ada data valid untuk di-import (periksa error).');
    return res.redirect('/admin/teachers/import');
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (const it of items) {
      const pwd = String(it.password || '').trim();
      const setPassword = pwd ? 1 : 0;
      const password_hash = await bcrypt.hash(pwd || it.username, 10); // default = username

      await conn.query(
        `INSERT INTO users (username, full_name, role, class_id, password_hash, is_active)
         VALUES (:username,:full_name,'TEACHER',NULL,:password_hash,true)
         ON CONFLICT (username) DO UPDATE SET
           full_name=EXCLUDED.full_name,
           role='TEACHER',
           class_id=NULL,
           is_active=true,
           password_hash=CASE WHEN :setPassword=1 THEN EXCLUDED.password_hash ELSE users.password_hash END;`,
        {
          username: it.username,
          full_name: it.full_name,
          password_hash,
          setPassword
        }
      );

      if (it.action === 'UPDATE') updated += 1;
      else inserted += 1;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal commit import guru. Coba ulangi / pecah file.');
    return res.redirect('/admin/teachers/import');
  } finally {
    conn.release();
  }

  req.session.teacherImportPreview = null;
  req.flash('success', `Import guru berhasil. Insert: ${inserted}, Update: ${updated}.`);
  return res.redirect('/admin/teachers');
});

router.delete('/subjects/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM subjects WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Mapel dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus mapel.');
  }
  res.redirect('/admin/subjects');
});

// Bulk delete subjects
router.post('/subjects/bulk-delete', async (req, res) => {
  let subject_ids = req.body.subject_ids;
  
  if (typeof subject_ids === 'string') {
    try {
      subject_ids = JSON.parse(subject_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/subjects');
    }
  }
  
  if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
    req.flash('error', 'Tidak ada mata pelajaran yang dipilih untuk dihapus.');
    return res.redirect('/admin/subjects');
  }

  const validIds = subject_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada ID mata pelajaran yang valid.');
    return res.redirect('/admin/subjects');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data
    await conn.query(`DELETE FROM exams WHERE subject_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM materials WHERE subject_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM question_bank WHERE subject_id IN (${placeholders});`, validIds);
    
    // Delete subjects
    const [result] = await conn.query(`DELETE FROM subjects WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} mata pelajaran dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus mata pelajaran. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/subjects');
});

// ===== USERS =====
router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const roleFilter = (req.query.role || '').trim();
  const classFilter = (req.query.class || '').trim();
  const statusFilter = (req.query.status || '').trim();

  const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
  
  // Build WHERE clause
  let whereConditions = [];
  let queryParams = {};
  
  if (search) {
    whereConditions.push('(u.username LIKE :search OR u.full_name LIKE :search)');
    queryParams.search = `%${search}%`;
  }
  
  if (roleFilter) {
    whereConditions.push('u.role = :role');
    queryParams.role = roleFilter;
  }
  
  if (classFilter) {
    whereConditions.push('u.class_id = :classId');
    queryParams.classId = parseInt(classFilter);
  }
  
  if (statusFilter) {
    whereConditions.push('u.is_active = :status');
    queryParams.status = statusFilter === 'active' ? 1 : 0;
  }
  
  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
  
  // Get total count
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM users u ${whereClause}`,
    queryParams
  );
  
  // Get paginated users
  const [users] = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.class_id, c.name AS class_name
     FROM users u
     LEFT JOIN classes c ON c.id=u.class_id
     ${whereClause}
     ORDER BY u.id DESC
     LIMIT :limit OFFSET :offset;`,
    { ...queryParams, limit, offset }
  );
  
  const totalPages = Math.ceil(total / limit);
  
  res.render('admin/users', { 
    title: 'Kelola Pengguna', 
    users, 
    classes,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    filters: {
      search,
      role: roleFilter,
      class: classFilter,
      status: statusFilter
    }
  });
});

// Download users as Excel
router.get('/users/download', async (req, res) => {
  try {
    // Support filter by IDs (bulk download)
    const { ids } = req.query;
    let query = `SELECT u.username, u.full_name, u.plain_password AS password,
                        c.name AS class_name, u.nomor_peserta
                 FROM users u
                 LEFT JOIN classes c ON c.id=u.class_id
                 WHERE u.role='STUDENT'`;
    
    const params = [];
    if (ids) {
      const idArray = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (idArray.length > 0) {
        query += ` AND u.id IN (${idArray.map(() => '?').join(',')})`;
        params.push(...idArray);
      }
    }
    
    query += ` ORDER BY c.name ASC, u.full_name ASC`;
    
    const [users] = await pool.query(query, params);
    
    if (users.length === 0) {
      req.flash('error', 'Tidak ada data pengguna untuk diunduh.');
      return res.redirect('/admin/users');
    }
    
    const data = users.map(u => ({
      'username': u.username,
      'full_name': u.full_name,
      'password': u.password || '',
      'class': u.class_name || '',
      'nomor_peserta': u.nomor_peserta || ''
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 25 }, // username
      { wch: 35 }, // full_name
      { wch: 20 }, // password
      { wch: 20 }, // class
      { wch: 20 }  // nomor_peserta
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Siswa');
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = ids ? `data_siswa_terpilih_${Date.now()}.xlsx` : `data_siswa_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal mengunduh data pengguna.');
    res.redirect('/admin/users');
  }
});

// GET Print Login Cards
router.get('/users/print-cards', async (req, res) => {
  try {
    const { ids, role, class_id } = req.query;
    
    let query = 'SELECT u.id, u.username, u.full_name, u.role, u.nomor_peserta, u.profile_photo, u.plain_password, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE 1=1';
    const params = {};
    
    // Filter by specific IDs
    if (ids) {
      const idArray = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      if (idArray.length > 0) {
        query += ` AND u.id IN (${idArray.join(',')})`;
      }
    }
    
    // Filter by role
    if (role && ['TEACHER', 'STUDENT'].includes(role)) {
      query += ' AND u.role = :role';
      params.role = role;
    }
    
    // Filter by class
    if (class_id) {
      query += ' AND u.class_id = :class_id';
      params.class_id = class_id;
    }
    
    query += ' ORDER BY u.full_name ASC;';
    
    const [users] = await pool.query(query, params);
    
    if (users.length === 0) {
      req.flash('error', 'Tidak ada pengguna yang dipilih untuk dicetak.');
      return res.redirect('/admin/users');
    }
    
    // Get classes for filter
    const [classes] = await pool.query('SELECT id, name FROM classes ORDER BY name ASC;');
    
    // Get school info from env or default
    const schoolInfo = {
      name: process.env.SCHOOL_NAME || 'SMK Negeri 1 Kras',
      address: process.env.SCHOOL_ADDRESS || 'Kediri, Jawa Timur',
      logo: '/images/logo.png'
    };
    
    res.render('admin/print_login_cards', {
      title: 'Cetak Kartu Login',
      users,
      classes,
      schoolInfo,
      role: role || '',
      class_id: class_id || '',
      layout: false // No layout for print page
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat halaman cetak kartu.');
    res.redirect('/admin/users');
  }
});

// JSON endpoint untuk modal edit (AJAX)
router.get('/users/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, username, full_name, role, class_id, is_active, nomor_peserta
       FROM users WHERE id=:id LIMIT 1;`,
      { id: req.params.id }
    );
    const user = rows && rows[0];
    if (!user) return res.status(404).json({ ok: false, message: 'Pengguna tidak ditemukan.' });
    return res.json({ ok: true, user });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data pengguna.' });
  }
});

// Update via AJAX untuk modal edit
router.post('/users/:id/ajax-update', async (req, res) => {
  const { username, full_name, role, class_id, is_active, new_password, nomor_peserta } = req.body || {};
  try {
    const setPassword = new_password && String(new_password).trim().length > 0 ? 1 : 0;
    const password_hash = setPassword ? await bcrypt.hash(String(new_password).trim(), 10) : null;
    const noPeserta = String(nomor_peserta || '').trim() || null;

    await pool.query(
      `UPDATE users
       SET username=:username,
           full_name=:full_name,
           role=:role,
           class_id=:class_id,
           is_active=:is_active,
           nomor_peserta=:nomor_peserta,
           password_hash=CASE WHEN :setPassword=1 THEN :password_hash ELSE password_hash END
       WHERE id=:id;`,
      {
        id: req.params.id,
        username: String(username || '').trim(),
        full_name: String(full_name || '').trim(),
        role: String(role || 'STUDENT').trim(),
        class_id: class_id ? Number(class_id) : null,
        is_active: String(is_active) === '1' || is_active === true,
        nomor_peserta: noPeserta,
        setPassword,
        password_hash
      }
    );

    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.class_id, u.nomor_peserta, c.name AS class_name
       FROM users u LEFT JOIN classes c ON c.id=u.class_id WHERE u.id=:id LIMIT 1;`,
      { id: req.params.id }
    );
    return res.json({ ok: true, user: rows && rows[0] });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, message: 'Username atau nomor peserta sudah dipakai.' });
    }
    return res.status(500).json({ ok: false, message: 'Gagal menyimpan perubahan pengguna.' });
  }
});

// ===== EDIT PENGGUNA (terutama siswa) =====
router.get('/users/:id/edit', async (req, res) => {
  try {
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
    const [rows] = await pool.query(
      `SELECT id, username, full_name, role, class_id, is_active, nomor_peserta
       FROM users WHERE id=:id LIMIT 1;`,
      { id: req.params.id }
    );
    const user = rows && rows[0];
    if (!user) {
      req.flash('error', 'Pengguna tidak ditemukan.');
      return res.redirect('/admin/users');
    }
    return res.render('admin/users_edit', { title: 'Edit Pengguna', user, classes });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal membuka halaman edit pengguna.');
    return res.redirect('/admin/users');
  }
});

router.post('/users/:id/edit', async (req, res) => {
  const { username, full_name, role, class_id, is_active, new_password, nomor_peserta } = req.body;
  try {
    const setPassword = new_password && String(new_password).trim().length > 0 ? 1 : 0;
    const password_hash = setPassword ? await bcrypt.hash(String(new_password).trim(), 10) : null;
    const noPeserta = String(nomor_peserta || '').trim() || null;
    const plainPwd = setPassword ? String(new_password).trim() : null;

    await pool.query(
      `UPDATE users
       SET username=:username,
           full_name=:full_name,
           role=:role,
           class_id=:class_id,
           is_active=:is_active,
           nomor_peserta=:nomor_peserta,
           plain_password=CASE WHEN :setPassword=1 THEN :plain_password ELSE plain_password END,
           password_hash=CASE WHEN :setPassword=1 THEN :password_hash ELSE password_hash END
       WHERE id=:id;`,
      {
        id: req.params.id,
        username: String(username || '').trim(),
        full_name: String(full_name || '').trim(),
        role: String(role || 'STUDENT').trim(),
        class_id: class_id ? Number(class_id) : null,
        is_active: String(is_active) === '1',
        nomor_peserta: noPeserta,
        plain_password: plainPwd,
        setPassword,
        password_hash
      }
    );

    req.flash('success', 'Pengguna berhasil diperbarui.');
    return res.redirect('/admin/users');
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      req.flash('error', 'Gagal: username atau nomor peserta sudah dipakai pengguna lain.');
      return res.redirect(`/admin/users/${req.params.id}/edit`);
    }
    req.flash('error', 'Gagal menyimpan perubahan pengguna.');
    return res.redirect(`/admin/users/${req.params.id}/edit`);
  }
});

// ===== IMPORT SISWA (MASS UPLOAD) =====
router.get('/users/import', async (req, res) => {
  const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
  res.render('admin/users_import', { title: 'Import Masal Siswa', classes });
});

router.post('/users/import/preview', uploadImport.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'File import belum dipilih.');
    return res.redirect('/admin/users/import');
  }

  try {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      req.flash('error', 'File kosong / tidak ada data.');
      return res.redirect('/admin/users/import');
    }

    // Build class map by code and name
    const [classes] = await pool.query(`SELECT id, code, name FROM classes;`);
    const classesMap = new Map();
    for (const c of classes) {
      if (c.code) classesMap.set(normalizeClassKey(c.code), c);
      if (c.name) classesMap.set(normalizeClassKey(c.name), c);
    }

    // collect usernames to detect insert/update
    const usernames = rows
      .map((r) => String(pickRowValue(r, ['username', 'user', 'nis', 'nisn'])).trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(usernames));

    let existingUsernamesSet = new Set();
    if (uniq.length) {
      const placeholders = uniq.map(() => '?').join(',');
      const [exists] = await pool.query(`SELECT username FROM users WHERE username IN (${placeholders});`, uniq);
      existingUsernamesSet = new Set((exists || []).map((x) => x.username));
    }

    const { preview, errors } = buildStudentImportPreview(rows, classesMap, existingUsernamesSet);
    const importId = nanoid(12);

    // store on session (keep raw password so we can hash on commit)
    req.session.studentImportPreview = {
      importId,
      preview,
      errors,
      createdAt: Date.now()
    };

    // cleanup temp file
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}

    return res.render('admin/users_import_preview', {
      title: 'Preview Import Siswa',
      importId,
      preview,
      errors
    });
  } catch (e) {
    console.error(e);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    req.flash('error', 'Gagal membaca file. Pastikan format Excel/CSV sesuai template.');
    return res.redirect('/admin/users/import');
  }
});

// Download laporan error (CSV) dari sesi preview terakhir
router.get('/users/import/errors.csv', async (req, res) => {
  const sess = req.session.studentImportPreview;
  if (!sess || !Array.isArray(sess.errors)) {
    return res.status(404).send('Tidak ada data error (jalankan preview import dulu).');
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="import_siswa_errors.csv"');
  res.write('row_no,reasons\n');
  for (const e of sess.errors) {
    const reasons = (e.reasons || []).join(' | ').replace(/\r?\n/g, ' ').replace(/"/g, '""');
    res.write(`${e.rowNo},"${reasons}"\n`);
  }
  res.end();
});

// Commit import dari preview
router.post('/users/import/commit', async (req, res) => {
  const { importId } = req.body;
  const sess = req.session.studentImportPreview;

  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid / sudah kedaluwarsa. Silakan upload ulang.');
    return res.redirect('/admin/users/import');
  }

  const items = Array.isArray(sess.preview) ? sess.preview : [];
  if (!items.length) {
    req.flash('error', 'Tidak ada data valid untuk di-import (periksa error).');
    return res.redirect('/admin/users/import');
  }

  // Hash semua password secara paralel (jauh lebih cepat dari loop sequential)
  const BCRYPT_ROUNDS = 8; // turunkan dari 10 ke 8 untuk import massal (masih aman)
  const prepared = await Promise.all(
    items.map(async (it) => {
      const pwd = String(it.password || '').trim();
      const plainPwd = pwd || it.username;
      const password_hash = await bcrypt.hash(plainPwd, BCRYPT_ROUNDS);
      return { ...it, plainPwd, password_hash };
    })
  );

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;

  try {
    await conn.beginTransaction();

    // Bulk insert menggunakan unnest — 1 query untuk semua baris (sangat cepat)
    const usernames  = prepared.map(it => it.username);
    const fullNames  = prepared.map(it => it.full_name);
    const classIds   = prepared.map(it => it.class_id ? String(it.class_id) : null);
    const hashes     = prepared.map(it => it.password_hash);
    const nomorList  = prepared.map(it => it.nomor_peserta || null);
    const plainPwds  = prepared.map(it => it.plainPwd);

    // rawQuery: bypass converter, langsung PostgreSQL native
    await conn.rawQuery(
      `INSERT INTO users (username, full_name, role, class_id, password_hash, is_active, nomor_peserta, plain_password)
       SELECT u, fn, 'STUDENT', ci::int, ph, true, np, pp
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
         AS t(u, fn, ci, ph, np, pp)
       ON CONFLICT (username) DO UPDATE SET
         full_name      = EXCLUDED.full_name,
         role           = 'STUDENT',
         class_id       = EXCLUDED.class_id,
         is_active      = true,
         nomor_peserta  = COALESCE(EXCLUDED.nomor_peserta, users.nomor_peserta),
         plain_password = EXCLUDED.plain_password,
         password_hash  = EXCLUDED.password_hash`,
      [usernames, fullNames, classIds, hashes, nomorList, plainPwds]
    );

    for (const it of prepared) {
      if (it.action === 'UPDATE') updated += 1;
      else inserted += 1;
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal commit import. Coba ulangi atau pecah file menjadi lebih kecil.');
    return res.redirect('/admin/users/import');
  } finally {
    conn.release();
  }

  // clear session preview
  req.session.studentImportPreview = null;
  req.flash('success', `Import siswa berhasil. Insert: ${inserted}, Update: ${updated}.`);
  return res.redirect('/admin/users');
});

router.post('/users', async (req, res) => {
  const { username, full_name, role, class_id, password, nomor_peserta } = req.body;
  try {
    const password_hash = await bcrypt.hash(password || username, 10);
    const noPeserta = String(nomor_peserta || '').trim() || null;
    await pool.query(
      `INSERT INTO users (username, full_name, role, class_id, password_hash, nomor_peserta, plain_password)
       VALUES (:username,:full_name,:role,:class_id,:password_hash,:nomor_peserta,:plain_password);`,
      { username, full_name, role, class_id: class_id || null, password_hash, nomor_peserta: noPeserta, plain_password: String(password || username).trim() }
    );
    req.flash('success', 'Pengguna ditambahkan.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menambahkan pengguna (mungkin username atau nomor peserta sudah ada).');
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/reset', async (req, res) => {
  try {
    const password_hash = await bcrypt.hash(req.body.new_password || '123456', 10);
    await pool.query(`UPDATE users SET password_hash=:ph, plain_password=:plain WHERE id=:id;`, { ph: password_hash, id: req.params.id });
    req.flash('success', 'Password direset.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal reset password.');
  }
  res.redirect('/admin/users');
});

router.post('/users/:id/toggle', async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_active = IF(is_active=true,0,1) WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Status akun diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui status akun.');
  }
  res.redirect('/admin/users');
});

router.delete('/users/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM users WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Pengguna dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus pengguna.');
  }
  res.redirect('/admin/users');
});

// Bulk delete users
router.post('/users/bulk-delete', async (req, res) => {
  let user_ids = req.body.user_ids;

  if (typeof user_ids === 'string') {
    try { user_ids = JSON.parse(user_ids); } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/users');
    }
  }

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    req.flash('error', 'Tidak ada pengguna yang dipilih.');
    return res.redirect('/admin/users');
  }

  const validIds = user_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  if (!validIds.length) {
    req.flash('error', 'ID tidak valid.');
    return res.redirect('/admin/users');
  }

  const ph = validIds.map((_, i) => `$${i+1}`).join(',');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Hapus data terkait - pakai nama kolom yang benar sesuai schema
    // attempts & attempt_answers sudah CASCADE dari FK
    // Hapus manual yang tidak CASCADE
    await conn.query(`DELETE FROM material_reads WHERE student_id IN (${ph})`, validIds);
    await conn.query(`DELETE FROM notification_reads WHERE user_id IN (${ph})`, validIds);
    await conn.query(`DELETE FROM assignment_submissions WHERE student_id IN (${ph})`, validIds);
    await conn.query(`DELETE FROM live_class_participants WHERE student_id IN (${ph})`, validIds);
    await conn.query(`DELETE FROM device_tokens WHERE user_id IN (${ph})`, validIds);

    // Hapus attempt_answers dulu (FK ke attempts)
    await conn.query(`
      DELETE FROM attempt_answers WHERE attempt_id IN (
        SELECT id FROM attempts WHERE student_id IN (${ph})
      )`, validIds);
    await conn.query(`
      DELETE FROM attempt_violations WHERE attempt_id IN (
        SELECT id FROM attempts WHERE student_id IN (${ph})
      )`, validIds);
    await conn.query(`DELETE FROM attempts WHERE student_id IN (${ph})`, validIds);

    // Hapus submission_backups
    await conn.query(`DELETE FROM submission_backups WHERE student_id IN (${ph})`, validIds);

    // Hapus users
    const [result] = await conn.query(`DELETE FROM users WHERE id IN (${ph})`, validIds);
    const deleted = result.affectedRows || 0;

    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} pengguna.`);
  } catch (e) {
    await conn.rollback();
    console.error('Bulk delete error:', e.message);
    req.flash('error', `Gagal menghapus: ${e.message}`);
  } finally {
    conn.release();
  }

  res.redirect('/admin/users');
});

// ===== RESET PASSWORD MASSAL =====
router.post('/users/bulk-reset-password', async (req, res) => {
  const { password_type, custom_password, role_filter, class_filter, user_ids } = req.body;

  try {
    // Tentukan password baru
    let newPassword = '';
    if (password_type === 'custom') {
      newPassword = String(custom_password || '').trim();
      if (!newPassword || newPassword.length < 4) {
        req.flash('error', 'Password minimal 4 karakter.');
        return res.redirect('/admin/users');
      }
    } else if (password_type === 'username') {
      newPassword = null; // akan diset per user
    } else {
      req.flash('error', 'Tipe password tidak valid.');
      return res.redirect('/admin/users');
    }

    // Ambil daftar user yang akan direset
    let query = `SELECT id, username FROM users WHERE is_active=true`;
    const params = {};

    if (user_ids) {
      // Reset user terpilih saja
      const ids = (Array.isArray(user_ids) ? user_ids : [user_ids])
        .map(id => parseInt(id)).filter(id => !isNaN(id));
      if (!ids.length) { req.flash('error', 'Tidak ada user dipilih.'); return res.redirect('/admin/users'); }
      const ph = ids.map((_, i) => `$${i+1}`).join(',');
      const [users] = await pool.query(`SELECT id, username FROM users WHERE id IN (${ph})`, ids);
      
      let updated = 0;
      for (const u of users) {
        const pwd = password_type === 'username' ? u.username : newPassword;
        const hash = await bcrypt.hash(pwd, 10);
        await pool.query(`UPDATE users SET password_hash=:h, plain_password=:p WHERE id=:id`,
          { h: hash, p: pwd, id: u.id });
        updated++;
      }
      req.flash('success', `Password ${updated} pengguna berhasil direset.`);
      return res.redirect('/admin/users');
    }

    // Reset berdasarkan filter role/kelas
    if (role_filter) { query += ` AND role=:role`; params.role = role_filter; }
    if (class_filter) { query += ` AND class_id=:class_id`; params.class_id = class_filter; }

    const [users] = await pool.query(query, params);
    if (!users.length) { req.flash('error', 'Tidak ada pengguna yang sesuai filter.'); return res.redirect('/admin/users'); }

    let updated = 0;
    for (const u of users) {
      const pwd = password_type === 'username' ? u.username : newPassword;
      const hash = await bcrypt.hash(pwd, 10);
      await pool.query(`UPDATE users SET password_hash=:h, plain_password=:p WHERE id=:id`,
        { h: hash, p: pwd, id: u.id });
      updated++;
    }

    req.flash('success', `Password ${updated} pengguna berhasil direset ke "${password_type === 'username' ? 'username masing-masing' : newPassword}".`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal reset password massal: ' + e.message);
  }
  res.redirect('/admin/users');
});

// ===== IMPORT UPDATE PASSWORD DARI EXCEL =====
router.get('/users/import-password', (req, res) => {
  res.render('admin/users_import_password', { title: 'Import Update Password' });
});

router.post('/users/import-password/preview', uploadImport.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    req.flash('error', 'File belum dipilih.');
    return res.redirect('/admin/users/import-password');
  }
  try {
    const wb = XLSX.readFile(file.path, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    try { fs.unlinkSync(file.path); } catch(_) {}

    if (!rows.length) {
      req.flash('error', 'File kosong.');
      return res.redirect('/admin/users/import-password');
    }

    const preview = [], errors = [];
    for (const [idx, row] of rows.entries()) {
      const rowNo = idx + 2;
      const username = String(pickRowValue(row, ['username','user','nis']) || '').trim();
      const password = String(pickRowValue(row, ['password_baru','password','pwd','pass']) || '').trim();

      if (!username) { errors.push({ rowNo, reason: 'Username kosong' }); continue; }
      if (!password || password.length < 4) { errors.push({ rowNo, reason: `Password terlalu pendek (min 4 karakter): "${username}"` }); continue; }

      preview.push({ rowNo, username, password });
    }

    // Cek username yang ada di DB
    if (preview.length) {
      const usernames = preview.map(p => p.username);
      const ph = usernames.map((_,i) => `$${i+1}`).join(',');
      const [existing] = await pool.query(`SELECT username FROM users WHERE username IN (${ph})`, usernames);
      const existSet = new Set(existing.map(u => u.username));

      for (const p of preview) {
        p.exists = existSet.has(p.username);
        if (!p.exists) errors.push({ rowNo: p.rowNo, reason: `Username tidak ditemukan: "${p.username}"` });
      }
    }

    const validPreview = preview.filter(p => p.exists);
    const importId = require('nanoid').nanoid(12);
    req.session.passwordImportPreview = { importId, preview: validPreview, errors, createdAt: Date.now() };

    res.render('admin/users_import_password_preview', {
      title: 'Preview Import Password',
      importId, preview: validPreview, errors
    });
  } catch(e) {
    console.error(e);
    try { fs.unlinkSync(file.path); } catch(_) {}
    req.flash('error', 'Gagal membaca file: ' + e.message);
    res.redirect('/admin/users/import-password');
  }
});

router.post('/users/import-password/commit', async (req, res) => {
  const { importId } = req.body;
  const sess = req.session.passwordImportPreview;
  if (!sess || sess.importId !== importId) {
    req.flash('error', 'Sesi preview tidak valid. Upload ulang.');
    return res.redirect('/admin/users/import-password');
  }
  const items = sess.preview || [];
  if (!items.length) {
    req.flash('error', 'Tidak ada data valid.');
    return res.redirect('/admin/users/import-password');
  }

  let updated = 0, failed = 0;
  for (const it of items) {
    try {
      const hash = await bcrypt.hash(it.password, 10);
      await pool.query(
        `UPDATE users SET password_hash=:h, plain_password=:p WHERE username=:u`,
        { h: hash, p: it.password, u: it.username }
      );
      updated++;
    } catch(e) {
      console.error('Update password error:', e.message);
      failed++;
    }
  }

  req.session.passwordImportPreview = null;
  req.flash('success', `Password berhasil diupdate: ${updated} pengguna.${failed ? ` Gagal: ${failed}.` : ''}`);
  res.redirect('/admin/users');
});

// Bulk move class users
router.post('/users/bulk-move-class', async (req, res) => {
  let user_ids = req.body.user_ids;
  const class_id = req.body.class_id;
  
  // Parse JSON string if needed
  if (typeof user_ids === 'string') {
    try {
      user_ids = JSON.parse(user_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/users');
    }
  }
  
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    req.flash('error', 'Tidak ada pengguna yang dipilih untuk dipindah kelas.');
    return res.redirect('/admin/users');
  }

  // Convert to integers and filter valid IDs
  const validIds = user_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada ID pengguna yang valid.');
    return res.redirect('/admin/users');
  }

  // Validate class_id if provided
  let targetClassId = null;
  let targetClassName = 'Tanpa Kelas';
  
  if (class_id && class_id.trim() !== '') {
    targetClassId = parseInt(class_id);
    if (isNaN(targetClassId)) {
      req.flash('error', 'ID kelas tidak valid.');
      return res.redirect('/admin/users');
    }
    
    // Get class name for confirmation message
    try {
      const [classRows] = await pool.query(`SELECT name FROM classes WHERE id = :id LIMIT 1;`, { id: targetClassId });
      if (classRows.length === 0) {
        req.flash('error', 'Kelas tujuan tidak ditemukan.');
        return res.redirect('/admin/users');
      }
      targetClassName = classRows[0].name;
    } catch (e) {
      console.error(e);
      req.flash('error', 'Gagal memvalidasi kelas tujuan.');
      return res.redirect('/admin/users');
    }
  }

  const conn = await pool.getConnection();
  let updated = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Update users' class_id
    const [result] = await conn.query(
      `UPDATE users SET class_id = ? WHERE id IN (${placeholders});`, 
      [targetClassId, ...validIds]
    );
    updated = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil memindahkan ${updated} pengguna ke kelas "${targetClassName}".`);
  } catch (e) {
    await conn.rollback();
    console.error('Bulk move class error:', e);
    req.flash('error', `Gagal memindahkan pengguna ke kelas. Error: ${e.message}`);
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/users');
});

// ===== EXAMS (UJIAN) =====
router.get('/exams', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const subjectFilter = req.query.subject || '';
  const teacherFilter = req.query.teacher || '';
  const classFilter = req.query.class || '';
  const statusFilter = req.query.status || '';

  // Get filter options
  const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
  const [teachers] = await pool.query(`SELECT id, username, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);
  const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);

  // Build WHERE clause
  let whereConditions = [];
  let queryParams = {};

  if (search) {
    whereConditions.push('(e.title LIKE :search OR e.description LIKE :search)');
    queryParams.search = `%${search}%`;
  }

  if (subjectFilter) {
    whereConditions.push('e.subject_id = :subjectId');
    queryParams.subjectId = subjectFilter;
  }

  if (teacherFilter) {
    whereConditions.push('e.teacher_id = :teacherId');
    queryParams.teacherId = teacherFilter;
  }

  if (classFilter) {
    // Cek di exam_classes (sistem baru) ATAU class_id (sistem lama)
    whereConditions.push('(EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=:classId) OR e.class_id=:classId)');
    queryParams.classId = classFilter;
  }

  if (statusFilter === 'published') {
    whereConditions.push('e.is_published = true');
  } else if (statusFilter === 'draft') {
    whereConditions.push('e.is_published = false');
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Get total count
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM exams e ${whereClause}`,
    queryParams
  );

  // Get paginated exams with related data
  const [exams] = await pool.query(
    `SELECT 
      e.id, e.title, e.description, e.start_at, e.end_at, 
      e.duration_minutes, e.is_published, e.created_at, e.class_id,
      s.name AS subject_name, s.code AS subject_code,
      u.full_name AS teacher_name,
      -- Ambil nama kelas dari exam_classes (sistem baru) atau class_id (sistem lama)
      COALESCE(
        (SELECT STRING_AGG(c2.name, ', ' ORDER BY c2.name)
         FROM exam_classes ec2
         JOIN classes c2 ON c2.id = ec2.class_id
         WHERE ec2.exam_id = e.id),
        c.name
      ) AS class_name,
      (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) AS question_count,
      (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) AS attempt_count,
      (SELECT COUNT(DISTINCT student_id) FROM attempts WHERE exam_id = e.id) AS participant_count,
      (SELECT COUNT(DISTINCT u2.id) FROM users u2
       INNER JOIN exam_classes ec3 ON ec3.class_id = u2.class_id AND ec3.exam_id = e.id
       WHERE u2.role='STUDENT' AND u2.is_active=true
      ) AS total_students
     FROM exams e
     LEFT JOIN subjects s ON s.id = e.subject_id
     LEFT JOIN users u ON u.id = e.teacher_id
     LEFT JOIN classes c ON c.id = e.class_id
     ${whereClause}
     ORDER BY e.created_at DESC
     LIMIT :limit OFFSET :offset;`,
    { ...queryParams, limit, offset }
  );
  
  // Calculate participation percentage for each exam
  exams.forEach(exam => {
    exam.participation_percentage = exam.total_students > 0 ? Math.round((exam.participant_count / exam.total_students) * 100) : 0;
  });

  const totalPages = Math.ceil(total / limit);

  res.render('admin/exams', {
    title: 'Kelola Ujian',
    exams,
    subjects,
    teachers,
    classes,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    filters: {
      search,
      subject: subjectFilter,
      teacher: teacherFilter,
      class: classFilter,
      status: statusFilter
    }
  });
});

// Get exam detail JSON for modal
router.get('/exams/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        e.id, e.title, e.description, e.subject_id, e.teacher_id, e.class_id,
        e.start_at, e.end_at, e.duration_minutes, e.pass_score, 
        e.shuffle_questions, e.shuffle_options, e.max_attempts, 
        e.access_code, e.is_published,
        s.name AS subject_name,
        u.full_name AS teacher_name,
        c.name AS class_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) AS question_count
       FROM exams e
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = e.teacher_id
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.id = :id
       LIMIT 1;`,
      { id: req.params.id }
    );
    const exam = rows && rows[0];
    if (!exam) return res.status(404).json({ ok: false, message: 'Ujian tidak ditemukan.' });
    return res.json({ ok: true, exam });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data ujian.' });
  }
});

// Toggle publish status
router.post('/exams/:id/toggle-publish', async (req, res) => {
  try {
    await pool.query(
      `UPDATE exams SET is_published = NOT is_published WHERE id=:id;`,
      { id: req.params.id }
    );
    req.flash('success', 'Status publikasi ujian diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui status publikasi.');
  }
  res.redirect('/admin/exams');
});

// Delete exam
router.delete('/exams/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM exams WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Ujian berhasil dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus ujian.');
  }
  res.redirect('/admin/exams');
});

// ===== ADMIN EXAM MANAGEMENT (CREATE, EDIT, QUESTIONS) =====

// GET Create New Exam
router.get('/exams/new', async (req, res) => {
  try {
    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role = 'TEACHER' AND is_active = true ORDER BY full_name ASC;`);
    const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);
    
    res.render('admin/exam_new', { 
      title: 'Buat Ujian Baru', 
      subjects, 
      teachers, 
      classes 
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal memuat halaman buat ujian.');
    res.redirect('/admin/exams');
  }
});

// POST Create New Exam
router.post('/exams', async (req, res) => {
  const {
    subject_id, teacher_id, title, description, class_ids,
    start_at, end_at, duration_minutes, pass_score, max_attempts,
    shuffle_questions, shuffle_options, access_code,
    show_score_to_student, show_review_to_student, max_questions
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO exams
        (subject_id, teacher_id, title, description, class_id, start_at, end_at, duration_minutes, pass_score, max_attempts, shuffle_questions, shuffle_options, access_code, show_score_to_student, show_review_to_student, is_published, max_questions)
       VALUES
        (:subject_id,:teacher_id,:title,:description,NULL,:start_at,:end_at,:duration_minutes,:pass_score,:max_attempts,:shuffle_questions,:shuffle_options,:access_code,:show_score_to_student,:show_review_to_student,:is_published,:max_questions);`,
      {
        subject_id, teacher_id, title,
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
        is_published: false,
        max_questions: max_questions ? Number(max_questions) : null
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

    req.flash('success', 'Ujian berhasil dibuat.');
    res.redirect(`/admin/exams/${examId}`);
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal membuat ujian.');
    res.redirect('/admin/exams/new');
  }
});

// GET Edit Exam
router.get('/exams/:id/edit', async (req, res) => {
  const examId = req.params.id;

  try {
    // Get exam data
    const [[exam]] = await pool.query(
      `SELECT * FROM exams WHERE id=:id LIMIT 1;`,
      { id: examId }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/admin/exams');
    }

    // Get exam classes
    const [examClasses] = await pool.query(
      `SELECT class_id FROM exam_classes WHERE exam_id = :exam_id`,
      { exam_id: examId }
    );
    exam.selected_classes = examClasses.map(ec => ec.class_id);

    const [subjects] = await pool.query(`SELECT * FROM subjects ORDER BY name ASC;`);
    const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role = 'TEACHER' AND is_active = true ORDER BY full_name ASC;`);
    const [classes] = await pool.query(`SELECT * FROM classes ORDER BY name ASC;`);

    res.render('admin/exam_edit', { 
      title: `Edit Ujian: ${exam.title}`, 
      exam, 
      subjects, 
      teachers, 
      classes 
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal memuat halaman edit ujian.');
    res.redirect('/admin/exams');
  }
});

// PUT Update Exam
router.put('/exams/:id', async (req, res) => {
  const examId = req.params.id;
  const {
    subject_id, teacher_id, title, description, class_ids,
    start_at, end_at, duration_minutes, pass_score, max_attempts,
    shuffle_questions, shuffle_options, access_code,
    show_score_to_student, show_review_to_student, max_questions
  } = req.body;

  try {
    await pool.query(
      `UPDATE exams SET
        subject_id=:subject_id, teacher_id=:teacher_id, title=:title, description=:description,
        start_at=:start_at, end_at=:end_at, duration_minutes=:duration_minutes,
        pass_score=:pass_score, max_attempts=:max_attempts,
        shuffle_questions=:shuffle_questions, shuffle_options=:shuffle_options,
        access_code=:access_code, show_score_to_student=:show_score_to_student,
        show_review_to_student=:show_review_to_student, max_questions=:max_questions
       WHERE id=:id;`,
      {
        id: examId, subject_id, teacher_id, title,
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
        max_questions: max_questions ? Number(max_questions) : null
      }
    );

    // Update exam_classes
    await pool.query(`DELETE FROM exam_classes WHERE exam_id=:exam_id;`, { exam_id: examId });

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
    res.redirect(`/admin/exams/${examId}`);
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal memperbarui ujian.');
    res.redirect(`/admin/exams/${examId}/edit`);
  }
});

// GET Exam Detail
router.get('/exams/:id', async (req, res) => {
  const examId = req.params.id;

  try {
    const [[exam]] = await pool.query(
      `SELECT e.*, s.name AS subject_name, u.full_name AS teacher_name
       FROM exams e
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = e.teacher_id
       WHERE e.id = :id
       LIMIT 1;`,
      { id: examId }
    );

    if (!exam) {
      req.flash('error', 'Ujian tidak ditemukan.');
      return res.redirect('/admin/exams');
    }

    // Get questions
    const [questions] = await pool.query(
      `SELECT q.*, 
              (SELECT COUNT(*) FROM options WHERE question_id = q.id) as option_count
       FROM questions q 
       WHERE q.exam_id = :exam_id 
       ORDER BY q.id ASC`,
      { exam_id: examId }
    );

    // Get exam classes
    const [examClasses] = await pool.query(
      `SELECT c.name 
       FROM exam_classes ec
       JOIN classes c ON c.id = ec.class_id
       WHERE ec.exam_id = :exam_id
       ORDER BY c.name`,
      { exam_id: examId }
    );
    exam.class_names = examClasses.map(ec => ec.name).join(', ') || 'Semua Kelas';

    // Get participation statistics (same logic as teacher)
    const [examClassesCount] = await pool.query(
      `SELECT COUNT(*) as count FROM exam_classes WHERE exam_id = :exam_id`,
      { exam_id: examId }
    );
    
    let totalStudentsQuery;
    let queryParams = { exam_id: examId };
    
    if (examClassesCount[0].count > 0) {
      totalStudentsQuery = `
        SELECT COUNT(DISTINCT u.id) as total 
        FROM users u
        INNER JOIN exam_classes ec ON ec.class_id = u.class_id
        WHERE u.role = 'STUDENT' 
        AND u.is_active = true 
        AND ec.exam_id = :exam_id
      `;
    } else if (exam.class_id) {
      totalStudentsQuery = `
        SELECT COUNT(*) as total 
        FROM users 
        WHERE role = 'STUDENT' 
        AND is_active = true 
        AND class_id = :class_id
      `;
      queryParams.class_id = exam.class_id;
    } else {
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
      { exam_id: examId }
    );
    
    exam.completed_count = completedResult.completed || 0;
    exam.total_students = totalStudentsResult.total || 0;
    exam.not_completed_count = exam.total_students - exam.completed_count;
    exam.completed_percentage = exam.total_students > 0 ? Math.round((exam.completed_count / exam.total_students) * 100) : 0;
    exam.not_completed_percentage = 100 - exam.completed_percentage;

    res.render('admin/exam_detail', { 
      title: `Ujian: ${exam.title}`, 
      exam, 
      questions 
    });
  } catch (error) {
    console.error(error);
    req.flash('error', 'Gagal memuat detail ujian.');
    res.redirect('/admin/exams');
  }
});

// Route admin untuk tambah soal, import, upload gambar - redirect ke teacher routes
router.get('/exams/:id/questions/new', (req, res) => {
  res.redirect(`/teacher/exams/${req.params.id}`);
});
router.get('/exams/:id/import', (req, res) => {
  res.redirect(`/teacher/exams/${req.params.id}/import`);
});
router.get('/exams/:id/questions/upload-images', (req, res) => {
  res.redirect(`/teacher/exams/${req.params.id}/questions/upload-images`);
});
router.get('/questions/:id/edit', (req, res) => {
  res.redirect(`/teacher/questions/${req.params.id}/edit`);
});

// Bulk delete exams
router.post('/exams/bulk-delete', async (req, res) => {
  let exam_ids = req.body.exam_ids;
  
  if (typeof exam_ids === 'string') {
    try {
      exam_ids = JSON.parse(exam_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/exams');
    }
  }
  
  if (!exam_ids || !Array.isArray(exam_ids) || exam_ids.length === 0) {
    req.flash('error', 'Tidak ada ujian yang dipilih untuk dihapus.');
    return res.redirect('/admin/exams');
  }

  const validIds = exam_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada ID ujian yang valid.');
    return res.redirect('/admin/exams');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data
    await conn.query(`DELETE FROM attempts WHERE exam_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM questions WHERE exam_id IN (${placeholders});`, validIds);
    await conn.query(`DELETE FROM exam_classes WHERE exam_id IN (${placeholders});`, validIds);
    
    // Delete exams
    const [result] = await conn.query(`DELETE FROM exams WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} ujian dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus ujian. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/exams');
});

// ===== MATERIALS =====
router.get('/materials', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  const search = (req.query.search || '').trim();
  const subjectFilter = (req.query.subject || '').trim();
  const teacherFilter = (req.query.teacher || '').trim();
  const classFilter = (req.query.class || '').trim();
  const statusFilter = (req.query.status || '').trim();

  // Get filter options
  const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
  const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);

  // Build WHERE clause
  let whereConditions = [];
  let queryParams = {};
  
  if (search) {
    whereConditions.push('(m.title LIKE :search OR m.description LIKE :search)');
    queryParams.search = `%${search}%`;
  }
  
  if (subjectFilter) {
    whereConditions.push('m.subject_id = :subjectId');
    queryParams.subjectId = parseInt(subjectFilter);
  }
  
  if (teacherFilter) {
    whereConditions.push('m.teacher_id = :teacherId');
    queryParams.teacherId = parseInt(teacherFilter);
  }
  
  if (classFilter) {
    whereConditions.push('m.class_id = :classId');
    queryParams.classId = parseInt(classFilter);
  }
  
  if (statusFilter === 'published') {
    whereConditions.push('m.is_published = true');
  } else if (statusFilter === 'draft') {
    whereConditions.push('m.is_published = false');
  }
  
  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
  
  // Get total count
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM materials m ${whereClause}`,
    queryParams
  );
  
  // Get paginated materials
  const [materials] = await pool.query(
    `SELECT 
      m.id, m.title, m.description, m.embed_type, m.embed_url, m.is_published, m.created_at,
      s.code AS subject_code, s.name AS subject_name,
      u.full_name AS teacher_name,
      c.name AS class_name,
      m.class_id,
      (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id) AS read_count,
      (SELECT COUNT(*) FROM users WHERE role='STUDENT' AND (m.class_id IS NULL OR class_id = m.class_id)) AS total_students
     FROM materials m
     LEFT JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN users u ON u.id = m.teacher_id
     LEFT JOIN classes c ON c.id = m.class_id
     ${whereClause}
     ORDER BY m.created_at DESC
     LIMIT :limit OFFSET :offset;`,
    { ...queryParams, limit, offset }
  );
  
  // Calculate read percentage for each material
  materials.forEach(m => {
    m.read_percentage = m.total_students > 0 ? Math.round((m.read_count / m.total_students) * 100) : 0;
  });
  
  const totalPages = Math.ceil(total / limit);

  res.render('admin/materials', {
    title: 'Kelola Materi',
    materials,
    subjects,
    teachers,
    classes,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    filters: {
      search,
      subject: subjectFilter,
      teacher: teacherFilter,
      class: classFilter,
      status: statusFilter
    }
  });
});

// Get material detail JSON for modal
router.get('/materials/:id/json', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        m.id, m.title, m.description, m.content_html, m.embed_type, m.embed_url,
        m.subject_id, m.teacher_id, m.class_id, m.is_published,
        m.auto_complete_minutes, m.created_at,
        s.name AS subject_name,
        u.full_name AS teacher_name,
        c.name AS class_name,
        (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id) AS read_count,
        (SELECT COUNT(*) FROM material_reads WHERE material_id = m.id AND completed_at IS NOT NULL) AS completed_count
       FROM materials m
       LEFT JOIN subjects s ON s.id = m.subject_id
       LEFT JOIN users u ON u.id = m.teacher_id
       LEFT JOIN classes c ON c.id = m.class_id
       WHERE m.id = :id
       LIMIT 1;`,
      { id: req.params.id }
    );
    const material = rows && rows[0];
    if (!material) return res.status(404).json({ ok: false, message: 'Materi tidak ditemukan.' });
    return res.json({ ok: true, material });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: 'Gagal memuat data materi.' });
  }
});

// Toggle publish status
router.post('/materials/:id/toggle-publish', async (req, res) => {
  try {
    await pool.query(
      `UPDATE materials SET is_published = NOT is_published WHERE id=:id;`,
      { id: req.params.id }
    );
    req.flash('success', 'Status publikasi materi diperbarui.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memperbarui status publikasi.');
  }
  res.redirect('/admin/materials');
});

// Delete material
router.delete('/materials/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM materials WHERE id=:id;`, { id: req.params.id });
    req.flash('success', 'Materi berhasil dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus materi.');
  }
  res.redirect('/admin/materials');
});

// Bulk delete materials
router.post('/materials/bulk-delete', async (req, res) => {
  let material_ids = req.body.material_ids;
  
  if (typeof material_ids === 'string') {
    try {
      material_ids = JSON.parse(material_ids);
    } catch (e) {
      req.flash('error', 'Format data tidak valid.');
      return res.redirect('/admin/materials');
    }
  }
  
  if (!material_ids || !Array.isArray(material_ids) || material_ids.length === 0) {
    req.flash('error', 'Tidak ada materi yang dipilih untuk dihapus.');
    return res.redirect('/admin/materials');
  }

  const validIds = material_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada ID materi yang valid.');
    return res.redirect('/admin/materials');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data
    await conn.query(`DELETE FROM material_reads WHERE material_id IN (${placeholders});`, validIds);
    
    // Try to delete from material_classes if table exists
    try {
      await conn.query(`DELETE FROM material_classes WHERE material_id IN (${placeholders});`, validIds);
    } catch (err) {
      // Table might not exist, skip silently
      console.log('material_classes table not found, skipping...');
    }
    
    // Delete materials
    const [result] = await conn.query(`DELETE FROM materials WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} materi dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus materi. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/materials');
});

// ===== VIOLATIONS - SISWA TERKUNCI =====
router.get('/violations/locked', async (req, res) => {
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
       GROUP BY a.id, u.full_name, u.username, c.name, e.title, e.id
       ORDER BY a.locked_at DESC;`
    );
    res.render('teacher/violations_locked', { title: 'Siswa Terkunci', locked });
  } catch(e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data.');
    res.redirect('/admin');
  }
});

router.post('/violations/unlock/:attemptId', async (req, res) => {
  const { attemptId } = req.params;
  try {
    const [[attempt]] = await pool.query(
      `SELECT id FROM attempts WHERE id=:aid AND is_locked=true LIMIT 1;`,
      { aid: attemptId }
    );
    if (!attempt) return res.json({ ok: false, message: 'Attempt tidak ditemukan.' });
    await pool.query(
      `UPDATE attempts SET is_locked=false, unlock_token=null, unlock_count=unlock_count+1 WHERE id=:aid;`,
      { aid: attemptId }
    );
    return res.json({ ok: true });
  } catch(e) {
    return res.json({ ok: false, message: e.message });
  }
});

// Setujui massal - buka kunci banyak siswa sekaligus (admin)
router.post('/violations/unlock-bulk', async (req, res) => {
  let ids = req.body.attempt_ids || [];
  if (!Array.isArray(ids)) ids = [ids];
  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return res.json({ ok: false, message: 'Tidak ada siswa dipilih.' });
  try {
    const placeholders = ids.map((_, i) => `:id${i}`).join(',');
    const paramObj = {};
    ids.forEach((id, i) => { paramObj[`id${i}`] = id; });
    await pool.query(
      `UPDATE attempts SET is_locked=false, unlock_token=null, unlock_count=unlock_count+1
       WHERE id IN (${placeholders}) AND is_locked=true;`,
      paramObj
    );
    return res.json({ ok: true, count: ids.length });
  } catch(e) {
    return res.json({ ok: false, message: e.message });
  }
});

// ===== GRADES (NILAI) =====
router.get('/grades', async (req, res) => {
  const exam_id = (req.query.exam_id || '').trim();
  const class_id = (req.query.class_id || '').trim();
  const teacher_id = (req.query.teacher_id || '').trim();
  const status = (req.query.status || '').trim();
  const result = (req.query.result || '').trim();
  const q = (req.query.q || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  // Get filter options
  const [exams] = await pool.query(`SELECT id, title FROM exams ORDER BY title ASC;`);
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);
  const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);

  const where = ['1=1'];
  const params = {};

  if (exam_id) {
    where.push('e.id=:exam_id');
    params.exam_id = exam_id;
  }
  if (class_id) {
    where.push('u.class_id=:class_id');
    params.class_id = class_id;
  }
  if (teacher_id) {
    where.push('e.teacher_id=:teacher_id');
    params.teacher_id = teacher_id;
  }
  if (status) {
    where.push('a.status=:status');
    params.status = status;
  }
  if (result && result === 'LULUS') {
    where.push("a.status='SUBMITTED' AND a.score >= e.pass_score");
  }
  if (result && result === 'TIDAK_LULUS') {
    where.push("a.status='SUBMITTED' AND a.score < e.pass_score");
  }
  if (q) {
    where.push('(u.full_name LIKE :q OR u.username LIKE :q OR e.title LIKE :q)');
    params.q = '%' + q + '%';
  }

  // Count total
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     LEFT JOIN users t ON t.id=e.teacher_id
     WHERE ${where.join(' AND ')};`,
    params
  );

  // Get paginated data
  const [rows] = await pool.query(
    `SELECT a.id, a.score, a.status, a.started_at, a.finished_at,
            e.id AS exam_id, e.title AS exam_title, e.pass_score,
            u.full_name AS student_name, u.username,
            c.name AS class_name,
            t.full_name AS teacher_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     LEFT JOIN classes c ON c.id=u.class_id
     LEFT JOIN users t ON t.id=e.teacher_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.id DESC
     LIMIT :limit OFFSET :offset;`,
    { ...params, limit, offset }
  );

  const rows2 = rows.map((r) => ({
    ...r,
    is_pass: r.status === 'SUBMITTED' ? Number(r.score) >= Number(r.pass_score) : 0
  }));

  res.render('admin/grades', {
    title: 'Kelola Nilai',
    rows: rows2,
    exams,
    classes,
    teachers,
    filters: { exam_id, class_id, teacher_id, status, result, q },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// Detail attempt untuk admin
router.get('/attempts/:id/detail', async (req, res) => {
  const attemptId = req.params.id;
  try {
    const [[attempt]] = await pool.query(
      `SELECT a.*, e.title AS exam_title, e.pass_score, e.id AS exam_id,
              u.full_name AS student_name, u.username,
              s.name AS subject_name, t.full_name AS teacher_name,
              c.name AS class_name
       FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       JOIN users u ON u.id=a.student_id
       JOIN subjects s ON s.id=e.subject_id
       JOIN users t ON t.id=e.teacher_id
       LEFT JOIN classes c ON c.id=u.class_id
       WHERE a.id=:id LIMIT 1;`,
      { id: attemptId }
    );
    if (!attempt) { req.flash('error','Attempt tidak ditemukan.'); return res.redirect('/admin/grades'); }

    // Ambil jawaban + opsi
    const [ans] = await pool.query(
      `SELECT aa.question_id, aa.option_id AS chosen_option_id, aa.is_correct,
              q.question_text, q.question_image, q.points
       FROM attempt_answers aa
       JOIN questions q ON q.id=aa.question_id
       WHERE aa.attempt_id=:aid ORDER BY aa.id ASC;`,
      { aid: attemptId }
    );

    const qids = ans.map(a => a.question_id);
    let optionsMap = {};
    if (qids.length) {
      const ph = qids.map((_,i) => `$${i+1}`).join(',');
      const [opts] = await pool.query(
        `SELECT id, question_id, option_label, option_text, is_correct FROM options WHERE question_id IN (${ph}) ORDER BY question_id ASC, option_label ASC;`,
        qids
      );
      for (const o of opts) {
        if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
        optionsMap[o.question_id].push(o);
      }
    }

    const answers = ans.map(a => {
      const opts = optionsMap[a.question_id] || [];
      const correct = opts.find(o => o.is_correct === true || o.is_correct === 1) || null;
      return { ...a, options: opts, correct_option_id: correct ? correct.id : null };
    });

    // Log pelanggaran anti-cheat
    let violations = [];
    try {
      const [vrows] = await pool.query(
        `SELECT violation_type, details, created_at FROM attempt_violations WHERE attempt_id=:aid ORDER BY id ASC LIMIT 300;`,
        { aid: attemptId }
      );
      violations = vrows || [];
    } catch(_) {}

    res.render('admin/attempt_detail', {
      title: 'Detail Nilai',
      attempt,
      exam: { id: attempt.exam_id, title: attempt.exam_title, pass_score: attempt.pass_score },
      student: { full_name: attempt.student_name, username: attempt.username, class_name: attempt.class_name },
      answers,
      violations
    });
  } catch(e) {
    console.error(e);
    req.flash('error','Gagal memuat detail: ' + e.message);
    res.redirect('/admin/grades');
  }
});

// Bulk reset nilai untuk admin
router.post('/attempts/bulk-reset', async (req, res) => {
  // Debug logging
  console.log('=== ADMIN BULK RESET DEBUG ===');
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
    return res.redirect('/admin/grades');
  }

  // Convert to integers and filter valid IDs
  const validIds = attempt_ids.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
  
  console.log('validIds:', validIds);
  
  if (validIds.length === 0) {
    console.log('No valid IDs found');
    req.flash('error', 'Tidak ada ID attempt yang valid.');
    return res.redirect('/admin/grades');
  }

  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    // Get attempt details for logging
    const placeholders = validIds.map(() => '?').join(',');
    const [attempts] = await conn.query(
      `SELECT a.id, e.title AS exam_title, u.full_name AS student_name
       FROM attempts a
       JOIN exams e ON e.id=a.exam_id
       JOIN users u ON u.id=a.student_id
       WHERE a.id IN (${placeholders});`,
      validIds
    );
    
    console.log('Found attempts:', attempts.length, 'Expected:', validIds.length);
    
    if (attempts.length === 0) {
      await conn.rollback();
      req.flash('error', 'Tidak ada attempt yang ditemukan.');
      return res.redirect('/admin/grades');
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
    console.error('Admin bulk reset error:', e);
    req.flash('error', `Gagal reset nilai. Error: ${e.message}`);
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/grades');
});

// Reset individual attempt untuk admin
router.post('/attempts/:id/reset', async (req, res) => {
  const attemptId = req.params.id;

  // Get attempt details
  const [[attempt]] = await pool.query(
    `SELECT a.id, a.exam_id, e.title AS exam_title, u.full_name AS student_name
     FROM attempts a
     JOIN exams e ON e.id=a.exam_id
     JOIN users u ON u.id=a.student_id
     WHERE a.id=:aid
     LIMIT 1;`,
    { aid: attemptId }
  );

  if (!attempt) {
    req.flash('error', 'Hasil ujian tidak ditemukan.');
    return res.redirect('/admin/grades');
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

  return res.redirect('/admin/grades');
});


// ===== ASSIGNMENTS MANAGEMENT =====

// ===== PEMANTAUAN TUGAS ADMIN =====
router.get('/assignments/monitoring', async (req, res) => {
  const assignment_id = req.query.assignment_id || '';
  const class_id = req.query.class_id || '';
  const teacher_id = req.query.teacher_id || '';

  const [allAssignments] = await pool.query(
    `SELECT a.id, a.title, u.full_name AS teacher_name
     FROM assignments a JOIN users u ON u.id=a.teacher_id
     ORDER BY a.created_at DESC;`
  );
  const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name ASC;`);
  const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);

  let submissions = [];
  if (assignment_id) {
    [submissions] = await pool.query(
      `SELECT u.id AS student_id, u.full_name AS student_name, u.username,
              c.name AS class_name, t.full_name AS teacher_name,
              sub.id AS submission_id, sub.file_path, sub.file_name,
              sub.link_url, sub.notes, sub.submitted_at, sub.score, sub.feedback
       FROM users u
       INNER JOIN assignment_classes ac ON ac.class_id=u.class_id AND ac.assignment_id=:aid
       LEFT JOIN classes c ON c.id=u.class_id
       LEFT JOIN assignments a ON a.id=:aid
       LEFT JOIN users t ON t.id=a.teacher_id
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

  res.render('admin/assignment_monitoring', {
    title: 'Pemantauan Tugas',
    allAssignments, classes, teachers, submissions,
    filters: { assignment_id, class_id, teacher_id },
    stats: { total, submitted, notSubmitted: total - submitted, graded }
  });
});

// GET Admin Assignments List
router.get('/assignments', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const subject_id = req.query.subject_id || '';
    const status = req.query.status || '';

    // Get subjects for filter
    const [subjects] = await pool.query(`SELECT id, name FROM subjects ORDER BY name ASC;`);

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = {};

    if (search) {
      whereConditions.push(`(a.title LIKE :search OR u.full_name LIKE :search)`);
      queryParams.search = `%${search}%`;
    }

    if (subject_id) {
      whereConditions.push(`a.subject_id = :subject_id`);
      queryParams.subject_id = subject_id;
    }

    if (status === 'published') {
      whereConditions.push(`a.is_published = true`);
    } else if (status === 'draft') {
      whereConditions.push(`a.is_published = false`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get assignments
    const [assignments] = await pool.query(
      `SELECT 
        a.*,
        u.full_name as teacher_name,
        s.name as subject_name,
        c.name as class_name,
        (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) as submission_count,
        (SELECT COUNT(*) FROM users WHERE role='STUDENT' AND (a.class_id IS NULL OR class_id = a.class_id)) AS total_students
      FROM assignments a
      JOIN users u ON a.teacher_id = u.id
      JOIN subjects s ON a.subject_id = s.id
      LEFT JOIN classes c ON a.class_id = c.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC;`,
      queryParams
    );
    
    // Calculate submission percentage for each assignment
    assignments.forEach(assignment => {
      assignment.submission_percentage = assignment.total_students > 0 ? Math.round((assignment.submission_count / assignment.total_students) * 100) : 0;
    });

    // Get stats
    const [[statsRow]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_published = true THEN 1 ELSE 0 END) as published,
        SUM(CASE WHEN is_published = false THEN 1 ELSE 0 END) as draft,
        (SELECT COUNT(*) FROM assignment_submissions) as submissions
      FROM assignments;
    `);

    const stats = {
      total: statsRow.total || 0,
      published: statsRow.published || 0,
      draft: statsRow.draft || 0,
      submissions: statsRow.submissions || 0
    };

    res.render('admin/assignments', {
      title: 'Manajemen Tugas',
      assignments,
      subjects,
      stats,
      search,
      subject_id,
      status
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data tugas.');
    res.redirect('/admin');
  }
});

// GET Admin Assignment Detail
router.get('/assignments/:id', async (req, res) => {
  try {
    const assignmentId = req.params.id;
    
    // Get assignment detail
    const [[assignment]] = await pool.query(
      `SELECT 
        a.*,
        u.full_name as teacher_name,
        s.name as subject_name,
        s.code as subject_code,
        c.name as class_name
      FROM assignments a
      JOIN users u ON a.teacher_id = u.id
      JOIN subjects s ON a.subject_id = s.id
      LEFT JOIN classes c ON a.class_id = c.id
      WHERE a.id = :id
      LIMIT 1;`,
      { id: assignmentId }
    );
    
    if (!assignment) {
      req.flash('error', 'Tugas tidak ditemukan.');
      return res.redirect('/admin/assignments');
    }
    
    // Get submissions
    const [submissions] = await pool.query(
      `SELECT 
        asub.*,
        u.full_name as student_name,
        u.username as student_username,
        c.name as class_name
      FROM assignment_submissions asub
      JOIN users u ON asub.student_id = u.id
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE asub.assignment_id = :id
      ORDER BY asub.submitted_at DESC;`,
      { id: assignmentId }
    );
    
    // Calculate stats
    const stats = {
      total_submissions: submissions.length,
      graded: submissions.filter(s => s.score !== null).length,
      pending: submissions.filter(s => s.score === null).length,
      avg_score: submissions.length > 0 
        ? submissions.filter(s => s.score !== null).reduce((sum, s) => sum + (s.score || 0), 0) / submissions.filter(s => s.score !== null).length 
        : 0
    };
    
    res.render('admin/assignment_detail', {
      title: 'Detail Tugas',
      assignment,
      submissions,
      stats
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat detail tugas.');
    res.redirect('/admin/assignments');
  }
});

// POST Delete Assignment
router.post('/assignments/:id/delete', async (req, res) => {
  const assignmentId = req.params.id;
  
  try {
    await pool.query(`DELETE FROM assignments WHERE id = :id;`, { id: assignmentId });
    req.flash('success', 'Tugas berhasil dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus tugas.');
  }
  
  res.redirect('/admin/assignments');
});

// POST Bulk Delete Assignments
router.post('/assignments/bulk-delete', async (req, res) => {
  // Handle both 'ids[]' and 'ids' parameter names
  let ids = req.body['ids[]'] || req.body.ids || [];
  
  // Ensure it's always an array
  const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  
  // Filter out empty values and convert to numbers
  const validIds = idsArray.filter(id => id && id.trim() !== '').map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada tugas yang dipilih.');
    return res.redirect('/admin/assignments');
  }
  
  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete related data first
    await conn.query(`DELETE FROM assignment_submissions WHERE assignment_id IN (${placeholders});`, validIds);
    
    // Delete assignments
    const [result] = await conn.query(`DELETE FROM assignments WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} tugas dan data terkait.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus tugas. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/assignments');
});

// ===== QUESTION BANK MANAGEMENT =====

// GET Admin Question Bank Export
router.get('/question-bank/export', async (req, res) => {
  const XLSX = require('xlsx');
  const path = require('path');
  try {
    const [questions] = await pool.query(`
      SELECT qb.id, qb.question_text, qb.question_image, qb.points, qb.difficulty, qb.tags, qb.chapter,
             s.name AS subject_name, s.code AS subject_code,
             u.full_name AS teacher_name
      FROM question_bank qb
      JOIN subjects s ON s.id = qb.subject_id
      JOIN users u ON u.id = qb.teacher_id
      ORDER BY u.full_name ASC, s.name ASC, qb.id ASC;`
    );
    if (!questions.length) {
      req.flash('error', 'Tidak ada soal untuk diekspor.');
      return res.redirect('/admin/question-bank');
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
    const rows = questions.map((q) => {
      const opts = optMap[q.id] || {};
      const correct = Object.entries(opts).find(([, v]) => v.correct)?.[0] || '';
      const qText = String(q.question_text || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      return {
        'question_text': qText,
        'image': getImageRef(q.question_image),
        'points': q.points || 1,
        'correct': correct,
        'A': opts['A']?.text || '', 'B': opts['B']?.text || '',
        'C': opts['C']?.text || '', 'D': opts['D']?.text || '', 'E': opts['E']?.text || '',
        'image_a': getImageRef(opts['A']?.image), 'image_b': getImageRef(opts['B']?.image),
        'image_c': getImageRef(opts['C']?.image), 'image_d': getImageRef(opts['D']?.image),
        'image_e': getImageRef(opts['E']?.image),
        'difficulty': q.difficulty || 'MEDIUM',
        'subject': q.subject_code || q.subject_name || '',
        'chapter': q.chapter || '',
        'tags': q.tags || '',
        'guru': q.teacher_name || ''
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ['question_text','image','points','correct','A','B','C','D','E','image_a','image_b','image_c','image_d','image_e','difficulty','subject','chapter','tags','guru']
    });
    ws['!cols'] = [{wch:60},{wch:20},{wch:8},{wch:8},{wch:35},{wch:35},{wch:35},{wch:35},{wch:35},{wch:20},{wch:20},{wch:20},{wch:20},{wch:20},{wch:10},{wch:15},{wch:20},{wch:25},{wch:30}];
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="bank_soal_semua_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal export: ' + e.message);
    res.redirect('/admin/question-bank');
  }
});

// GET Admin Question Bank List
router.get('/question-bank', async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const subject_id = req.query.subject_id || '';
    const difficulty = req.query.difficulty || '';

    // Get subjects for filter
    const [subjects] = await pool.query(`SELECT id, name FROM subjects ORDER BY name ASC;`);

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = {};

    if (search) {
      whereConditions.push(`(qb.question_text LIKE :search OR u.full_name LIKE :search)`);
      queryParams.search = `%${search}%`;
    }

    if (subject_id) {
      whereConditions.push(`qb.subject_id = :subject_id`);
      queryParams.subject_id = subject_id;
    }

    if (difficulty) {
      whereConditions.push(`qb.difficulty = :difficulty`);
      queryParams.difficulty = difficulty;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get questions
    const [questions] = await pool.query(
      `SELECT 
        qb.*,
        u.full_name as teacher_name,
        s.name as subject_name
      FROM question_bank qb
      JOIN users u ON qb.teacher_id = u.id
      JOIN subjects s ON qb.subject_id = s.id
      WHERE ${whereClause}
      ORDER BY qb.created_at DESC;`,
      queryParams
    );

    // Get stats
    const [[statsRow]] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'EASY' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'MEDIUM' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'HARD' THEN 1 ELSE 0 END) as hard
      FROM question_bank;
    `);

    const stats = {
      total: statsRow.total || 0,
      easy: statsRow.easy || 0,
      medium: statsRow.medium || 0,
      hard: statsRow.hard || 0
    };

    res.render('admin/question_bank', {
      title: 'Manajemen Bank Soal',
      questions,
      subjects,
      stats,
      search,
      subject_id,
      difficulty
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data bank soal.');
    res.redirect('/admin');
  }
});

// POST Delete Question Bank
router.post('/question-bank/:id/delete', async (req, res) => {
  const questionId = req.params.id;
  
  try {
    await pool.query(`DELETE FROM question_bank WHERE id = :id;`, { id: questionId });
    req.flash('success', 'Soal berhasil dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus soal.');
  }
  
  res.redirect('/admin/question-bank');
});

// POST Bulk Delete Question Bank
router.post('/question-bank/bulk-delete', async (req, res) => {
  // Handle both 'ids[]' and 'ids' parameter names
  let ids = req.body['ids[]'] || req.body.ids || [];
  
  // Ensure it's always an array
  const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  
  // Filter out empty values and convert to numbers
  const validIds = idsArray.filter(id => id && id.trim() !== '').map(id => parseInt(id)).filter(id => !isNaN(id));
  
  if (validIds.length === 0) {
    req.flash('error', 'Tidak ada soal yang dipilih.');
    return res.redirect('/admin/question-bank');
  }
  
  const conn = await pool.getConnection();
  let deleted = 0;
  
  try {
    await conn.beginTransaction();
    
    const placeholders = validIds.map(() => '?').join(',');
    
    // Delete question bank items
    const [result] = await conn.query(`DELETE FROM question_bank WHERE id IN (${placeholders});`, validIds);
    deleted = result.affectedRows || 0;
    
    await conn.commit();
    req.flash('success', `Berhasil menghapus ${deleted} soal dari bank soal.`);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    req.flash('error', 'Gagal menghapus soal. Terjadi kesalahan pada database.');
  } finally {
    conn.release();
  }
  
  res.redirect('/admin/question-bank');
});
// Failed Submissions Management
router.get('/failed-submissions', async (req, res) => {
  try {
    // Cek kolom submission_status dengan cara PostgreSQL
    const [cols] = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='attempts' AND column_name='submission_status' LIMIT 1
    `);
    if (!cols.length) {
      req.flash('error', 'Sistem recovery belum diaktifkan. Jalankan database migration terlebih dahulu.');
      return res.redirect('/admin');
    }

    // 1. Attempt dengan submission_status = FAILED
    const [failedAttempts] = await pool.query(`
      SELECT a.id, a.exam_id, a.student_id, a.status, a.submission_status,
             a.started_at, a.finished_at,
             u.full_name as student_name, u.username as student_username,
             e.title as exam_title, e.duration_minutes,
             s.name as subject_name,
             sb.id as backup_id, sb.created_at as backup_created
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN submission_backups sb ON sb.attempt_id = a.id AND sb.status = 'ACTIVE'
      WHERE a.submission_status = 'FAILED'
      ORDER BY a.started_at DESC
    `);

    // 2. Attempt IN_PROGRESS yang sudah melebihi waktu + 3 menit grace period
    const [expiredAttempts] = await pool.query(`
      SELECT a.id, a.exam_id, a.student_id, a.status,
             a.started_at, a.finished_at,
             u.full_name as student_name, u.username as student_username,
             e.title as exam_title, e.duration_minutes, e.end_at as exam_end_at,
             s.name as subject_name,
             FLOOR(EXTRACT(EPOCH FROM (NOW() - a.started_at))/60) AS minutes_elapsed
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      JOIN subjects s ON s.id = e.subject_id
      WHERE a.status = 'IN_PROGRESS'
        AND (
          FLOOR(EXTRACT(EPOCH FROM (NOW() - a.started_at))/60) > (e.duration_minutes + 3)
          OR (e.end_at IS NOT NULL AND NOW() > (e.end_at + INTERVAL '3 minutes'))
        )
      ORDER BY a.started_at ASC
    `);

    res.render('admin/failed_submissions', {
      title: 'Recovery Submission',
      user: req.session.user,
      failedAttempts: failedAttempts || [],
      expiredAttempts: expiredAttempts || []
    });
  } catch (error) {
    console.error('Error in failed-submissions route:', error);
    req.flash('error', 'Gagal memuat data: ' + error.message);
    res.redirect('/admin');
  }
});

// Force submit attempt IN_PROGRESS yang sudah expired (admin)
router.post('/failed-submissions/:id/force-submit', async (req, res) => {
  const attemptId = req.params.id;
  try {
    const [[attempt]] = await pool.query(
      `SELECT a.id, a.student_id, a.exam_id, a.status,
              e.duration_minutes,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - a.started_at))/60) AS minutes_elapsed
       FROM attempts a JOIN exams e ON e.id = a.exam_id
       WHERE a.id = :aid AND a.status = 'IN_PROGRESS' LIMIT 1;`,
      { aid: attemptId }
    );
    if (!attempt) {
      req.flash('error', 'Attempt tidak ditemukan atau sudah disubmit.');
      return res.redirect('/admin/failed-submissions');
    }
    const { finalizeAttemptWithBackup } = require('../utils/submission-utils');
    await finalizeAttemptWithBackup(attempt.id, attempt.student_id, attempt.exam_id);
    req.flash('success', `Attempt #${attemptId} berhasil disubmit paksa.`);
  } catch (error) {
    console.error('Force submit failed:', error);
    req.flash('error', 'Gagal force submit: ' + error.message);
  }
  res.redirect('/admin/failed-submissions');
});

// Force submit MASSAL semua expired IN_PROGRESS
router.post('/failed-submissions/force-submit-all', async (req, res) => {
  try {
    const { autoSubmitAllExpired } = require('../middleware/auto-submit');
    const result = await autoSubmitAllExpired();
    req.flash('success', `Berhasil submit ${result.processed} dari ${result.total} attempt yang expired.`);
  } catch (error) {
    console.error('Force submit all failed:', error);
    req.flash('error', 'Gagal: ' + error.message);
  }
  res.redirect('/admin/failed-submissions');
});

// Recover Failed Submission
router.post('/failed-submissions/:id/recover', async (req, res) => {
  const attemptId = req.params.id;
  
  try {
    const [[attempt]] = await pool.query(`
      SELECT a.*, sb.backup_data, sb.id as backup_id
      FROM attempts a
      LEFT JOIN submission_backups sb ON sb.attempt_id = a.id AND sb.status = 'ACTIVE'
      WHERE a.id = :aid AND a.submission_status = 'FAILED'
    `, { aid: attemptId });

    if (!attempt) {
      req.flash('error', 'Attempt tidak ditemukan atau bukan status FAILED.');
      return res.redirect('/admin/failed-submissions');
    }

    if (!attempt.backup_data) {
      req.flash('error', 'Backup data tidak ditemukan untuk attempt ini.');
      return res.redirect('/admin/failed-submissions');
    }

    // Parse backup data
    const backupData = JSON.parse(attempt.backup_data);
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Restore answers from backup
      for (const answer of backupData.answers) {
        await connection.query(`
          UPDATE attempt_answers 
          SET option_id = :oid, is_correct = :isc, answered_at = :at
          WHERE attempt_id = :aid AND question_id = :qid
        `, {
          oid: answer.option_id,
          isc: answer.is_correct,
          at: answer.answered_at,
          aid: attemptId,
          qid: answer.question_id
        });
      }

      // Recalculate and finalize
      const [[sum]] = await connection.query(`
        SELECT
            SUM(q.points) AS total_points,
            SUM(CASE WHEN aa.is_correct=1 THEN q.points ELSE 0 END) AS score_points,
            SUM(CASE WHEN aa.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,
            SUM(CASE WHEN aa.option_id IS NOT NULL AND aa.is_correct=0 THEN 1 ELSE 0 END) AS wrong_count
         FROM attempt_answers aa
         JOIN questions q ON q.id=aa.question_id
         WHERE aa.attempt_id=:aid;
      `, { aid: attemptId });

      const total_points = Number(sum.total_points || 0);
      const score_points = Number(sum.score_points || 0);
      const correct_count = Number(sum.correct_count || 0);
      const wrong_count = Number(sum.wrong_count || 0);
      const score = total_points > 0 ? Math.round((score_points / total_points) * 100) : 0;

      // Update attempt status
      await connection.query(`
        UPDATE attempts
        SET finished_at = NOW(), status = 'SUBMITTED', submission_status = 'SUBMITTED',
            score = :score, total_points = :total_points, 
            correct_count = :correct_count, wrong_count = :wrong_count
        WHERE id = :aid
      `, { score, total_points, correct_count, wrong_count, aid: attemptId });

      // Mark backup as restored
      await connection.query(`
        UPDATE submission_backups 
        SET status = 'RESTORED', restored_at = NOW()
        WHERE id = :bid
      `, { bid: attempt.backup_id });

      await connection.commit();
      
      req.flash('success', `Submission berhasil dipulihkan. Nilai: ${score}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Recovery failed:', error);
    req.flash('error', 'Gagal memulihkan submission.');
  }
  
  res.redirect('/admin/failed-submissions');
});

// Retry Failed Submission
router.post('/failed-submissions/:id/retry', async (req, res) => {
  const attemptId = req.params.id;
  
  try {
    const [[attempt]] = await pool.query(`
      SELECT a.student_id, a.exam_id
      FROM attempts a
      WHERE a.id = :aid AND a.submission_status = 'FAILED'
    `, { aid: attemptId });

    if (!attempt) {
      req.flash('error', 'Attempt tidak ditemukan atau bukan status FAILED.');
      return res.redirect('/admin/failed-submissions');
    }

    // Reset status and retry finalization
    await pool.query(`
      UPDATE attempts 
      SET submission_status = 'PENDING'
      WHERE id = :aid
    `, { aid: attemptId });

    // Try to finalize again
    await finalizeAttemptWithBackup(attemptId, attempt.student_id, attempt.exam_id);
    
    req.flash('success', 'Submission berhasil diproses ulang.');
  } catch (error) {
    console.error('Retry failed:', error);
    req.flash('error', 'Gagal memproses ulang submission.');
  }
  
  res.redirect('/admin/failed-submissions');
});

// ===== RANKING UPDATE =====
router.post('/update-ranking', async (req, res) => {
  try {
    // Clear the banner cache to force refresh of ranking data
    if (router.bannerCache) {
      delete router.bannerCache;
    }
    
    // Also clear auth router cache if it exists
    const authRouter = require('./auth');
    if (authRouter.bannerCache) {
      delete authRouter.bannerCache;
    }
    
    // Force a fresh calculation by calling the banner data endpoint
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];

    // Pre-calculate and cache new ranking data
    const [activeClasses] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) as activity_score
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT'
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    const [activeStudents] = await pool.query(`
      SELECT 
        u.full_name,
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) + COUNT(DISTINCT asub.id) as activity_score
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at >= :weekAgo
      WHERE u.role = 'STUDENT' AND u.is_active = true
      GROUP BY u.id, u.full_name, c.name
      HAVING COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) + COUNT(DISTINCT asub.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    const [activeTeachers] = await pool.query(`
      SELECT 
        u.full_name,
        COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT a.id) as activity_score
      FROM users u
      LEFT JOIN exams e ON e.teacher_id = u.id AND e.created_at >= :weekAgo
      LEFT JOIN materials m ON m.teacher_id = u.id AND m.created_at >= :weekAgo
      LEFT JOIN assignments a ON a.teacher_id = u.id AND a.created_at >= :weekAgo
      WHERE u.role = 'TEACHER' AND u.is_active = true
      GROUP BY u.id, u.full_name
      HAVING COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT a.id) > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    // Update cache in auth router
    const responseData = {
      success: true,
      data: {
        activeClasses: activeClasses.map(c => c.class_name),
        activeStudents: activeStudents.map(s => ({ name: s.full_name, class: s.class_name })),
        activeTeachers: activeTeachers.map(t => t.full_name),
        weekPeriod: `${oneWeekAgoStr} - ${new Date().toISOString().split('T')[0]}`
      }
    };

    // Set new cache
    authRouter.bannerCache = {
      data: responseData,
      timestamp: Date.now()
    };

    res.json({
      success: true,
      message: 'Data peringkat berhasil diperbarui',
      stats: {
        activeClasses: activeClasses.length,
        activeStudents: activeStudents.length,
        activeTeachers: activeTeachers.length,
        lastUpdated: new Date().toLocaleString('id-ID')
      }
    });

  } catch (error) {
    console.error('Error updating ranking data:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui data peringkat: ' + error.message
    });
  }
});

// ===== MONITORING =====
router.get('/monitoring', async (req, res) => {
  res.render('admin/monitoring', { title: 'Monitoring Sistem' });
});

router.get('/monitoring/data', async (req, res) => {
  try {
    const os = require('os');
    const { execSync } = require('child_process');

    // CPU usage (snapshot 500ms)
    const cpuStart = os.cpus();
    await new Promise(r => setTimeout(r, 500));
    const cpuEnd = os.cpus();

    let totalIdle = 0, totalTick = 0;
    cpuEnd.forEach((cpu, i) => {
      const startCpu = cpuStart[i];
      for (const type in cpu.times) {
        totalTick += cpu.times[type] - (startCpu.times[type] || 0);
      }
      totalIdle += cpu.times.idle - (startCpu.times.idle || 0);
    });
    const cpuUsage = totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100) : 0;

    // RAM sistem
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const mem = process.memoryUsage();
    const nodeRss  = Math.round(mem.rss / 1024 / 1024);
    const nodeHeap = Math.round(mem.heapUsed / 1024 / 1024);

    // Uptime
    const uptimeSec = os.uptime();
    const uptimeApp = process.uptime();

    // Storage (disk usage) - pakai df di Linux
    let storage = { total: 0, used: 0, free: 0, percent: 0, uploadSize: '-' };
    try {
      if (process.platform !== 'win32') {
        const dfOut = execSync("df -BM / | tail -1").toString().trim();
        // Format: /dev/vda1  20480M  8192M  12288M  40% /
        const parts = dfOut.split(/\s+/);
        const total = parseInt(parts[1]) || 0;
        const used  = parseInt(parts[2]) || 0;
        const free  = parseInt(parts[3]) || 0;
        const pct   = parseInt(parts[4]) || 0;
        storage = { total, used, free, percent: pct };

        // Ukuran folder uploads
        try {
          const UPLOAD_ROOT = process.env.UPLOAD_ROOT || require('path').join(__dirname, '..', 'public', 'uploads');
          const duOut = execSync(`du -sm "${UPLOAD_ROOT}" 2>/dev/null || echo "0"`).toString().trim();
          const sizeMb = parseInt(duOut.split('\t')[0]) || 0;
          storage.uploadSize = sizeMb >= 1024
            ? (sizeMb / 1024).toFixed(1) + ' GB'
            : sizeMb + ' MB';
        } catch(_) { storage.uploadSize = '-'; }
      }
    } catch(_) {}

    // DB stats
    let dbStats = { active: 0, total: 0, uptime: '-' };
    try {
      const [r] = await pool.query(`
        SELECT count(*) AS total,
               sum(CASE WHEN state='active' THEN 1 ELSE 0 END) AS active
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      const [u] = await pool.query(`
        SELECT
          EXTRACT(DAY FROM (now() - pg_postmaster_start_time()))::int AS days,
          EXTRACT(HOUR FROM (now() - pg_postmaster_start_time()))::int % 24 AS hours,
          EXTRACT(MINUTE FROM (now() - pg_postmaster_start_time()))::int % 60 AS minutes
      `);
      const uu = u[0];
      const uptimeStr = uu
        ? (uu.days > 0 ? `${uu.days}h ` : '') + `${uu.hours}j ${uu.minutes}m`
        : '-';
      dbStats = {
        active: Number(r[0]?.active || 0),
        total:  Number(r[0]?.total  || 0),
        uptime: uptimeStr
      };
    } catch(_) {}

    // DB size
    let dbSize = '-';
    try {
      const [s] = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`);
      dbSize = s[0]?.size || '-';
    } catch(_) {}

    // Statistik data + siswa yang sedang ujian
    let stats = { users: 0, exams: 0, attempts: 0, activeAttempts: 0 };
    let activeExams = [];
    
    // Stats dasar
    try {
      const [r1] = await pool.query(`SELECT COUNT(*) AS c FROM users`);
      const [r2] = await pool.query(`SELECT COUNT(*) AS c FROM exams`);
      const [r3] = await pool.query(`SELECT COUNT(*) AS c FROM attempts`);
      const [r4] = await pool.query(`SELECT COUNT(*) AS c FROM attempts WHERE status = 'IN_PROGRESS'`);
      stats = {
        users:         Number(r1[0]?.c || 0),
        exams:         Number(r2[0]?.c || 0),
        attempts:      Number(r3[0]?.c || 0),
        activeAttempts: Number(r4[0]?.c || 0)
      };
    } catch(e1) {
      console.error('Monitoring stats error:', e1.message);
    }

    // Detail siswa yang sedang ujian - ringkasan per ujian (lebih ringan)
    try {
      const [activeRows] = await pool.query(`
        SELECT
          e.id AS exam_id,
          e.title AS exam_title,
          e.duration_minutes,
          COUNT(a.id) AS student_count,
          MIN(FLOOR(EXTRACT(EPOCH FROM (now() - a.started_at))/60))::int AS min_elapsed,
          MAX(FLOOR(EXTRACT(EPOCH FROM (now() - a.started_at))/60))::int AS max_elapsed
        FROM attempts a
        JOIN exams e ON e.id = a.exam_id
        WHERE a.status = 'IN_PROGRESS'
        GROUP BY e.id, e.title, e.duration_minutes
        ORDER BY student_count DESC
        LIMIT 20
      `);
      activeExams = (activeRows || []).map(r => ({
        exam_id:          r.exam_id,
        exam_title:       r.exam_title,
        student_count:    Number(r.student_count) || 0,
        duration_minutes: Number(r.duration_minutes) || 0,
        min_elapsed:      Number(r.min_elapsed) || 0,
        max_elapsed:      Number(r.max_elapsed) || 0,
        remaining_minutes: Math.max(0, Number(r.duration_minutes) - (Number(r.max_elapsed) || 0))
      }));
    } catch(e2) {
      console.error('Monitoring activeExams error:', e2.message);
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      redisConnected: req.app.locals.isRedisConnected === true,
      serviceHosts: {
        db:    process.env.DB_HOST    || 'localhost',
        redis: process.env.REDIS_HOST || 'localhost',
      },
      server: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpuModel: os.cpus()[0]?.model || '-',
        cpuCores: os.cpus().length,
        cpuUsage,
        totalMem: Math.round(totalMem / 1024 / 1024),
        usedMem:  Math.round(usedMem  / 1024 / 1024),
        freeMem:  Math.round(freeMem  / 1024 / 1024),
        memPercent: Math.round((usedMem / totalMem) * 100),
        nodeRss,
        nodeHeap,
        uptimeOs:  uptimeSec,
        uptimeApp: uptimeApp,
        pid: process.pid,
        rss:       nodeRss,
        heapUsed:  nodeHeap,
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      storage,
      db: { ...dbStats },
      dbSize,
      stats,
      activeExams
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Restart Services ─────────────────────────────────────────────────────────
router.post('/monitoring/restart', async (req, res) => {
  const { service } = req.body;
  const { exec } = require('child_process');
  const IS_WIN = process.platform === 'win32';

  // Deteksi apakah service ada di server terpisah (bukan localhost)
  const dbHost    = process.env.DB_HOST    || 'localhost';
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const isLocalhost = (h) => !h || h === 'localhost' || h === '127.0.0.1';

  const dbIsRemote    = !isLocalhost(dbHost);
  const redisIsRemote = !isLocalhost(redisHost);

  // SSH key path (opsional, set di .env)
  const sshKey     = process.env.SSH_KEY_PATH || '/root/.ssh/id_rsa';
  const sshUser    = process.env.SSH_USER     || 'root';
  const sshOptions = `-o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${sshKey}`;

  let cmd = null;
  let info = null;

  if (service === 'app') {
    if (IS_WIN) return res.json({ ok: false, message: 'Reload app tidak tersedia di Windows.' });
    cmd = 'pm2 reload all';
  } else if (service === 'postgresql') {
    if (IS_WIN) return res.json({ ok: false, message: 'Restart PostgreSQL tidak tersedia di Windows.' });
    if (dbIsRemote) {
      // Coba SSH ke server database
      cmd = `ssh ${sshOptions} ${sshUser}@${dbHost} "systemctl restart postgresql"`;
      info = `via SSH ke ${dbHost}`;
    } else {
      cmd = 'systemctl restart postgresql';
    }
  } else if (service === 'redis') {
    if (IS_WIN) return res.json({ ok: false, message: 'Restart Redis tidak tersedia di Windows.' });
    if (redisIsRemote) {
      // Coba SSH ke server Redis
      cmd = `ssh ${sshOptions} ${sshUser}@${redisHost} "systemctl restart redis-server || systemctl restart redis"`;
      info = `via SSH ke ${redisHost}`;
    } else {
      cmd = 'systemctl restart redis-server || systemctl restart redis';
    }
  } else {
    return res.json({ ok: false, message: `Service "${service}" tidak dikenal.` });
  }

  // Untuk restart app, lakukan setelah response dikirim
  if (service === 'app') {
    res.json({ ok: true, message: 'Aplikasi akan di-reload dalam 2 detik...' });
    setTimeout(() => {
      exec(cmd, (err) => {
        if (err) console.error('Restart app error:', err.message);
      });
    }, 2000);
    return;
  }

  exec(cmd, { timeout: 20000 }, (err, stdout, stderr) => {
    if (err) {
      // Jika SSH gagal, berikan pesan informatif
      const isSSHError = err.message.includes('ssh') || err.message.includes('Connection') || err.message.includes('Permission');
      if (isSSHError && info) {
        return res.json({
          ok: false,
          message: `Gagal SSH ${info}. Pastikan SSH key sudah dikonfigurasi di .env (SSH_KEY_PATH, SSH_USER). Error: ${err.message}`
        });
      }
      return res.json({ ok: false, message: `Gagal restart ${service}: ${err.message}` });
    }
    const msg = info ? `${service} berhasil di-restart ${info}.` : `${service} berhasil di-restart.`;
    res.json({ ok: true, message: msg });
  });
});

// ── Backup Database ───────────────────────────────────────────────────────────
router.get('/monitoring/backup-db', async (req, res) => {
  const { exec } = require('child_process');
  const path = require('path');

  if (process.platform === 'win32') {
    return res.status(400).json({ ok: false, message: 'Backup hanya tersedia di Linux/VPS.' });
  }

  const dbHost     = process.env.DB_HOST     || 'localhost';
  const dbPort     = process.env.DB_PORT     || '5432';
  const dbUser     = process.env.DB_USER     || 'lmsuser';
  const dbPassword = process.env.DB_PASSWORD || '';
  const dbName     = process.env.DB_NAME     || 'cbt_smk';

  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename   = `backup_${dbName}_${timestamp}.sql`;
  const backupPath = `/tmp/${filename}`;

  const cmd = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --no-owner --no-acl -f "${backupPath}"`;

  exec(cmd, { timeout: 120000 }, (err) => {
    if (err) {
      console.error('Backup DB error:', err.message);
      return res.status(500).json({ ok: false, message: 'Gagal backup database: ' + err.message });
    }

    // Stream file ke browser lalu hapus
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const fs = require('fs');
    const stream = fs.createReadStream(backupPath);
    stream.pipe(res);
    stream.on('end', () => {
      try { fs.unlinkSync(backupPath); } catch (_) {}
    });
    stream.on('error', (e) => {
      console.error('Stream error:', e.message);
      try { fs.unlinkSync(backupPath); } catch (_) {}
    });
  });
});

function formatUptime(sec) {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m ${s}d`;
}

// ===== AGENDA (ADMIN - lihat semua guru) =====
router.get('/agenda', async (req, res) => {
  const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  const teacher_id = req.query.teacher_id || '';

  let q = `SELECT a.*, u.full_name AS teacher_name
           FROM agendas a JOIN users u ON u.id=a.teacher_id
           WHERE EXTRACT(MONTH FROM a.agenda_date)=:bulan AND EXTRACT(YEAR FROM a.agenda_date)=:tahun`;
  const params = { bulan, tahun };
  if (teacher_id) { q += ' AND a.teacher_id=:tid'; params.tid = teacher_id; }
  q += ' ORDER BY a.agenda_date ASC, a.start_time ASC;';

  const [agendas] = await pool.query(q, params);
  const [teachers] = await pool.query(`SELECT id, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);

  res.render('admin/agenda', { title: 'Agenda Guru', agendas, teachers, bulan, tahun, teacher_id });
});

// ===== NOTIFIKASI GURU - REKAP PER GURU =====
router.get('/notifications', async (req, res) => {
  const q = (req.query.q || '').trim();
  const type = (req.query.type || '').trim();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    // Rekap unik: GROUP BY title + sender + type + DATE(created_at)
    // Karena sistem insert 1 baris per siswa, kita deduplikasi
    let having = 'HAVING 1=1';
    const params = {};

    if (q) {
      having += ' AND (title LIKE :q OR sender_name LIKE :q OR sender_username LIKE :q)';
      params.q = `%${q}%`;
    }
    if (type) {
      having += ' AND notif_type = :type';
      params.type = type;
    }

    const [notifications] = await pool.query(
      `SELECT
         MIN(n.id) AS id,
         n.title,
         n.message,
         n.type AS notif_type,
         n.target_type,
         n.target_id,
         n.is_active,
         n.expires_at,
         n.sender_id,
         u.full_name AS sender_name,
         u.username AS sender_username,
         u.role AS sender_role,
         c.name AS target_class_name,
         COUNT(n.id) AS total_sent,
         SUM(CASE WHEN nr.id IS NOT NULL THEN 1 ELSE 0 END) AS read_count,
         MIN(n.created_at) AS created_at
       FROM notifications n
       LEFT JOIN users u ON u.id = n.sender_id
       LEFT JOIN classes c ON c.id = n.target_id AND n.target_type = 'class'
       LEFT JOIN notification_reads nr ON nr.notification_id = n.id
       GROUP BY n.title, n.message, n.type, n.sender_id, n.target_type, n.target_id, DATE(n.created_at),
                u.full_name, u.username, u.role, c.name, n.is_active, n.expires_at
       ${having}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT n.title, n.sender_id, n.type, n.target_type, n.target_id, DATE(n.created_at),
                u.full_name AS sender_name, u.username AS sender_username
         FROM notifications n
         LEFT JOIN users u ON u.id = n.sender_id
         GROUP BY n.title, n.message, n.type, n.sender_id, n.target_type, n.target_id, DATE(n.created_at),
                  u.full_name, u.username
         ${having.replace('sender_name', 'u.full_name').replace('sender_username', 'u.username').replace('notif_type', 'n.type')}
       ) sub`,
      params
    );

    const totalPages = Math.ceil(total / limit);

    res.render('admin/notifications', {
      title: 'Pantau Notifikasi Guru',
      notifications,
      q, type,
      page, totalPages, total
    });
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal memuat data notifikasi.');
    res.redirect('/admin');
  }
});

// Hapus semua notifikasi dengan title+sender+tanggal yang sama (hapus duplikat sekaligus)
router.post('/notifications/:id/delete', async (req, res) => {
  try {
    // Ambil data notif dulu untuk hapus semua yang sama
    const [[notif]] = await pool.query(
      `SELECT title, message, sender_id, type, target_type, target_id, DATE(created_at) AS tgl
       FROM notifications WHERE id = :id LIMIT 1`,
      { id: req.params.id }
    );
    if (notif) {
      await pool.query(
        `DELETE FROM notifications
         WHERE title = :title AND message = :message
           AND COALESCE(sender_id, 0) = COALESCE(:sender_id, 0)
           AND type = :type AND target_type = :target_type
           AND COALESCE(target_id, 0) = COALESCE(:target_id, 0)
           AND DATE(created_at) = :tgl`,
        {
          title: notif.title, message: notif.message,
          sender_id: notif.sender_id, type: notif.type,
          target_type: notif.target_type, target_id: notif.target_id,
          tgl: notif.tgl
        }
      );
    }
    req.flash('success', 'Notifikasi dihapus.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Gagal menghapus notifikasi.');
  }
  res.redirect('/admin/notifications');
});

module.exports = router;