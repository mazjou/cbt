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

  // Seed data default
  await conn.query(`
    INSERT INTO classes (code, name) VALUES ('X-RPL-1','X RPL 1')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
  `);

  await conn.query(`
    INSERT INTO subjects (code, name) VALUES ('MAT','Matematika'),('BIN','Bahasa Indonesia')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
  `);

  const adminPass = await bcrypt.hash('admin123', 10);
  const teacherPass = await bcrypt.hash('guru123', 10);
  const studentPass = await bcrypt.hash('siswa123', 10);
  const principalPass = await bcrypt.hash('kepsek123', 10);

  await conn.query(`
    INSERT INTO users (username, full_name, role, password_hash, plain_password)
    VALUES ('admin','Administrator','ADMIN',$1,'admin123')
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash, plain_password=EXCLUDED.plain_password;
  `, [adminPass]);

  await conn.query(`
    INSERT INTO users (username, full_name, role, password_hash, plain_password)
    VALUES ('guru','Guru SMK','TEACHER',$1,'guru123')
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash, plain_password=EXCLUDED.plain_password;
  `, [teacherPass]);

  await conn.query(`
    INSERT INTO users (username, full_name, role, password_hash)
    VALUES ('kepsek','Kepala Sekolah','PRINCIPAL',$1)
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash;
  `, [principalPass]);

  const clsResult = await conn.query(`SELECT id FROM classes WHERE code='X-RPL-1' LIMIT 1;`);
  const classId = clsResult.rows[0]?.id || null;

  await conn.query(`
    INSERT INTO users (username, full_name, role, class_id, password_hash)
    VALUES ('siswa','Siswa Contoh','STUDENT',$1,$2)
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, class_id=EXCLUDED.class_id, password_hash=EXCLUDED.password_hash;
  `, [classId, studentPass]);

  console.log('✓ Database & schema siap.');
  console.log('✓ Akun default: admin/admin123, guru/guru123, siswa/siswa123, kepsek/kepsek123');
  await conn.end();
}

main().catch((err) => {
  console.error('Setup gagal:', err.message);
  process.exit(1);
});
