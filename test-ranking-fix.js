const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true
  });

  try {
    console.log('=== Test Query Ranking Kelas (30 hari terakhir) ===\n');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    
    console.log(`Periode: ${startDate.toISOString().split('T')[0]} s/d ${endDate.toISOString().split('T')[0]}\n`);
    
    // Query dengan created_at (FIXED)
    const [results] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_exams,
        COUNT(DISTINCT asub.id) as total_assignments,
        COUNT(DISTINCT mr.id) as total_material_reads,
        COALESCE(AVG(at.score), 0) as avg_score,
        (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub.id) + COUNT(DISTINCT mr.id)) as total_activities,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 THEN 
            ROUND(((COUNT(DISTINCT at.student_id) + COUNT(DISTINCT asub.student_id) + COUNT(DISTINCT mr.student_id)) / (COUNT(DISTINCT u.id) * 3)) * 100)
          ELSE 0 
        END as participation_rate
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING total_students > 0 AND total_activities > 0
      ORDER BY total_activities DESC, participation_rate DESC, c.name ASC
      LIMIT 10
    `, { startDate, endDate });
    
    console.log('Top 10 Kelas Teraktif:\n');
    console.table(results.map(r => ({
      Kelas: r.class_name,
      'Total Siswa': r.total_students,
      'Ujian': r.total_exams,
      'Tugas': r.total_assignments,
      'Baca Materi': r.total_material_reads,
      'Total Aktivitas': r.total_activities,
      'Partisipasi': r.participation_rate + '%',
      'Rata-rata Nilai': parseFloat(r.avg_score).toFixed(2)
    })));
    
    // Cek detail untuk kelas yang punya submission
    console.log('\n=== Detail Kelas dengan Submission Tugas ===\n');
    const [classesWithSubmissions] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT asub.id) as total_submissions,
        COUNT(DISTINCT asub.student_id) as unique_students,
        COUNT(DISTINCT u.id) as total_students,
        ROUND((COUNT(DISTINCT asub.student_id) / COUNT(DISTINCT u.id)) * 100) as submission_rate
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING total_submissions > 0
      ORDER BY submission_rate DESC, total_submissions DESC
    `, { startDate, endDate });
    
    console.table(classesWithSubmissions);
    
    // Verify X TKJ 2
    console.log('\n=== Verify X TKJ 2 ===\n');
    const [tkj2] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_exams,
        COUNT(DISTINCT asub.id) as total_assignments,
        COUNT(DISTINCT mr.id) as total_material_reads,
        (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub.id) + COUNT(DISTINCT mr.id)) as total_activities,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 THEN 
            ROUND(((COUNT(DISTINCT at.student_id) + COUNT(DISTINCT asub.student_id) + COUNT(DISTINCT mr.student_id)) / (COUNT(DISTINCT u.id) * 3)) * 100)
          ELSE 0 
        END as participation_rate
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      WHERE c.name = 'X TKJ 2'
      GROUP BY c.id, c.name
    `, { startDate, endDate });
    
    if (tkj2.length > 0) {
      console.table(tkj2);
    } else {
      console.log('X TKJ 2 tidak ditemukan atau tidak ada aktivitas');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
