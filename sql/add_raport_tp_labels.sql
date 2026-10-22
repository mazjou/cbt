-- Migration: custom nama kolom TP (Tujuan Pembelajaran) per periode raport
-- Admin bisa mengubah nama kolom "TP 1", "TP 2", dst di cetak raport menjadi nama
-- custom (mis. "Pengetahuan", "Keterampilan") per periode. Jika belum diset, cetak
-- raport fallback ke "TP 1", "TP 2", dst.
-- Jalankan sekali di VPS (sesuaikan password):
--   PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_raport_tp_labels.sql

CREATE TABLE IF NOT EXISTS raport_tp_labels (
  id        SERIAL PRIMARY KEY,
  period_id INT NOT NULL REFERENCES raport_periods(id) ON DELETE CASCADE,
  tp_index  INT NOT NULL,
  label     VARCHAR(100) NOT NULL,
  UNIQUE(period_id, tp_index)
);
