// Script untuk debug masalah perhitungan siswa yang belum mengerjakan
// Jalankan: node debug-exam-participants.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function debugExamParticipants() {
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
    console.log('🔍 Debug: Exam Participants Calculation\n');

    // Ambil ujian yang sedang dilihat (contoh ujian dengan banyak "belum mengerjakan")
    const [exams] = await pool.query(`
      SELECT 
        e.id,
        e.title,
        e.class_id as old_class_id,
        u.full_name as teacher_name
      FROM exams e
      JOIN users u ON u.id = e.teacher_id
      WHERE e.is_published = 1
      ORDER BY e.created_at DESC
      LIMIT 5
    `);

    console.log('📋 Recent Published Exams:');
    console.log('─'.repeat(60));
    exams.forEach(exam => {
      console.log(`ID: ${exam.id} | ${exam.title}`);
      console.log(`   Teacher: ${exam.teacher_name}`);
      console.log(`   Old Class ID: ${exam.old_class_id || 'NULL (uses exam_classes)'}`);
      console.log('');
    });

    // Pilih ujian pertama untuk analisis detail
    if (exams.length === 0) {
      console.log('❌ Tidak ada ujian published untuk dianalisis');
      return;
    }

    const examId = exams[0].id;
    const examTitle = exams[0].title;
    
    console.log(`🎯 Analyzing Exam: "${examTitle}" (ID: ${examId})\n`);

    // 1. Cek exam_classes (kelas yang ditargetkan)
    const [examClasses] = await pool.query(`
      SELECT 
        ec.class_id,
        c.name as class_name
      FROM exam_classes ec
      JOIN classes c ON c.id = ec.class_id
      WHERE ec.exam_id = :exam_id
    `, { exam_id: examId });

    console.log('🎯 Target Classes (exam_classes):');
    console.log('─'.repeat(40));
    if (examClasses.length === 0) {
      console.log('❌ Tidak ada kelas yang ditargetkan di exam_classes!');
      console.log('   Ini mungkin penyebab masalahnya.\n');
    } else {
      examClasses.forEach(ec => {
        console.log(`✅ Class ID: ${ec.class_id} | ${ec.class_name}`);
      });
      console.log('');
    }

    // 2. Cek total siswa di kelas target
    if (examClasses.length > 0) {
      const classIds = examClasses.map(ec => ec.class_id);
      const placeholders = classIds.map(() => '?').join(',');
      
      const [targetStudents] = await pool.query(`
        SELECT 
          u.id,
          u.full_name,
          u.class_id,
          c.name as class_name
        FROM users u
        JOIN classes c ON c.id = u.class_id
        WHERE u.role = 'STUDENT' 
        AND u.is_active = 1 
        AND u.class_id IN (${placeholders})
        ORDER BY c.name, u.full_name
      `, classIds);

      console.log(`👥 Target Students (${targetStudents.length} total):`);
      console.log('─'.repeat(50));
      
      const studentsByClass = {};
      targetStudents.forEach(student => {
        if (!studentsByClass[student.class_name]) {
          studentsByClass[student.class_name] = [];
        }
        studentsByClass[student.class_name].push(student);
      });

      Object.keys(studentsByClass).forEach(className => {
        console.log(`📚 ${className}: ${studentsByClass[className].length} siswa`);
        studentsByClass[className].slice(0, 3).forEach(student => {
          console.log(`   - ${student.full_name} (ID: ${student.id})`);
        });
        if (studentsByClass[className].length > 3) {
          console.log(`   ... dan ${studentsByClass[className].length - 3} siswa lainnya`);
        }
        console.log('');
      });
    }

    // 3. Cek siswa yang sudah mengerjakan
    const [completedStudents] = await pool.query(`
      SELECT DISTINCT
        a.student_id,
        u.full_name,
        c.name as class_name,
        a.status,
        a.score
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE a.exam_id = :exam_id
      ORDER BY c.name, u.full_name
    `, { exam_id: examId });

    console.log(`✅ Students Who Attempted (${completedStudents.length} total):`);
    console.log('─'.repeat(50));
    completedStudents.forEach(student => {
      console.log(`- ${student.full_name} (${student.class_name || 'No Class'}) | Status: ${student.status} | Score: ${student.score || 'N/A'}`);
    });
    console.log('');

    // 4. Cek query yang digunakan sistem untuk hitung "belum mengerjakan"
    console.log('🔍 Testing System Query for "Belum Mengerjakan":\n');

    // Query yang mungkin digunakan sistem (cek semua siswa aktif)
    const [allActiveStudents] = await pool.query(`
      SELECT COUNT(*) as total
      FROM users 
      WHERE role = 'STUDENT' AND is_active = 1
    `);

    console.log(`📊 All Active Students: ${allActiveStudents[0].total}`);

    // Query yang benar (hanya siswa di kelas target)
    if (examClasses.length > 0) {
      const classIds = examClasses.map(ec => ec.class_id);
      const placeholders = classIds.map(() => '?').join(',');
      
      const [correctTargetCount] = await pool.query(`
        SELECT COUNT(*) as total
        FROM users u
        WHERE u.role = 'STUDENT' 
        AND u.is_active = 1 
        AND u.class_id IN (${placeholders})
      `, classIds);

      console.log(`🎯 Correct Target Students: ${correctTargetCount[0].total}`);
      console.log(`✅ Completed: ${completedStudents.length}`);
      console.log(`❌ Not Completed: ${correctTargetCount[0].total - completedStudents.length}`);
      
      const wrongCalculation = allActiveStudents[0].total - completedStudents.length;
      console.log(`\n⚠️  WRONG Calculation (All Students - Completed): ${wrongCalculation}`);
      console.log(`✅ CORRECT Calculation (Target Students - Completed): ${correctTargetCount[0].total - completedStudents.length}`);
      
      if (wrongCalculation !== (correctTargetCount[0].total - completedStudents.length)) {
        console.log('\n🚨 MASALAH DITEMUKAN:');
        console.log('   Sistem menghitung berdasarkan SEMUA siswa aktif,');
        console.log('   bukan hanya siswa di kelas yang ditargetkan!');
      }
    }

    // 5. Cek apakah ada ujian yang menggunakan class_id lama
    const [oldClassUsage] = await pool.query(`
      SELECT class_id FROM exams WHERE id = :exam_id
    `, { exam_id: examId });

    if (oldClassUsage[0].class_id) {
      console.log(`\n⚠️  Ujian ini masih menggunakan class_id lama: ${oldClassUsage[0].class_id}`);
      console.log('   Ini bisa menyebabkan konflik dengan sistem exam_classes baru');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

debugExamParticipants();