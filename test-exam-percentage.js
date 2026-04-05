// Script untuk test kolom persentase pengerjaan ujian
// Jalankan: node test-exam-percentage.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testExamPercentage() {
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
    console.log('🧪 Testing Exam Percentage Feature...\n');

    // Simulate the same query as in teacher route
    const teacherId = 103; // Example teacher ID
    const [exams] = await pool.query(
      `SELECT e.*, s.name AS subject_name,
              (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,
              (SELECT GROUP_CONCAT(c.name SEPARATOR ', ') 
               FROM exam_classes ec 
               JOIN classes c ON c.id=ec.class_id 
               WHERE ec.exam_id=e.id) AS class_names
       FROM exams e
       JOIN subjects s ON s.id=e.subject_id
       WHERE e.teacher_id=:tid
       ORDER BY e.id DESC
       LIMIT 5`,
      { tid: teacherId }
    );

    console.log(`📋 Found ${exams.length} exams for teacher ID ${teacherId}\n`);

    // Calculate participation percentage for each exam
    for (let exam of exams) {
      console.log(`🎯 Processing: "${exam.title}" (ID: ${exam.id})`);
      
      // Check if exam uses exam_classes system
      const [examClassesCount] = await pool.query(
        `SELECT COUNT(*) as count FROM exam_classes WHERE exam_id = ?`,
        [exam.id]
      );

      let totalStudentsQuery;
      let queryParams = [exam.id];

      if (examClassesCount[0].count > 0) {
        console.log('   ✅ Using exam_classes system');
        totalStudentsQuery = `
          SELECT COUNT(DISTINCT u.id) as total 
          FROM users u
          INNER JOIN exam_classes ec ON ec.class_id = u.class_id
          WHERE u.role = 'STUDENT' 
          AND u.is_active = 1 
          AND ec.exam_id = ?
        `;
      } else if (exam.class_id) {
        console.log('   ⚠️  Using old class_id system');
        totalStudentsQuery = `
          SELECT COUNT(*) as total 
          FROM users 
          WHERE role = 'STUDENT' 
          AND is_active = 1 
          AND class_id = ?
        `;
        queryParams = [exam.class_id];
      } else {
        console.log('   📢 Exam for all classes');
        totalStudentsQuery = `
          SELECT COUNT(*) as total 
          FROM users 
          WHERE role = 'STUDENT' 
          AND is_active = 1
        `;
        queryParams = [];
      }

      const [[totalStudentsResult]] = await pool.query(totalStudentsQuery, queryParams);
      const [[completedResult]] = await pool.query(
        `SELECT COUNT(DISTINCT student_id) as completed FROM attempts WHERE exam_id = ?`,
        [exam.id]
      );

      exam.total_students = totalStudentsResult.total || 0;
      exam.completed_count = completedResult.completed || 0;
      exam.participation_percentage = exam.total_students > 0 ? 
        Math.round((exam.completed_count / exam.total_students) * 100) : 0;

      console.log(`   📊 Target Students: ${exam.total_students}`);
      console.log(`   ✅ Completed: ${exam.completed_count}`);
      console.log(`   📈 Percentage: ${exam.participation_percentage}%`);
      console.log(`   🎨 Color: ${exam.participation_percentage >= 80 ? 'GREEN' : exam.participation_percentage >= 50 ? 'AMBER' : 'GRAY'}`);
      console.log('');
    }

    // Display summary table
    console.log('📊 SUMMARY TABLE:');
    console.log('─'.repeat(100));
    console.log('ID'.padEnd(5) + 'TITLE'.padEnd(30) + 'TARGET'.padEnd(8) + 'DONE'.padEnd(6) + 'PERCENTAGE'.padEnd(12) + 'STATUS');
    console.log('─'.repeat(100));
    
    exams.forEach(exam => {
      const title = exam.title.length > 28 ? exam.title.substring(0, 25) + '...' : exam.title;
      const status = exam.participation_percentage >= 80 ? '🟢 HIGH' : 
                    exam.participation_percentage >= 50 ? '🟡 MED' : '🔴 LOW';
      
      console.log(
        exam.id.toString().padEnd(5) +
        title.padEnd(30) +
        exam.total_students.toString().padEnd(8) +
        exam.completed_count.toString().padEnd(6) +
        `${exam.participation_percentage}%`.padEnd(12) +
        status
      );
    });

    console.log('\n🎯 FEATURE BENEFITS:');
    console.log('─'.repeat(50));
    console.log('✅ Visual progress bar for quick overview');
    console.log('✅ Color coding: Green (≥80%), Amber (≥50%), Gray (<50%)');
    console.log('✅ Exact numbers: completed/total students');
    console.log('✅ Accurate calculation based on target classes');
    console.log('✅ Works with both old and new class systems');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testExamPercentage();