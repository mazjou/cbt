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

async function checkForeignKeyConstraints() {
  try {
    console.log('🔍 Checking foreign key constraints for users table...\n');
    
    // Get all tables that reference users table
    const [constraints] = await pool.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE REFERENCED_TABLE_NAME = 'users' 
        AND TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, COLUMN_NAME;
    `);
    
    console.log('📋 Tables that reference users table:');
    console.log('=====================================');
    
    if (constraints.length === 0) {
      console.log('✅ No foreign key constraints found.');
    } else {
      constraints.forEach((constraint, index) => {
        console.log(`${index + 1}. ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME}`);
        console.log(`   → references users.${constraint.REFERENCED_COLUMN_NAME}`);
        console.log(`   → constraint: ${constraint.CONSTRAINT_NAME}\n`);
      });
    }
    
    // Check for data in related tables
    console.log('\n🔍 Checking data in related tables...\n');
    
    const tablesToCheck = [
      'attempts',
      'assignment_submissions', 
      'notification_reads',
      'live_class_participants',
      'material_reads',
      'exam_results',
      'student_answers'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table} LIMIT 1;`);
        console.log(`📊 ${table}: ${rows[0].count} records`);
      } catch (error) {
        console.log(`❌ ${table}: Table not found or error - ${error.message}`);
      }
    }
    
    // Test bulk delete with a safe user ID (if any test users exist)
    console.log('\n🧪 Testing bulk delete constraints...\n');
    
    const [testUsers] = await pool.query(`
      SELECT id, username, role 
      FROM users 
      WHERE username LIKE 'test%' OR username LIKE 'demo%'
      LIMIT 3;
    `);
    
    if (testUsers.length > 0) {
      console.log('Found test users for constraint testing:');
      testUsers.forEach(user => {
        console.log(`- ID: ${user.id}, Username: ${user.username}, Role: ${user.role}`);
      });
    } else {
      console.log('No test users found. Create test users first to safely test bulk delete.');
    }
    
  } catch (error) {
    console.error('❌ Error checking constraints:', error.message);
  } finally {
    await pool.end();
  }
}

checkForeignKeyConstraints();