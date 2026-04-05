const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lms_smk',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function checkDatabaseTables() {
  try {
    console.log('🔍 Checking database tables...\n');
    
    // Get current database name
    const [[{ database_name }]] = await pool.query('SELECT DATABASE() as database_name;');
    console.log(`📊 Database: ${database_name}\n`);
    
    // List of tables that might be related to users
    const expectedTables = [
      'users',
      'student_answers',
      'exam_results', 
      'attempts',
      'assignment_submissions',
      'material_reads',
      'notification_reads',
      'live_class_participants',
      'profile_photos',
      'exams',
      'materials',
      'assignments',
      'notifications',
      'live_classes'
    ];
    
    console.log('📋 Checking expected tables:');
    console.log('============================');
    
    const existingTables = [];
    const missingTables = [];
    
    for (const table of expectedTables) {
      try {
        const [tables] = await pool.query(`SHOW TABLES LIKE '${table}';`);
        
        if (tables.length > 0) {
          // Get row count
          const [[{ count }]] = await pool.query(`SELECT COUNT(*) as count FROM ${table};`);
          console.log(`✅ ${table} - ${count} records`);
          existingTables.push({ table, count });
        } else {
          console.log(`❌ ${table} - NOT FOUND`);
          missingTables.push(table);
        }
      } catch (error) {
        console.log(`❌ ${table} - ERROR: ${error.message}`);
        missingTables.push(table);
      }
    }
    
    // Show all tables in database
    console.log('\n📋 All tables in database:');
    console.log('===========================');
    const [allTables] = await pool.query('SHOW TABLES;');
    allTables.forEach((row, index) => {
      const tableName = Object.values(row)[0];
      console.log(`${index + 1}. ${tableName}`);
    });
    
    // Check foreign key constraints for users table
    console.log('\n🔗 Foreign key constraints referencing users:');
    console.log('===============================================');
    
    const [constraints] = await pool.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE REFERENCED_TABLE_NAME = 'users' 
        AND TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, COLUMN_NAME;
    `);
    
    if (constraints.length === 0) {
      console.log('ℹ️  No foreign key constraints found referencing users table.');
    } else {
      constraints.forEach((constraint, index) => {
        console.log(`${index + 1}. ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME} → users.${constraint.REFERENCED_COLUMN_NAME}`);
      });
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log('===========');
    console.log(`✅ Existing tables: ${existingTables.length}`);
    console.log(`❌ Missing tables: ${missingTables.length}`);
    console.log(`🔗 Foreign key constraints: ${constraints.length}`);
    
    if (missingTables.length > 0) {
      console.log('\n⚠️  Missing tables that might cause bulk delete issues:');
      missingTables.forEach(table => console.log(`   - ${table}`));
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabaseTables();