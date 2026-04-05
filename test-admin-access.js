const pool = require('./src/db/pool');

async function testAdminAccess() {
  console.log('=== Testing Admin Access to Exams ===');
  
  try {
    // Test 1: Check if admin routes are properly configured
    console.log('\n1. Checking admin exam route data...');
    
    // Simulate the same query as admin exam route
    const page = 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    // Get filter options (same as route)
    const [subjects] = await pool.query(`SELECT id, code, name FROM subjects ORDER BY name ASC;`);
    const [teachers] = await pool.query(`SELECT id, username, full_name FROM users WHERE role='TEACHER' ORDER BY full_name ASC;`);
    const [classes] = await pool.query(`SELECT id, code, name FROM classes ORDER BY name ASC;`);
    
    console.log(`Found ${subjects.length} subjects, ${teachers.length} teachers, ${classes.length} classes`);
    
    // Get total count (same as route)
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM exams e`);
    console.log(`Total exams in database: ${total}`);
    
    // Get paginated exams with related data (same as route)
    const [exams] = await pool.query(
      `SELECT 
        e.id, e.title, e.description, e.start_at, e.end_at, 
        e.duration_minutes, e.is_published, e.created_at, e.class_id,
        s.name AS subject_name, s.code AS subject_code,
        u.full_name AS teacher_name,
        c.name AS class_name,
        (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) AS question_count,
        (SELECT COUNT(*) FROM attempts WHERE exam_id = e.id) AS attempt_count,
        (SELECT COUNT(DISTINCT student_id) FROM attempts WHERE exam_id = e.id) AS participant_count,
        (SELECT COUNT(*) FROM users WHERE role='STUDENT' AND (e.class_id IS NULL OR class_id = e.class_id)) AS total_students
       FROM exams e
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = e.teacher_id
       LEFT JOIN classes c ON c.id = e.class_id
       ORDER BY e.created_at DESC
       LIMIT :limit OFFSET :offset;`,
      { limit, offset }
    );
    
    console.log(`\nFound ${exams.length} exams for admin view:`);
    exams.forEach((exam, index) => {
      const participation = exam.total_students > 0 ? Math.round((exam.participant_count / exam.total_students) * 100) : 0;
      console.log(`${index + 1}. ${exam.title}`);
      console.log(`   - Subject: ${exam.subject_name || 'N/A'}`);
      console.log(`   - Teacher: ${exam.teacher_name || 'N/A'}`);
      console.log(`   - Questions: ${exam.question_count}`);
      console.log(`   - Participants: ${exam.participant_count}/${exam.total_students} (${participation}%)`);
      console.log(`   - Status: ${exam.is_published ? 'Published' : 'Draft'}`);
      console.log('');
    });
    
    // Test 2: Check admin user and role
    console.log('2. Checking admin user access...');
    const [adminUsers] = await pool.query(`SELECT id, username, full_name, role FROM users WHERE role = 'ADMIN';`);
    console.log(`Found ${adminUsers.length} admin users:`);
    adminUsers.forEach(admin => {
      console.log(`- ${admin.username} (${admin.full_name})`);
    });
    
    // Test 3: Check if admin exam view file exists
    const fs = require('fs');
    const path = require('path');
    
    console.log('\n3. Checking admin view files...');
    const viewFiles = [
      'src/views/admin/exams.ejs',
      'src/views/admin/exam_new.ejs', 
      'src/views/admin/exam_edit.ejs',
      'src/views/admin/exam_detail.ejs'
    ];
    
    viewFiles.forEach(file => {
      const exists = fs.existsSync(path.join(__dirname, file));
      console.log(`${file}: ${exists ? '✅ EXISTS' : '❌ MISSING'}`);
    });
    
    console.log('\n=== Admin Access Test Complete ===');
    console.log('\n📋 INSTRUCTIONS FOR ACCESS:');
    console.log('1. Login as admin user');
    console.log('2. Go to admin dashboard: /admin');
    console.log('3. Click on "Ujian" card (red card)');
    console.log('4. Or directly access: /admin/exams');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testAdminAccess();