-- Migration: Add support for multiple classes per exam

-- 1. Create new table for exam-class relationship
CREATE TABLE IF NOT EXISTS exam_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_class (exam_id, class_id),
  INDEX idx_exam (exam_id),
  INDEX idx_class (class_id),
  CONSTRAINT fk_exam_classes_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_exam_classes_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 2. Migrate existing data from exams.class_id to exam_classes table
INSERT INTO exam_classes (exam_id, class_id)
SELECT id, class_id 
FROM exams 
WHERE class_id IS NOT NULL;

-- 3. Keep class_id column for backward compatibility (will be deprecated)
-- ALTER TABLE exams DROP FOREIGN KEY fk_exams_class;
-- ALTER TABLE exams DROP COLUMN class_id;

-- Note: We keep class_id for now to avoid breaking existing code
-- It will be gradually phased out
