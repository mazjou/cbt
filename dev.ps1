# dev.ps1 - Matikan semua node lalu jalankan npm run dev
# Cara pakai: klik kanan -> Run with PowerShell
# ATAU di PowerShell: .\dev.ps1

Write-Host "Menghentikan semua proses node..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host "Semua proses node dihentikan." -ForegroundColor Green

Write-Host "Menjalankan npm run dev..." -ForegroundColor Cyan
npm run dev
