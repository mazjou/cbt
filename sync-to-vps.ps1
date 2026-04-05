# Script PowerShell untuk sinkronisasi ke VPS
# Jalankan dengan: .\sync-to-vps.ps1

$VPS_HOST = "10.10.102.15"
$VPS_USER = "root"  # Ganti dengan username VPS Anda
$VPS_PATH = "/var/www/lms-smkn1kras"  # Ganti dengan path di VPS
$LOCAL_PATH = "."

Write-Host "🚀 Memulai sinkronisasi ke VPS..." -ForegroundColor Green
Write-Host "Target: $VPS_USER@$VPS_HOST`:$VPS_PATH" -ForegroundColor Cyan
Write-Host ""

# Menggunakan SCP untuk transfer file
# Pastikan sudah install OpenSSH Client di Windows

# Compress folder terlebih dahulu (exclude node_modules, .git, dll)
Write-Host "📦 Membuat archive..." -ForegroundColor Yellow

$excludeList = @(
    "node_modules",
    ".git",
    ".env",
    "*.log",
    "src/public/uploads",
    ".kiro"
)

# Buat temporary archive
$archiveName = "lms-sync-$(Get-Date -Format 'yyyyMMdd-HHmmss').tar.gz"

# Gunakan tar (tersedia di Windows 10+)
tar -czf $archiveName --exclude=node_modules --exclude=.git --exclude=.env --exclude=*.log --exclude=src/public/uploads --exclude=.kiro *

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Archive berhasil dibuat: $archiveName" -ForegroundColor Green
    
    # Upload ke VPS
    Write-Host "📤 Upload ke VPS..." -ForegroundColor Yellow
    scp $archiveName "$VPS_USER@$VPS_HOST`:$VPS_PATH/"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Upload berhasil!" -ForegroundColor Green
        
        # Extract di VPS dan restart
        Write-Host "📂 Extract dan restart aplikasi..." -ForegroundColor Yellow
        ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && tar -xzf $archiveName && rm $archiveName && pm2 restart lms-smkn1kras"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Aplikasi berhasil di-update dan restart!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Gagal restart aplikasi. Silakan restart manual." -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Upload gagal!" -ForegroundColor Red
    }
    
    # Hapus archive lokal
    Remove-Item $archiveName
} else {
    Write-Host "❌ Gagal membuat archive!" -ForegroundColor Red
}
