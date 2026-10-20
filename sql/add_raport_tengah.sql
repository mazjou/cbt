-- Migration: Laporan Tengah Semester
-- Run once: psql -d <dbname> -f add_raport_tengah.sql

-- Tambah kolom tanggal_lahir ke users jika belum ada
ALTER TABLE users ADD COLUMN IF NOT EXISTS tanggal_lahir DATE NULL;

-- Tabel periode raport
CREATE TABLE IF NOT EXISTS raport_periods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  school_year VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabel grup mata pelajaran (mis: A. Muatan Nasional, B. Muatan Kewilayahan)
CREATE TABLE IF NOT EXISTS raport_subject_groups (
  id SERIAL PRIMARY KEY,
  period_id INT NOT NULL REFERENCES raport_periods(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0
);

-- Tabel mata pelajaran raport
CREATE TABLE IF NOT EXISTS raport_subjects (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES raport_subject_groups(id) ON DELETE CASCADE,
  period_id INT NOT NULL REFERENCES raport_periods(id) ON DELETE CASCADE,
  subject_name VARCHAR(100) NOT NULL,
  sort_order INT DEFAULT 0,
  teacher_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- Tabel nilai raport
CREATE TABLE IF NOT EXISTS raport_scores (
  id SERIAL PRIMARY KEY,
  period_id INT NOT NULL REFERENCES raport_periods(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raport_subject_id INT NOT NULL REFERENCES raport_subjects(id) ON DELETE CASCADE,
  score DECIMAL(5,2),
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(period_id, student_id, raport_subject_id)
);
