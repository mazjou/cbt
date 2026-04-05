# Script untuk setup SSH key di Windows ke VPS
# Jalankan dengan: .\setup-ssh-key.ps1

$VPS_HOST = "10.10.102.15"
$VPS_USER = "root"

Write-Host "🔑 Setup SSH Key untuk VPS" -ForegroundColor Green
Write-Host "Target: $VPS_USER@$VPS_HOST" -ForegroundColor Cyan
Write-Host ""

# Cek apakah SSH key sudah ada
$sshKeyPath = "$env:USERPROFILE\.ssh\id_rsa"
$sshPubKeyPath = "$env:USERPROFILE\.ssh\id_rsa.pub"

if (-Not (Test-Path $sshKeyPath)) {
    Write-Host "📝 Membuat SSH key baru..." -ForegroundColor Yellow
    
    # Buat folder .ssh jika belum ada
    $sshDir = "$env:USERPROFILE\.ssh"
    if (-Not (Test-Path $sshDir)) {
        New-Item -ItemType Directory -Path $sshDir | Out-Null
    }
    
    # Generate SSH key
    ssh-keygen -t rsa -b 4096 -f $sshKeyPath -N '""'
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ SSH key berhasil dibuat!" -ForegroundColor Green
    } else {
        Write-Host "❌ Gagal membuat SSH key!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ SSH key sudah ada: $sshKeyPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "📤 Mengirim public key ke VPS..." -ForegroundColor Yellow
Write-Host "⚠️  Anda akan diminta password VPS" -ForegroundColor Yellow
Write-Host ""

# Baca public key
$publicKey = Get-Content $sshPubKeyPath -Raw

# Kirim public key ke VPS menggunakan SSH
$command = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$publicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo 'SSH key berhasil ditambahkan!'"

ssh "$VPS_USER@$VPS_HOST" $command

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ SSH key berhasil di-setup!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🧪 Testing koneksi tanpa password..." -ForegroundColor Yellow
    
    # Test koneksi
    ssh -o BatchMode=yes -o ConnectTimeout=5 "$VPS_USER@$VPS_HOST" "echo 'Koneksi berhasil'"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "🎉 Setup selesai! Sekarang Anda bisa SSH tanpa password." -ForegroundColor Green
        Write-Host ""
        Write-Host "Langkah selanjutnya:" -ForegroundColor Cyan
        Write-Host "1. Edit file sync-to-vps.ps1 (sesuaikan VPS_USER dan VPS_PATH)" -ForegroundColor White
        Write-Host "2. Jalankan: .\sync-to-vps.ps1" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "⚠️  Koneksi masih memerlukan password. Coba setup ulang." -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "❌ Gagal mengirim SSH key ke VPS!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Solusi alternatif (Manual):" -ForegroundColor Yellow
    Write-Host "1. Buka file: $sshPubKeyPath" -ForegroundColor White
    Write-Host "2. Copy isi file tersebut" -ForegroundColor White
    Write-Host "3. Login ke VPS: ssh $VPS_USER@$VPS_HOST" -ForegroundColor White
    Write-Host "4. Jalankan: mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys" -ForegroundColor White
    Write-Host "5. Paste public key, save (Ctrl+O, Enter, Ctrl+X)" -ForegroundColor White
    Write-Host "6. Jalankan: chmod 600 ~/.ssh/authorized_keys" -ForegroundColor White
}
