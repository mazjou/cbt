const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('=== Struktur Tabel assignments ===\n');
    const [columns] = await pool.query('DESCRIBE assignments');
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type})`);
    });
    
    console.log('\n=== Sample Data ===\n');
    const [sample] = await pool.query(`
      SELECT a.id, a.title, a.class_id, c.name as class_name
      FROM assignments a
      LEFT JOIN classes c ON c.id = a.class_id
      ORDER BY a.id DESC
      LIMIT 5
    `);
    console.table(sample);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
})();
