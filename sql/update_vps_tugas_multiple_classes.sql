-- Update Database VPS untuk Fitur Tugas Multiple Classes
-- Tanggal: 2026-03-11
-- Deskripsi: Menambahkan tabel assignment_classes dan migrate data existing

-- 1. Buat tabel assignment_classes jika belum ada
CREATE TABLE IF NOT EXISTS assignment_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment_class (assignment_id, class_id),
  INDEX idx_assignment_id (assignment_id),
  INDEX idx_class_id (class_id),
  INDEX idx_assignment_class (assignment_id, class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Migrate data existing dari assignments.class_id ke assignment_classes
INSERT IGNORE INTO assignment_classes (assignment_id, class_id)
SELECT id, class_id
FROM assignments
WHERE class_id IS NOT NULL;

-- 3. Verify migration
SELECT 
  'Migration Summary' as info,
  (SELECT COUNT(*) FROM assignments WHERE class_id IS NOT NULL) as assignments_with_class,
  (SELECT COUNT(*) FROM assignment_classes) as migrated_records,
  CASE 
    WHEN (SELECT COUNT(*) FROM assignments WHERE class_id IS NOT NULL) = (SELECT COUNT(*) FROM assignment_classes) 
    THEN 'SUCCESS' 
    ELSE 'CHECK_NEEDED' 
  END as migration_status;

-- 4. Cek struktur tabel assignment_classes
DESCRIBE assignment_classes;

-- 5. Sample data untuk verifikasi
SELECT 
  ac.id,
  a.title as assignment_title,
  c.name as class_name,
  ac.created_at
FROM assignment_classes ac
JOIN assignments a ON a.id = ac.assignment_id
JOIN classes c ON c.id = ac.class_id
ORDER BY ac.id DESC
LIMIT 10;