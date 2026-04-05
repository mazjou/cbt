/**
 * Run Database Migration for Submission Backup System
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

async function runMigration() {
  console.log('🚀 Starting database migration...\n');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('✅ Connected to database:', process.env.DB_NAME);
    
    // Read SQL file
    const sql = fs.readFileSync('create-submission-backup-table.sql', 'utf8');
    console.log('\n📄 SQL file loaded\n');
    
    // Execute migration
    console.log('⏳ Executing migration...\n');
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables and columns
    console.log('🔍 Verifying migration...\n');
    
    // Check submission_backups table
    const [tables] = await connection.query(`SHOW TABLES LIKE 'submission_backups'`);
    if (tables.length > 0) {
      console.log('✅ Table submission_backups created');
      
      const [columns] = await connection.query(`DESCRIBE submission_backups`);
      console.log('   Columns:');
      columns.forEach(col => {
        console.log(`   - ${col.Field}: ${col.Type}`);
      });
    } else {
      console.log('❌ Table submission_backups not found');
    }
    
    console.log('');
    
    // Check submission_status column
    const [statusCol] = await connection.query(`
      SHOW COLUMNS FROM attempts LIKE 'submission_status'
    `);
    
    if (statusCol.length > 0) {
      console.log('✅ Column submission_status added to attempts table');
      console.log(`   Type: ${statusCol[0].Type}`);
      console.log(`   Default: ${statusCol[0].Default}`);
    } else {
      console.log('❌ Column submission_status not found in attempts table');
    }
    
    console.log('\n🎉 All done! You can now restart your server.\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('\n⚠️  Column already exists. This is OK if you ran migration before.');
    } else if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('\n⚠️  Table already exists. This is OK if you ran migration before.');
    } else {
      console.error('\n❌ Error details:', error);
      process.exit(1);
    }
  } finally {
    await connection.end();
  }
}

runMigration().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
