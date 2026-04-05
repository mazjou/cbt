const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixNullTargetNotifications() {
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
    
    // Find notifications with NULL target_id but target_type is not 'all'
    console.log('🔍 Finding invalid notifications...');
    const [invalid] = await connection.query(`
      SELECT id, title, target_type, target_id
      FROM notifications
      WHERE target_type != 'all' AND target_id IS NULL
    `);
    
    if (invalid.length === 0) {
      console.log('✅ No invalid notifications found');
    } else {
      console.log(`⚠️  Found ${invalid.length} invalid notifications:`);
      invalid.forEach(n => {
        console.log(`   ID: ${n.id} | Title: ${n.title} | Type: ${n.target_type} | Target ID: NULL`);
      });
      
      console.log('\n🗑️  Deleting invalid notifications...');
      await connection.query(`
        DELETE FROM notifications
        WHERE target_type != 'all' AND target_id IS NULL
      `);
      
      console.log('✅ Invalid notifications deleted');
    }
    
    console.log('\n📊 Current valid notifications:');
    const [valid] = await connection.query(`
      SELECT id, title, target_type, target_id, is_active
      FROM notifications
      ORDER BY created_at DESC
    `);
    
    if (valid.length === 0) {
      console.log('   ℹ️  No notifications');
    } else {
      valid.forEach(n => {
        console.log(`   ID: ${n.id} | ${n.title} | ${n.target_type} (${n.target_id || 'all'}) | Active: ${n.is_active ? 'YES' : 'NO'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

fixNullTargetNotifications();
