# ✅ Checklist Update Aplikasi ke VPS

## 📋 Persiapan

- [ ] Pastikan koneksi ke VPS stabil (ping 10.10.102.15)
- [ ] Pastikan SSH key sudah di-setup (jalankan: `.\setup-ssh-key.ps1`)
- [ ] Pastikan aplikasi di local sudah di-test dan berjalan baik
- [ ] Catat waktu update (untuk rollback jika perlu)

---

## 🗄️ Update Database

### Backup Database (WAJIB!)

- [ ] Login ke VPS: `ssh root@10.10.102.15`
- [ ] Backup database: `mysqldump -u root -p lms_smk > backup_lms_smk_$(date +%Y%m%d_%H%M%S).sql`
- [ ] Verifikasi file backup ada: `ls -lh backup_*.sql`
- [ ] Catat nama file backup: ___________________________

### Jalankan Update Database

**Pilih salah satu cara:**

#### Cara 1: Otomatis (PowerShell)
- [ ] Jalankan: `.\update-database-vps.ps1`
- [ ] Masukkan password MySQL saat diminta
- [ ] Tunggu sampai selesai

#### Cara 2: Manual
- [ ] Upload SQL: `scp sql/update_vps_database.sql root@10.10.102.15:/root/`
- [ ] Login VPS: `ssh root@10.10.102.15`
- [ ] Jalankan SQL: `mysql -u root -p lms_smk < /root/update_vps_database.sql`
- [ ] Verifikasi: `mysql -u root -p lms_smk -e "SHOW TABLES;"`

### Verifikasi Database

- [ ] Cek tabel baru ada: `question_bank`, `assignments`, `notifications`, `live_classes`
- [ ] Cek kolom baru: `users.profile_photo`, `questions.question_pdf`
- [ ] Tidak ada error message

---

## 📁 Sync File Aplikasi

### Edit Konfigurasi (Sekali Saja)

- [ ] Buka file: `sync-to-vps.ps1`
- [ ] Sesuaikan `VPS_PATH` dengan path di VPS
- [ ] Save file

### Jalankan Sync

- [ ] Jalankan: `.\sync-to-vps.ps1`
- [ ] Tunggu proses upload selesai
- [ ] Aplikasi otomatis restart dengan PM2

### Verifikasi Sync

- [ ] Cek status PM2: `ssh root@10.10.102.15 "pm2 status"`
- [ ] Cek log aplikasi: `ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 20"`
- [ ] Tidak ada error di log

---

## 🧪 Testing Aplikasi

### Test Login

- [ ] Buka aplikasi di browser: http://10.10.102.15
- [ ] Logout (jika sudah login)
- [ ] Login dengan akun admin
- [ ] Login dengan akun guru
- [ ] Login dengan akun siswa

### Test Fitur Lama (Pastikan Tidak Rusak)

- [ ] Dashboard admin/guru/siswa tampil normal
- [ ] Kelola pengguna (admin)
- [ ] Kelola mata pelajaran (admin)
- [ ] Kelola kelas (admin)
- [ ] Buat ujian (guru)
- [ ] Ikut ujian (siswa)
- [ ] Lihat nilai (guru & siswa)

### Test Fitur Baru

- [ ] **Profil**: Upload foto profil
- [ ] **Profil**: Edit informasi profil
- [ ] **Profil**: Ganti password
- [ ] **Bank Soal**: Buat soal baru di bank soal (guru)
- [ ] **Bank Soal**: Import soal dari bank ke ujian (guru)
- [ ] **Tugas**: Buat tugas baru (guru)
- [ ] **Tugas**: Upload tugas (siswa)
- [ ] **Tugas**: Beri nilai tugas (guru)
- [ ] **Notifikasi**: Buat notifikasi (admin)
- [ ] **Notifikasi**: Lihat notifikasi (semua role)
- [ ] **Live Class**: Buat jadwal live class (guru)
- [ ] **Live Class**: Join live class (siswa)

### Test Responsive (Mobile)

- [ ] Buka di HP/tablet
- [ ] Login berhasil
- [ ] Navigasi sidebar berfungsi
- [ ] Tabel responsive (scroll horizontal)
- [ ] Form input berfungsi

---

## 🔧 Troubleshooting

### Jika Database Error

- [ ] Cek log MySQL: `ssh root@10.10.102.15 "tail -50 /var/log/mysql/error.log"`
- [ ] Restore backup: `ssh root@10.10.102.15 "mysql -u root -p lms_smk < backup_lms_smk.sql"`
- [ ] Restart MySQL: `ssh root@10.10.102.15 "systemctl restart mysql"`

### Jika Aplikasi Error

- [ ] Cek log PM2: `ssh root@10.10.102.15 "pm2 logs lms-smkn1kras --lines 50"`
- [ ] Restart aplikasi: `ssh root@10.10.102.15 "pm2 restart lms-smkn1kras"`
- [ ] Cek status PM2: `ssh root@10.10.102.15 "pm2 status"`

### Jika Sync Gagal

- [ ] Cek koneksi: `ping 10.10.102.15`
- [ ] Cek SSH: `ssh root@10.10.102.15 "echo OK"`
- [ ] Cek space disk VPS: `ssh root@10.10.102.15 "df -h"`

---

## 📝 Dokumentasi

### Catat Informasi Update

- **Tanggal Update**: ___________________________
- **Waktu Mulai**: ___________________________
- **Waktu Selesai**: ___________________________
- **File Backup**: ___________________________
- **Versi Aplikasi**: ___________________________
- **Masalah yang Ditemui**: 
  
  ___________________________________________
  
  ___________________________________________

### Informasi Kontak Darurat

- **Admin VPS**: ___________________________
- **Admin Database**: ___________________________
- **Developer**: ___________________________

---

## ✅ Selesai!

- [ ] Semua checklist sudah dicentang
- [ ] Aplikasi berjalan normal
- [ ] Tidak ada error di log
- [ ] User sudah diberitahu untuk logout dan login ulang
- [ ] Dokumentasi update sudah dicatat

---

## 📞 Bantuan

Jika ada masalah:
1. Cek file **CARA_UPDATE_DATABASE_VPS.md**
2. Cek file **TROUBLESHOOTING_PM2_REDIS.md**
3. Restore backup database jika perlu
4. Atau tanya developer 😊
