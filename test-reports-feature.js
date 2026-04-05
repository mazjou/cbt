// Test script untuk fitur laporan rekap LMS
const pool = require('./src/db/pool');

async function testReportsFeature() {
  console.log('🧪 Testing Reports Feature...\n');
  
  try {
    // 1. Test database connection
    console.log('1. Testing database connection...');
    const [result] = await pool.query('SELECT 1 as test');
    console.log('✅ Database connection OK\n');
    
    // 2. Check required tables
    console.log('2. Checking required tables...');
    const requiredTables = ['users', 'exams', 'materials', 'assignments', 'attempts', 'material_reads', 'assignment_submissions', 'classes', 'subjects'];
    
    for (const table of requiredTables) {
      try {
        const [tables] = await pool.query(`SHOW TABLES LIKE '${table}';`);
        if (tables.length > 0) {
          console.log(`✅ Table ${table} exists`);
        } else {
          console.log(`⚠️  Table ${table} not found`);
        }
      } catch (e) {
        console.log(`❌ Error checking table ${table}: ${e.message}`);
      }
    }
    console.log('');
    
    // 3. Test summary statistics query
    console.log('3. Testing summary statistics...');
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];
    
    const [[summaryRow]] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM exams WHERE created_at BETWEEN ? AND ?) as total_exams,
        (SELECT COUNT(*) FROM materials WHERE created_at BETWEEN ? AND ?) as total_materials,
        (SELECT COUNT(*) FROM assignments WHERE created_at BETWEEN ? AND ?) as total_assignments,
        (SELECT COUNT(*) FROM attempts WHERE created_at BETWEEN ? AND ?) as total_attempts,
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active = 1) as total_students,
        (SELECT COUNT(*) FROM users WHERE role = 'TEACHER' AND is_active = 1) as total_teachers
    `, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log('Summary Statistics:');
    console.log(`   - Total Exams: ${summaryRow.total_exams}`);
    console.log(`   - Total Materials: ${summaryRow.total_materials}`);
    console.log(`   - Total Assignments: ${summaryRow.total_assignments}`);
    console.log(`   - Total Attempts: ${summaryRow.total_attempts}`);
    console.log(`   - Total Students: ${summaryRow.total_students}`);
    console.log(`   - Total Teachers: ${summaryRow.total_teachers}`);
    console.log('✅ Summary statistics query OK\n');
    
    // 4. Test active teachers query
    console.log('4. Testing active teachers query...');
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
      LIMIT 5
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log(`Found ${activeTeachers.length} active teachers:`);
    activeTeachers.forEach((teacher, index) => {
      console.log(`   ${index + 1}. ${teacher.full_name} - Score: ${teacher.activity_score} (${teacher.total_exams} ujian, ${teacher.total_materials} materi, ${teacher.total_assignments} tugas)`);
    });
    console.log('✅ Active teachers query OK\n');
    
    // 5. Test active students query
    console.log('5. Testing active students query...');
    const [activeStudents] = await pool.query(`
      SELECT 
        u.id, u.full_name, c.name as class_name,
        COUNT(DISTINCT at.id) as total_attempts,
        COUNT(DISTINCT asub.id) as total_submissions,
        (COUNT(DISTINCT at.id) * 3 + COUNT(DISTINCT asub.id) * 2) as activity_score
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at BETWEEN ? AND ?
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at BETWEEN ? AND ?
      WHERE u.role = 'STUDENT' AND u.is_active = 1
      GROUP BY u.id, u.full_name, c.name
      HAVING activity_score > 0
      ORDER BY activity_score DESC, u.full_name ASC
      LIMIT 5
    `, [startDate, endDate, startDate, endDate]);
    
    console.log(`Found ${activeStudents.length} active students:`);
    activeStudents.forEach((student, index) => {
      console.log(`   ${index + 1}. ${student.full_name} (${student.class_name || 'Tanpa Kelas'}) - Score: ${student.activity_score} (${student.total_attempts} ujian, ${student.total_submissions} tugas)`);
    });
    console.log('✅ Active students query OK\n');
    
    // 6. Test active classes query
    console.log('6. Testing active classes query...');
    const [activeClasses] = await pool.query(`
      SELECT 
        c.id, c.name as class_name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT at.id) as total_attempts,
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
      LIMIT 5
    `, [startDate, endDate]);
    
    console.log(`Found ${activeClasses.length} active classes:`);
    activeClasses.forEach((classData, index) => {
      console.log(`   ${index + 1}. ${classData.class_name} - ${classData.total_students} siswa, ${classData.total_attempts} ujian, ${classData.participation_rate}% partisipasi`);
    });
    console.log('✅ Active classes query OK\n');
    
    // 7. Test popular subjects query
    console.log('7. Testing popular subjects query...');
    const [popularSubjects] = await pool.query(`
      SELECT 
        s.id, s.name as subject_name,
        COUNT(DISTINCT e.id) as total_exams,
        COUNT(DISTINCT m.id) as total_materials,
        COUNT(DISTINCT at.id) as total_attempts
      FROM subjects s
      LEFT JOIN exams e ON e.subject_id = s.id AND e.created_at BETWEEN ? AND ?
      LEFT JOIN materials m ON m.subject_id = s.id AND m.created_at BETWEEN ? AND ?
      LEFT JOIN attempts at ON at.exam_id = e.id AND at.created_at BETWEEN ? AND ?
      GROUP BY s.id, s.name
      HAVING (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) > 0
      ORDER BY (COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT at.id)) DESC
      LIMIT 5
    `, [startDate, endDate, startDate, endDate, startDate, endDate]);
    
    console.log(`Found ${popularSubjects.length} popular subjects:`);
    popularSubjects.forEach((subject, index) => {
      console.log(`   ${index + 1}. ${subject.subject_name} - ${subject.total_exams} ujian, ${subject.total_materials} materi, ${subject.total_attempts} percobaan`);
    });
    console.log('✅ Popular subjects query OK\n');
    
    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Manual Testing Steps:');
    console.log('1. Login as admin and go to /admin');
    console.log('2. Click "Rekap Penggunaan LMS" card');
    console.log('3. Verify all statistics are displayed correctly');
    console.log('4. Test date filters and quick period selection');
    console.log('5. Test Excel export functionality');
    console.log('6. Verify responsive design on mobile');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run the test
testReportsFeature();