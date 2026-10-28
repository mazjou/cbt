require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || 5432);
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'cbt_smk';

  // Koneksi ke postgres default untuk buat database jika belum ada
  const adminConn = new Client({ host, port, user, password, database: 'postgres' });
  await adminConn.connect();

  const dbCheck = await adminConn.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [database]
  );
  if (dbCheck.rowCount === 0) {
    await adminConn.query(`CREATE DATABASE "${database}" ENCODING 'UTF8';`);
    console.log(`✓ Database "${database}" dibuat`);
  } else {
    console.log(`✓ Database "${database}" sudah ada`);
  }
  await adminConn.end();

  // Koneksi ke database target
  const conn = new Client({ host, port, user, password, database });
  await conn.connect();

  // Load schema PostgreSQL
  const schemaPath = path.join(__dirname, '..', '..', 'sql', 'schema_pg.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await conn.query(schemaSql);
  console.log('✓ Schema berhasil dijalankan');

  // Migrasi kolom yang mungkin belum ada (untuk database lama)
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(100) NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS nomor_peserta VARCHAR(30) NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) NULL`,
    `ALTER TABLE options ADD COLUMN IF NOT EXISTS option_image VARCHAR(255) NULL`,
    `ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS link_url VARCHAR(500) NULL`,
    `ALTER TABLE attempts ADD COLUMN IF NOT EXISTS submission_status VARCHAR(20) NULL DEFAULT 'PENDING'`,
    `ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_pdf VARCHAR(255) NULL`,
    `ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_questions INT NULL`,
    // Notifications columns
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id INT NULL REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_role VARCHAR(20) NULL`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'all'`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_id INT NULL`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_users_nomor_peserta ON users(nomor_peserta) WHERE nomor_peserta IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS agendas (
      id SERIAL PRIMARY KEY, teacher_id INT NOT NULL, title VARCHAR(200) NOT NULL,
      description TEXT NULL, agenda_date DATE NOT NULL, start_time TIME NULL,
      end_time TIME NULL, category VARCHAR(50) NOT NULL DEFAULT 'UMUM',
      status VARCHAR(20) NOT NULL DEFAULT 'AKTIF',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL,
      CONSTRAINT fk_agenda_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_agenda_teacher ON agendas(teacher_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agenda_date ON agendas(agenda_date)`,
    `CREATE TABLE IF NOT EXISTS submission_backups (
      id SERIAL PRIMARY KEY, attempt_id INT NOT NULL, student_id INT NOT NULL,
      exam_id INT NOT NULL, backup_data JSONB NULL, status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (attempt_id)
    )`,
    // Jadwal ujian per kelas (multi-waktu)
    `ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS start_at TIMESTAMP NULL`,
    `ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS end_at TIMESTAMP NULL`,
    `ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS duration_minutes INT NULL`,
    // Tambah nilai WEB ke enum embed_type jika belum ada
    `DO $$ BEGIN ALTER TYPE embed_type ADD VALUE IF NOT EXISTS 'WEB'; EXCEPTION WHEN others THEN NULL; END $$`,
    // Material multi-kelas (junction table)
    `CREATE TABLE IF NOT EXISTS material_classes (
      id          SERIAL PRIMARY KEY,
      material_id INT NOT NULL,
      class_id    INT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (material_id, class_id),
      CONSTRAINT fk_mc_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
      CONSTRAINT fk_mc_class    FOREIGN KEY (class_id)    REFERENCES classes(id)   ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_material_classes_material ON material_classes(material_id)`,
    `CREATE INDEX IF NOT EXISTS idx_material_classes_class    ON material_classes(class_id)`,
    `INSERT INTO material_classes (material_id, class_id)
     SELECT id, class_id FROM materials WHERE class_id IS NOT NULL
     ON CONFLICT (material_id, class_id) DO NOTHING`,
  ];
  for (const sql of migrations) {
    try { await conn.query(sql); } catch(e) { /* abaikan jika sudah ada */ }
  }
  console.log('✓ Migrasi kolom selesai');

  // Tambahkan indexes untuk performa
  const indexSqlPath = path.join(__dirname, '..', '..', 'sql', 'add_indexes.sql');
  if (fs.existsSync(indexSqlPath)) {
    try {
      const indexSql = fs.readFileSync(indexSqlPath, 'utf8');
      await conn.query(indexSql);
      console.log('✓ Indexes berhasil dibuat');
    } catch(e) {
      console.log('⚠️ Beberapa index sudah ada, dilanjutkan...');
    }
  }

  // Seed data default — hanya akun admin (data lain tidak perlu di-seed)
  const adminPass = await bcrypt.hash('admin123', 10);

  await conn.query(`
    INSERT INTO users (username, full_name, role, password_hash, plain_password)
    VALUES ('admin','Administrator','ADMIN',$1,'admin123')
    ON CONFLICT (username) DO NOTHING;
  `, [adminPass]);

  console.log('✓ Database & schema siap.');
  console.log('✓ Akun default: admin/admin123 (hanya dibuat jika belum ada)');
  await conn.end();
}

main().catch((err) => {
  console.error('Setup gagal:', err.message);
  process.exit(1);
});
