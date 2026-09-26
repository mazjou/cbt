-- Tabel panitia ujian
-- Menyimpan daftar guru yang ditunjuk sebagai panitia ujian
CREATE TABLE IF NOT EXISTS panitia_ujian (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  jabatan VARCHAR(100) NOT NULL DEFAULT 'Panitia',
  nomor_ruang VARCHAR(20) NULL,
  keterangan TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id),
  CONSTRAINT fk_panitia_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_panitia_user ON panitia_ujian(user_id);
