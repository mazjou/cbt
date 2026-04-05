const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_kras',
    multipleStatements: true
  });

  try {
    console.log('🔄 Running notifications migration...');
    
    const sql = require('fs').readFileSync('./sql/create_notifications.sql', 'utf8');
    await connection.query(sql);
    
    console.log('✅ Notifications tables created successfully!');
    console.log('📋 Tables created:');
    console.log('   - notifications');
    console.log('   - notification_reads');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
