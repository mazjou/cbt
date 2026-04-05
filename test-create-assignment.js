const pool = require('./src/db/pool');

async function testCreateAssignment() {
  try {
    console.log('Testing create assignment...\n');
    
    // Get a teacher ID
    const [[teacher]] = await pool.query(
      "SELECT id, username FROM users WHERE role = 'teacher' LIMIT 1"
    );
    
    if (!teacher) {
      console.log('✗ No teacher found in database');
      return;
    }
    
    console.log(`Using teacher: ${teacher.username} (ID: ${teacher.id})`);
    
    // Get a subject ID
    const [[subject]] = await pool.query(
      "SELECT id, name FROM subjects LIMIT 1"
    );
    
    if (!subject) {
      console.log('✗ No subject found in database');
      return;
    }
    
    console.log(`Using subject: ${subject.name} (ID: ${subject.id})`);
    
    // Get a class ID
    const [[classData]] = await pool.query(
      "SELECT id, name FROM classes LIMIT 1"
    );
    
    if (!classData) {
      console.log('✗ No class found in database');
      return;
    }
    
    console.log(`Using class: ${classData.name} (ID: ${classData.id})\n`);
    
    // Try to create assignment
    const testData = {
      subject_id: subject.id,
      teacher_id: teacher.id,
      title: 'Test Assignment',
      description: 'This is a test assignment',
      class_id: classData.id,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      max_score: 100,
      allow_late: 0,
      is_published: 0
    };
    
    console.log('Attempting to insert assignment...');
    const [result] = await pool.query(
      `INSERT INTO assignments 
       (subject_id, teacher_id, title, description, class_id, due_date, max_score, allow_late_submission, is_published)
       VALUES (:subject_id, :teacher_id, :title, :description, :class_id, :due_date, :max_score, :allow_late, :is_published);`,
      testData
    );
    
    console.log('✓ Assignment created successfully!');
    console.log(`  Insert ID: ${result.insertId}`);
    console.log(`  Affected rows: ${result.affectedRows}`);
    
    // Clean up - delete the test assignment
    await pool.query('DELETE FROM assignments WHERE id = :id', { id: result.insertId });
    console.log('\n✓ Test assignment cleaned up');
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('  Error code:', error.code);
    if (error.sql) {
      console.error('  SQL:', error.sql);
    }
    console.error('\nFull error:', error);
  } finally {
    await pool.end();
  }
}

testCreateAssignment();
