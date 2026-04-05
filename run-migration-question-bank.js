// Script untuk menjalankan migration question bank
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('🔧 Starting migration: Create question bank tables...\n');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_smk',
    multipleStatements: true
  });

  try {
    console.log('✅ Connected to database:', process.env.DB_NAME);
    
    // Read SQL file
    const sqlFile = path.join(__dirname, 'sql', 'create_question_bank.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('📝 Creating question bank tables...');
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Verifying tables...');
    
    // Verify tables
    const tables = ['question_bank', 'question_bank_options', 'question_bank_usage'];
    for (const table of tables) {
      const [rows] = await connection.query(`SHOW TABLES LIKE '${table}';`);
      if (rows.length > 0) {
        console.log(`✅ Table ${table} created`);
        
        // Show columns
        const [columns] = await connection.query(`SHOW COLUMNS FROM ${table};`);
        console.log(`   Columns: ${columns.map(c => c.Field).join(', ')}`);
      } else {
        console.log(`❌ Table ${table} not found`);
      }
    }
    
    console.log('\n🎉 Question bank tables ready!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await connection.end();
    console.log('\n🔌 Database connection closed.');
  }
}

runMigration().catch(console.error);
