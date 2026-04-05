-- Tabel junction untuk assignment multiple classes
CREATE TABLE IF NOT EXISTS assignment_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment_class (assignment_id, class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate existing data from assignments.class_id to assignment_classes
INSERT INTO assignment_classes (assignment_id, class_id)
SELECT id, class_id
FROM assignments
WHERE class_id IS NOT NULL
ON DUPLICATE KEY UPDATE assignment_id = assignment_id;

-- Note: Jangan drop kolom class_id dulu untuk backward compatibility
-- ALTER TABLE assignments DROP COLUMN class_id;
