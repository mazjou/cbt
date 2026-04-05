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
    console.log('=== Test Multiple Classes Assignment Feature ===\n');
    
    // 1. Check assignment_classes table exists
    console.log('1. Checking assignment_classes table...');
    const [tables] = await pool.query(`SHOW TABLES LIKE 'assignment_classes'`);
    if (tables.length === 0) {
      console.log('❌ Table assignment_classes not found! Run migration first.');
      return;
    }
    console.log('✓ Table exists\n');
    
    // 2. Check existing assignments with multiple classes
    console.log('2. Checking assignments with multiple classes...');
    const [multiClassAssignments] = await pool.query(`
      SELECT 
        a.id,
        a.title,
        COUNT(DISTINCT ac.class_id) as class_count,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') as class_names
      FROM assignments a
      LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
      LEFT JOIN classes c ON c.id = ac.class_id
      GROUP BY a.id, a.title
      HAVING class_count > 1
      ORDER BY a.id DESC
      LIMIT 5
    `);
    
    if (multiClassAssignments.length > 0) {
      console.log('Found assignments with multiple classes:');
      console.table(multiClassAssignments);
    } else {
      console.log('No assignments with multiple classes yet.\n');
    }
    
    // 3. Test query for teacher view
    console.log('3. Testing teacher view query...');
    const [teacherView] = await pool.query(`
      SELECT 
        a.id, a.title,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS class_names,
        COUNT(DISTINCT ac.class_id) AS class_count,
        (SELECT COUNT(*) FROM assignment_submissions asub WHERE asub.assignment_id = a.id) AS submission_count,
        (SELECT COUNT(DISTINCT u.id) 
         FROM users u 
         INNER JOIN assignment_classes ac2 ON ac2.class_id = u.class_id 
         WHERE ac2.assignment_id = a.id AND u.role = 'student' AND u.is_active = 1) AS total_students
      FROM assignments a
      LEFT JOIN assignment_classes ac ON ac.assignment_id = a.id
      LEFT JOIN classes c ON c.id = ac.class_id
      GROUP BY a.id, a.title
      ORDER BY a.created_at DESC
      LIMIT 5
    `);
    
    console.log('Teacher view (latest 5 assignments):');
    console.table(teacherView.map(a => ({
      ID: a.id,
      Title: a.title,
      Classes: a.class_names || 'None',
      'Class Count': a.class_count,
      Submissions: a.submission_count,
      'Total Students': a.total_students
    })));
    
    // 4. Test query for student view
    console.log('\n4. Testing student view query...');
    const [classes] = await pool.query(`SELECT id, name FROM classes LIMIT 3`);
    
    for (const cls of classes) {
      const [studentView] = await pool.query(`
        SELECT 
          a.id, a.title,
          s.name AS subject_name
        FROM assignments a
        JOIN subjects s ON s.id = a.subject_id
        INNER JOIN assignment_classes ac ON ac.assignment_id = a.id
        WHERE a.is_published = 1
          AND ac.class_id = :classId
        ORDER BY a.due_date ASC, a.created_at DESC
        LIMIT 3
      `, { classId: cls.id });
      
      console.log(`\nAssignments for class "${cls.name}":`);
      if (studentView.length > 0) {
        console.table(studentView);
      } else {
        console.log('  No assignments found');
      }
    }
    
    // 5. Simulate creating assignment for multiple classes
    console.log('\n5. Simulating create assignment for multiple classes...');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Get first 3 classes
      const [testClasses] = await connection.query(`SELECT id, name FROM classes LIMIT 3`);
      const classIds = testClasses.map(c => c.id);
      
      console.log('Selected classes:', testClasses.map(c => c.name).join(', '));
      
      // Insert test assignment
      const [result] = await connection.query(`
        INSERT INTO assignments 
        (subject_id, teacher_id, title, description, class_id, due_date, max_score, allow_late_submission, is_published)
        VALUES (1, 1, 'TEST: Multiple Classes Assignment', 'This is a test assignment', NULL, NULL, 100, 1, 0)
      `);
      
      const assignmentId = result.insertId;
      console.log('Created assignment ID:', assignmentId);
      
      // Insert into assignment_classes
      for (const classId of classIds) {
        await connection.query(
          `INSERT INTO assignment_classes (assignment_id, class_id) VALUES (?, ?)`,
          [assignmentId, classId]
        );
      }
      console.log('Linked to', classIds.length, 'classes');
      
      // Verify
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
      
      console.log('\nVerification:');
      console.table([verify]);
      
      // Rollback (don't actually create test data)
      await connection.rollback();
      console.log('\n✓ Test successful (rolled back)');
      
    } catch (err) {
      await connection.rollback();
      console.error('❌ Test failed:', err.message);
    } finally {
      connection.release();
    }
    
    console.log('\n=== All Tests Completed ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
