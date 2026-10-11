-- ============================================================
-- Index untuk optimasi performa ujian banyak user bersamaan
-- Jalankan: psql -U lmsuser -d cbt_smk -f sql/add_indexes.sql
-- ============================================================

-- attempts: query paling sering saat ujian berlangsung
CREATE INDEX IF NOT EXISTS idx_attempts_exam_student ON attempts(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_submission_status ON attempts(submission_status);
CREATE INDEX IF NOT EXISTS idx_attempts_student_status ON attempts(student_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_id_student ON attempts(id, student_id); -- validasi attempt per user

-- attempt_answers: diakses setiap siswa klik jawaban (paling sering)
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt_question ON attempt_answers(attempt_id, question_id);

-- questions: diakses saat load soal ujian
CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id, id); -- untuk shuffle + max_questions

-- options: diakses saat load soal dan cek jawaban
CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);
CREATE INDEX IF NOT EXISTS idx_options_correct ON options(question_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_options_id_question ON options(id, question_id); -- validasi jawaban

-- exams: filter published + jadwal (cek apakah ujian aktif)
CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_published_time ON exams(is_published, start_at, end_at);

-- exam_classes: cek akses siswa ke ujian berdasarkan kelas
CREATE INDEX IF NOT EXISTS idx_exam_classes_class ON exam_classes(class_id);
CREATE INDEX IF NOT EXISTS idx_exam_classes_exam_class ON exam_classes(exam_id, class_id);

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
CREATE INDEX IF NOT EXISTS idx_sb_attempt ON submission_backups(attempt_id);

-- attempt_violations: anti-cheat hitung pelanggaran
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON attempt_violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_attempt_time ON attempt_violations(attempt_id, created_at);

SELECT 'Indexes berhasil dibuat/diperbarui!' AS status;
