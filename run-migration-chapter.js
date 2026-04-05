const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Menghubungkan ke database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cbt_kras',
      multipleStatements: true
    });
    
    console.log('✅ Terhubung ke database');
    
    // Baca file SQL
    const sqlFile = path.join(__dirname, 'sql', 'add_chapter_to_question_bank.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('🔄 Menjalankan migration...');
    await connection.query(sql);
    
    console.log('✅ Migration berhasil dijalankan!');
    console.log('');
    console.log('📋 Perubahan yang dilakukan:');
    console.log('   - Menambahkan kolom "chapter" ke tabel question_bank');
    console.log('   - Menambahkan index untuk pencarian lebih cepat');
    console.log('');
    console.log('✨ Sekarang guru dapat menambahkan bab/materi pada soal bank soal');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Kolom "chapter" sudah ada di database');
    } else {
      throw error;
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Koneksi database ditutup');
    }
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
