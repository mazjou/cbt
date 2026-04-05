-- LMS SMKN 1 Kras - PostgreSQL Schema
-- Konversi dari MySQL/MariaDB ke PostgreSQL

-- Enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN','TEACHER','STUDENT','PRINCIPAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE embed_type AS ENUM ('YOUTUBE','PDF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('MCQ');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS','SUBMITTED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_level AS ENUM ('EASY','MEDIUM','HARD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('EXAM','MATERIAL','ASSIGNMENT','GENERAL','LIVE_CLASS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE live_class_status AS ENUM ('SCHEDULED','LIVE','ENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE submission_status_type AS ENUM ('PENDING','GRADED','LATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== CLASSES =====
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== SUBJECTS =====
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  role user_role NOT NULL DEFAULT 'STUDENT',
  class_id INT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile_photo VARCHAR(255) NULL,
  plain_password VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_users_class FOREIGN KEY (class_id) REFERENCES classes(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- ===== MATERIALS =====
CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  content_html TEXT NULL,
  embed_type embed_type NULL,
  embed_url VARCHAR(500) NULL,
  class_id INT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  auto_complete_minutes INT NULL DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_materials_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_materials_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_materials_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS material_reads (
  id SERIAL PRIMARY KEY,
  material_id INT NOT NULL,
  student_id INT NOT NULL,
  first_opened_at TIMESTAMP NOT NULL,
  last_opened_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (material_id, student_id),
  CONSTRAINT fk_mr_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mr_student ON material_reads(student_id);

-- ===== EXAMS =====
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  class_id INT NULL,
  start_at TIMESTAMP NULL,
  end_at TIMESTAMP NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  pass_score INT NOT NULL DEFAULT 75,
  shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_options BOOLEAN NOT NULL DEFAULT TRUE,
  max_attempts INT NOT NULL DEFAULT 1,
  access_code VARCHAR(20) NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  show_score_to_student BOOLEAN NOT NULL DEFAULT TRUE,
  show_review_to_student BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_exams_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_exams_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_exams_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exam_classes (
  id SERIAL PRIMARY KEY,
  exam_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exam_id, class_id),
  CONSTRAINT fk_exam_classes_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_exam_classes_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_exam_classes_exam ON exam_classes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_class ON exam_classes(class_id);

-- ===== QUESTIONS =====
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  exam_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  question_type question_type NOT NULL DEFAULT 'MCQ',
  points INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS options (
  id SERIAL PRIMARY KEY,
  question_id INT NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  option_image VARCHAR(255) NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, option_label),
  CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ===== ATTEMPTS =====
CREATE TABLE IF NOT EXISTS attempts (
  id SERIAL PRIMARY KEY,
  exam_id INT NOT NULL,
  student_id INT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NULL,
  status attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
  submission_status VARCHAR(20) NULL DEFAULT 'PENDING',
  score INT NOT NULL DEFAULT 0,
  total_points INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attempts_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attempt_student ON attempts(student_id);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL,
  question_id INT NOT NULL,
  option_id INT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at TIMESTAMP NULL,
  UNIQUE (attempt_id, question_id),
  CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_answers_option FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attempt_violations (
  id SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_violation_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_violation_attempt ON attempt_violations(attempt_id);

-- ===== QUESTION BANK =====
CREATE TABLE IF NOT EXISTS question_bank (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  question_type question_type NOT NULL DEFAULT 'MCQ',
  difficulty difficulty_level NOT NULL DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL,
  chapter VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_qb_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_qb_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS question_bank_options (
  id SERIAL PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_bank_id, option_label),
  CONSTRAINT fk_qb_options_question FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_bank_usage (
  id SERIAL PRIMARY KEY,
  question_bank_id INT NOT NULL,
  exam_id INT NOT NULL,
  question_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qbu_bank FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  CONSTRAINT fk_qbu_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT fk_qbu_question FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ===== ASSIGNMENTS =====
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  due_date TIMESTAMP NULL,
  max_score INT NOT NULL DEFAULT 100,
  allow_late_submission BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_assign_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assign_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assign_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assignment_classes (
  id SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, class_id),
  CONSTRAINT fk_ac_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  submitted_at TIMESTAMP NULL,
  score INT NULL,
  feedback TEXT NULL,
  graded_at TIMESTAMP NULL,
  graded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (assignment_id, student_id),
  CONSTRAINT fk_asub_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_asub_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'GENERAL',
  reference_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notification_reads (
  id SERIAL PRIMARY KEY,
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (notification_id, user_id),
  CONSTRAINT fk_nr_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_nr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===== DEVICE TOKENS (Firebase Push) =====
CREATE TABLE IF NOT EXISTS device_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token TEXT NOT NULL,
  platform VARCHAR(20) NULL DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  UNIQUE (user_id, token),
  CONSTRAINT fk_dt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===== LIVE CLASSES =====
CREATE TABLE IF NOT EXISTS live_classes (
  id SERIAL PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  room_id VARCHAR(20) NULL,
  meeting_url VARCHAR(500) NULL,
  scheduled_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  max_participants INT NOT NULL DEFAULT 100,
  status live_class_status NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  CONSTRAINT fk_lc_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lc_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_lc_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS live_class_participants (
  id SERIAL PRIMARY KEY,
  live_class_id INT NOT NULL,
  student_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP NULL,
  UNIQUE (live_class_id, student_id),
  CONSTRAINT fk_lcp_lc FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_lcp_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

DO $$ BEGIN
  CREATE TYPE chat_room_type AS ENUM ('CLASS','MATERIAL','EXAM','LIVE_CLASS','PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  room_type chat_room_type NOT NULL,
  room_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_type, room_id);
CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id);

CREATE TABLE IF NOT EXISTS forum_discussions (
  id SERIAL PRIMARY KEY,
  live_class_id INT NOT NULL,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fd_lc FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_fd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forum_replies (
  id SERIAL PRIMARY KEY,
  discussion_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fr_discussion FOREIGN KEY (discussion_id) REFERENCES forum_discussions(id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_quizzes (
  id SERIAL PRIMARY KEY,
  live_class_id INT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_answer VARCHAR(10) NULL,
  duration_seconds INT NOT NULL DEFAULT 30,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lq_lc FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS live_quiz_answers (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL,
  student_id INT NOT NULL,
  answer VARCHAR(10) NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (quiz_id, student_id),
  CONSTRAINT fk_lqa_quiz FOREIGN KEY (quiz_id) REFERENCES live_quizzes(id) ON DELETE CASCADE,
  CONSTRAINT fk_lqa_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===== SUBMISSION BACKUPS =====
CREATE TABLE IF NOT EXISTS submission_backups (
  id SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL,
  student_id INT NOT NULL,
  exam_id INT NOT NULL,
  backup_data JSONB NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attempt_id),
  CONSTRAINT fk_sb_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
);

-- ===== TRIGGER: updated_at otomatis =====
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON materials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_question_bank_updated_at BEFORE UPDATE ON question_bank
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_live_classes_updated_at BEFORE UPDATE ON live_classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
