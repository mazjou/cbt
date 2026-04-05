// Debug script to test the reports route
const pool = require('./src/db/pool');

async function debugReportsError() {
  console.log('🔍 Debugging Reports Error...\n');
  
  try {
    // Test the exact same queries as in the route
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    
    console.log(`Testing with dates: ${startDate} to ${endDate}\n`);
    
    // Test summary query
    console.log('1. Testing summary query...');
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
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active = 1) as total_students
    `, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log('✅ Summary query OK');
    console.log('Summary data:', summaryRow);
    
    const summary = {
      total_exams: summaryRow.total_exams || 0,
      total_materials: summaryRow.total_materials || 0,
      total_assignments: summaryRow.total_assignments || 0,
      total_attempts: summaryRow.total_attempts || 0,
      avg_score: summaryRow.avg_score || 0,
      pass_rate: summaryRow.total_attempts > 0 ? Math.round((summaryRow.passed_attempts / summaryRow.total_attempts) * 100) : 0,
      total_material_reads: summaryRow.total_material_reads || 0,
      avg_reads_per_material: summaryRow.total_materials > 0 ? (summaryRow.total_material_reads / summaryRow.total_materials) : 0,
      total_submissions: summaryRow.total_submissions || 0,
      submission_rate: summaryRow.total_assignments > 0 ? Math.round((summaryRow.total_submissions / summaryRow.total_assignments) * 100) : 0,
      student_participation: summaryRow.total_students > 0 ? Math.round((summaryRow.active_students / summaryRow.total_students) * 100) : 0
    };
    
    console.log('\n2. Testing active teachers query...');
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
      WHERE u.role = 'TEACHER' AND u.is_active = 1
      GROUP BY u.id, u.full_name
      HAVING activity_score > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log(`✅ Active teachers query OK (${activeTeachers.length} found)`);
    
    console.log('\n3. Testing active students query...');
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
      WHERE u.role = 'STUDENT' AND u.is_active = 1
      GROUP BY u.id, u.full_name, c.name
      HAVING activity_score > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 10
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log(`✅ Active students query OK (${activeStudents.length} found)`);
    
    console.log('\n4. Testing active classes query...');
    const [activeClasses] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_attempts,
        COALESCE(AVG(at.score), 0) as avg_score,
        CASE 
          WHEN COUNT(DISTINCT u.id) > 0 THEN 
            ROUND((COUNT(DISTINCT at.student_id) / COUNT(DISTINCT u.id)) * 100)
          ELSE 0 
        END as participation_rate
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT' AND u.is_active = 1
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN ? AND ?
      GROUP BY c.id, c.name
      HAVING total_students > 0
      ORDER BY participation_rate DESC, total_attempts DESC, c.name ASC
    `, [startDate, endDate]);
    
    console.log(`✅ Active classes query OK (${activeClasses.length} found)`);
    
    console.log('\n5. Testing popular subjects query...');
    const [popularSubjects] = await pool.query(`
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
    
    console.log(`✅ Popular subjects query OK (${popularSubjects.length} found)`);
    
    console.log('\n6. Testing data structure for template...');
    const templateData = {
      title: 'Rekap Penggunaan LMS',
      filters: { start_date: startDate, end_date: endDate },
      summary,
      activeTeachers,
      activeStudents,
      activeClasses,
      popularSubjects
    };
    
    console.log('Template data structure:');
    console.log('- title:', templateData.title);
    console.log('- filters:', templateData.filters);
    console.log('- summary keys:', Object.keys(templateData.summary));
    console.log('- activeTeachers length:', templateData.activeTeachers.length);
    console.log('- activeStudents length:', templateData.activeStudents.length);
    console.log('- activeClasses length:', templateData.activeClasses.length);
    console.log('- popularSubjects length:', templateData.popularSubjects.length);
    
    console.log('\n🎉 All data queries work fine!');
    console.log('\n💡 The error might be in the EJS template or layout file.');
    console.log('Check if admin/reports.ejs exists and has proper syntax.');
    
  } catch (error) {
    console.error('❌ Error in debug:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run the debug
debugReportsError();