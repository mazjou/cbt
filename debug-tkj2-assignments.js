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
    console.log('=== Detail Kelas X TKJ 2 ===\n');
    
    // Get class info
    const [classInfo] = await pool.query(`
      SELECT id, name, 
        (SELECT COUNT(*) FROM users WHERE class_id = classes.id AND role = 'student' AND is_active = 1) as total_students
      FROM classes 
      WHERE name = 'X TKJ 2'
    `);
    
    if (classInfo.length === 0) {
      console.log('Kelas X TKJ 2 tidak ditemukan');
      return;
    }
    
    console.log('Info Kelas:');
    console.table(classInfo);
    const classId = classInfo[0].id;
    
    // Get all assignments for this class
    console.log('\n=== Daftar Tugas untuk Kelas X TKJ 2 ===\n');
    const [assignments] = await pool.query(`
      SELECT 
        a.id,
        a.title,
        a.class_id,
        a.created_at,
        a.due_date,
        COUNT(DISTINCT asub.id) as total_submissions,
        COUNT(DISTINCT asub.student_id) as unique_students
      FROM assignments a
      LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id
      WHERE a.class_id = ?
      GROUP BY a.id, a.title, a.class_id, a.created_at, a.due_date
      ORDER BY a.created_at DESC
    `, [classId]);
    
    console.table(assignments);
    
    // Get submission details for each assignment
    for (const assignment of assignments) {
      console.log(`\n=== Detail Submission Tugas: ${assignment.title} ===\n`);
      const [submissions] = await pool.query(`
        SELECT 
          asub.id,
          u.full_name as student_name,
          asub.submitted_at,
          asub.created_at,
          asub.score
        FROM assignment_submissions asub
        JOIN users u ON u.id = asub.student_id
        WHERE asub.assignment_id = ?
        ORDER BY asub.created_at DESC
      `, [assignment.id]);
      
      if (submissions.length > 0) {
        console.table(submissions);
      } else {
        console.log('Tidak ada submission');
      }
    }
    
    // Check query yang digunakan di reports
    console.log('\n=== Simulasi Query Reports (30 hari terakhir) ===\n');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    
    const [reportData] = await pool.query(`
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
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.submitted_at BETWEEN :startDate AND :endDate
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      WHERE c.name = 'X TKJ 2'
      GROUP BY c.id, c.name
    `, { startDate, endDate });
    
    console.table(reportData);
    
    // Try with created_at instead
    console.log('\n=== Simulasi Query dengan created_at (bukan submitted_at) ===\n');
    const [reportData2] = await pool.query(`
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
    
    console.table(reportData2);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
