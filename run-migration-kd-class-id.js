/**
 * Migration: tambah kolom class_id ke raport_subject_kd
 *
 * Jalankan sekali sebelum deploy:
 *   node run-migration-kd-class-id.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT || 5432),
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Menjalankan migration: tambah class_id ke raport_subject_kd...');

    await client.query(`
      ALTER TABLE raport_subject_kd
        ADD COLUMN IF NOT EXISTS class_id INT NULL
        REFERENCES classes(id) ON DELETE SET NULL
    `);
    console.log('✅ Kolom class_id ditambahkan (atau sudah ada).');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_raport_subject_kd_class
        ON raport_subject_kd(class_id)
    `);
    console.log('✅ Index idx_raport_subject_kd_class dibuat (atau sudah ada).');

    // Verifikasi
    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'raport_subject_kd' AND column_name = 'class_id'
    `);
    if (rows.length > 0) {
      console.log('\n✅ Verifikasi berhasil:');
      console.table(rows);
    } else {
      console.error('❌ Verifikasi gagal: kolom class_id tidak ditemukan.');
      process.exit(1);
    }

    console.log('\n✅ Migration selesai. Restart aplikasi untuk mengaktifkan perubahan kode.');
  } catch (error) {
    console.error('❌ Migration gagal:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
