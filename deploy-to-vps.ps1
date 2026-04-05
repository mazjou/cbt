# Script PowerShell untuk Deploy ke VPS dengan Git
# Jalankan dengan: .\deploy-to-vps.ps1

$VPS_HOST = "10.10.102.15"
$VPS_USER = "root"
$VPS_PATH = "/var/www/lms-smkn1kras"
$BRANCH = "main"  # Ganti dengan "master" jika branch Anda master

Write-Host "🚀 Deploy ke VPS dengan Git" -ForegroundColor Green
Write-Host "Target: $VPS_USER@$VPS_HOST`:$VPS_PATH" -ForegroundColor Cyan
Write-Host ""

# Step 1: Cek status git
Write-Host "📋 Cek status git..." -ForegroundColor Yellow
git status --short

$hasChanges = git status --short
if ($hasChanges) {
    Write-Host ""
    Write-Host "📝 Ada perubahan yang belum di-commit" -ForegroundColor Yellow
    
    $commit = Read-Host "Commit perubahan? (y/n)"
    
    if ($commit -eq "y" -or $commit -eq "Y") {
        Write-Host ""
        $message = Read-Host "Masukkan pesan commit"
        
        if (-not $message) {
            $message = "Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        }
        
        Write-Host ""
        Write-Host "📦 Commit perubahan..." -ForegroundColor Yellow
        git add .
        git commit -m "$message"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Commit berhasil!" -ForegroundColor Green
        } else {
            Write-Host "❌ Commit gagal!" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "⚠️  Deploy dibatalkan. Commit perubahan terlebih dahulu." -ForegroundColor Yellow
        exit 0
    }
}

# Step 2: Push ke GitHub
Write-Host ""
Write-Host "📤 Push ke GitHub..." -ForegroundColor Yellow
git push origin $BRANCH

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Push berhasil!" -ForegroundColor Green
} else {
    Write-Host "❌ Push gagal!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Pastikan Anda sudah login ke GitHub" -ForegroundColor White
    Write-Host "2. Pastikan branch '$BRANCH' ada di remote" -ForegroundColor White
    Write-Host "3. Coba: git push -u origin $BRANCH" -ForegroundColor White
    exit 1
}

# Step 3: Pull di VPS
Write-Host ""
Write-Host "📥 Pull perubahan di VPS..." -ForegroundColor Yellow

$pullCommand = "cd $VPS_PATH && git pull origin $BRANCH"
ssh "$VPS_USER@$VPS_HOST" $pullCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Pull berhasil!" -ForegroundColor Green
} else {
    Write-Host "❌ Pull gagal!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Pastikan git sudah terinstall di VPS" -ForegroundColor White
    Write-Host "2. Pastikan folder $VPS_PATH adalah git repository" -ForegroundColor White
    Write-Host "3. Login ke VPS dan cek: cd $VPS_PATH && git status" -ForegroundColor White
    exit 1
}

# Step 4: Install dependencies
Write-Host ""
Write-Host "📦 Install dependencies..." -ForegroundColor Yellow

$installCommand = "cd $VPS_PATH && npm install --production"
ssh "$VPS_USER@$VPS_HOST" $installCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Install dependencies berhasil!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Install dependencies gagal, tapi lanjut restart..." -ForegroundColor Yellow
}

# Step 5: Restart aplikasi
Write-Host ""
Write-Host "🔄 Restart aplikasi..." -ForegroundColor Yellow

$restartCommand = "pm2 restart lms-smkn1kras"
ssh "$VPS_USER@$VPS_HOST" $restartCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Restart berhasil!" -ForegroundColor Green
} else {
    Write-Host "❌ Restart gagal!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Cek status PM2: ssh $VPS_USER@$VPS_HOST 'pm2 status'" -ForegroundColor White
    Write-Host "2. Cek log: ssh $VPS_USER@$VPS_HOST 'pm2 logs lms-smkn1kras --lines 50'" -ForegroundColor White
    exit 1
}

# Step 6: Cek status
Write-Host ""
Write-Host "📊 Cek status aplikasi..." -ForegroundColor Yellow

$statusCommand = "pm2 status lms-smkn1kras"
ssh "$VPS_USER@$VPS_HOST" $statusCommand

Write-Host ""
Write-Host "🎉 Deploy selesai!" -ForegroundColor Green
Write-Host ""
Write-Host "Langkah selanjutnya:" -ForegroundColor Cyan
Write-Host "1. Buka aplikasi di browser" -ForegroundColor White
Write-Host "2. Test fitur yang baru diupdate" -ForegroundColor White
Write-Host "3. Jika ada error, cek log: ssh $VPS_USER@$VPS_HOST 'pm2 logs lms-smkn1kras --lines 50'" -ForegroundColor White
Write-Host ""
Write-Host "📝 Catatan:" -ForegroundColor Yellow
Write-Host "- Jika ada perubahan database, jalankan: .\update-database-vps.ps1" -ForegroundColor White
Write-Host "- Jika ada perubahan .env, update manual di VPS" -ForegroundColor White
