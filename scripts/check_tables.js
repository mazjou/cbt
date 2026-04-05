require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTables() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cbt_smk'
    });

    console.log('✓ Connected to database:', process.env.DB_NAME);

    // Check if tables exist
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME IN ('assignments', 'assignment_submissions')
      ORDER BY TABLE_NAME;
    `, [process.env.DB_NAME]);

    console.log('\nTables found:', tables.length);
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });

    if (tables.length === 0) {
      console.log('\n❌ Tables NOT found! Creating now...\n');
      
      // Read and execute SQL
      const fs = require('fs');
      const path = require('path');
      const sqlPath = path.join(__dirname, '..', 'sql', 'add_assignments.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      await connection.query(sql);
      console.log('✅ Tables created successfully!');
      
      // Verify again
      const [newTables] = await connection.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME IN ('assignments', 'assignment_submissions')
        ORDER BY TABLE_NAME;
      `, [process.env.DB_NAME]);
      
      console.log('\nVerified tables:');
      newTables.forEach(table => {
        console.log(`  - ${table.TABLE_NAME}`);
      });
    } else {
      console.log('\n✅ All tables exist!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkTables();
