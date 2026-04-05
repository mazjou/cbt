-- Menambahkan kolom question_pdf untuk embed PDF di soal ujian
ALTER TABLE questions 
ADD COLUMN question_pdf VARCHAR(255) NULL AFTER question_image;

-- Komentar: 
-- question_pdf akan menyimpan path file PDF yang di-upload
-- Format: uploads/questions/pdf/xxxxx.pdf
