# Script PowerShell untuk Update Database VPS
# Jalankan dengan: .\update-database-vps.ps1

$VPS_HOST = "10.10.102.15"
$VPS_USER = "root"
$DB_NAME = "lms_smk"
$SQL_FILE = "sql/update_vps_database.sql"

Write-Host "🗄️  Update Database VPS" -ForegroundColor Green
Write-Host "Target: $VPS_USER@$VPS_HOST" -ForegroundColor Cyan
Write-Host "Database: $DB_NAME" -ForegroundColor Cyan
Write-Host ""

# Cek apakah file SQL ada
if (-Not (Test-Path $SQL_FILE)) {
    Write-Host "❌ File SQL tidak ditemukan: $SQL_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "✅ File SQL ditemukan: $SQL_FILE" -ForegroundColor Green
Write-Host ""

# Konfirmasi
Write-Host "⚠️  PENTING: Pastikan Anda sudah backup database!" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Lanjutkan update database? (y/n)"

if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "❌ Update dibatalkan." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "📤 Upload file SQL ke VPS..." -ForegroundColor Yellow

# Upload file SQL ke VPS
scp $SQL_FILE "$VPS_USER@$VPS_HOST`:/root/update_vps_database.sql"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Upload berhasil!" -ForegroundColor Green
    Write-Host ""
    
    # Jalankan SQL di VPS
    Write-Host "🔄 Menjalankan update database..." -ForegroundColor Yellow
    Write-Host "⚠️  Anda akan diminta password MySQL" -ForegroundColor Yellow
    Write-Host ""
    
    ssh "$VPS_USER@$VPS_HOST" "mysql -u root -p $DB_NAME < /root/update_vps_database.sql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Database berhasil diupdate!" -ForegroundColor Green
        Write-Host ""
        
        # Verifikasi
        Write-Host "🔍 Verifikasi tabel baru..." -ForegroundColor Yellow
        ssh "$VPS_USER@$VPS_HOST" "mysql -u root -p $DB_NAME -e 'SHOW TABLES;'"
        
        Write-Host ""
        Write-Host "🔄 Restart aplikasi..." -ForegroundColor Yellow
        ssh "$VPS_USER@$VPS_HOST" "pm2 restart lms-smkn1kras"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "🎉 Update selesai!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Langkah selanjutnya:" -ForegroundColor Cyan
            Write-Host "1. Buka aplikasi di browser" -ForegroundColor White
            Write-Host "2. Logout dan login ulang" -ForegroundColor White
            Write-Host "3. Test fitur-fitur baru (profil, bank soal, tugas, dll)" -ForegroundColor White
        } else {
            Write-Host ""
            Write-Host "⚠️  Gagal restart aplikasi. Silakan restart manual:" -ForegroundColor Yellow
            Write-Host "ssh $VPS_USER@$VPS_HOST 'pm2 restart lms-smkn1kras'" -ForegroundColor White
        }
    } else {
        Write-Host ""
        Write-Host "❌ Gagal menjalankan update database!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "1. Pastikan password MySQL benar" -ForegroundColor White
        Write-Host "2. Pastikan nama database benar: $DB_NAME" -ForegroundColor White
        Write-Host "3. Cek manual: ssh $VPS_USER@$VPS_HOST" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "❌ Upload gagal!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Pastikan SSH key sudah di-setup (jalankan: .\setup-ssh-key.ps1)" -ForegroundColor White
    Write-Host "2. Pastikan VPS bisa diakses: ping $VPS_HOST" -ForegroundColor White
    Write-Host "3. Coba manual: scp $SQL_FILE $VPS_USER@$VPS_HOST`:/root/" -ForegroundColor White
}
