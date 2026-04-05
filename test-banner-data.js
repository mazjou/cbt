const pool = require('./src/db/pool');

async function testBannerData() {
  console.log('=== Testing Login Banner Data ===');
  
  try {
    // Calculate date range for last week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];
    
    console.log(`\n📅 Testing data for period: ${oneWeekAgoStr} to ${new Date().toISOString().split('T')[0]}`);

    // Test 1: Get top 3 active classes
    console.log('\n1. Testing Top 3 Active Classes...');
    const [activeClasses] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) as activity_score,
        COUNT(DISTINCT at.id) as exam_attempts,
        COUNT(DISTINCT mr.id) as material_reads
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT'
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      GROUP BY c.id, c.name
      HAVING activity_score > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    console.log(`Found ${activeClasses.length} active classes:`);
    activeClasses.forEach((cls, index) => {
      console.log(`${index + 1}. ${cls.class_name} - Score: ${cls.activity_score} (${cls.exam_attempts} attempts, ${cls.material_reads} reads)`);
    });

    // Test 2: Get top 3 active students
    console.log('\n2. Testing Top 3 Active Students...');
    const [activeStudents] = await pool.query(`
      SELECT 
        u.full_name,
        c.name as class_name,
        COUNT(DISTINCT at.id) + COUNT(DISTINCT mr.id) + COUNT(DISTINCT asub.id) as activity_score,
        COUNT(DISTINCT at.id) as exam_attempts,
        COUNT(DISTINCT mr.id) as material_reads,
        COUNT(DISTINCT asub.id) as assignment_submissions
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      LEFT JOIN attempts at ON at.student_id = u.id AND at.created_at >= :weekAgo
      LEFT JOIN material_reads mr ON mr.student_id = u.id AND mr.created_at >= :weekAgo
      LEFT JOIN assignment_submissions asub ON asub.student_id = u.id AND asub.created_at >= :weekAgo
      WHERE u.role = 'STUDENT' AND u.is_active = 1
      GROUP BY u.id, u.full_name, c.name
      HAVING activity_score > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    console.log(`Found ${activeStudents.length} active students:`);
    activeStudents.forEach((student, index) => {
      console.log(`${index + 1}. ${student.full_name} (${student.class_name || 'No Class'}) - Score: ${student.activity_score}`);
      console.log(`   Activities: ${student.exam_attempts} attempts, ${student.material_reads} reads, ${student.assignment_submissions} submissions`);
    });

    // Test 3: Get top 3 active teachers
    console.log('\n3. Testing Top 3 Active Teachers...');
    const [activeTeachers] = await pool.query(`
      SELECT 
        u.full_name,
        COUNT(DISTINCT e.id) + COUNT(DISTINCT m.id) + COUNT(DISTINCT a.id) as activity_score,
        COUNT(DISTINCT e.id) as exams_created,
        COUNT(DISTINCT m.id) as materials_created,
        COUNT(DISTINCT a.id) as assignments_created
      FROM users u
      LEFT JOIN exams e ON e.teacher_id = u.id AND e.created_at >= :weekAgo
      LEFT JOIN materials m ON m.teacher_id = u.id AND m.created_at >= :weekAgo
      LEFT JOIN assignments a ON a.teacher_id = u.id AND a.created_at >= :weekAgo
      WHERE u.role = 'TEACHER' AND u.is_active = 1
      GROUP BY u.id, u.full_name
      HAVING activity_score > 0
      ORDER BY activity_score DESC
      LIMIT 3;
    `, { weekAgo: oneWeekAgoStr });

    console.log(`Found ${activeTeachers.length} active teachers:`);
    activeTeachers.forEach((teacher, index) => {
      console.log(`${index + 1}. ${teacher.full_name} - Score: ${teacher.activity_score}`);
      console.log(`   Created: ${teacher.exams_created} exams, ${teacher.materials_created} materials, ${teacher.assignments_created} assignments`);
    });

    // Test 4: Simulate banner content
    console.log('\n4. Simulating Banner Content...');
    let bannerItems = [];
    
    activeClasses.forEach((cls, index) => {
      bannerItems.push(`🏆 Kelas Teraktif #${index + 1}: ${cls.class_name}`);
    });
    
    activeStudents.forEach((student, index) => {
      bannerItems.push(`⭐ Siswa Teraktif #${index + 1}: ${student.full_name} (${student.class_name || 'No Class'})`);
    });
    
    activeTeachers.forEach((teacher, index) => {
      bannerItems.push(`👨‍🏫 Guru Teraktif #${index + 1}: ${teacher.full_name}`);
    });

    console.log('\nBanner content preview:');
    if (bannerItems.length > 0) {
      bannerItems.forEach(item => console.log(`- ${item}`));
    } else {
      console.log('- 📊 Belum ada aktivitas minggu ini');
    }

    console.log('\n=== Banner Data Test Complete ===');
    console.log('\n🎯 EXPECTED BANNER BEHAVIOR:');
    console.log('1. Banner loads quickly with soft pastel colors');
    console.log('2. Shows scrolling text with top 3 classes, students, teachers');
    console.log('3. Different colors for each category (yellow, blue, purple)');
    console.log('4. Smooth scrolling animation that pauses on hover');
    console.log('5. Fallback message if no data available');

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testBannerData();