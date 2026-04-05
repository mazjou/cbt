const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('=== Running Migration: Add assignment_classes Table ===\n');
    
    const sql = fs.readFileSync('sql/add_assignment_classes_table.sql', 'utf8');
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        await pool.query(statement);
        console.log('✓ Success\n');
      }
    }
    
    console.log('=== Verify Migration ===\n');
    
    // Check table structure
    const [columns] = await pool.query('DESCRIBE assignment_classes');
    console.log('Kolom di tabel assignment_classes:');
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type})`);
    });
    
    // Check migrated data
    console.log('\n=== Data yang Dimigrate ===\n');
    const [data] = await pool.query(`
      SELECT 
        ac.id,
        a.title as assignment_title,
        c.name as class_name
      FROM assignment_classes ac
      JOIN assignments a ON a.id = ac.assignment_id
      JOIN classes c ON c.id = ac.class_id
      ORDER BY ac.id DESC
      LIMIT 10
    `);
    console.table(data);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
})();
