#!/bin/bash

# Script Rollback VPS
# Untuk mengembalikan ke kondisi sebelum update

set -e

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Konfigurasi (SESUAIKAN DENGAN VPS ANDA)
DB_USER="root"
DB_NAME="lms_database"
APP_NAME="lms-app"
APP_DIR="/path/to/lms-folder"
BACKUP_DIR="/backup"

echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║              ROLLBACK VPS - EMERGENCY                  ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Fungsi print
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

confirm() {
    read -p "$(echo -e ${YELLOW}$1 [y/N]: ${NC})" response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Cari backup terbaru
echo ""
print_info "Mencari backup terbaru..."

LATEST_DB_BACKUP=$(ls -t $BACKUP_DIR/lms_backup_*_db.sql 2>/dev/null | head -1)
LATEST_APP_BACKUP=$(ls -t $BACKUP_DIR/lms_backup_*_app.tar.gz 2>/dev/null | head -1)

if [ -z "$LATEST_DB_BACKUP" ] || [ -z "$LATEST_APP_BACKUP" ]; then
    print_error "Backup tidak ditemukan!"
    echo ""
    print_info "File backup harus ada di: $BACKUP_DIR"
    print_info "Format: lms_backup_YYYYMMDD_HHMMSS_db.sql"
    print_info "        lms_backup_YYYYMMDD_HHMMSS_app.tar.gz"
    exit 1
fi

echo ""
print_success "Backup ditemukan:"
echo "  Database: $(basename $LATEST_DB_BACKUP)"
echo "  Aplikasi: $(basename $LATEST_APP_BACKUP)"
echo ""

# Konfirmasi
print_warning "PERHATIAN: Rollback akan:"
echo "  1. Stop aplikasi"
echo "  2. Restore database ke backup"
echo "  3. Restore folder aplikasi ke backup"
echo "  4. Restart aplikasi"
echo ""
print_warning "Semua perubahan setelah backup akan HILANG!"
echo ""

if ! confirm "Apakah Anda yakin ingin rollback?"; then
    print_info "Rollback dibatalkan."
    exit 0
fi

# Password MySQL
read -sp "Masukkan password MySQL: " DB_PASS
echo ""
echo ""

# STEP 1: Stop aplikasi
print_info "STEP 1: Stop aplikasi..."
pm2 stop $APP_NAME > /dev/null 2>&1
print_success "Aplikasi di-stop"

# STEP 2: Restore database
echo ""
print_info "STEP 2: Restore database..."

mysql -u $DB_USER -p$DB_PASS $DB_NAME < $LATEST_DB_BACKUP 2>/dev/null

if [ $? -eq 0 ]; then
    print_success "Database berhasil di-restore"
else
    print_error "Restore database gagal!"
    exit 1
fi

# STEP 3: Restore aplikasi
echo ""
print_info "STEP 3: Restore folder aplikasi..."

cd $(dirname $APP_DIR)

# Backup folder current (jika ada masalah)
if [ -d "$APP_DIR" ]; then
    mv $APP_DIR "${APP_DIR}_failed_$(date +%Y%m%d_%H%M%S)"
fi

# Extract backup
tar -xzf $LATEST_APP_BACKUP 2>/dev/null

if [ $? -eq 0 ]; then
    print_success "Aplikasi berhasil di-restore"
else
    print_error "Restore aplikasi gagal!"
    exit 1
fi

# STEP 4: Start aplikasi
echo ""
print_info "STEP 4: Start aplikasi..."

cd $APP_DIR
pm2 start $APP_NAME > /dev/null 2>&1
sleep 3

APP_STATUS=$(pm2 jlist | grep -o "\"status\":\"online\"" | wc -l)

if [ "$APP_STATUS" -gt 0 ]; then
    print_success "Aplikasi berhasil di-start"
else
    print_error "Aplikasi gagal start!"
    print_info "Cek log: pm2 logs $APP_NAME"
    exit 1
fi

pm2 save > /dev/null 2>&1

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            ROLLBACK BERHASIL! ✅                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
print_info "Aplikasi telah dikembalikan ke kondisi sebelum update"
echo ""
print_info "Langkah selanjutnya:"
echo "  1. Test login ke aplikasi"
echo "  2. Verifikasi data tidak hilang"
echo "  3. Monitor log: pm2 logs $APP_NAME"
echo ""
print_success "Selesai!"
echo ""