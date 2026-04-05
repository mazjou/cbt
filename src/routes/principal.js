const express = require('express');
const XLSX = require('xlsx');
const pool = require('../db/pool');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('PRINCIPAL'));

router.get('/', async (req, res) => {
  const user = req.session.user;
  try {
    const [[sCnt]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role='STUDENT' AND is_active=true;`);
    const [[tCnt]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE role='TEACHER' AND is_active=true;`);
    const [[eCnt]] = await pool.query(`SELECT COUNT(*) AS c FROM exams;`);
    const [[ePub]] = await pool.query(`SELECT COUNT(*) AS c FROM exams WHERE is_published=true;`);
    const [[mCnt]] = await pool.query(`SELECT COUNT(*) AS c FROM materials;`);
    const [[mPub]] = await pool.query(`SELECT COUNT(*) AS c FROM materials WHERE is_published=true;`);
    const [[doneAny]] = await pool.query(`SELECT COUNT(DISTINCT student_id) AS c FROM attempts;`);
    const [[readAny]] = await pool.query(`SELECT COUNT(DISTINCT student_id) AS c FROM material_reads;`);

    const [examProgress] = await pool.query(
      `SELECT e.id, e.title, e.is_published,
              (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') 
               FROM exam_classes ec 
               JOIN classes c ON c.id=ec.class_id 
               WHERE ec.exam_id=e.id) AS class_names,
              (SELECT COUNT(DISTINCT a.student_id) FROM attempts a WHERE a.exam_id=e.id) AS done_count,
              (SELECT COUNT(*) FROM users u
                WHERE u.role='STUDENT' AND u.is_active=true
                  AND (
                    NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
                    OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=u.class_id)
                  )
              ) AS eligible_count,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
              u2.full_name AS teacher_name
       FROM exams e
       JOIN users u2 ON u2.id=e.teacher_id
       ORDER BY e.id DESC
       LIMIT 10;`
    );

    const [materialProgress] = await pool.query(
      `SELECT m.id, m.title, m.is_published, c.name AS class_name,
              (SELECT COUNT(DISTINCT mr.student_id) FROM material_reads mr WHERE mr.material_id=m.id) AS read_count,
              (SELECT COUNT(DISTINCT mr.student_id) FROM material_reads mr WHERE mr.material_id=m.id AND mr.completed_at IS NOT NULL) AS completed_count,
              (SELECT COUNT(*) FROM users u
                WHERE u.role='STUDENT' AND u.is_active=true
                  AND (m.class_id IS NULL OR u.class_id=m.class_id)
              ) AS eligible_count,
              u2.full_name AS teacher_name,
              s.name AS subject_name
       FROM materials m
       JOIN users u2 ON u2.id=m.teacher_id
       JOIN subjects s ON s.id=m.subject_id
       LEFT JOIN classes c ON c.id=m.class_id
       ORDER BY m.id DESC
       LIMIT 10;`
    );

    const [teacherActivity] = await pool.query(
      `SELECT u.id, u.full_name,
              (SELECT COUNT(*) FROM exams e WHERE e.teacher_id=u.id) AS exams_count,
              (SELECT COUNT(*) FROM materials m WHERE m.teacher_id=u.id) AS materials_count
       FROM users u
       WHERE u.role='TEACHER' AND u.is_active=true
       ORDER BY (exams_count + materials_count) DESC, u.full_name ASC;`
    );

    return res.render('principal/index', {
      title: 'Dashboard Kepala Sekolah',
      summary: {
        students: sCnt.c,
        teachers: tCnt.c,
        exams: eCnt.c,
        exams_published: ePub.c,
        materials: mCnt.c,
        materials_published: mPub.c,
        students_done_any_exam: doneAny.c,
        students_read_any_material: readAny.c
      },
      examProgress,
      materialProgress,
      teacherActivity,
      user
    });
  } catch (e) {
    console.error(e);
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat dashboard kepala sekolah.',
      user
    });
  }
});

router.get('/exams', async (req, res) => {
  const user = req.session.user;
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const classFilter = req.query.class || '';
    const statusFilter = req.query.status || '';

    const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name;`);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = {};
    
    if (search) {
      whereConditions.push('(e.title LIKE :search OR s.name LIKE :search OR u.full_name LIKE :search)');
      queryParams.search = `%${search}%`;
    }
    
    if (classFilter) {
      whereConditions.push('EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id = :classId)');
      queryParams.classId = classFilter;
    }
    
    if (statusFilter) {
      whereConditions.push('e.is_published = :status');
      queryParams.status = statusFilter === 'published' ? 1 : 0;
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Get total count
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM exams e
       JOIN users u ON u.id=e.teacher_id
       JOIN subjects s ON s.id=e.subject_id
       ${whereClause}`,
      queryParams
    );
    
    const [exams] = await pool.query(
      `SELECT e.id, e.title, e.is_published, e.start_at, e.duration_minutes, e.pass_score,
              (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') 
               FROM exam_classes ec 
               JOIN classes c ON c.id=ec.class_id 
               WHERE ec.exam_id=e.id) AS class_names,
              s.name AS subject_name,
              u.full_name AS teacher_name,
              (SELECT COUNT(DISTINCT a.student_id) FROM attempts a WHERE a.exam_id=e.id AND a.status='SUBMITTED') AS done_count,
              (SELECT COUNT(*) FROM users u2
                WHERE u2.role='STUDENT' AND u2.is_active=true
                  AND (
                    NOT EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id)
                    OR EXISTS (SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=u2.class_id)
                  )
              ) AS eligible_count,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
              (SELECT AVG(a.score) FROM attempts a WHERE a.exam_id=e.id AND a.status='SUBMITTED') AS avg_score
       FROM exams e
       JOIN users u ON u.id=e.teacher_id
       JOIN subjects s ON s.id=e.subject_id
       ${whereClause}
       ORDER BY e.id DESC
       LIMIT :limit OFFSET :offset;`,
      { ...queryParams, limit, offset }
    );

    const totalPages = Math.ceil(total / limit);

    return res.render('principal/exams', {
      title: 'Rekap Ujian',
      exams,
      classes,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      filters: {
        search,
        class: classFilter,
        status: statusFilter
      },
      user
    });
  } catch (e) {
    console.error(e);
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat rekap ujian.',
      user
    });
  }
});

router.get('/materials', async (req, res) => {
  const user = req.session.user;
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const classFilter = req.query.class || '';
    const subjectFilter = req.query.subject || '';
    const statusFilter = req.query.status || '';

    const [classes] = await pool.query(`SELECT id, name FROM classes ORDER BY name;`);
    const [subjects] = await pool.query(`SELECT id, name FROM subjects ORDER BY name;`);
    
    // Build WHERE clause
    let whereConditions = [];
    let queryParams = {};
    
    if (search) {
      whereConditions.push('(m.title LIKE :search OR s.name LIKE :search OR u.full_name LIKE :search)');
      queryParams.search = `%${search}%`;
    }
    
    if (classFilter) {
      whereConditions.push('m.class_id = :classId');
      queryParams.classId = classFilter;
    }
    
    if (subjectFilter) {
      whereConditions.push('m.subject_id = :subjectId');
      queryParams.subjectId = subjectFilter;
    }
    
    if (statusFilter) {
      whereConditions.push('m.is_published = :status');
      queryParams.status = statusFilter === 'published' ? 1 : 0;
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Get total count
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM materials m
       JOIN users u ON u.id=m.teacher_id
       JOIN subjects s ON s.id=m.subject_id
       ${whereClause}`,
      queryParams
    );
    
    const [materials] = await pool.query(
      `SELECT m.id, m.title, m.is_published, m.embed_type, m.created_at,
              c.id AS class_id, c.name AS class_name,
              s.id AS subject_id, s.name AS subject_name,
              u.full_name AS teacher_name,
              (SELECT COUNT(DISTINCT mr.student_id) FROM material_reads mr WHERE mr.material_id=m.id) AS read_count,
              (SELECT COUNT(DISTINCT mr.student_id) FROM material_reads mr WHERE mr.material_id=m.id AND mr.completed_at IS NOT NULL) AS completed_count,
              (SELECT COUNT(*) FROM users u2
                WHERE u2.role='STUDENT' AND u2.is_active=true
                  AND (m.class_id IS NULL OR u2.class_id=m.class_id)
              ) AS eligible_count
       FROM materials m
       JOIN users u ON u.id=m.teacher_id
       JOIN subjects s ON s.id=m.subject_id
       LEFT JOIN classes c ON c.id=m.class_id
       ${whereClause}
       ORDER BY m.id DESC
       LIMIT :limit OFFSET :offset;`,
      { ...queryParams, limit, offset }
    );

    const totalPages = Math.ceil(total / limit);

    return res.render('principal/materials', {
      title: 'Rekap Materi',
      materials,
      classes,
      subjects,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      filters: {
        search,
        class: classFilter,
        subject: subjectFilter,
        status: statusFilter
      },
      user
    });
  } catch (e) {
    console.error(e);
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat rekap materi.',
      user
    });
  }
});

// ===== REPORTS =====
router.get('/reports', async (req, res) => {
  const user = req.session.user;
  try {
    // Parse filter parameters
    const startDate = req.query.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = req.query.end_date || new Date().toISOString().split('T')[0];
    const exportExcel = req.query.export === 'excel';

    const filters = { start_date: startDate, end_date: endDate };

    // Get summary statistics
    const [[summaryRow]] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM exams WHERE created_at BETWEEN ? AND ?) as total_exams,
        (SELECT COUNT(*) FROM materials WHERE created_at BETWEEN ? AND ?) as total_materials,
        (SELECT COUNT(*) FROM assignments WHERE created_at BETWEEN ? AND ?) as total_assignments,
        (SELECT COUNT(*) FROM attempts WHERE created_at BETWEEN ? AND ?) as total_attempts,
        (SELECT COALESCE(AVG(score), 0) FROM attempts WHERE created_at BETWEEN ? AND ? AND score IS NOT NULL) as avg_score,
        (SELECT COUNT(*) FROM attempts WHERE created_at BETWEEN ? AND ? AND score >= (SELECT pass_score FROM exams WHERE id = attempts.exam_id)) as passed_attempts,
        (SELECT COUNT(*) FROM material_reads WHERE created_at BETWEEN ? AND ?) as total_material_reads,
        (SELECT COUNT(*) FROM assignment_submissions WHERE created_at BETWEEN ? AND ?) as total_submissions,
        (SELECT COUNT(DISTINCT student_id) FROM attempts WHERE created_at BETWEEN ? AND ?) as active_students,
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active = true) as total_students
    `, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);

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
      LEFT JOIN exams e ON e.teacher_id = u.id AND e.created_at BETWEEN ? AND ?
      LEFT JOIN materials m ON m.teacher_id = u.id AND m.created_at BETWEEN ? AND ?
      LEFT JOIN assignments a ON a.teacher_id = u.id AND a.created_at BETWEEN ? AND ?
      WHERE u.role = 'TEACHER' AND u.is_active = true
      GROUP BY u.id, u.full_name
      HAVING (COUNT(DISTINCT e.id) * 3 + COUNT(DISTINCT m.id) * 2 + COUNT(DISTINCT a.id) * 2) > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);

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
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN ? AND ?
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN ? AND ?
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN ? AND ?
      WHERE u.role = 'STUDENT' AND u.is_active = true
      GROUP BY u.id, u.full_name, c.name
      HAVING (COUNT(DISTINCT at.id) * 3 + COUNT(DISTINCT asub.id) * 2 + COUNT(DISTINCT mr.id)) > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);

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
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN ? AND ?
      LEFT JOIN (
        SELECT asub.*, ac.class_id as target_class_id
        FROM assignment_submissions asub
        INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
        WHERE asub.created_at BETWEEN ? AND ?
      ) asub_filtered ON asub_filtered.student_id = u.id AND asub_filtered.target_class_id = c.id
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN ? AND ?
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT u.id) > 0
      ORDER BY total_activities DESC, participation_rate DESC, c.name ASC
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);

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
      LEFT JOIN exams e ON e.subject_id = s.id AND e.created_at BETWEEN ? AND ?
      LEFT JOIN materials m ON m.subject_id = s.id AND m.created_at BETWEEN ? AND ?
      LEFT JOIN attempts at ON at.exam_id = e.id AND at.created_at BETWEEN ? AND ?
      GROUP BY s.id, s.name
      HAVING (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) > 0
      ORDER BY (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) DESC, avg_score DESC
      LIMIT 10
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);

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
      const filename = `Rekap_LMS_KepSek_${startDate}_${endDate}_${Date.now()}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }

    res.render('principal/reports', {
      title: 'Rekap Penggunaan LMS',
      filters,
      summary,
      activeTeachers,
      activeStudents,
      activeClasses,
      popularSubjects,
      user
    });

  } catch (error) {
    console.error('Error generating principal reports:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    return res.status(500).render('error', {
      title: 'Error',
      message: 'Gagal memuat laporan rekap: ' + error.message,
      user
    });
  }
});

module.exports = router;
