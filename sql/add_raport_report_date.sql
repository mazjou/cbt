-- Migration: tambah kolom report_date (tanggal cetak raport) ke raport_periods
-- Admin bisa mengisi tanggal raport per periode dari dashboard. Tanggal ini tampil
-- sebagai baris kota+tanggal di atas tanda tangan wali kelas pada cetak raport.
-- Jika report_date NULL, baris kota+tanggal TIDAK ditampilkan di cetak.
-- Jalankan sekali di VPS (sesuaikan password):
--   PGPASSWORD=<pw> psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_raport_report_date.sql

ALTER TABLE raport_periods ADD COLUMN IF NOT EXISTS report_date DATE NULL;
