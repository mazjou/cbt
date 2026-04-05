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

  // Tambahkan indexes untuk performa
  const indexSqlPath = path.join(__dirname, '..', '..', 'sql', 'add_indexes.sql');
  if (fs.existsSync(indexSqlPath)) {
    const indexSql = fs.readFileSync(indexSqlPath, 'utf8');
    await conn.query(indexSql);
    console.log('✓ Indexes berhasil dibuat');
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
    INSERT INTO users (username, full_name, role, password_hash)
    VALUES ('admin','Administrator','ADMIN',$1)
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash;
  `, [adminPass]);

  await conn.query(`
    INSERT INTO users (username, full_name, role, password_hash)
    VALUES ('guru','Guru SMK','TEACHER',$1)
    ON CONFLICT (username) DO UPDATE SET full_name=EXCLUDED.full_name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash;
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
