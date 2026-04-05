# Cara Update Aplikasi di VPS Ubuntu

## Ringkasan
Panduan ini menjelaskan cara update aplikasi CBT yang sudah berjalan di VPS Ubuntu dengan versi terbaru dari Windows, tanpa kehilangan data yang sudah ada.

## Strategi Update

### A. Update Kode Aplikasi
Kode aplikasi bisa diupdate dengan aman menggunakan Git atau upload manual.

### B. Sinkronisasi Database
Database perlu dimigrate dengan hati-hati agar data lama tetap aman.

---

## Langkah 1: Backup Data di VPS (WAJIB!)

Sebelum update apapun, backup dulu data yang ada:

```bash
# Login ke VPS
ssh user@your-vps-ip

# Masuk ke direktori aplikasi
cd /path/to/your/app

# Backup database
mysqldump -u root -p lms_smk > backup_database_$(date +%Y%m%d_%H%M%S).sql

# Backup folder uploads (foto, file tugas, dll)
tar -czf backup_uploads_$(date +%Y%m%d_%H%M%S).tar.gz src/public/uploads/

# Backup .env
cp .env .env.backup
```

---

## Langkah 2: Update Kode Aplikasi

### Opsi A: Menggunakan Git (Recommended)

Jika aplikasi di VPS menggunakan Git:

```bash
# Di VPS
cd /path/to/your/app

# Stop aplikasi dulu
pm2 stop lms-app

# Pull update terbaru
git pull origin main
# atau
git pull origin master

# Install dependencies baru (jika ada)
npm install

# Lanjut ke Langkah 3
```

### Opsi B: Upload Manual dari Windows

Jika tidak pakai Git:

**Di Windows:**
1. Compress folder aplikasi (exclude node_modules, .env, uploads):
```powershell
# Buat zip tanpa node_modules dan uploads
Compress-Archive -Path src,sql,package.json,ecosystem.config.js -DestinationPath app-update.zip
```

2. Upload ke VPS menggunakan SCP atau SFTP:
```powershell
# Menggunakan SCP (dari Windows)
scp app-update.zip user@your-vps-ip:/tmp/
```

**Di VPS:**
```bash
# Stop aplikasi
pm2 stop lms-app

# Backup kode lama
cd /path/to/your/app
cd ..
cp -r your-app your-app-backup-$(date +%Y%m%d)

# Extract update
cd /path/to/your/app
unzip /tmp/app-update.zip -d .

# Install dependencies
npm install

# Lanjut ke Langkah 3
```

---

## Langkah 3: Sinkronisasi Database

Database perlu diupdate dengan tabel/kolom baru tanpa menghapus data lama.

### Cek Perubahan Database

Bandingkan schema lama vs baru:

```bash
# Di VPS, lihat struktur database saat ini
mysql -u root -p lms_smk -e "SHOW TABLES;"
mysql -u root -p lms_smk -e "DESCRIBE attempts;"
mysql -u root -p lms_smk -e "DESCRIBE questions;"
```

### Jalankan Migration Script

Buat file migration untuk perubahan database baru:

```bash
# Di VPS
cd /path/to/your/app
nano sql/migrate_update.sql
```

Isi dengan ALTER TABLE untuk perubahan baru (contoh):

```sql
-- Migration untuk update terbaru
-- Tambahkan kolom baru jika belum ada

-- Cek dan tambah kolom question_pdf jika belum ada
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS question_pdf VARCHAR(255) NULL AFTER question_image;

-- Cek dan tambah tabel attempt_violations jika belum ada
CREATE TABLE IF NOT EXISTS attempt_violations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  details VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_violation_attempt (attempt_id),
  CONSTRAINT fk_violation_attempt FOREIGN KEY (attempt_id) REFERENCES attempts(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tambah tabel question_bank jika belum ada
CREATE TABLE IF NOT EXISTS question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  question_type ENUM('MCQ') NOT NULL DEFAULT 'MCQ',
  difficulty ENUM('EASY','MEDIUM','HARD') NOT NULL DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_qb_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_qb_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS question_bank_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qb_option_label (question_bank_id, option_label),
  CONSTRAINT fk_qb_options_question FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tambah tabel assignments jika belum ada
CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  due_date DATETIME NULL,
  max_score INT NOT NULL DEFAULT 100,
  allow_late_submission TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignments_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assignments_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assignments_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  file_path VARCHAR(255) NULL,
  file_name VARCHAR(255) NULL,
  notes TEXT NULL,
  submitted_at DATETIME NOT NULL,
  score INT NULL,
  feedback TEXT NULL,
  graded_at DATETIME NULL,
  graded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assignment_student (assignment_id, student_id),
  INDEX idx_submission_student (student_id),
  CONSTRAINT fk_submission_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submission_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_submission_grader FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tambah tabel notifications jika belum ada
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  target_role ENUM('ALL','ADMIN','TEACHER','STUDENT','PRINCIPAL') NOT NULL DEFAULT 'ALL',
  target_class_id INT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notification_class FOREIGN KEY (target_class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_user (notification_id, user_id),
  CONSTRAINT fk_notif_read_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_read_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tambah tabel live_classes jika belum ada
CREATE TABLE IF NOT EXISTS live_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_id INT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  meeting_url VARCHAR(500) NULL,
  room_name VARCHAR(100) NULL,
  status ENUM('SCHEDULED','LIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_liveclass_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_liveclass_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_liveclass_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS live_class_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  live_class_id INT NOT NULL,
  student_id INT NOT NULL,
  joined_at DATETIME NOT NULL,
  left_at DATETIME NULL,
  duration_seconds INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_participant_student (student_id),
  INDEX idx_participant_liveclass (live_class_id),
  CONSTRAINT fk_participant_liveclass FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_participant_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Tambah tabel exam_classes jika belum ada (untuk multi-class support)
CREATE TABLE IF NOT EXISTS exam_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_exam_class (exam_id, class_id),
  CONSTRAINT fk_examclass_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_examclass_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
```

Jalankan migration:

```bash
mysql -u root -p lms_smk < sql/migrate_update.sql
```

---

## Langkah 4: Restart Aplikasi

```bash
# Di VPS
cd /path/to/your/app

# Restart dengan PM2
pm2 restart lms-app

# Atau jika belum pakai PM2
pm2 start ecosystem.config.js

# Cek status
pm2 status
pm2 logs lms-app --lines 50
```

---

## Langkah 5: Verifikasi Update

```bash
# Cek aplikasi berjalan
curl http://localhost:3000

# Cek log untuk error
pm2 logs lms-app --lines 100

# Test login dan fitur baru
```

---

## Troubleshooting

### Error: Module not found
```bash
# Install ulang dependencies
npm install
pm2 restart lms-app
```

### Error: Database column not found
```bash
# Jalankan ulang migration
mysql -u root -p lms_smk < sql/migrate_update.sql
```

### Error: Permission denied pada uploads
```bash
# Fix permission folder uploads
chmod -R 755 src/public/uploads/
chown -R $USER:$USER src/public/uploads/
```

### Aplikasi tidak bisa diakses
```bash
# Cek port
netstat -tulpn | grep 3000

# Cek firewall
sudo ufw status
sudo ufw allow 3000

# Restart PM2
pm2 restart all
```

---

## Rollback Jika Ada Masalah

Jika update bermasalah, rollback ke versi lama:

```bash
# Stop aplikasi
pm2 stop lms-app

# Restore kode lama
cd /path/to
rm -rf your-app
mv your-app-backup-YYYYMMDD your-app

# Restore database
mysql -u root -p lms_smk < backup_database_YYYYMMDD_HHMMSS.sql

# Restart
cd your-app
pm2 restart lms-app
```

---

## Checklist Update

- [ ] Backup database
- [ ] Backup folder uploads
- [ ] Backup .env
- [ ] Stop aplikasi (pm2 stop)
- [ ] Update kode (git pull atau upload manual)
- [ ] npm install
- [ ] Jalankan migration database
- [ ] Restart aplikasi (pm2 restart)
- [ ] Test login
- [ ] Test fitur baru
- [ ] Cek logs untuk error

---

## Tips Penting

1. **Selalu backup sebelum update** - Database dan uploads adalah aset paling penting
2. **Update saat jam sepi** - Misal malam hari atau weekend agar tidak ganggu user
3. **Test di local dulu** - Pastikan aplikasi berjalan di Windows sebelum upload ke VPS
4. **Gunakan Git** - Lebih mudah untuk tracking perubahan dan rollback
5. **Monitor logs** - Setelah update, pantau logs selama 10-15 menit untuk deteksi error

---

## Sinkronisasi Data Antar Environment

Jika ingin sync data dari VPS ke Windows (untuk testing):

```bash
# Di VPS, export database
mysqldump -u root -p lms_smk > export_data.sql

# Download ke Windows
scp user@vps-ip:/path/to/export_data.sql .

# Di Windows, import
mysql -u root -p lms_smk < export_data.sql
```

---

## Kontak Darurat

Jika ada masalah serius:
1. Restore dari backup
2. Hubungi admin VPS
3. Cek dokumentasi di folder project
