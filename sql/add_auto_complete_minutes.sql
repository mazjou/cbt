-- Menambahkan kolom auto_complete_minutes ke tabel materials
-- Jalankan query ini jika database sudah ada

ALTER TABLE materials 
ADD COLUMN auto_complete_minutes INT NULL DEFAULT 5 
AFTER is_published;
