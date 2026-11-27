-- Migration: tambah kolom sesi ke tabel users
ALTER TABLE users ADD COLUMN IF NOT EXISTS sesi INTEGER DEFAULT NULL;
COMMENT ON COLUMN users.sesi IS 'Sesi ujian siswa (1, 2, 3, dst)';
