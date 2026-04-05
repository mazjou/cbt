# Cara Update Database di VPS Production

## 📋 Persiapan

### 1. Backup Database Dulu (WAJIB!)

Login ke VPS:
```bash
ssh root@10.10.102.15
```

Backup database:
```bash
# Backup dengan timestamp
mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql

# Atau backup dengan nama sederhana
mysqldump -u root -p lms_smk > backup_lms_smk.sql
```

Masukkan password MySQL saat diminta.

**Hasil:** File backup akan tersimpan di folder home (biasanya `/root/`)

---

## 🚀 Cara 1: Upload File SQL Lalu Jalankan (RECOMMENDED)

### Step 1: Upload File SQL ke VPS

Di Windows (PowerShell):
```powershell
# Upload file SQL ke VPS
scp sql/update_vps_database.sql root@10.10.102.15:/root/
```

### Step 2: Jalankan SQL di VPS

Login ke VPS:
```bash
ssh root@10.10.102.15
```

Jalankan update database:
```bash
# Masuk ke folder home
cd ~

# Jalankan SQL script
mysql -u root -p lms_smk < update_vps_database.sql
```

Masukkan password MySQL saat diminta.

**Hasil yang diharapkan:**
```
(tidak ada error message = berhasil!)
```

### Step 3: Verifikasi Update Berhasil

Cek tabel baru:
```bash
mysql -u root -p lms_smk -e "SHOW TABLES;"
```

Seharusnya muncul tabel-tabel baru:
- `question_bank`
- `question_bank_options`
- `assignments`
- `assignment_submissions`
- `notifications`
- `notification_reads`
- `live_classes`
- `live_class_participants`
- `attempt_violations`
- `exam_classes`

Cek kolom baru di tabel users:
```bash
mysql -u root -p lms_smk -e "DESCRIBE users;"
```

Seharusnya ada kolom `profile_photo`.

---

## 🚀 Cara 2: Jalankan Langsung dari Windows

### Upload dan Jalankan Sekaligus

Di Windows (PowerShell):
```powershell
# Upload file SQL
scp sql/update_vps_database.sql root@10.10.102.15:/root/

# Jalankan SQL via SSH
ssh root@10.10.102.15 "mysql -u root -p lms_smk < /root/update_vps_database.sql"
```

Masukkan password MySQL saat diminta.

---

## 🚀 Cara 3: Copy-Paste Manual (Jika Cara 1 & 2 Gagal)

### Step 1: Buka File SQL

Di Windows, buka file:
```
sql/update_vps_database.sql
```

Copy semua isinya (Ctrl+A, Ctrl+C).

### Step 2: Login ke MySQL di VPS

```bash
ssh root@10.10.102.15
mysql -u root -p lms_smk
```

### Step 3: Paste dan Jalankan

Paste semua SQL yang sudah di-copy (Klik kanan → Paste).

Tekan Enter untuk menjalankan.

Ketik `exit` untuk keluar dari MySQL.

---

## ✅ Verifikasi Update Berhasil

### 1. Cek Tabel Baru

```bash
mysql -u root -p lms_smk -e "SHOW TABLES;"
```

### 2. Cek Kolom Baru

```bash
# Cek kolom profile_photo di tabel users
mysql -u root -p lms_smk -e "DESCRIBE users;"

# Cek kolom question_pdf di tabel questions
mysql -u root -p lms_smk -e "DESCRIBE questions;"
```

### 3. Restart Aplikasi

```bash
pm2 restart lms-smkn1kras
```

### 4. Test di Browser

Buka aplikasi di browser, coba:
- Login
- Akses halaman profil (seharusnya tidak error)
- Coba fitur-fitur baru (bank soal, tugas, notifikasi, live class)

---

## 🔧 Troubleshooting

### Error: "Table already exists"

**Tidak masalah!** Script menggunakan `CREATE TABLE IF NOT EXISTS`, jadi aman jika tabel sudah ada.

### Error: "Duplicate column name"

**Tidak masalah!** Script menggunakan `ADD COLUMN IF NOT EXISTS`, jadi aman jika kolom sudah ada.

### Error: "Access denied for user"

Pastikan password MySQL benar. Coba login manual:
```bash
mysql -u root -p
```

### Error: "Unknown database 'lms_smk'"

Nama database salah. Cek nama database yang benar:
```bash
mysql -u root -p -e "SHOW DATABASES;"
```

Ganti `lms_smk` dengan nama database yang benar.

### Aplikasi Error Setelah Update

1. Cek log aplikasi:
```bash
pm2 logs lms-smkn1kras --lines 50
```

2. Restart aplikasi:
```bash
pm2 restart lms-smkn1kras
```

3. Jika masih error, restore backup:
```bash
mysql -u root -p lms_smk < backup_lms_smk.sql
pm2 restart lms-smkn1kras
```

---

## 📝 Checklist Update Database

- [ ] Backup database (`mysqldump`)
- [ ] Upload file SQL ke VPS (`scp`)
- [ ] Jalankan SQL script (`mysql < update_vps_database.sql`)
- [ ] Verifikasi tabel baru (`SHOW TABLES`)
- [ ] Verifikasi kolom baru (`DESCRIBE users`)
- [ ] Restart aplikasi (`pm2 restart`)
- [ ] Test di browser (login, profil, fitur baru)

---

## 🎯 Quick Commands

```bash
# Backup database
ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql"

# Upload SQL dari Windows
scp sql/update_vps_database.sql root@10.10.102.15:/root/

# Jalankan update database
ssh root@10.10.102.15 "mysql -u root -p lms_smk < /root/update_vps_database.sql"

# Restart aplikasi
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"

# Cek status aplikasi
ssh root@10.10.102.15 "pm2 status"

# Cek log aplikasi
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"
```

---

## ⚠️ Catatan Penting

1. **SELALU backup database sebelum update!**
2. Script ini AMAN untuk database yang sudah ada data
3. Script hanya menambah tabel/kolom baru, tidak mengubah data lama
4. Jika tabel/kolom sudah ada, script akan skip (tidak error)
5. Setelah update database, user HARUS logout dan login ulang
6. Folder `src/public/uploads` tidak perlu di-sync (berisi data user)

---

## 📞 Bantuan

Jika ada masalah:
1. Cek log aplikasi: `pm2 logs lms-smkn1kras`
2. Cek log MySQL: `/var/log/mysql/error.log`
3. Restore backup jika perlu
4. Atau tanya saya lagi 😊
