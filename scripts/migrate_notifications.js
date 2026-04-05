require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');

async function runMigration() {
  try {
    console.log('🚀 Running notification migration...');
    
    const sqlFile = path.join(__dirname, '..', 'sql', 'add_notifications.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50) + '...');
      await pool.query(statement);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('📋 Table "notifications" has been created.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart your server: npm run dev');
    console.log('2. Login as a teacher and publish a material or exam');
    console.log('3. Login as a student to see the notification bell icon');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
