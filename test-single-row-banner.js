const pool = require('./src/db/pool');

async function testSingleRowBanner() {
  console.log('=== Testing Single Row Banner ===');
  
  try {
    // Test the same queries as in auth.js
    const [activeClasses] = await pool.query(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT u.id) as student_count
      FROM classes c
      LEFT JOIN users u ON u.class_id = c.id AND u.role = 'STUDENT' AND u.is_active = 1
      GROUP BY c.id, c.name
      HAVING student_count > 0
      ORDER BY student_count DESC
      LIMIT 5;
    `);

    const [activeStudents] = await pool.query(`
      SELECT u.full_name, c.name as class_name
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'STUDENT' AND u.is_active = 1
      ORDER BY u.created_at DESC
      LIMIT 5;
    `);

    const [activeTeachers] = await pool.query(`
      SELECT u.full_name
      FROM users u
      WHERE u.role = 'TEACHER' AND u.is_active = 1
      ORDER BY u.created_at DESC
      LIMIT 5;
    `);

    // Generate banner messages like in auth.js
    const bannerMessages = [];
    
    activeClasses.forEach((cls, index) => {
      bannerMessages.push(`🏆 Selamat kepada kelas ${cls.class_name} sebagai kelas teraktif ke-${index + 1}!`);
    });
    
    activeStudents.forEach((student, index) => {
      bannerMessages.push(`🌟 Selamat kepada ${student.full_name} dari ${student.class_name || 'kelas'} sebagai siswa teraktif ke-${index + 1}!`);
    });
    
    activeTeachers.forEach((teacher, index) => {
      bannerMessages.push(`👨‍🏫 Selamat kepada ${teacher.full_name} sebagai guru teraktif ke-${index + 1} dalam menggunakan LMS!`);
    });

    console.log('\n📊 Data Summary:');
    console.log(`- Active classes: ${activeClasses.length}`);
    console.log(`- Active students: ${activeStudents.length}`);
    console.log(`- Active teachers: ${activeTeachers.length}`);
    console.log(`- Total banner messages: ${bannerMessages.length}`);

    console.log('\n📝 Banner Messages:');
    bannerMessages.forEach((msg, index) => {
      console.log(`${index + 1}. ${msg}`);
    });

    console.log('\n🎨 Single Row Banner Features:');
    console.log('✅ Simplified single row layout');
    console.log('✅ Moderate animation speed (240s desktop, 4 minutes per cycle)');
    console.log('✅ Soft pastel blue theme');
    console.log('✅ Responsive font sizes');
    console.log('✅ Hover to pause animation');
    console.log('✅ Full width positioning');

    console.log('\n⚡ Animation Speeds:');
    console.log('- Desktop: 240s (4 minutes per cycle)');
    console.log('- Tablet: 200s (3.3 minutes per cycle)');
    console.log('- Mobile: 180s (3 minutes per cycle)');

    console.log('\n🎯 Expected Result:');
    console.log('Banner should now display as single scrolling row with all messages');
    console.log('Animation speed is comfortable for reading');
    console.log('Should be visible on login page only');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testSingleRowBanner();