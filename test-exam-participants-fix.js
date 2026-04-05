// Script untuk test perbaikan perhitungan siswa ujian
// Jalankan: node test-exam-participants-fix.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testExamParticipantsFix() {
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
    console.log('🧪 Testing Exam Participants Fix...\n');

    // Test dengan ujian yang menggunakan exam_classes
    const examId = 28; // Test 10 TKJ 3
    console.log(`🎯 Testing Exam ID: ${examId}\n`);

    // 1. Cek apakah ujian menggunakan exam_classes
    const [examClassesCount] = await pool.query(
      `SELECT COUNT(*) as count FROM exam_classes WHERE exam_id = :exam_id`,
      { exam_id: examId }
    );

    console.log(`📊 Exam Classes Count: ${examClassesCount[0].count}`);

    // 2. Test query baru untuk total siswa
    let totalStudentsQuery;
    let queryParams = { exam_id: examId };
    
    if (examClassesCount[0].count > 0) {
      console.log('✅ Using NEW exam_classes system');
      totalStudentsQuery = `
        SELECT COUNT(DISTINCT u.id) as total 
        FROM users u
        INNER JOIN exam_classes ec ON ec.class_id = u.class_id
        WHERE u.role = 'STUDENT' 
        AND u.is_active = 1 
        AND ec.exam_id = :exam_id
      `;
    } else {
      console.log('⚠️  Using OLD class_id system');
      totalStudentsQuery = `
        SELECT COUNT(*) as total 
        FROM users 
        WHERE role = 'STUDENT' 
        AND is_active = 1
      `;
    }

    const [[totalStudentsResult]] = await pool.query(totalStudentsQuery, queryParams);
    console.log(`🎯 Target Students: ${totalStudentsResult.total}`);

    // 3. Cek siswa yang sudah mengerjakan
    const [[completedResult]] = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as completed FROM attempts WHERE exam_id = :exam_id`,
      { exam_id: examId }
    );
    console.log(`✅ Completed: ${completedResult.completed}`);

    // 4. Hitung yang belum mengerjakan
    const notCompleted = totalStudentsResult.total - completedResult.completed;
    console.log(`❌ Not Completed: ${notCompleted}`);

    // 5. Hitung persentase
    const completedPercentage = totalStudentsResult.total > 0 ? 
      Math.round((completedResult.completed / totalStudentsResult.total) * 100) : 0;
    const notCompletedPercentage = 100 - completedPercentage;

    console.log(`📈 Completed Percentage: ${completedPercentage}%`);
    console.log(`📉 Not Completed Percentage: ${notCompletedPercentage}%`);

    // 6. Test query untuk daftar siswa yang belum mengerjakan
    let notCompletedStudentsQuery;
    if (examClassesCount[0].count > 0) {
      notCompletedStudentsQuery = `
        SELECT u.id, u.username, u.full_name, c.name as class_name
        FROM users u
        INNER JOIN exam_classes ec ON ec.class_id = u.class_id
        LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.role='STUDENT' AND u.is_active = 1 AND ec.exam_id = :exam_id
        AND u.id NOT IN (SELECT DISTINCT student_id FROM attempts WHERE exam_id = :exam_id)
        ORDER BY u.full_name ASC
        LIMIT 5
      `;
    } else {
      notCompletedStudentsQuery = `
        SELECT u.id, u.username, u.full_name, c.name as class_name
        FROM users u
        LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.role='STUDENT' AND u.is_active = 1
        AND u.id NOT IN (SELECT DISTINCT student_id FROM attempts WHERE exam_id = :exam_id)
        ORDER BY u.full_name ASC
        LIMIT 5
      `;
    }

    const [notCompletedStudents] = await pool.query(notCompletedStudentsQuery, queryParams);
    
    console.log(`\n👥 Sample Students Not Completed (${notCompletedStudents.length} shown):`);
    console.log('─'.repeat(60));
    notCompletedStudents.forEach(student => {
      console.log(`- ${student.full_name} (${student.class_name || 'No Class'})`);
    });

    // 7. Bandingkan dengan perhitungan lama
    const [oldCalculation] = await pool.query(`
      SELECT COUNT(*) as total FROM users WHERE role='STUDENT' AND is_active = 1
    `);
    
    const oldNotCompleted = oldCalculation[0].total - completedResult.completed;
    
    console.log('\n📊 COMPARISON:');
    console.log('─'.repeat(50));
    console.log(`❌ OLD Calculation: ${oldNotCompleted} not completed`);
    console.log(`✅ NEW Calculation: ${notCompleted} not completed`);
    console.log(`🎯 Difference: ${oldNotCompleted - notCompleted} students`);

    if (oldNotCompleted !== notCompleted) {
      console.log('\n🎉 SUCCESS: Fix is working correctly!');
      console.log('   The calculation now only includes target class students.');
    } else {
      console.log('\n⚠️  No difference detected. Check if exam uses exam_classes.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testExamParticipantsFix();