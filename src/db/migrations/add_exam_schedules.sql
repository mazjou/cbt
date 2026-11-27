CREATE TABLE IF NOT EXISTS exam_schedules (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  sesi INTEGER NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  mata_pelajaran TEXT NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
