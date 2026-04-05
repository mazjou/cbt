-- Tabel untuk menyimpan bank soal
CREATE TABLE IF NOT EXISTS question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  points INT DEFAULT 1,
  difficulty ENUM('EASY', 'MEDIUM', 'HARD') DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL COMMENT 'Comma-separated tags for categorization',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_teacher_subject (teacher_id, subject_id),
  INDEX idx_difficulty (difficulty),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel untuk opsi jawaban bank soal
CREATE TABLE IF NOT EXISTS question_bank_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL COMMENT 'A, B, C, D, E',
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  UNIQUE KEY unique_question_option (question_bank_id, option_label),
  INDEX idx_question (question_bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel untuk tracking penggunaan soal dari bank
CREATE TABLE IF NOT EXISTS question_bank_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  question_id INT NOT NULL COMMENT 'ID soal di ujian yang menggunakan bank soal ini',
  exam_id INT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_bank (question_bank_id),
  INDEX idx_exam (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Komentar:
-- question_bank: Menyimpan soal yang dapat digunakan ulang
-- question_bank_options: Opsi jawaban untuk bank soal
-- question_bank_usage: Tracking soal mana yang menggunakan bank soal (untuk statistik)
-- difficulty: EASY, MEDIUM, HARD untuk filter
-- tags: Untuk kategorisasi (misal: "trigonometri,sudut,sin-cos")
