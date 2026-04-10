-- Migrasi: sistem kunci pelanggaran dengan token unlock
-- Jalankan: psql -h 127.0.0.1 -U lmsuser -d cbt_smk -f sql/add_violation_lock.sql

-- Tambah kolom max_violations ke exams (default 3)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_violations INT NOT NULL DEFAULT 3;

-- Tambah kolom ke attempts: is_locked, unlock_token, locked_at
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS unlock_token VARCHAR(20) NULL;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS unlock_count INT NOT NULL DEFAULT 0;
