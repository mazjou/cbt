const mysql = require('mysql2/promise');
require('dotenv').config();

async function testFailedSubmissionsRoute() {
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
    console.log('🔍 Testing Failed Submissions Route Query...\n');

    // Test the exact query from the route
    const [failedAttempts] = await pool.query(`
      SELECT a.id, a.exam_id, a.student_id, a.status, a.submission_status,
             a.started_at, a.finished_at,
             u.full_name as student_name, u.username as student_username,
             e.title as exam_title, s.name as subject_name,
             sb.id as backup_id, sb.created_at as backup_created
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN submission_backups sb ON sb.attempt_id = a.id AND sb.status = 'ACTIVE'
      WHERE a.submission_status = 'FAILED'
      ORDER BY a.started_at DESC
    `);

    console.log(`✅ Query executed successfully`);
    console.log(`📊 Found ${failedAttempts.length} failed submissions`);
    
    if (failedAttempts.length > 0) {
      console.log('\n📋 Sample data:');
      console.log(JSON.stringify(failedAttempts[0], null, 2));
    }

    // Test if we can create a test failed submission
    console.log('\n🧪 Creating test failed submission...');
    
    // Find an existing attempt to modify
    const [existingAttempts] = await pool.query(`
      SELECT id FROM attempts WHERE status = 'SUBMITTED' LIMIT 1
    `);
    
    if (existingAttempts.length > 0) {
      const attemptId = existingAttempts[0].id;
      
      // Temporarily mark as failed for testing
      await pool.query(`
        UPDATE attempts SET submission_status = 'FAILED' WHERE id = :aid
      `, { aid: attemptId });
      
      console.log(`✅ Created test failed submission with ID: ${attemptId}`);
      
      // Test the query again
      const [testFailedAttempts] = await pool.query(`
        SELECT a.id, a.exam_id, a.student_id, a.status, a.submission_status,
               u.full_name as student_name, e.title as exam_title
        FROM attempts a
        JOIN users u ON u.id = a.student_id
        JOIN exams e ON e.id = a.exam_id
        WHERE a.submission_status = 'FAILED'
        ORDER BY a.started_at DESC
      `);
      
      console.log(`📊 Now found ${testFailedAttempts.length} failed submissions`);
      
      // Restore the original status
      await pool.query(`
        UPDATE attempts SET submission_status = 'SUBMITTED' WHERE id = :aid
      `, { aid: attemptId });
      
      console.log(`✅ Restored original status for attempt ${attemptId}`);
    } else {
      console.log('ℹ️  No existing attempts found for testing');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testFailedSubmissionsRoute();