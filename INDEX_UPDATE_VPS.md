# 📚 Index: Update Database & Sync VPS

Dokumentasi lengkap untuk update database dan sinkronisasi aplikasi ke VPS.

---

## 🎯 Quick Start (Paling Cepat)

```powershell
# 1. Backup database
ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql"

# 2. Update database (otomatis)
.\update-database-vps.ps1

# 3. Sync files (otomatis)
.\sync-to-vps.ps1

# 4. Test di browser
# - Logout dan login ulang
# - Test semua fitur
```

---

## 📁 File-File yang Tersedia

### 1. Script SQL

| File | Deskripsi |
|------|-----------|
| `sql/update_vps_database.sql` | Script SQL lengkap untuk update database VPS |

**Isi:**
- Tambah kolom `profile_photo` ke tabel `users`
- Tambah kolom `question_pdf` ke tabel `questions`
- Buat tabel `question_bank` + `question_bank_options`
- Buat tabel `assignments` + `assignment_submissions`
- Buat tabel `notifications` + `notification_reads`
- Buat tabel `live_classes` + `live_class_participants`
- Buat tabel `attempt_violations`
- Buat tabel `exam_classes`

### 2. Script Otomatis

| File | Deskripsi | Cara Pakai |
|------|-----------|------------|
| `update-database-vps.ps1` | Update database otomatis (PowerShell) | `.\update-database-vps.ps1` |
| `update-database-vps.sh` | Update database otomatis (Bash) | `bash update-database-vps.sh` |
| `sync-to-vps.ps1` | Sync files ke VPS (PowerShell) | `.\sync-to-vps.ps1` |
| `sync-to-vps.sh` | Sync files ke VPS (Bash) | `bash sync-to-vps.sh` |
| `setup-ssh-key.ps1` | Setup SSH key tanpa password | `.\setup-ssh-key.ps1` |

### 3. Dokumentasi

| File | Deskripsi | Untuk Siapa |
|------|-----------|-------------|
| `RINGKASAN_UPDATE_DATABASE.md` | Ringkasan singkat update database | Semua orang |
| `CARA_UPDATE_DATABASE_VPS.md` | Panduan lengkap step-by-step | Pemula |
| `CHECKLIST_UPDATE_VPS.md` | Checklist untuk print/simpan | Admin/Operator |
| `QUICK_COMMANDS_VPS.md` | Kumpulan command VPS | Developer |
| `PANDUAN_SYNC_VPS_LENGKAP.md` | Panduan sync files lengkap | Semua orang |
| `CARA_SINKRON_OTOMATIS_VPS.md` | Panduan sinkronisasi otomatis | Developer |

---

## 🚀 Workflow Update Aplikasi

### Pertama Kali (Setup)

1. **Setup SSH Key** (sekali saja)
   ```powershell
   .\setup-ssh-key.ps1
   ```

2. **Edit Konfigurasi Sync** (sekali saja)
   - Buka `sync-to-vps.ps1`
   - Sesuaikan `VPS_PATH` dengan path di VPS
   - Save

### Setiap Ada Update

1. **Backup Database** (WAJIB!)
   ```powershell
   ssh root@10.10.102.15 "mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql"
   ```

2. **Update Database** (jika ada perubahan struktur)
   ```powershell
   .\update-database-vps.ps1
   ```

3. **Sync Files** (setiap ada perubahan code)
   ```powershell
   .\sync-to-vps.ps1
   ```

4. **Test Aplikasi**
   - Buka di browser
   - Logout dan login ulang
   - Test fitur yang diupdate

---

## 📖 Panduan Berdasarkan Kebutuhan

### Saya Baru Pertama Kali Update VPS
👉 Baca: `CARA_UPDATE_DATABASE_VPS.md`

### Saya Ingin Update Cepat
👉 Baca: `RINGKASAN_UPDATE_DATABASE.md`

### Saya Ingin Checklist Lengkap
👉 Baca: `CHECKLIST_UPDATE_VPS.md`

### Saya Ingin Command-Command Praktis
👉 Baca: `QUICK_COMMANDS_VPS.md`

### Saya Ingin Setup Sync Otomatis
👉 Baca: `PANDUAN_SYNC_VPS_LENGKAP.md`

---

## 🔧 Troubleshooting

### Database Error
```powershell
# Restore backup
ssh root@10.10.102.15 "mysql -u root -p lms_smk < backup_lms_smk.sql"

# Restart MySQL
ssh root@10.10.102.15 "systemctl restart mysql"
```

### Aplikasi Error
```powershell
# Cek log
ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"

# Restart aplikasi
ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"
```

### Sync Gagal
```powershell
# Cek koneksi
ping 10.10.102.15

# Cek SSH
ssh root@10.10.102.15 "echo OK"

# Setup ulang SSH key
.\setup-ssh-key.ps1
```

---

## 📊 Fitur-Fitur Baru yang Ditambahkan

### 1. Foto Profil User
- User bisa upload foto profil
- Foto tampil di navbar dan halaman profil
- Support JPG, PNG, max 2MB

### 2. Bank Soal
- Guru bisa menyimpan soal untuk digunakan ulang
- Filter berdasarkan mata pelajaran, tingkat kesulitan
- Import soal dari bank ke ujian

### 3. Tugas/Assignments
- Guru bisa membuat tugas
- Siswa upload file tugas
- Guru beri nilai dan feedback

### 4. Notifikasi
- Admin/Guru bisa kirim notifikasi
- Filter berdasarkan role dan kelas
- Notifikasi tampil di navbar

### 5. Live Class
- Guru bisa jadwalkan live class
- Integrasi dengan Jitsi Meet
- Tracking kehadiran siswa

### 6. Anti-Cheat
- Tracking tab switch
- Tracking copy-paste
- Tracking fullscreen exit

### 7. Multi-Class Support
- Ujian bisa untuk multiple kelas
- Guru bisa pilih beberapa kelas sekaligus

---

## ⚠️ Catatan Penting

1. **SELALU backup database sebelum update!**
2. **Test di local dulu sebelum update ke VPS**
3. **User harus logout dan login ulang setelah update**
4. **Folder `src/public/uploads` jangan di-sync** (berisi data user)
5. **File `.env` jangan di-sync** (berisi konfigurasi VPS)

---

## 📞 Bantuan

Jika ada masalah:
1. Cek file dokumentasi yang sesuai (lihat tabel di atas)
2. Cek `QUICK_COMMANDS_VPS.md` untuk command praktis
3. Restore backup jika perlu
4. Atau tanya developer 😊

---

## 🎯 Checklist Cepat

- [ ] Setup SSH key (`.\setup-ssh-key.ps1`)
- [ ] Edit konfigurasi sync (`sync-to-vps.ps1`)
- [ ] Backup database
- [ ] Update database (`.\update-database-vps.ps1`)
- [ ] Sync files (`.\sync-to-vps.ps1`)
- [ ] Test aplikasi di browser
- [ ] User logout dan login ulang

---

**Selamat mengupdate! 🚀**
