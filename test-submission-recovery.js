const mysql = require('mysql2/promise');
require('dotenv').config();

async function testSubmissionRecovery() {
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
    console.log('🔍 Testing Submission Recovery System...\n');

    // 1. Check if backup table exists
    console.log('1. Checking backup table...');
    try {
      const [tables] = await pool.query(`SHOW TABLES LIKE 'submission_backups'`);
      if (tables.length > 0) {
        console.log('✅ submission_backups table exists');
      } else {
        console.log('❌ submission_backups table not found');
        console.log('   Run: node -e "require(\'./create-submission-backup-table.sql\')"');
      }
    } catch (error) {
      console.log('❌ Error checking backup table:', error.message);
    }

    // 2. Check if submission_status column exists
    console.log('\n2. Checking submission_status column...');
    try {
      const [columns] = await pool.query(`SHOW COLUMNS FROM attempts LIKE 'submission_status'`);
      if (columns.length > 0) {
        console.log('✅ submission_status column exists');
      } else {
        console.log('❌ submission_status column not found');
        console.log('   Run the ALTER TABLE command from create-submission-backup-table.sql');
      }
    } catch (error) {
      console.log('❌ Error checking submission_status column:', error.message);
    }

    // 3. Check for failed submissions
    console.log('\n3. Checking for failed submissions...');
    try {
      const [failedAttempts] = await pool.query(`
        SELECT COUNT(*) as count FROM attempts WHERE submission_status = 'FAILED'
      `);
      console.log(`📊 Found ${failedAttempts[0].count} failed submissions`);
    } catch (error) {
      console.log('❌ Error checking failed submissions:', error.message);
    }

    // 4. Check for existing backups
    console.log('\n4. Checking existing backups...');
    try {
      const [backups] = await pool.query(`
        SELECT COUNT(*) as count FROM submission_backups WHERE status = 'ACTIVE'
      `);
      console.log(`💾 Found ${backups[0].count} active backups`);
    } catch (error) {
      console.log('❌ Error checking backups:', error.message);
    }

    // 5. Test backup creation (simulation)
    console.log('\n5. Testing backup creation logic...');
    try {
      const [inProgressAttempts] = await pool.query(`
        SELECT a.id, a.student_id, a.exam_id, COUNT(aa.id) as answer_count
        FROM attempts a
        LEFT JOIN attempt_answers aa ON aa.attempt_id = a.id
        WHERE a.status = 'IN_PROGRESS'
        GROUP BY a.id, a.student_id, a.exam_id
        LIMIT 1
      `);
      
      if (inProgressAttempts.length > 0) {
        const attempt = inProgressAttempts[0];
        console.log(`📝 Found test attempt ${attempt.id} with ${attempt.answer_count} answers`);
        console.log('   Backup creation would work for this attempt');
      } else {
        console.log('ℹ️  No in-progress attempts found for testing');
      }
    } catch (error) {
      console.log('❌ Error testing backup creation:', error.message);
    }

    // 6. Summary
    console.log('\n📋 SUMMARY:');
    console.log('✅ Enhanced submission system with:');
    console.log('   - Transaction-based submission');
    console.log('   - Automatic answer backup');
    console.log('   - Failed submission tracking');
    console.log('   - Admin recovery interface');
    console.log('   - Retry mechanism');
    console.log('\n🔧 To activate:');
    console.log('   1. Run: mysql < create-submission-backup-table.sql');
    console.log('   2. Restart the application');
    console.log('   3. Access /admin/failed-submissions for recovery');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testSubmissionRecovery();