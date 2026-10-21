-- Migration: Nilai per KD (Kompetensi Dasar) untuk raport tengah semester
-- Run once:
--   PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_raport_kd.sql

-- Tabel master KD per mapel
CREATE TABLE IF NOT EXISTS raport_subject_kd (
  id               SERIAL PRIMARY KEY,
  raport_subject_id INT NOT NULL REFERENCES raport_subjects(id) ON DELETE CASCADE,
  kd_name          VARCHAR(200) NOT NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raport_subject_kd_subject
  ON raport_subject_kd(raport_subject_id);

-- Tabel nilai per KD per siswa per periode
CREATE TABLE IF NOT EXISTS raport_kd_scores (
  id                SERIAL PRIMARY KEY,
  period_id         INT NOT NULL REFERENCES raport_periods(id) ON DELETE CASCADE,
  student_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raport_subject_id INT NOT NULL REFERENCES raport_subjects(id) ON DELETE CASCADE,
  kd_id             INT NOT NULL REFERENCES raport_subject_kd(id) ON DELETE CASCADE,
  score             NUMERIC(5,2) NULL,
  updated_by        INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMP,
  UNIQUE(period_id, student_id, kd_id)
);

CREATE INDEX IF NOT EXISTS idx_raport_kd_scores_lookup
  ON raport_kd_scores(period_id, raport_subject_id, student_id);
