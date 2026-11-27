CREATE TABLE IF NOT EXISTS exam_schedules (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  sesi INTEGER NOT NULL,
  hari VARCHAR(20),
  tanggal DATE,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  mata_pelajaran TEXT NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tambah kolom hari dan tanggal jika tabel sudah ada sebelumnya
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS hari VARCHAR(20);
ALTER TABLE exam_schedules ADD COLUMN IF NOT EXISTS tanggal DATE;
