-- Migration: tambah kolom tempat_lahir ke tabel users
-- Run once di VPS:
--   PGPASSWORD=$(grep ^DB_PASS /cbt/.env | cut -d= -f2) psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_tempat_lahir_users.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS tempat_lahir VARCHAR(100) NULL;

-- Update dari sdms_siswa yang sudah ada (untuk siswa yang sudah pernah disinkronisasi)
UPDATE users u
SET
  tempat_lahir  = ss.tempat_lahir,
  tanggal_lahir = ss.tanggal_lahir
FROM sdms_siswa ss
WHERE (
  u.username = ss.nisn OR
  u.username = ss.nis  OR
  SPLIT_PART(u.username, '@', 1) = ss.nisn OR
  SPLIT_PART(u.username, '@', 1) = ss.nis
)
  AND u.role = 'STUDENT'
  AND (ss.tempat_lahir IS NOT NULL OR ss.tanggal_lahir IS NOT NULL);

-- Cek hasilnya
SELECT COUNT(*) AS siswa_dengan_ttl
FROM users
WHERE role = 'STUDENT'
  AND (tempat_lahir IS NOT NULL OR tanggal_lahir IS NOT NULL);
