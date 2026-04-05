-- =====================================================
-- SCRIPT UPDATE DATABASE UNTUK VPS PRODUCTION
-- =====================================================
-- File: sql/update_vps_database.sql
-- Deskripsi: Update database VPS yang sudah ada data lama
-- Cara Pakai: mysql -u root -p lms_smk < sql/update_vps_database.sql
-- 
-- AMAN untuk database yang sudah ada data!
-- Script ini hanya menambah tabel/kolom baru, tidak mengubah data lama
-- =====================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- =====================================================
-- 1. TAMBAH KOLOM BARU KE TABEL YANG SUDAH ADA
-- =====================================================

-- Kolom profile_photo untuk foto profil user
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_photo VARCHAR(255) DEFAULT NULL AFTER full_name;

-- Kolom question_pdf untuk soal dengan PDF
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS question_pdf VARCHAR(255) NULL AFTER question_image;

-- =====================================================
-- 2. TABEL BARU: BANK SOAL
-- =====================================================

CREATE TABLE IF NOT EXISTS question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  question_type ENUM('MCQ') NOT NULL DEFAULT 'MCQ',
  difficulty ENUM('EASY','MEDIUM','HARD') NOT NULL DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_qb_subject (subject_id),
  INDEX idx_qb_teacher (teacher_id),
  INDEX idx_qb_difficulty (difficulty),
  CONSTRAINT fk_qb_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_qb_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS question_bank_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qb_option_label (question_bank_id, option_label),
  INDEX idx_qbo_question (question_bank_id),
  CONSTRAINT fk_qb_options_question FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. TABEL BARU: TUGAS/ASSIGNMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  due_date DATETIME NULL,
  max_score INT NOT NULL DEFAULT 100,
  allow_late_submission TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assignment_subject (subject_id),
  INDEX idx_assignment_teacher (teacher_id),
  INDEX idx_assignment_class (class_id),
  CONSTRAINT fk_assignments_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assignments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  submitted_at DATETIME NOT NULL,
  score INT NULL,
  feedback TEXT NULL,
  graded_at DATETIME NULL,
  graded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assignment_student (assignment_id, student_id),
  INDEX idx_submission_student (student_id),
  INDEX idx_submission_assignment (assignment_id),
  CONSTRAINT fk_submission_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submission_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submission_grader FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. TABEL BARU: NOTIFIKASI
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  target_role ENUM('ALL','ADMIN','TEACHER','STUDENT','PRINCIPAL') NOT NULL DEFAULT 'ALL',
  target_class_id INT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_role (target_role),
  INDEX idx_notif_class (target_class_id),
  INDEX idx_notif_creator (created_by),
  CONSTRAINT fk_notification_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_class FOREIGN KEY (target_class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_user (notification_id, user_id),
  INDEX idx_notif_read_user (user_id),
  CONSTRAINT fk_notif_read_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. TABEL BARU: LIVE CLASS
-- =====================================================

CREATE TABLE IF NOT EXISTS live_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  meeting_url VARCHAR(500) NULL,
  room_name VARCHAR(100) NULL,
  status ENUM('SCHEDULED','LIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_liveclass_teacher (teacher_id),
  INDEX idx_liveclass_subject (subject_id),
  INDEX idx_liveclass_class (class_id),
  INDEX idx_liveclass_status (status),
  CONSTRAINT fk_liveclass_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_liveclass_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_liveclass_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS live_class_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  live_class_id INT NOT NULL,
  student_id INT NOT NULL,
  joined_at DATETIME NOT NULL,
  left_at DATETIME NULL,
  duration_seconds INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_participant_student (student_id),
  INDEX idx_participant_liveclass (live_class_id),
  CONSTRAINT fk_participant_liveclass FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_participant_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 6. TABEL BARU: ANTI-CHEAT
-- =====================================================

CREATE TABLE IF NOT EXISTS attempt_violations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_violation_attempt (attempt_id),
  INDEX idx_violation_type (violation_type),
  CONSTRAINT fk_violation_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 7. TABEL BARU: MULTI-CLASS SUPPORT UNTUK UJIAN
-- =====================================================

CREATE TABLE IF NOT EXISTS exam_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_class (exam_id, class_id),
  INDEX idx_examclass_exam (exam_id),
  INDEX idx_examclass_class (class_id),
  CONSTRAINT fk_examclass_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_examclass_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 8. TAMBAH INDEX UNTUK PERFORMA
-- =====================================================

-- Index untuk profile_photo (jika belum ada)
CREATE INDEX IF NOT EXISTS idx_users_profile_photo ON users(profile_photo);

-- Index untuk question_pdf (jika belum ada)
CREATE INDEX IF NOT EXISTS idx_questions_pdf ON questions(question_pdf);

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- SELESAI!
-- =====================================================
-- Database berhasil diupdate dengan fitur-fitur baru:
-- ✅ Foto Profil User
-- ✅ Bank Soal
-- ✅ Tugas/Assignments
-- ✅ Notifikasi
-- ✅ Live Class
-- ✅ Anti-Cheat
-- ✅ Multi-Class Support
-- 
-- Data lama tetap aman dan tidak berubah!
-- =====================================================
