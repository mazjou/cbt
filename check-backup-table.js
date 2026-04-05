const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTables() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    namedPlaceholders: true
  });

  try {
    console.log('Checking submission_backups table...');
    const [tables] = await pool.query('SHOW TABLES LIKE "submission_backups"');
    console.log('Tables found:', tables.length);
    
    if (tables.length > 0) {
      const [columns] = await pool.query('DESCRIBE submission_backups');
      console.log('Columns:', columns.map(c => c.Field));
      
      // Test the exact JOIN query
      console.log('\nTesting JOIN query...');
      const [result] = await pool.query(`
        SELECT COUNT(*) as count
        FROM attempts a
        LEFT JOIN submission_backups sb ON sb.attempt_id = a.id AND sb.status = 'ACTIVE'
        LIMIT 1
      `);
      console.log('JOIN query works, count:', result[0].count);
    } else {
      console.log('submission_backups table does not exist!');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();