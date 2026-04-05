# Cara Install Fitur Bank Soal di Production Server

## Error yang Terjadi

```
Table 'cbt_kras.question_bank' doesn't exist
```

Tabel bank soal belum dibuat di database production.

## Solusi: Jalankan Migration di Server Linux

### Metode 1: Via SSH (Recommended)

#### 1. Login ke Server
```bash
ssh user@10.10.102.8
# Atau sesuai IP/hostname server Anda
```

#### 2. Masuk ke Direktori Aplikasi
```bash
cd /var/cbt-smk-premium
```

#### 3. Jalankan Migration
```bash
node run-migration-question-bank.js
```

Expected output:
```
🔧 Starting migration: Create question bank tables...

✅ Connected to database: cbt_kras
📝 Creating question bank tables...
✅ Migration completed successfully!

📊 Verifying tables...
✅ Table question_bank created
   Columns: id, teacher_id, subject_id, question_text, question_image, question_pdf, points, difficulty, tags, created_at, updated_at
✅ Table question_bank_options created
   Columns: id, question_bank_id, option_label, option_text, is_correct, created_at
✅ Table question_bank_usage created
   Columns: id, question_bank_id, question_id, exam_id, used_at

🎉 Question bank tables ready!

🔌 Database connection closed.
```

#### 4. Restart Aplikasi
```bash
pm2 restart cbt-app
pm2 logs cbt-app --lines 20
```

#### 5. Test di Browser
Buka: https://liveclass.tam.web.id/teacher/question-bank

---

### Metode 2: Via MySQL Direct (Alternative)

Jika tidak bisa SSH atau ada masalah dengan script Node.js:

#### 1. Login ke MySQL di Server
```bash
mysql -u root -p cbt_kras
```

#### 2. Copy-Paste SQL Berikut
```sql
-- Tabel untuk menyimpan bank soal
CREATE TABLE IF NOT EXISTS question_bank (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image VARCHAR(255) NULL,
  question_pdf VARCHAR(255) NULL,
  points INT DEFAULT 1,
  difficulty ENUM('EASY', 'MEDIUM', 'HARD') DEFAULT 'MEDIUM',
  tags VARCHAR(255) NULL COMMENT 'Comma-separated tags for categorization',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_teacher_subject (teacher_id, subject_id),
  INDEX idx_difficulty (difficulty),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel untuk opsi jawaban bank soal
CREATE TABLE IF NOT EXISTS question_bank_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  option_label CHAR(1) NOT NULL COMMENT 'A, B, C, D, E',
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  UNIQUE KEY unique_question_option (question_bank_id, option_label),
  INDEX idx_question (question_bank_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabel untuk tracking penggunaan soal dari bank
CREATE TABLE IF NOT EXISTS question_bank_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_bank_id INT NOT NULL,
  question_id INT NOT NULL COMMENT 'ID soal di ujian yang menggunakan bank soal ini',
  exam_id INT NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_bank_id) REFERENCES question_bank(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_bank (question_bank_id),
  INDEX idx_exam (exam_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 3. Verifikasi Tabel Sudah Dibuat
```sql
SHOW TABLES LIKE 'question_bank%';
```

Expected output:
```
+----------------------------------+
| Tables_in_cbt_kras (question_bank%) |
+----------------------------------+
| question_bank                    |
| question_bank_options            |
| question_bank_usage              |
+----------------------------------+
```

#### 4. Cek Struktur Tabel
```sql
DESCRIBE question_bank;
DESCRIBE question_bank_options;
DESCRIBE question_bank_usage;
```

#### 5. Exit MySQL
```sql
EXIT;
```

#### 6. Restart Aplikasi
```bash
pm2 restart cbt-app
```

---

### Metode 3: Via phpMyAdmin / Adminer (GUI)

Jika server punya phpMyAdmin atau Adminer:

#### 1. Login ke phpMyAdmin
URL: http://10.10.102.8/phpmyadmin (atau sesuai konfigurasi)

#### 2. Pilih Database
Klik database `cbt_kras` di sidebar kiri

#### 3. Buka Tab SQL
Klik tab "SQL" di bagian atas

#### 4. Paste SQL
Copy SQL dari file `sql/create_question_bank.sql` dan paste di text area

#### 5. Execute
Klik tombol "Go" atau "Execute"

#### 6. Verifikasi
Cek di sidebar kiri, seharusnya muncul 3 tabel baru:
- question_bank
- question_bank_options
- question_bank_usage

#### 7. Restart Aplikasi
```bash
pm2 restart cbt-app
```

---

## Verifikasi Instalasi

### 1. Cek Tabel di Database
```bash
mysql -u root -p -e "USE cbt_kras; SHOW TABLES LIKE 'question_bank%';"
```

### 2. Cek Aplikasi
```bash
pm2 logs cbt-app --lines 50
```

Pastikan tidak ada error `ER_NO_SUCH_TABLE`.

### 3. Test di Browser
1. Login sebagai guru
2. Buka menu "Bank Soal" atau akses: https://liveclass.tam.web.id/teacher/question-bank
3. Seharusnya muncul halaman bank soal (kosong jika belum ada data)
4. Coba buat soal baru

---

## Troubleshooting

### Error: Access denied for user
**Penyebab**: User MySQL tidak punya permission

**Solusi**:
```sql
-- Login sebagai root
mysql -u root -p

-- Grant permission
GRANT ALL PRIVILEGES ON cbt_kras.* TO 'root'@'localhost';
FLUSH PRIVILEGES;
```

### Error: Foreign key constraint fails
**Penyebab**: Tabel users atau subjects belum ada

**Solusi**:
```sql
-- Cek tabel yang ada
SHOW TABLES;

-- Pastikan ada tabel: users, subjects, questions, exams
```

### Error: Table already exists
**Penyebab**: Tabel sudah dibuat sebelumnya

**Solusi**:
Tidak perlu action, tabel sudah ada. Langsung restart aplikasi.

### Aplikasi Masih Error Setelah Migration
**Penyebab**: PM2 belum restart atau cache

**Solusi**:
```bash
# Stop semua
pm2 stop all

# Delete dari PM2
pm2 delete all

# Start lagi
pm2 start ecosystem.config.js

# Save
pm2 save
```

---

## Quick Command (Copy-Paste)

Untuk yang sudah familiar, ini command lengkap:

```bash
# SSH ke server
ssh user@server_ip

# Masuk direktori
cd /var/cbt-smk-premium

# Jalankan migration
node run-migration-question-bank.js

# Restart PM2
pm2 restart cbt-app

# Cek logs
pm2 logs cbt-app --lines 20

# Test
curl -I https://liveclass.tam.web.id/teacher/question-bank
```

---

## Catatan Penting

1. **Backup Database**: Selalu backup sebelum migration
   ```bash
   mysqldump -u root -p cbt_kras > backup_before_bank_soal.sql
   ```

2. **Test di Development**: Jika ada environment development, test dulu di sana

3. **Rollback**: Jika ada masalah, drop tabel:
   ```sql
   DROP TABLE IF EXISTS question_bank_usage;
   DROP TABLE IF EXISTS question_bank_options;
   DROP TABLE IF EXISTS question_bank;
   ```

4. **Permission**: Pastikan user MySQL punya permission CREATE TABLE

---

**Status**: Pending Installation
**Required**: SSH access ke server production
**Estimated Time**: 5-10 menit
