-- Menambahkan kolom chapter/bab ke tabel question_bank
-- Untuk memudahkan organisasi soal berdasarkan bab atau topik materi

ALTER TABLE question_bank 
ADD COLUMN chapter VARCHAR(255) DEFAULT NULL AFTER subject_id;

-- Menambahkan index untuk pencarian lebih cepat
CREATE INDEX idx_question_bank_chapter ON question_bank(chapter);

-- Komentar kolom
ALTER TABLE question_bank 
MODIFY COLUMN chapter VARCHAR(255) DEFAULT NULL COMMENT 'Bab atau topik materi soal';
