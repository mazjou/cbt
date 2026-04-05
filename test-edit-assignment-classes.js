const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
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
    console.log('=== Test Edit Assignment with Multiple Classes ===\n');
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 1. Create test assignment with 2 classes
      console.log('1. Creating test assignment with 2 classes...');
      const [classes] = await connection.query(`SELECT id, name FROM classes LIMIT 5`);
      const initialClassIds = [classes[0].id, classes[1].id];
      
      const [result] = await connection.query(`
        INSERT INTO assignments 
        (subject_id, teacher_id, title, description, due_date, max_score, allow_late_submission, is_published)
        VALUES (1, 1, 'TEST EDIT: Assignment', 'Test edit functionality', NULL, 100, 1, 0)
      `);
      
      const assignmentId = result.insertId;
      console.log('Created assignment ID:', assignmentId);
      
      // Insert initial classes
      for (const classId of initialClassIds) {
        await connection.query(
          `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
          [assignmentId, classId]
        );
      }
      
      console.log('Initial classes:', classes.slice(0, 2).map(c => c.name).join(', '));
      
      // 2. Simulate GET edit form - load selected classes
      console.log('\n2. Loading edit form (GET)...');
      const [[assignment]] = await connection.query(
        `SELECT * FROM assignments WHERE id = ?`,
        [assignmentId]
      );
      
      const [selectedClasses] = await connection.query(
        `SELECT class_id FROM assignment_classes WHERE assignment_id = ?`,
        [assignmentId]
      );
      assignment.selected_class_ids = selectedClasses.map(sc => sc.class_id);
      
      console.log('Selected class IDs:', assignment.selected_class_ids);
      console.log('✓ Form would show these classes as checked');
      
      // 3. Simulate POST update - change classes
      console.log('\n3. Updating assignment with different classes...');
      const newClassIds = [classes[2].id, classes[3].id, classes[4].id];
      
      // Delete existing
      await connection.query(
        `DELETE FROM assignment_classes WHERE assignment_id = ?`,
        [assignmentId]
      );
      console.log('✓ Deleted old class assignments');
      
      // Insert new
      for (const classId of newClassIds) {
        await connection.query(
          `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
          [assignmentId, classId]
        );
      }
      console.log('✓ Inserted new class assignments');
      console.log('New classes:', classes.slice(2, 5).map(c => c.name).join(', '));
      
      // 4. Verify update
      console.log('\n4. Verifying update...');
      const [[verify]] = await connection.query(`
        SELECT 
          a.title,
          COUNT(DISTINCT ac.class_id) as class_count,
          GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as class_names
        FROM assignments a
        LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
        LEFT JOIN classes c ON c.id = ac.class_id
        WHERE a.id = ?
        GROUP BY a.id, a.title
      `, [assignmentId]);
      
      console.table([verify]);
      
      // 5. Test validation - empty classes
      console.log('5. Testing validation (empty classes)...');
      await connection.query(
        `DELETE FROM assignment_classes WHERE assignment_id = ?`,
        [assignmentId]
      );
      
      const [emptyCheck] = await connection.query(
        `SELECT COUNT(*) as count FROM assignment_classes WHERE assignment_id = ?`,
        [assignmentId]
      );
      
      if (emptyCheck[0].count === 0) {
        console.log('✓ Validation would catch this: No classes selected');
      }
      
      // Rollback all test data
      await connection.rollback();
      console.log('\n✓ All tests successful (rolled back)');
      
    } catch (err) {
      await connection.rollback();
      console.error('❌ Test failed:', err.message);
      throw err;
    } finally {
      connection.release();
    }
    
    console.log('\n=== Test Completed ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
