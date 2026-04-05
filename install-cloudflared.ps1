# Script untuk install cloudflared di folder project
# Cara pakai: Klik kanan file ini -> Run with PowerShell

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Install Cloudflared - Opsi A" -ForegroundColor Cyan
Write-Host "  (Install ke folder project)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if bin folder exists
if (-not (Test-Path ".\bin")) {
    Write-Host "[1/4] Membuat folder bin..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path ".\bin" -Force | Out-Null
    Write-Host "      ✓ Folder bin dibuat" -ForegroundColor Green
} else {
    Write-Host "[1/4] Folder bin sudah ada" -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/4] Download cloudflared..." -ForegroundColor Yellow
Write-Host "      Membuka browser untuk download..." -ForegroundColor Gray

# Open download page
Start-Process "https://github.com/cloudflare/cloudflared/releases/latest"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INSTRUKSI MANUAL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Di browser yang terbuka, scroll ke bawah" -ForegroundColor White
Write-Host "2. Cari file: cloudflared-windows-amd64.exe" -ForegroundColor White
Write-Host "3. Klik untuk download (~50MB)" -ForegroundColor White
Write-Host "4. Setelah download selesai, tekan Enter di sini..." -ForegroundColor Yellow
Write-Host ""

Read-Host "Tekan Enter setelah download selesai"

Write-Host ""
Write-Host "[3/4] Mencari file yang didownload..." -ForegroundColor Yellow

# Common download locations
$downloadPaths = @(
    "$env:USERPROFILE\Downloads\cloudflared-windows-amd64.exe",
    "$env:USERPROFILE\Downloads\cloudflared-windows-amd64 (1).exe",
    "$env:USERPROFILE\Downloads\cloudflared-windows-amd64 (2).exe"
)

$sourceFile = $null
foreach ($path in $downloadPaths) {
    if (Test-Path $path) {
        $sourceFile = $path
        break
    }
}

if ($sourceFile) {
    Write-Host "      ✓ File ditemukan: $sourceFile" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "[4/4] Memindahkan file ke bin\cloudflared.exe..." -ForegroundColor Yellow
    
    try {
        Move-Item $sourceFile ".\bin\cloudflared.exe" -Force
        Write-Host "      ✓ File berhasil dipindahkan" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "  INSTALASI BERHASIL!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Test instalasi dengan command:" -ForegroundColor White
        Write-Host "  .\bin\cloudflared.exe --version" -ForegroundColor Yellow
        Write-Host ""
        
        # Test version
        Write-Host "Testing..." -ForegroundColor Gray
        & ".\bin\cloudflared.exe" --version
        
        Write-Host ""
        Write-Host "Langkah selanjutnya:" -ForegroundColor White
        Write-Host "1. Login: .\bin\cloudflared.exe tunnel login" -ForegroundColor Yellow
        Write-Host "2. Baca: SETUP_CLOUDFLARE_TUNNEL_WINDOWS.md" -ForegroundColor Yellow
        
    } catch {
        Write-Host "      ✗ Error: $_" -ForegroundColor Red
    }
    
} else {
    Write-Host "      ✗ File tidak ditemukan di folder Downloads" -ForegroundColor Red
    Write-Host ""
    Write-Host "Cara manual:" -ForegroundColor Yellow
    Write-Host "1. Cari file cloudflared-windows-amd64.exe di folder Downloads" -ForegroundColor White
    Write-Host "2. Pindahkan ke folder: bin\" -ForegroundColor White
    Write-Host "3. Rename menjadi: cloudflared.exe" -ForegroundColor White
}

Write-Host ""
Write-Host "Tekan Enter untuk keluar..." -ForegroundColor Gray
Read-Host
