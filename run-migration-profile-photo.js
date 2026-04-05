const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_smk',
    multipleStatements: true
  });

  try {
    console.log('🔄 Running profile photo migration...');
    
    const sql = fs.readFileSync(path.join(__dirname, 'sql', 'add_profile_photo.sql'), 'utf8');
    await connection.query(sql);
    
    console.log('✅ Profile photo migration completed successfully!');
    console.log('📝 Added profile_photo column to users table');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
