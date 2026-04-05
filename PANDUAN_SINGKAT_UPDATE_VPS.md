# Panduan Singkat Update Aplikasi ke VPS

## Jawaban Singkat
✅ **Bisa!** Aplikasi bisa diupdate dengan aman.
✅ **Data aman!** Database tidak akan hilang, hanya ditambah tabel/kolom baru.

## 3 Langkah Utama

### 1️⃣ Backup Dulu (WAJIB!)
```bash
# Di VPS
mysqldump -u root -p lms_smk > backup_$(date +%Y%m%d).sql
tar -czf backup_uploads.tar.gz src/public/uploads/
```

### 2️⃣ Update Kode
```bash
# Stop aplikasi
pm2 stop lms-app

# Update kode (pilih salah satu):
# Opsi A: Git
git pull origin main
npm install

# Opsi B: Upload manual dari Windows
# Upload file zip ke VPS, lalu extract
```

### 3️⃣ Update Database
```bash
# Jalankan migration (menambah tabel/kolom baru)
mysql -u root -p lms_smk < sql/migrate_update.sql

# Restart aplikasi
pm2 restart lms-app
```

## Yang Ditambahkan ke Database

Migration script akan menambahkan:
- Tabel `attempt_violations` (anti-cheat)
- Tabel `question_bank` + `question_bank_options` (bank soal)
- Tabel `assignments` + `assignment_submissions` (tugas)
- Tabel `notifications` + `notification_reads` (notifikasi)
- Tabel `live_classes` + `live_class_participants` (live class)
- Tabel `exam_classes` (multi-class support)
- Kolom `question_pdf` di tabel `questions`

**Data lama tetap aman!** Migration hanya menambah, tidak menghapus atau mengubah data yang sudah ada.

## Jika Ada Masalah

Rollback dengan restore backup:
```bash
pm2 stop lms-app
mysql -u root -p lms_smk < backup_YYYYMMDD.sql
pm2 restart lms-app
```

## Detail Lengkap

Lihat file `CARA_UPDATE_APLIKASI_VPS.md` untuk panduan lengkap dengan troubleshooting.
