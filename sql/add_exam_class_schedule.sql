-- Migrasi: Tambah kolom jadwal per kelas ke exam_classes
-- Jika NULL, fallback ke kolom di tabel exams (backward-compatible)
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS start_at TIMESTAMP NULL;
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS end_at TIMESTAMP NULL;
ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS duration_minutes INT NULL;
