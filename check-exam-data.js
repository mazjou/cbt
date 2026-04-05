// Script untuk cek data ujian di database
// Jalankan: node check-exam-data.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkExamData() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true
  });

  try {
    console.log('🔍 Mengecek data ujian ID 2...\n');

    // Get exam data
    const [exams] = await pool.query(
      `SELECT 
        id, 
        title, 
        start_at, 
        end_at,
        duration_minutes,
        created_at
      FROM exams 
      WHERE id = 2`
    );

    if (exams.length === 0) {
      console.log('❌ Ujian dengan ID 2 tidak ditemukan!');
      return;
    }

    const exam = exams[0];
    
    console.log('📋 Data Ujian:');
    console.log('─────────────────────────────────────');
    console.log('ID:', exam.id);
    console.log('Judul:', exam.title);
    console.log('Durasi:', exam.duration_minutes, 'menit');
    console.log('');
    console.log('⏰ Waktu:');
    console.log('─────────────────────────────────────');
    console.log('start_at (raw):', exam.start_at);
    console.log('end_at (raw):', exam.end_at);
    console.log('');
    
    if (exam.start_at) {
      console.log('start_at (formatted):', new Date(exam.start_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
      console.log('start_at (ISO):', new Date(exam.start_at).toISOString());
      console.log('start_at (datetime-local format):', 
        new Date(new Date(exam.start_at).getTime() - new Date(exam.start_at).getTimezoneOffset() * 60000).toISOString().slice(0,16)
      );
    } else {
      console.log('⚠️  start_at adalah NULL!');
    }
    
    console.log('');
    
    if (exam.end_at) {
      console.log('end_at (formatted):', new Date(exam.end_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
      console.log('end_at (ISO):', new Date(exam.end_at).toISOString());
      console.log('end_at (datetime-local format):', 
        new Date(new Date(exam.end_at).getTime() - new Date(exam.end_at).getTimezoneOffset() * 60000).toISOString().slice(0,16)
      );
    } else {
      console.log('⚠️  end_at adalah NULL!');
    }
    
    console.log('');
    console.log('📅 Dibuat:', new Date(exam.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
    console.log('');
    
    // Check if NULL
    if (!exam.start_at || !exam.end_at) {
      console.log('❌ MASALAH DITEMUKAN:');
      console.log('   Waktu mulai atau waktu selesai adalah NULL!');
      console.log('');
      console.log('💡 SOLUSI:');
      console.log('   1. Update waktu ujian secara manual di database');
      console.log('   2. Atau edit ujian dan isi waktu yang benar');
      console.log('');
      console.log('📝 Query untuk update manual:');
      console.log(`   UPDATE exams SET`);
      console.log(`     start_at = '2024-01-15 08:00:00',`);
      console.log(`     end_at = '2024-01-15 10:00:00'`);
      console.log(`   WHERE id = 2;`);
    } else {
      console.log('✅ Data waktu lengkap!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkExamData();
