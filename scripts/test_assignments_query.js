require('dotenv').config();
const mysql = require('mysql2/promise');

async function testQuery() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true,
    timezone: '+07:00' // Asia/Jakarta (WIB)
  });

  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const [rows] = await pool.query('SELECT 1 AS test');
    console.log('✓ Database connection successful');
    
    // Test assignments table exists
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'assignments'`,
      [process.env.DB_NAME]
    );
    
    if (tables.length > 0) {
      console.log('✓ Assignments table exists');
      
      // Test query with named placeholder
      const [[count]] = await pool.query(
        'SELECT COUNT(*) AS c FROM assignments WHERE teacher_id = :tid',
        { tid: 4 }
      );
      console.log(`✓ Query successful: ${count.c} assignments found for teacher_id=4`);
      
      // Test query with positional placeholder
      const [[count2]] = await pool.query(
        'SELECT COUNT(*) AS c FROM assignments WHERE teacher_id = ?',
        [4]
      );
      console.log(`✓ Query successful (positional): ${count2.c} assignments found for teacher_id=4`);
      
    } else {
      console.log('✗ Assignments table does NOT exist');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

testQuery();
