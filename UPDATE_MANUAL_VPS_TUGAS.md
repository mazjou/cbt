# Update Manual VPS untuk Fitur Tugas Multiple Classes

## Langkah-Langkah Manual (Mudah)

### 1. Backup Database (WAJIB)
```bash
# SSH ke VPS
ssh user@your-vps

# Backup database
mysqldump -h localhost -u [username] -p [database_name] > backup_tugas_$(date +%Y%m%d).sql

# Contoh:
mysqldump -h localhost -u root -p cbt_database > backup_tugas_20260311.sql
```

### 2. Login ke MySQL
```bash
mysql -h localhost -u [username] -p [database_name]

# Contoh:
mysql -h localhost -u root -p cbt_database
```

### 3. Jalankan SQL Commands (Copy-Paste)

Copy-paste command ini satu per satu ke MySQL:

```sql
-- Buat tabel assignment_classes
CREATE TABLE IF NOT EXISTS assignment_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment_class (assignment_id, class_id),
  INDEX idx_assignment_id (assignment_id),
  INDEX idx_class_id (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```sql
-- Migrate data existing
INSERT IGNORE INTO assignment_classes (assignment_id, class_id)
SELECT id, class_id
FROM assignments
WHERE class_id IS NOT NULL;
```

```sql
-- Cek hasil migration
SELECT COUNT(*) as total_migrated FROM assignment_classes;
```

```sql
-- Lihat sample data
SELECT 
  ac.id,
  a.title as assignment_title,
  c.name as class_name
FROM assignment_classes ac
JOIN assignments a ON a.id = ac.assignment_id
JOIN classes c ON c.id = ac.class_id
LIMIT 5;
```

```sql
-- Exit MySQL
EXIT;
```

### 4. Restart Aplikasi
```bash
# Jika menggunakan PM2
pm2 restart all

# Jika menggunakan systemd
sudo systemctl restart your-app-name

# Jika menggunakan screen/tmux
# Kill session dan start ulang

# Cek status
pm2 status
```

### 5. Test Fitur
1. Buka browser → Login sebagai guru
2. Menu "Tugas Saya" → Harus bisa load
3. "Buat Tugas Baru" → Harus ada checkbox list kelas
4. Buat tugas test → Harus berhasil

## Verifikasi Cepat

### Cek Tabel Ada
```bash
mysql -h localhost -u [username] -p [database_name] -e "DESCRIBE assignment_classes;"
```

### Cek Data Dimigrate
```bash
mysql -h localhost -u [username] -p [database_name] -e "SELECT COUNT(*) FROM assignment_classes;"
```

## Troubleshooting

### Error: Table already exists
```sql
-- Cek apakah tabel sudah ada
SHOW TABLES LIKE 'assignment_classes';

-- Jika sudah ada, skip CREATE TABLE
```

### Error: Foreign key constraint
```sql
-- Cek data yang bermasalah
SELECT * FROM assignments WHERE class_id NOT IN (SELECT id FROM classes);

-- Hapus data bermasalah (jika ada)
DELETE FROM assignments WHERE class_id NOT IN (SELECT id FROM classes);
```

### Error: Duplicate entry
```sql
-- Hapus duplicate (jika ada)
DELETE ac1 FROM assignment_classes ac1
INNER JOIN assignment_classes ac2 
WHERE ac1.id > ac2.id 
AND ac1.assignment_id = ac2.assignment_id 
AND ac1.class_id = ac2.class_id;
```

## Rollback (Jika Ada Masalah)

```bash
# Restore database
mysql -h localhost -u [username] -p [database_name] < backup_tugas_20260311.sql

# Restart aplikasi
pm2 restart all
```

## Checklist Update Manual

- [ ] ✅ Backup database
- [ ] ✅ Login ke MySQL
- [ ] ✅ CREATE TABLE assignment_classes
- [ ] ✅ INSERT data migration
- [ ] ✅ Verifikasi COUNT(*)
- [ ] ✅ Lihat sample data
- [ ] ✅ EXIT MySQL
- [ ] ✅ Restart aplikasi
- [ ] ✅ Test di browser

## Estimasi Waktu
- Backup: 2 menit
- SQL commands: 3 menit
- Restart: 1 menit
- Testing: 5 menit
- **Total: 10-15 menit**

## SQL Commands Lengkap (Copy-Paste Sekaligus)

Jika mau copy-paste sekaligus:

```sql
-- Buat tabel assignment_classes
CREATE TABLE IF NOT EXISTS assignment_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  class_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_assignment_class (assignment_id, class_id),
  INDEX idx_assignment_id (assignment_id),
  INDEX idx_class_id (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate data existing
INSERT IGNORE INTO assignment_classes (assignment_id, class_id)
SELECT id, class_id
FROM assignments
WHERE class_id IS NOT NULL;

-- Verifikasi hasil
SELECT 
  'Migration Summary' as info,
  (SELECT COUNT(*) FROM assignments WHERE class_id IS NOT NULL) as assignments_with_class,
  (SELECT COUNT(*) FROM assignment_classes) as migrated_records;

-- Sample data
SELECT 
  ac.id,
  a.title as assignment_title,
  c.name as class_name
FROM assignment_classes ac
JOIN assignments a ON a.id = ac.assignment_id
JOIN classes c ON c.id = ac.class_id
LIMIT 5;
```

---

**Keuntungan Update Manual:**
- ✅ Kontrol penuh setiap langkah
- ✅ Bisa lihat hasil setiap command
- ✅ Mudah troubleshoot jika ada error
- ✅ Tidak perlu upload file script
- ✅ Bisa pause kapan saja

**Status**: Ready untuk update manual