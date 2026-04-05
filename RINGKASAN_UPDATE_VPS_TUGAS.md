# Ringkasan: Update VPS untuk Fitur Tugas Multiple Classes

## Masalah
VPS gagal memuat tugas karena database belum diupdate dengan tabel `assignment_classes` yang baru.

## Solusi Cepat

### 1. Upload File ke VPS
Upload 2 file ini ke VPS:
- `sql/update_vps_tugas_multiple_classes.sql`
- `update-vps-tugas-multiple-classes.sh` (Linux) atau `.ps1` (Windows)

### 2. Jalankan Update

#### Linux VPS:
```bash
# SSH ke VPS
ssh user@your-vps

# Masuk ke directory aplikasi
cd /path/to/app

# Jalankan script
chmod +x update-vps-tugas-multiple-classes.sh
./update-vps-tugas-multiple-classes.sh
```

#### Windows VPS:
```powershell
# Remote Desktop ke VPS
# Buka PowerShell di directory aplikasi
cd C:\path\to\app

# Jalankan script
.\update-vps-tugas-multiple-classes.ps1
```

### 3. Yang Akan Dilakukan Script
- ✅ Backup database otomatis
- ✅ Buat tabel `assignment_classes`
- ✅ Migrate data existing
- ✅ Restart aplikasi (PM2)
- ✅ Verifikasi hasil

## Manual Alternative

Jika script tidak bisa jalan:

```bash
# 1. Backup
mysqldump -h localhost -u username -p database_name > backup.sql

# 2. Update database
mysql -h localhost -u username -p database_name < sql/update_vps_tugas_multiple_classes.sql

# 3. Restart app
pm2 restart all
```

## Verifikasi

Setelah update, test:
1. Login guru → "Tugas Saya" harus bisa load
2. "Buat Tugas Baru" → harus ada checkbox list kelas
3. Login siswa → harus bisa lihat tugas
4. Admin → "Rekap LMS" harus menghitung tugas dengan benar

## Files Siap Upload

1. **sql/update_vps_tugas_multiple_classes.sql** ✅
2. **update-vps-tugas-multiple-classes.sh** ✅ 
3. **update-vps-tugas-multiple-classes.ps1** ✅
4. **PANDUAN_UPDATE_VPS_TUGAS.md** ✅

## Estimasi Waktu
Total: 10-20 menit (termasuk backup, update, restart, testing)

## Rollback
Jika ada masalah:
```bash
mysql -h localhost -u username -p database_name < backup.sql
pm2 restart all
```

---
**Status**: Ready to deploy
**Action**: Upload files dan jalankan script update