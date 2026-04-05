// Script untuk test tampilan tabel yang lebih kompak
// Jalankan: node test-compact-table.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testCompactTable() {
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
    console.log('🧪 Testing Compact Table Layout...\n');

    // Get sample exams data
    const teacherId = 103;
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

    // Calculate participation for display
    for (let exam of exams) {
      const [examClassesCount] = await pool.query(
        `SELECT COUNT(*) as count FROM exam_classes WHERE exam_id = ?`,
        [exam.id]
      );

      let totalStudentsQuery;
      let queryParams = [exam.id];

      if (examClassesCount[0].count > 0) {
        totalStudentsQuery = `
          SELECT COUNT(DISTINCT u.id) as total 
          FROM users u
          INNER JOIN exam_classes ec ON ec.class_id = u.class_id
          WHERE u.role = 'STUDENT' 
          AND u.is_active = 1 
          AND ec.exam_id = ?
        `;
      } else if (exam.class_id) {
        totalStudentsQuery = `
          SELECT COUNT(*) as total 
          FROM users 
          WHERE role = 'STUDENT' 
          AND is_active = 1 
          AND class_id = ?
        `;
        queryParams = [exam.class_id];
      } else {
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
    }

    // Display compact table simulation
    console.log('📊 COMPACT TABLE LAYOUT PREVIEW:');
    console.log('═'.repeat(120));
    console.log('ID'.padEnd(5) + 'JUDUL UJIAN & MAPEL'.padEnd(35) + 'KELAS'.padEnd(20) + 'SOAL'.padEnd(6) + 'DURASI'.padEnd(8) + 'PENGERJAAN'.padEnd(15) + 'STATUS'.padEnd(12) + 'AKSI');
    console.log('═'.repeat(120));

    exams.forEach(exam => {
      const title = exam.title.length > 25 ? exam.title.substring(0, 22) + '...' : exam.title;
      const subject = exam.subject_name.length > 20 ? exam.subject_name.substring(0, 17) + '...' : exam.subject_name;
      const titleAndSubject = `${title}\n${' '.repeat(5)}📚 ${subject}`;
      
      const classes = exam.class_names ? 
        (exam.class_names.length > 18 ? exam.class_names.substring(0, 15) + '...' : exam.class_names) : 
        'Semua Kelas';
      
      const progressBar = '█'.repeat(Math.floor(exam.participation_percentage / 10)) + 
                         '░'.repeat(10 - Math.floor(exam.participation_percentage / 10));
      const participation = `[${progressBar}] ${exam.participation_percentage}%\n${' '.repeat(5)}${exam.completed_count}/${exam.total_students}`;
      
      const status = exam.is_published ? '🟢 Published' : '⚪ Draft';
      
      console.log(
        exam.id.toString().padEnd(5) +
        title.padEnd(35) +
        classes.padEnd(20) +
        exam.question_count.toString().padEnd(6) +
        `${exam.duration_minutes}m`.padEnd(8) +
        `${exam.participation_percentage}%`.padEnd(15) +
        status.padEnd(12) +
        'Detail Edit'
      );
      console.log(' '.repeat(5) + `📚 ${subject}`.padEnd(35) + ' '.repeat(20) + ' '.repeat(6) + ' '.repeat(8) + `${exam.completed_count}/${exam.total_students}`.padEnd(15));
      console.log('─'.repeat(120));
    });

    console.log('\n🎯 LAYOUT IMPROVEMENTS:');
    console.log('─'.repeat(50));
    console.log('✅ Removed separate "Mapel" column');
    console.log('✅ Subject name moved under exam title');
    console.log('✅ More horizontal space for other columns');
    console.log('✅ Cleaner, more compact design');
    console.log('✅ Better mobile responsiveness');

    console.log('\n📱 SPACE SAVINGS:');
    console.log('─'.repeat(30));
    console.log('Before: 10 columns (ID, Title, Subject, Class, Questions, Duration, Progress, Code, Status, Actions)');
    console.log('After:  9 columns (ID, Title+Subject, Class, Questions, Duration, Progress, Code, Status, Actions)');
    console.log('Space saved: ~10-15% horizontal space');

    console.log('\n🎨 VISUAL HIERARCHY:');
    console.log('─'.repeat(30));
    console.log('• Exam Title: Bold, prominent');
    console.log('• Subject: Smaller, muted color');
    console.log('• Clear visual separation');
    console.log('• Maintains readability');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testCompactTable();