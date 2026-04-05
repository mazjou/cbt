#!/bin/bash

# Update VPS Database untuk Fitur Tugas Multiple Classes
# Usage: ./update-vps-tugas-multiple-classes.sh

echo "=== Update VPS Database untuk Fitur Tugas Multiple Classes ==="
echo "Tanggal: $(date)"
echo ""

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fungsi untuk print dengan warna
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Cek apakah file .env ada
if [ ! -f .env ]; then
    print_error "File .env tidak ditemukan!"
    print_info "Pastikan Anda menjalankan script ini dari root directory aplikasi"
    exit 1
fi

# Load environment variables
source .env

# Cek environment variables
if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_NAME" ]; then
    print_error "Environment variables database tidak lengkap!"
    print_info "Pastikan DB_HOST, DB_USER, DB_PASSWORD, dan DB_NAME sudah diset di .env"
    exit 1
fi

print_info "Database: $DB_NAME@$DB_HOST"
print_info "User: $DB_USER"
echo ""

# Backup database sebelum update
print_info "1. Membuat backup database..."
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
mysqldump -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME > $BACKUP_FILE

if [ $? -eq 0 ]; then
    print_success "Backup berhasil: $BACKUP_FILE"
else
    print_error "Backup gagal!"
    exit 1
fi

echo ""

# Jalankan update SQL
print_info "2. Menjalankan update database..."
mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME < sql/update_vps_tugas_multiple_classes.sql

if [ $? -eq 0 ]; then
    print_success "Update database berhasil!"
else
    print_error "Update database gagal!"
    print_warning "Restore backup jika diperlukan: mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME < $BACKUP_FILE"
    exit 1
fi

echo ""

# Verifikasi hasil update
print_info "3. Verifikasi hasil update..."

# Cek apakah tabel assignment_classes ada
TABLE_EXISTS=$(mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "SHOW TABLES LIKE 'assignment_classes';" | wc -l)

if [ $TABLE_EXISTS -gt 1 ]; then
    print_success "Tabel assignment_classes berhasil dibuat"
    
    # Cek jumlah data yang dimigrate
    MIGRATED_COUNT=$(mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "SELECT COUNT(*) FROM assignment_classes;" | tail -n 1)
    print_success "Data yang dimigrate: $MIGRATED_COUNT records"
    
    # Tampilkan sample data
    print_info "Sample data assignment_classes:"
    mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME -e "
    SELECT 
      ac.id,
      a.title as assignment_title,
      c.name as class_name
    FROM assignment_classes ac
    JOIN assignments a ON a.id = ac.assignment_id
    JOIN classes c ON c.id = ac.class_id
    ORDER BY ac.id DESC
    LIMIT 5;"
    
else
    print_error "Tabel assignment_classes tidak ditemukan!"
    exit 1
fi

echo ""

# Restart aplikasi
print_info "4. Restart aplikasi..."
if command -v pm2 &> /dev/null; then
    print_info "Menggunakan PM2..."
    pm2 restart all
    if [ $? -eq 0 ]; then
        print_success "Aplikasi berhasil direstart dengan PM2"
    else
        print_warning "Gagal restart dengan PM2, restart manual mungkin diperlukan"
    fi
else
    print_warning "PM2 tidak ditemukan"
    print_info "Restart aplikasi secara manual:"
    print_info "- Jika menggunakan systemd: sudo systemctl restart your-app"
    print_info "- Jika menggunakan screen/tmux: restart session"
    print_info "- Jika menggunakan node langsung: kill process dan jalankan ulang"
fi

echo ""

# Summary
print_success "=== UPDATE SELESAI ==="
print_info "Yang sudah dilakukan:"
print_info "✓ Backup database: $BACKUP_FILE"
print_info "✓ Buat tabel assignment_classes"
print_info "✓ Migrate data existing"
print_info "✓ Verifikasi hasil"
print_info "✓ Restart aplikasi"
echo ""
print_info "Fitur yang sekarang tersedia:"
print_info "✓ Buat tugas untuk multiple classes"
print_info "✓ Edit tugas dengan multiple classes"
print_info "✓ Ranking kelas akurat dengan assignment_classes"
echo ""
print_warning "Catatan:"
print_info "- Backup disimpan di: $BACKUP_FILE"
print_info "- Jika ada masalah, restore dengan: mysql -h$DB_HOST -u$DB_USER -p$DB_PASSWORD $DB_NAME < $BACKUP_FILE"
print_info "- Test fitur tugas setelah update"
echo ""
print_success "Update VPS berhasil! 🎉"