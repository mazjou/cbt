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
    console.log('=== Debug Ranking Assignments dengan Multiple Classes ===\n');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    
    console.log(`Periode: ${startDate.toISOString().split('T')[0]} s/d ${endDate.toISOString().split('T')[0]}\n`);
    
    // 1. Cek assignment_submissions dengan assignment_classes
    console.log('1. Cek assignment_submissions dengan assignment_classes...');
    const [submissionsCheck] = await pool.query(`
      SELECT 
        a.id as assignment_id,
        a.title,
        ac.class_id,
        c.name as class_name,
        COUNT(asub.id) as submission_count
      FROM assignments a
      LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
      LEFT JOIN classes c ON c.id = ac.class_id
      LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id
      WHERE asub.created_at >= :startDate AND asub.created_at <= :endDate
      GROUP BY a.id, a.title, ac.class_id, c.name
      ORDER BY a.id DESC, c.name ASC
    `, { startDate, endDate });
    
    console.table(submissionsCheck);
    
    // 2. Query ranking kelas LAMA (sebelum fix)
    console.log('\n2. Query ranking kelas LAMA (mungkin tidak akurat)...');
    const [oldQuery] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_exams,
        COUNT(DISTINCT asub.id) as total_assignments,
        COUNT(DISTINCT mr.id) as total_material_reads,
        (COUNT(DISTINCT at.id) + COUNT(DISTINCT asub.id) + COUNT(DISTINCT mr.id)) as total_activities
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING total_students > 0 AND total_activities > 0
      ORDER BY total_activities DESC
      LIMIT 5
    `, { startDate, endDate });
    
    console.table(oldQuery);
    
    // 3. Query ranking kelas BARU (dengan assignment_classes)
    console.log('\n3. Query ranking kelas BARU (dengan assignment_classes)...');
    const [newQuery] = await pool.query(`
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
        AND EXISTS (SELECT 1 FROM assignment_classes ac WHERE ac.assignment_id = asub.assignment_id AND ac.class_id = c.id)
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING total_students > 0 AND total_activities > 0
      ORDER BY total_activities DESC, participation_rate DESC
      LIMIT 5
    `, { startDate, endDate });
    
    console.table(newQuery);
    
    // 4. Bandingkan hasil
    console.log('\n4. Perbandingan hasil...');
    console.log('Query LAMA vs BARU:');
    
    const comparison = [];
    for (const oldRow of oldQuery) {
      const newRow = newQuery.find(nr => nr.id === oldRow.id);
      if (newRow) {
        comparison.push({
          class_name: oldRow.class_name,
          old_assignments: oldRow.total_assignments,
          new_assignments: newRow.total_assignments,
          difference: newRow.total_assignments - oldRow.total_assignments,
          old_activities: oldRow.total_activities,
          new_activities: newRow.total_activities
        });
      }
    }
    
    console.table(comparison);
    
    // 5. Cek assignment yang tidak ter-link ke kelas
    console.log('\n5. Cek assignment yang tidak ter-link ke assignment_classes...');
    const [orphanAssignments] = await pool.query(`
      SELECT 
        a.id,
        a.title,
        a.class_id as old_class_id,
        c.name as old_class_name,
        COUNT(ac.id) as linked_classes
      FROM assignments a
      LEFT JOIN classes c ON c.id = a.class_id
      LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
      GROUP BY a.id, a.title, a.class_id, c.name
      HAVING linked_classes = 0
      ORDER BY a.id DESC
    `);
    
    if (orphanAssignments.length > 0) {
      console.log('❌ Found assignments not linked to assignment_classes:');
      console.table(orphanAssignments);
    } else {
      console.log('✓ All assignments are properly linked to assignment_classes');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();