const pool = require('./src/db/pool');

async function testAdminExamManagement() {
  console.log('=== Testing Admin Exam Management ===');
  
  try {
    // Test 1: Check if admin exam routes exist by checking database structure
    console.log('\n1. Checking exam table structure...');
    const [columns] = await pool.query(`DESCRIBE exams;`);
    console.log('Exam table columns:', columns.map(c => c.Field).join(', '));
    
    // Check for new display options columns
    const hasDisplayOptions = columns.some(c => c.Field === 'show_score_to_student') && 
                             columns.some(c => c.Field === 'show_review_to_student');
    console.log('Display options columns exist:', hasDisplayOptions);
    
    // Test 2: Check exam_classes table
    console.log('\n2. Checking exam_classes table...');
    try {
      const [examClassesColumns] = await pool.query(`DESCRIBE exam_classes;`);
      console.log('Exam_classes table columns:', examClassesColumns.map(c => c.Field).join(', '));
    } catch (e) {
      console.log('Exam_classes table does not exist or error:', e.message);
    }
    
    // Test 3: Get sample exam data
    console.log('\n3. Getting sample exam data...');
    const [exams] = await pool.query(`
      SELECT e.id, e.title, e.is_published, 
             s.name as subject_name, 
             u.full_name as teacher_name,
             (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
      FROM exams e
      LEFT JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN users u ON u.id = e.teacher_id
      ORDER BY e.created_at DESC
      LIMIT 5;
    `);
    
    console.log(`Found ${exams.length} exams:`);
    exams.forEach(exam => {
      console.log(`- ${exam.title} (${exam.subject_name}) by ${exam.teacher_name} - ${exam.question_count} questions - ${exam.is_published ? 'Published' : 'Draft'}`);
    });
    
    // Test 4: Check admin user exists
    console.log('\n4. Checking admin user...');
    const [admins] = await pool.query(`SELECT id, username, full_name FROM users WHERE role = 'ADMIN' LIMIT 1;`);
    if (admins.length > 0) {
      console.log('Admin user found:', admins[0].username, '-', admins[0].full_name);
    } else {
      console.log('No admin user found');
    }
    
    console.log('\n=== Admin Exam Management Test Complete ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testAdminExamManagement();