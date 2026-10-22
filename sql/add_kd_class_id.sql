-- Migration: tambah class_id ke raport_subject_kd agar TP per kelas bisa dibedakan
-- Baris lama (class_id = NULL) tetap muncul di semua kelas (backward-compatible)
--
-- Cara 1 — runner script (dianjurkan, membaca .env otomatis):
--   node run-migration-kd-class-id.js
--
-- Cara 2 — manual psql:
--   PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_kd_class_id.sql

ALTER TABLE raport_subject_kd
  ADD COLUMN IF NOT EXISTS class_id INT NULL
  REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raport_subject_kd_class
  ON raport_subject_kd(class_id);
