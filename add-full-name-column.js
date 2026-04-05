const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function addFullNameColumn() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cbt_db',
      multipleStatements: true
    });
    
    console.log('✅ Connected to database');
    
    // Check if column already exists
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM users LIKE 'full_name'`
    );
    
    if (columns.length > 0) {
      console.log('ℹ️  Column full_name already exists, skipping...');
      return;
    }
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'sql', 'add_full_name_column.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📝 Adding full_name column to users table...');
    await connection.query(sql);
    
    console.log('✅ Column full_name added successfully!');
    console.log('');
    console.log('📊 Column details:');
    console.log('   - Name: full_name');
    console.log('   - Type: VARCHAR(255)');
    console.log('   - Nullable: YES');
    console.log('   - Position: After username');
    console.log('');
    console.log('💡 Tips:');
    console.log('   - Kolom ini untuk menyimpan nama lengkap siswa');
    console.log('   - Format tampilan: Nama Lengkap (username) - Kelas');
    console.log('   - Jika full_name NULL, akan fallback ke username');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('');
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration
addFullNameColumn();
