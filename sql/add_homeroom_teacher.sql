-- Migration: tambah kolom wali kelas ke tabel classes
-- Jalankan: psql -d <dbname> -f add_homeroom_teacher.sql

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS homeroom_teacher_name VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS homeroom_teacher_nip  VARCHAR(30)  NULL;
