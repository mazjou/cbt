const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkNotifications() {
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
    
    // Check all notifications
    console.log('📢 All Notifications:');
    const [notifications] = await connection.query(`
      SELECT n.*, u.username AS sender_name
      FROM notifications n
      JOIN users u ON u.id = n.sender_id
      ORDER BY n.created_at DESC
      LIMIT 10
    `);
    
    if (notifications.length === 0) {
      console.log('   ⚠️  No notifications found');
    } else {
      notifications.forEach(n => {
        console.log(`\n   ID: ${n.id}`);
        console.log(`   Title: ${n.title}`);
        console.log(`   Type: ${n.type}`);
        console.log(`   Target: ${n.target_type} (ID: ${n.target_id || 'N/A'})`);
        console.log(`   Active: ${n.is_active ? 'YES' : 'NO'}`);
        console.log(`   Expires: ${n.expires_at || 'Never'}`);
        console.log(`   Created: ${n.created_at}`);
        console.log(`   Sender: ${n.sender_name}`);
      });
    }
    
    // Check notification reads
    console.log('\n\n📖 Notification Reads:');
    const [reads] = await connection.query(`
      SELECT nr.*, u.username
      FROM notification_reads nr
      JOIN users u ON u.id = nr.student_id
      ORDER BY nr.read_at DESC
      LIMIT 10
    `);
    
    if (reads.length === 0) {
      console.log('   ℹ️  No reads yet');
    } else {
      reads.forEach(r => {
        console.log(`   Notif ID: ${r.notification_id} | Student: ${r.username} | Read: ${r.read_at}`);
      });
    }
    
    // Test query for a specific student (ID 702 from the list)
    console.log('\n\n🧪 Test Query for Student ID 702:');
    const studentId = 702;
    
    const [[studentData]] = await connection.query(
      `SELECT class_id FROM users WHERE id = ?`,
      [studentId]
    );
    
    console.log(`   Class ID: ${studentData?.class_id || 'NULL'}`);
    
    const [activeNotifs] = await connection.query(
      `SELECT n.id, n.title, n.message, n.type, n.created_at, n.target_type, n.target_id
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
      [studentData?.class_id, studentId, studentId]
    );
    
    console.log(`   Active notifications for this student: ${activeNotifs.length}`);
    if (activeNotifs.length > 0) {
      activeNotifs.forEach(n => {
        console.log(`      - ${n.title} (${n.target_type})`);
      });
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

checkNotifications();
