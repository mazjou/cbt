require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function createAssignmentsTables() {
  let connection;
  
  try {
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lms_smkn1kras',
      multipleStatements: true
    });

    console.log('✓ Connected to database');

    // Read SQL file
    const sqlPath = path.join(__dirname, '..', 'sql', 'add_assignments.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute SQL
    await connection.query(sql);
    console.log('✓ Tables created successfully');

    // Verify tables
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME IN ('assignments', 'assignment_submissions')
      ORDER BY TABLE_NAME;
    `, [process.env.DB_NAME || 'lms_smkn1kras']);

    console.log('\n✓ Verified tables:');
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });

    // Check columns
    const [assignmentCols] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'assignments'
      ORDER BY ORDINAL_POSITION;
    `, [process.env.DB_NAME || 'lms_smkn1kras']);

    console.log('\n✓ Assignments table columns:');
    assignmentCols.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });

    const [submissionCols] = await connection.query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'assignment_submissions'
      ORDER BY ORDINAL_POSITION;
    `, [process.env.DB_NAME || 'lms_smkn1kras']);

    console.log('\n✓ Assignment_submissions table columns:');
    submissionCols.forEach(col => {
      console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
    });

    console.log('\n✅ Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your server: npm start');
    console.log('2. Login as teacher and create assignments');
    console.log('3. Login as student and submit assignments');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✓ Database connection closed');
    }
  }
}

// Run the script
createAssignmentsTables();
