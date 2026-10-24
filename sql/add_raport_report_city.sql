-- Migration: tambah kolom report_city ke raport_periods
-- Run once di VPS: psql -U lmsuser -h 10.10.102.12 -d cbt_smk -f sql/add_raport_report_city.sql
ALTER TABLE raport_periods ADD COLUMN IF NOT EXISTS report_city VARCHAR(100) NULL;
