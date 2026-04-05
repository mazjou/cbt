// Script untuk menjalankan migration question_pdf
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  console.log('🔧 Starting migration: Add question_pdf column...\n');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_smk'
  });

  try {
    console.log('✅ Connected to database:', process.env.DB_NAME);
    
    // Check if column already exists
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM questions LIKE 'question_pdf';`
    );
    
    if (columns.length > 0) {
      console.log('⚠️  Column question_pdf already exists. Skipping migration.');
      return;
    }
    
    // Run migration
    console.log('📝 Adding column question_pdf to questions table...');
    await connection.query(
      `ALTER TABLE questions 
       ADD COLUMN question_pdf VARCHAR(255) NULL AFTER question_image;`
    );
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Verifying column...');
    
    // Verify
    const [verify] = await connection.query(
      `SHOW COLUMNS FROM questions LIKE 'question_pdf';`
    );
    
    if (verify.length > 0) {
      console.log('✅ Column question_pdf verified:');
      console.log('   - Type:', verify[0].Type);
      console.log('   - Null:', verify[0].Null);
      console.log('   - Default:', verify[0].Default);
      console.log('\n🎉 Migration successful! You can now upload PDF to exam questions.');
    } else {
      console.log('❌ Verification failed. Column not found.');
    }
    
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
