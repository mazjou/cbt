const mysql = require('mysql2/promise');
require('dotenv').config();

async function testNotificationForUser() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cbt_db'
    });
    
    console.log('✅ Connected to database\n');
    
    const studentId = 39;
    
    // Get student info
    console.log(`👤 Student Info (ID: ${studentId}):`);
    const [[student]] = await connection.query(
      `SELECT id, username, full_name, role, class_id FROM users WHERE id = ?`,
      [studentId]
    );
    
    if (!student) {
      console.log('   ❌ Student not found!');
      return;
    }
    
    console.log(`   Username: ${student.username}`);
    console.log(`   Full Name: ${student.full_name || '(empty)'}`);
    console.log(`   Role: ${student.role}`);
    console.log(`   Class ID: ${student.class_id || 'NULL'}`);
    
    // Check all notifications
    console.log('\n📢 All Active Notifications:');
    const [allNotifs] = await connection.query(`
      SELECT id, title, target_type, target_id, is_active, expires_at
      FROM notifications
      WHERE is_active = TRUE
      ORDER BY created_at DESC
    `);
    
    if (allNotifs.length === 0) {
      console.log('   ℹ️  No active notifications');
    } else {
      allNotifs.forEach(n => {
        const expired = n.expires_at && new Date(n.expires_at) < new Date();
        console.log(`   ID: ${n.id} | ${n.title} | ${n.target_type} (${n.target_id || 'all'}) | Expired: ${expired ? 'YES' : 'NO'}`);
      });
    }
    
    // Check notification reads
    console.log('\n📖 Notification Reads for this student:');
    const [reads] = await connection.query(
      `SELECT notification_id FROM notification_reads WHERE student_id = ?`,
      [studentId]
    );
    
    if (reads.length === 0) {
      console.log('   ℹ️  No reads yet');
    } else {
      console.log(`   Read notification IDs: ${reads.map(r => r.notification_id).join(', ')}`);
    }
    
    // Test the exact query from the API
    console.log('\n🧪 Test API Query:');
    const [notifications] = await connection.query(
      `SELECT n.id, n.title, n.message, n.type, n.created_at, n.target_type, n.target_id, n.is_active, n.expires_at
       FROM notifications n
       WHERE n.is_active = TRUE
         AND (n.expires_at IS NULL OR n.expires_at > NOW())
         AND (
           n.target_type = 'all'
           OR (n.target_type = 'class' AND n.target_id = ?)
           OR (n.target_type = 'student' AND n.target_id = ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM notification_reads nr 
           WHERE nr.notification_id = n.id AND nr.student_id = ?
         )
       ORDER BY n.created_at DESC
       LIMIT 5`,
      [student.class_id, studentId, studentId]
    );
    
    console.log(`   Result: ${notifications.length} notifications`);
    if (notifications.length > 0) {
      notifications.forEach(n => {
        console.log(`\n   ✅ Notification ID: ${n.id}`);
        console.log(`      Title: ${n.title}`);
        console.log(`      Type: ${n.type}`);
        console.log(`      Target: ${n.target_type} (ID: ${n.target_id || 'all'})`);
        console.log(`      Active: ${n.is_active}`);
        console.log(`      Expires: ${n.expires_at || 'Never'}`);
        console.log(`      Message: ${n.message.substring(0, 50)}...`);
      });
    } else {
      console.log('   ❌ No notifications match the criteria');
      console.log('\n   Debugging:');
      console.log(`   - Student ID: ${studentId}`);
      console.log(`   - Class ID: ${student.class_id || 'NULL'}`);
      console.log(`   - Looking for: target_type='all' OR (target_type='class' AND target_id=${student.class_id}) OR (target_type='student' AND target_id=${studentId})`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

testNotificationForUser();
