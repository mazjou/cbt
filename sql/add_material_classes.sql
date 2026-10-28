-- Migration: Multi-kelas untuk materi (material_classes junction table)
-- Mirip dengan exam_classes dan assignment_classes
-- Run once di server:
--   PGPASSWORD=<pw> psql -U lmsuser -h <host> -d cbt_smk -f sql/add_material_classes.sql

-- 1. Buat tabel junction material_classes
CREATE TABLE IF NOT EXISTS material_classes (
  id          SERIAL PRIMARY KEY,
  material_id INT NOT NULL,
  class_id    INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (material_id, class_id),
  CONSTRAINT fk_mc_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
  CONSTRAINT fk_mc_class    FOREIGN KEY (class_id)    REFERENCES classes(id)   ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_material_classes_material ON material_classes(material_id);
CREATE INDEX IF NOT EXISTS idx_material_classes_class    ON material_classes(class_id);

-- 2. Migrasi data lama: pindahkan class_id dari kolom materials ke material_classes
INSERT INTO material_classes (material_id, class_id)
SELECT id, class_id
FROM materials
WHERE class_id IS NOT NULL
ON CONFLICT (material_id, class_id) DO NOTHING;

-- Kolom class_id di materials dibiarkan (tidak di-drop) untuk backward compatibility
-- Setelah migrasi sistem berjalan stabil, bisa di-drop dengan:
-- ALTER TABLE materials DROP COLUMN class_id;
