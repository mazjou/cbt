# Ringkasan: Update Database VPS

## 📦 File yang Dibuat

1. **sql/update_vps_database.sql** - Script SQL lengkap untuk update database
2. **update-database-vps.ps1** - Script PowerShell otomatis (Windows)
3. **update-database-vps.sh** - Script Bash otomatis (Git Bash/Linux)
4. **CARA_UPDATE_DATABASE_VPS.md** - Panduan lengkap step-by-step

---

## 🚀 Cara Tercepat (Otomatis)

### Opsi 1: PowerShell (Windows)

```powershell
.\update-database-vps.ps1
```

### Opsi 2: Git Bash

```bash
bash update-database-vps.sh
```

Script akan otomatis:
1. Upload file SQL ke VPS
2. Jalankan update database
3. Verifikasi tabel baru
4. Restart aplikasi

---

## 📋 Apa yang Diupdate?

### Kolom Baru:
- `users.profile_photo` - Untuk foto profil user
- `questions.question_pdf` - Untuk soal dengan PDF

### Tabel Baru:
- `question_bank` + `question_bank_options` - Bank soal
- `assignments` + `assignment_submissions` - Tugas
- `notifications` + `notification_reads` - Notifikasi
- `live_classes` + `live_class_participants` - Live class
- `attempt_violations` - Anti-cheat
- `exam_classes` - Multi-class support

---

## ⚠️ Catatan Penting

1. **WAJIB backup database dulu!**
   ```bash
   ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk.sql"
   ```

2. **Script ini AMAN** - Hanya menambah tabel/kolom baru, tidak mengubah data lama

3. **Setelah update** - User harus logout dan login ulang

4. **Jika error** - Restore backup:
   ```bash
   ssh root@10.10.102.15 "mysql -u root -p lms_smk < backup_lms_smk.sql"
   ```

---

## 🎯 Quick Start

```powershell
# 1. Backup database (di VPS)
ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk.sql"

# 2. Update database (otomatis)
.\update-database-vps.ps1

# 3. Test di browser
# - Logout dan login ulang
# - Coba fitur profil, bank soal, tugas, dll
```

---

## 📞 Troubleshooting

Lihat file **CARA_UPDATE_DATABASE_VPS.md** untuk troubleshooting lengkap.

Quick fix:
```bash
# Cek log aplikasi
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"

# Restart aplikasi
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"
```
