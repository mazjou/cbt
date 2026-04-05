const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lms_smk',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function testBulkReset() {
  try {
    console.log('🧪 Testing Bulk Reset Setup...\n');
    
    // Check if attempts table exists and has data
    console.log('1. Checking attempts table...');
    const [attempts] = await pool.query(`
      SELECT a.id, a.score, a.status, 
             e.title AS exam_title, 
             u.full_name AS student_name,
             t.full_name AS teacher_name
      FROM attempts a
      JOIN exams e ON e.id = a.exam_id
      JOIN users u ON u.id = a.student_id
      JOIN users t ON t.id = e.teacher_id
      LIMIT 10;
    `);
    
    if (attempts.length === 0) {
      console.log('❌ No attempts found in database');
      console.log('   Create some test attempts first by having students take exams');
      return;
    }
    
    console.log(`✅ Found ${attempts.length} attempts (showing max 10):`);
    attempts.forEach((attempt, index) => {
      console.log(`   ${index + 1}. ID: ${attempt.id} | ${attempt.student_name} | ${attempt.exam_title} | Score: ${attempt.score} | Teacher: ${attempt.teacher_name}`);
    });
    
    // Check teachers and their exams
    console.log('\n2. Checking teachers and their exams...');
    const [teachers] = await pool.query(`
      SELECT u.id, u.full_name, u.username,
             COUNT(e.id) as exam_count,
             COUNT(a.id) as attempt_count
      FROM users u
      LEFT JOIN exams e ON e.teacher_id = u.id
      LEFT JOIN attempts a ON a.exam_id = e.id
      WHERE u.role = 'TEACHER'
      GROUP BY u.id, u.full_name, u.username
      HAVING exam_count > 0
      ORDER BY attempt_count DESC
      LIMIT 5;
    `);
    
    if (teachers.length === 0) {
      console.log('❌ No teachers with exams found');
      return;
    }
    
    console.log(`✅ Found ${teachers.length} teachers with exams:`);
    teachers.forEach((teacher, index) => {
      console.log(`   ${index + 1}. ${teacher.full_name} (${teacher.username}) | ${teacher.exam_count} exams | ${teacher.attempt_count} attempts`);
    });
    
    // Test data for bulk reset
    console.log('\n3. Sample data for testing bulk reset...');
    const sampleTeacher = teachers[0];
    
    const [teacherAttempts] = await pool.query(`
      SELECT a.id, a.score, a.status,
             e.title AS exam_title,
             u.full_name AS student_name
      FROM attempts a
      JOIN exams e ON e.id = a.exam_id
      JOIN users u ON u.id = a.student_id
      WHERE e.teacher_id = ?
      LIMIT 5;
    `, [sampleTeacher.id]);
    
    if (teacherAttempts.length === 0) {
      console.log(`❌ No attempts found for teacher ${sampleTeacher.full_name}`);
      return;
    }
    
    console.log(`✅ Sample attempts for teacher ${sampleTeacher.full_name}:`);
    teacherAttempts.forEach((attempt, index) => {
      console.log(`   ${index + 1}. ID: ${attempt.id} | ${attempt.student_name} | ${attempt.exam_title} | Score: ${attempt.score}`);
    });
    
    // Test URLs
    console.log('\n4. Test URLs for bulk reset...');
    console.log(`📝 Teacher grades page: /teacher/grades`);
    console.log(`📝 Admin grades page: /admin/grades`);
    console.log(`📝 Teacher bulk reset: POST /teacher/attempts/bulk-reset`);
    console.log(`📝 Admin bulk reset: POST /admin/attempts/bulk-reset`);
    
    // Test form data format
    console.log('\n5. Expected form data format...');
    const sampleIds = teacherAttempts.slice(0, 3).map(a => a.id);
    console.log('Form data should contain:');
    console.log(`attempt_ids[]: [${sampleIds.join(', ')}]`);
    
    console.log('\n6. JavaScript test...');
    console.log('In browser console, you can test:');
    console.log(`document.querySelectorAll('.attempt-checkbox').length`);
    console.log(`document.querySelectorAll('.attempt-checkbox:checked').length`);
    
    console.log('\n✅ Bulk reset setup looks good!');
    console.log('💡 To test:');
    console.log('   1. Login as teacher or admin');
    console.log('   2. Go to grades page');
    console.log('   3. Check some checkboxes');
    console.log('   4. Click "Reset Nilai Terpilih"');
    console.log('   5. Check browser console and server logs for debug info');
    
  } catch (error) {
    console.error('❌ Error testing bulk reset:', error.message);
  } finally {
    await pool.end();
  }
}

testBulkReset();