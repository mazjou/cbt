const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_kras'
  });

  try {
    console.log('🔄 Checking notifications table...');
    
    // Check if is_active column exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'is_active'`,
      [process.env.DB_NAME || 'cbt_kras']
    );
    
    if (columns.length === 0) {
      console.log('⚠️  Column is_active not found, adding it...');
      await connection.query(
        `ALTER TABLE notifications 
         ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER target_id,
         ADD INDEX idx_active (is_active)`
      );
      console.log('✅ Column is_active added successfully!');
    } else {
      console.log('✅ Column is_active already exists');
    }
    
    console.log('✅ Table check completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

fixTable();
