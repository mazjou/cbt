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
    console.log('=== Struktur Tabel assignment_submissions ===\n');
    const [columns] = await pool.query('DESCRIBE assignment_submissions');
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type})`);
    });
    
    console.log('\n=== Sample Data ===\n');
    const [sample] = await pool.query(`
      SELECT id, student_id, assignment_id, created_at, submitted_at, updated_at
      FROM assignment_submissions 
      ORDER BY id DESC
      LIMIT 5
    `);
    console.table(sample);
    
    console.log('\n=== Cek Data Kelas X TKJ 2 ===\n');
    const [tkj2Data] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT asub.id) as total_submissions,
        COUNT(DISTINCT asub.student_id) as unique_students_submitted
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id
      WHERE c.name LIKE '%TKJ 2%'
      GROUP BY c.id, c.name
    `);
    console.table(tkj2Data);
    
    console.log('\n=== Cek dengan Filter Tanggal (30 hari terakhir) ===\n');
    const [tkj2DateFiltered] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT asub.id) as submissions_created_at,
        COUNT(DISTINCT asub2.id) as submissions_submitted_at
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id 
        AND asub.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      LEFT JOIN assignment_submissions asub2 ON asub2.student_id = u.id 
        AND asub2.submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      WHERE c.name LIKE '%TKJ 2%'
      GROUP BY c.id, c.name
    `);
    console.table(tkj2DateFiltered);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();
