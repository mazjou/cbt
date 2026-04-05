# Update VPS Database untuk Fitur Tugas Multiple Classes (PowerShell)
# Usage: .\update-vps-tugas-multiple-classes.ps1

Write-Host "=== Update VPS Database untuk Fitur Tugas Multiple Classes ===" -ForegroundColor Cyan
Write-Host "Tanggal: $(Get-Date)" -ForegroundColor Gray
Write-Host ""

# Fungsi untuk print dengan warna
function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Blue
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "[WARNING] $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

# Cek apakah file .env ada
if (-not (Test-Path ".env")) {
    Write-Error "File .env tidak ditemukan!"
    Write-Info "Pastikan Anda menjalankan script ini dari root directory aplikasi"
    exit 1
}

# Load environment variables dari .env
Get-Content .env | ForEach-Object {
    if ($_ -match "^([^#][^=]+)=(.*)$") {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

$DB_HOST = $env:DB_HOST
$DB_USER = $env:DB_USER
$DB_PASSWORD = $env:DB_PASSWORD
$DB_NAME = $env:DB_NAME

# Cek environment variables
if (-not $DB_HOST -or -not $DB_USER -or -not $DB_PASSWORD -or -not $DB_NAME) {
    Write-Error "Environment variables database tidak lengkap!"
    Write-Info "Pastikan DB_HOST, DB_USER, DB_PASSWORD, dan DB_NAME sudah diset di .env"
    exit 1
}

Write-Info "Database: $DB_NAME@$DB_HOST"
Write-Info "User: $DB_USER"
Write-Host ""

# Cek apakah mysql command tersedia
try {
    mysql --version | Out-Null
} catch {
    Write-Error "MySQL client tidak ditemukan!"
    Write-Info "Install MySQL client atau pastikan mysql command tersedia di PATH"
    exit 1
}

# Backup database sebelum update
Write-Info "1. Membuat backup database..."
$backupFile = "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

try {
    & mysqldump -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME | Out-File -FilePath $backupFile -Encoding UTF8
    Write-Success "Backup berhasil: $backupFile"
} catch {
    Write-Error "Backup gagal: $($_.Exception.Message)"
    exit 1
}

Write-Host ""

# Jalankan update SQL
Write-Info "2. Menjalankan update database..."
try {
    Get-Content "sql/update_vps_tugas_multiple_classes.sql" | & mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME
    Write-Success "Update database berhasil!"
} catch {
    Write-Error "Update database gagal: $($_.Exception.Message)"
    Write-Warning "Restore backup jika diperlukan: Get-Content $backupFile | mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME"
    exit 1
}

Write-Host ""

# Verifikasi hasil update
Write-Info "3. Verifikasi hasil update..."

try {
    # Cek apakah tabel assignment_classes ada
    $tableCheck = & mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "SHOW TABLES LIKE 'assignment_classes';"
    
    if ($tableCheck -match "assignment_classes") {
        Write-Success "Tabel assignment_classes berhasil dibuat"
        
        # Cek jumlah data yang dimigrate
        $migratedCount = & mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "SELECT COUNT(*) FROM assignment_classes;" | Select-Object -Last 1
        Write-Success "Data yang dimigrate: $migratedCount records"
        
        # Tampilkan sample data
        Write-Info "Sample data assignment_classes:"
        & mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e @"
SELECT 
  ac.id,
  a.title as assignment_title,
  c.name as class_name
FROM assignment_classes ac
JOIN assignments a ON a.id = ac.assignment_id
JOIN classes c ON c.id = ac.class_id
ORDER BY ac.id DESC
LIMIT 5;
"@
        
    } else {
        Write-Error "Tabel assignment_classes tidak ditemukan!"
        exit 1
    }
} catch {
    Write-Error "Verifikasi gagal: $($_.Exception.Message)"
    exit 1
}

Write-Host ""

# Restart aplikasi
Write-Info "4. Restart aplikasi..."
try {
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        Write-Info "Menggunakan PM2..."
        pm2 restart all
        Write-Success "Aplikasi berhasil direstart dengan PM2"
    } else {
        Write-Warning "PM2 tidak ditemukan"
        Write-Info "Restart aplikasi secara manual:"
        Write-Info "- Jika menggunakan Windows Service: Restart service"
        Write-Info "- Jika menggunakan PM2: pm2 restart all"
        Write-Info "- Jika menggunakan node langsung: kill process dan jalankan ulang"
    }
} catch {
    Write-Warning "Gagal restart aplikasi: $($_.Exception.Message)"
    Write-Info "Restart aplikasi secara manual"
}

Write-Host ""

# Summary
Write-Success "=== UPDATE SELESAI ===" 
Write-Info "Yang sudah dilakukan:"
Write-Info "✓ Backup database: $backupFile"
Write-Info "✓ Buat tabel assignment_classes"
Write-Info "✓ Migrate data existing"
Write-Info "✓ Verifikasi hasil"
Write-Info "✓ Restart aplikasi"
Write-Host ""
Write-Info "Fitur yang sekarang tersedia:"
Write-Info "✓ Buat tugas untuk multiple classes"
Write-Info "✓ Edit tugas dengan multiple classes"
Write-Info "✓ Ranking kelas akurat dengan assignment_classes"
Write-Host ""
Write-Warning "Catatan:"
Write-Info "- Backup disimpan di: $backupFile"
Write-Info "- Jika ada masalah, restore dengan: Get-Content $backupFile | mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME"
Write-Info "- Test fitur tugas setelah update"
Write-Host ""
Write-Success "Update VPS berhasil! 🎉" -ForegroundColor Green