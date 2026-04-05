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
    queueLimit: 0
  });

  try {
    console.log('=== Cek Semua Submission dari Siswa X TKJ 2 ===\n');
    
    const [submissions] = await pool.query(`
      SELECT 
        a.id as assignment_id,
        a.title as assignment_title,
        c.name as assignment_class,
        COUNT(DISTINCT asub.id) as total_submissions,
        COUNT(DISTINCT asub.student_id) as unique_students,
        (SELECT COUNT(*) FROM users WHERE class_id = 7 AND role = 'student' AND is_active = 1) as total_tkj2_students,
        ROUND((COUNT(DISTINCT asub.student_id) / (SELECT COUNT(*) FROM users WHERE class_id = 7 AND role = 'student' AND is_active = 1)) * 100) as percentage
      FROM assignments a
      LEFT JOIN classes c ON c.id = a.class_id
      LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id
      WHERE asub.student_id IN (SELECT id FROM users WHERE class_id = 7 AND role = 'student')
      GROUP BY a.id, a.title, c.name
      ORDER BY percentage DESC, a.created_at DESC
    `);
    
    console.table(submissions);
    
    if (submissions.length === 0) {
      console.log('\nTidak ada submission dari siswa X TKJ 2');
      
      console.log('\n=== Cek Siswa X TKJ 2 ===\n');
      const [students] = await pool.query(`
        SELECT id, username, full_name, class_id
        FROM users
        WHERE class_id = 7 AND role = 'student' AND is_active = 1
        LIMIT 10
      `);
      console.table(students);
    } else {
      console.log('\n=== Detail Submission per Tugas ===\n');
      for (const sub of submissions) {
        console.log(`\nTugas: ${sub.assignment_title} (${sub.assignment_class})`);
        console.log(`Persentase: ${sub.percentage}%`);
        
        const [details] = await pool.query(`
          SELECT 
            u.full_name as student_name,
            asub.submitted_at,
            asub.score
          FROM assignment_submissions asub
          JOIN users u ON u.id = asub.student_id
          WHERE asub.assignment_id = ? AND u.class_id = 7
          ORDER BY asub.submitted_at DESC
          LIMIT 10
        `, [sub.assignment_id]);
        
        console.table(details);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
