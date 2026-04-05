# Panduan Update VPS untuk Fitur Tugas Multiple Classes

## Masalah
VPS gagal memuat tugas karena database belum diupdate dengan fitur multiple classes yang baru.

## Yang Perlu Diupdate

### 1. Database Schema
- Tabel baru: `assignment_classes` (junction table)
- Migration data dari `assignments.class_id` ke `assignment_classes`
- Index untuk performance

### 2. Query Baru
- Ranking kelas menggunakan subquery dengan `assignment_classes`
- Student view menggunakan INNER JOIN dengan `assignment_classes`
- Teacher view menggunakan GROUP_CONCAT untuk multiple classes

## Cara Update VPS

### Opsi 1: Menggunakan Script Otomatis (Recommended)

#### Linux/Ubuntu VPS:
```bash
# Upload file ke VPS
scp sql/update_vps_tugas_multiple_classes.sql user@your-vps:/path/to/app/sql/
scp update-vps-tugas-multiple-classes.sh user@your-vps:/path/to/app/

# SSH ke VPS
ssh user@your-vps

# Masuk ke directory aplikasi
cd /path/to/app

# Jalankan script update
chmod +x update-vps-tugas-multiple-classes.sh
./update-vps-tugas-multiple-classes.sh
```

#### Windows VPS:
```powershell
# Copy file ke VPS
# Upload sql/update_vps_tugas_multiple_classes.sql
# Upload update-vps-tugas-multiple-classes.ps1

# Remote Desktop ke VPS
# Buka PowerShell di directory aplikasi
cd C:\path\to\app

# Jalankan script update
.\update-vps-tugas-multiple-classes.ps1
```

### Opsi 2: Manual Update

#### 1. Backup Database
```bash
mysqldump -h localhost -u username -p database_name > backup_$(date +%Y%m%d).sql
```

#### 2. Jalankan SQL Update
```bash
mysql -h localhost -u username -p database_name < sql/update_vps_tugas_multiple_classes.sql
```

#### 3. Restart Aplikasi
```bash
# Jika menggunakan PM2
pm2 restart all

# Jika menggunakan systemd
sudo systemctl restart your-app-name

# Jika menggunakan screen/tmux
# Kill session lama dan start ulang
```

## Verifikasi Update

### 1. Cek Tabel Baru
```sql
-- Login ke MySQL
mysql -h localhost -u username -p database_name

-- Cek tabel assignment_classes
DESCRIBE assignment_classes;

-- Cek data yang dimigrate
SELECT COUNT(*) FROM assignment_classes;

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

### 2. Test Fitur di Browser
1. Login sebagai guru
2. Buka menu "Tugas Saya" - harus bisa load
3. Klik "Buat Tugas Baru" - harus ada checkbox list kelas
4. Buat tugas untuk multiple classes - harus berhasil
5. Cek list tugas - harus tampil badge "X Kelas"
6. Login sebagai siswa - harus bisa lihat tugas kelasnya

### 3. Cek Ranking Kelas
1. Login sebagai admin/kepala sekolah
2. Buka "Rekap Penggunaan LMS"
3. Cek "Kelas Teraktif" - harus menghitung tugas dengan benar
4. Klik "Refresh" untuk data terbaru

## Troubleshooting

### Error: Table 'assignment_classes' doesn't exist
```bash
# Jalankan ulang migration
mysql -h localhost -u username -p database_name < sql/update_vps_tugas_multiple_classes.sql
```

### Error: Gagal memuat tugas
```bash
# Cek log aplikasi
pm2 logs

# Atau jika menggunakan systemd
journalctl -u your-app-name -f

# Restart aplikasi
pm2 restart all
```

### Error: Foreign key constraint fails
```bash
# Cek data yang bermasalah
SELECT * FROM assignments WHERE class_id NOT IN (SELECT id FROM classes);

# Hapus atau perbaiki data yang bermasalah
DELETE FROM assignments WHERE class_id NOT IN (SELECT id FROM classes);

# Jalankan ulang migration
mysql -h localhost -u username -p database_name < sql/update_vps_tugas_multiple_classes.sql
```

### Error: Duplicate entry
```bash
# Hapus data duplicate di assignment_classes
DELETE ac1 FROM assignment_classes ac1
INNER JOIN assignment_classes ac2 
WHERE ac1.id > ac2.id 
AND ac1.assignment_id = ac2.assignment_id 
AND ac1.class_id = ac2.class_id;
```

## Rollback Plan

Jika ada masalah serius, rollback dengan:

```bash
# Restore database dari backup
mysql -h localhost -u username -p database_name < backup_YYYYMMDD.sql

# Restart aplikasi
pm2 restart all
```

## Files yang Diupload ke VPS

1. **sql/update_vps_tugas_multiple_classes.sql** - SQL migration
2. **update-vps-tugas-multiple-classes.sh** - Script Linux
3. **update-vps-tugas-multiple-classes.ps1** - Script Windows

## Checklist Update

- [ ] Backup database
- [ ] Upload file SQL dan script ke VPS
- [ ] Jalankan script update
- [ ] Verifikasi tabel assignment_classes ada
- [ ] Verifikasi data dimigrate dengan benar
- [ ] Restart aplikasi
- [ ] Test fitur tugas di browser
- [ ] Test ranking kelas di laporan
- [ ] Cek log aplikasi untuk error

## Estimasi Waktu

- **Backup database**: 1-5 menit (tergantung ukuran)
- **Migration**: 1-2 menit
- **Restart aplikasi**: 30 detik
- **Testing**: 5-10 menit
- **Total**: 10-20 menit

## Catatan Penting

1. **Backup Wajib**: Selalu backup database sebelum update
2. **Maintenance Mode**: Pertimbangkan maintenance mode saat update
3. **Peak Hours**: Hindari update saat jam sibuk
4. **Testing**: Test semua fitur setelah update
5. **Monitoring**: Monitor log aplikasi setelah update

## Support

Jika ada masalah:
1. Cek log aplikasi untuk error message
2. Verifikasi struktur database
3. Test query manual di MySQL
4. Rollback jika diperlukan
5. Contact developer untuk bantuan

---

**Status**: Ready for production deployment
**Last Updated**: 2026-03-11
**Version**: 1.0