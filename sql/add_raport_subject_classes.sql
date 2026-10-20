-- Tambah tabel relasi mapel-kelas untuk raport tengah semester
-- Memungkinkan 1 mapel punya banyak kelas dengan guru yang berbeda
CREATE TABLE IF NOT EXISTS raport_subject_classes (
  id SERIAL PRIMARY KEY,
  raport_subject_id INT NOT NULL REFERENCES raport_subjects(id) ON DELETE CASCADE,
  class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(raport_subject_id, class_id)
);
