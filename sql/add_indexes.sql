-- ============================================================
-- Index untuk optimasi performa ujian banyak user bersamaan
-- Jalankan: psql -U lmsuser -d cbt_smk -f sql/add_indexes.sql
-- ============================================================

-- attempts: query paling sering saat ujian berlangsung
CREATE INDEX IF NOT EXISTS idx_attempts_exam_student ON attempts(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_submission_status ON attempts(submission_status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON attempts(student_id, status);

-- attempt_answers: diakses setiap siswa klik jawaban
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt_question ON attempt_answers(attempt_id, question_id);

-- questions: diakses saat load soal ujian
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);

-- options: diakses saat load soal dan cek jawaban
CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_options_correct ON options(question_id, is_correct);

-- exams: filter published + class
CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);

-- exam_classes: cek akses siswa ke ujian
CREATE INDEX IF NOT EXISTS idx_exam_classes_class ON exam_classes(class_id);

-- users: login dan filter role
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_class ON users(class_id);

-- material_reads: tracking materi
CREATE INDEX IF NOT EXISTS idx_material_reads_student ON material_reads(student_id);
CREATE INDEX IF NOT EXISTS idx_material_reads_material ON material_reads(material_id);

-- assignment_submissions
CREATE INDEX IF NOT EXISTS idx_asub_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_asub_student ON assignment_submissions(student_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_active ON notifications(is_active, target_type);
CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads(user_id);

-- submission_backups
CREATE INDEX IF NOT EXISTS idx_sb_status ON submission_backups(status);

SELECT 'Indexes berhasil dibuat!' AS status;
