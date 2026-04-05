const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDuplicateUsers() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cbt_db'
    });
    
    console.log('✅ Connected to database\n');
    
    // Check for duplicate usernames
    console.log('🔍 Checking for duplicate usernames...');
    const [duplicates] = await connection.query(`
      SELECT username, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM users
      WHERE role = 'student'
      GROUP BY username
      HAVING count > 1
      ORDER BY count DESC
    `);
    
    if (duplicates.length > 0) {
      console.log('⚠️  Found duplicate usernames:');
      duplicates.forEach(dup => {
        console.log(`   - ${dup.username}: ${dup.count} times (IDs: ${dup.ids})`);
      });
    } else {
      console.log('✅ No duplicate usernames found');
    }
    
    console.log('\n📊 All students:');
    const [students] = await connection.query(`
      SELECT u.id, u.username, u.full_name, c.name AS class_name, u.class_id
      FROM users u
      LEFT JOIN classes c ON c.id = u.class_id
      WHERE u.role = 'student'
      ORDER BY u.username ASC
      LIMIT 20
    `);
    
    students.forEach(s => {
      console.log(`   ID: ${s.id} | Username: ${s.username} | Name: ${s.full_name || '(empty)'} | Class: ${s.class_name || 'No Class'}`);
    });
    
    console.log(`\n📈 Total students: ${students.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

checkDuplicateUsers();
