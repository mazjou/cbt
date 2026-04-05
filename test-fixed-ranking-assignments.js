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
    console.log('=== Test Fixed Ranking Assignments Query ===\n');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    
    console.log(`Periode: ${startDate.toISOString().split('T')[0]} s/d ${endDate.toISOString().split('T')[0]}\n`);
    
    // Test query yang sudah diperbaiki
    console.log('Query ranking kelas FIXED (dengan assignment_classes subquery)...');
    const [fixedQuery] = await pool.query(`
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
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN :startDate AND :endDate
      LEFT JOIN (
        SELECT asub.*, ac.class_id as target_class_id
        FROM assignment_submissions asub
        INNER JOIN assignment_classes ac ON ac.assignment_id = asub.assignment_id
        WHERE asub.created_at BETWEEN :startDate AND :endDate
      ) asub_filtered ON asub_filtered.student_id = u.id AND asub_filtered.target_class_id = c.id
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING total_students > 0 AND total_activities > 0
      ORDER BY total_activities DESC, participation_rate DESC, c.name ASC
      LIMIT 10
    `, { startDate, endDate });
    
    console.table(fixedQuery.map(r => ({
      Kelas: r.class_name,
      'Total Siswa': r.total_students,
      'Ujian': r.total_exams,
      'Tugas': r.total_assignments,
      'Baca Materi': r.total_material_reads,
      'Total Aktivitas': r.total_activities,
      'Partisipasi': r.participation_rate + '%'
    })));
    
    // Bandingkan dengan query lama
    console.log('\n=== Perbandingan dengan Query Lama ===\n');
    const [oldQuery] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT asub.id) as old_total_assignments
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'student' AND u.is_active = 1
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name
      HAVING old_total_assignments > 0
      ORDER BY old_total_assignments DESC
    `, { startDate, endDate });
    
    console.log('Perbandingan assignment count:');
    const comparison = [];
    for (const fixed of fixedQuery) {
      const old = oldQuery.find(o => o.id === fixed.id);
      comparison.push({
        class_name: fixed.class_name,
        old_assignments: old ? old.old_total_assignments : 0,
        new_assignments: fixed.total_assignments,
        difference: fixed.total_assignments - (old ? old.old_total_assignments : 0),
        status: fixed.total_assignments === (old ? old.old_total_assignments : 0) ? '✓ Same' : '⚠ Different'
      });
    }
    
    console.table(comparison);
    
    // Detail breakdown per kelas
    console.log('\n=== Detail Breakdown Assignment Submissions ===\n');
    const [detailBreakdown] = await pool.query(`
      SELECT 
        c.name as class_name,
        a.title as assignment_title,
        COUNT(asub.id) as submission_count,
        GROUP_CONCAT(DISTINCT u.full_name ORDER BY u.full_name SEPARATOR ', ') as students_submitted
      FROM classes c
      INNER JOIN assignment_classes ac ON ac.class_id = c.id
      INNER JOIN assignments a ON a.id = ac.assignment_id
      LEFT JOIN assignment_submissions asub ON asub.assignment_id = a.id
      LEFT JOIN users u ON u.id = asub.student_id AND u.class_id = c.id
      WHERE asub.created_at BETWEEN :startDate AND :endDate
      GROUP BY c.id, c.name, a.id, a.title
      HAVING submission_count > 0
      ORDER BY c.name, a.title
    `, { startDate, endDate });
    
    console.table(detailBreakdown);
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();