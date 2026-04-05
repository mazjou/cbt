#!/bin/bash

# Script Update VPS dengan Backup Otomatis
# Untuk fitur Recovery Submission Ujian

set -e  # Exit jika ada error

# Warna untuk output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Konfigurasi (SESUAIKAN DENGAN VPS ANDA)
DB_USER="root"
DB_NAME="lms_database"
APP_NAME="lms-app"
APP_DIR="/path/to/lms-folder"
BACKUP_DIR="/backup"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   UPDATE VPS - FITUR RECOVERY SUBMISSION UJIAN        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Fungsi untuk print dengan warna
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

# Fungsi untuk konfirmasi
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

# STEP 0: Konfirmasi
echo ""
print_warning "PERHATIAN: Script ini akan:"
echo "  1. Backup database dan aplikasi"
echo "  2. Stop aplikasi (downtime 1-2 menit)"
echo "  3. Update kode dari Git"
echo "  4. Jalankan database migration"
echo "  5. Restart aplikasi"
echo ""

if ! confirm "Apakah Anda yakin ingin melanjutkan?"; then
    print_info "Update dibatalkan."
    exit 0
fi

# STEP 1: Cek apakah ada ujian yang sedang berlangsung
echo ""
print_info "STEP 1: Cek ujian yang sedang berlangsung..."

ONGOING_EXAMS=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -se "
    SELECT COUNT(*) FROM attempts WHERE status = 'IN_PROGRESS';
")

if [ "$ONGOING_EXAMS" -gt 0 ]; then
    print_warning "Ada $ONGOING_EXAMS siswa yang sedang mengerjakan ujian!"
    if ! confirm "Tetap lanjutkan? (Tidak disarankan)"; then
        print_info "Update dibatalkan."
        exit 0
    fi
fi

print_success "Aman untuk update"

# STEP 2: Buat folder backup
echo ""
print_info "STEP 2: Persiapan folder backup..."

mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lms_backup_$TIMESTAMP"

print_success "Folder backup siap: $BACKUP_DIR"

# STEP 3: Backup Database
echo ""
print_info "STEP 3: Backup database..."

read -sp "Masukkan password MySQL: " DB_PASS
echo ""

mysqldump -u $DB_USER -p$DB_PASS $DB_NAME > "${BACKUP_FILE}_db.sql" 2>/dev/null

if [ $? -eq 0 ]; then
    DB_SIZE=$(du -h "${BACKUP_FILE}_db.sql" | cut -f1)
    print_success "Database berhasil di-backup (${DB_SIZE})"
else
    print_error "Backup database gagal!"
    exit 1
fi

# STEP 4: Backup Aplikasi
echo ""
print_info "STEP 4: Backup folder aplikasi..."

cd $(dirname $APP_DIR)
tar -czf "${BACKUP_FILE}_app.tar.gz" $(basename $APP_DIR) 2>/dev/null

if [ $? -eq 0 ]; then
    APP_SIZE=$(du -h "${BACKUP_FILE}_app.tar.gz" | cut -f1)
    print_success "Aplikasi berhasil di-backup (${APP_SIZE})"
else
    print_error "Backup aplikasi gagal!"
    exit 1
fi

# STEP 5: Stop Aplikasi
echo ""
print_info "STEP 5: Stop aplikasi..."

pm2 stop $APP_NAME > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Aplikasi berhasil di-stop"
else
    print_warning "Aplikasi mungkin sudah stop atau tidak menggunakan PM2"
fi

# STEP 6: Pull Update dari Git
echo ""
print_info "STEP 6: Pull update dari Git..."

cd $APP_DIR

# Stash perubahan lokal
git stash > /dev/null 2>&1

# Pull update
git pull origin main > /dev/null 2>&1 || git pull origin master > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Kode berhasil di-update"
else
    print_error "Git pull gagal!"
    print_info "Mencoba restore..."
    pm2 start $APP_NAME
    exit 1
fi

# STEP 7: Install Dependencies
echo ""
print_info "STEP 7: Install dependencies..."

npm install > /dev/null 2>&1

if [ $? -eq 0 ]; then
    print_success "Dependencies berhasil di-install"
else
    print_warning "Ada masalah saat install dependencies (mungkin tidak ada yang baru)"
fi

# STEP 8: Database Migration
echo ""
print_info "STEP 8: Jalankan database migration..."

if [ -f "create-submission-backup-table.sql" ]; then
    mysql -u $DB_USER -p$DB_PASS $DB_NAME < create-submission-backup-table.sql 2>/dev/null
    
    if [ $? -eq 0 ]; then
        print_success "Database migration berhasil"
    else
        print_warning "Migration mungkin sudah pernah dijalankan"
    fi
else
    print_error "File migration tidak ditemukan!"
    exit 1
fi

# STEP 9: Verifikasi Tabel dan Kolom
echo ""
print_info "STEP 9: Verifikasi database..."

# Cek tabel submission_backups
TABLE_EXISTS=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -se "
    SHOW TABLES LIKE 'submission_backups';
" 2>/dev/null)

if [ -n "$TABLE_EXISTS" ]; then
    print_success "Tabel submission_backups: OK"
else
    print_error "Tabel submission_backups: TIDAK ADA"
    exit 1
fi

# Cek kolom submission_status
COLUMN_EXISTS=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -se "
    SHOW COLUMNS FROM attempts LIKE 'submission_status';
" 2>/dev/null)

if [ -n "$COLUMN_EXISTS" ]; then
    print_success "Kolom submission_status: OK"
else
    print_error "Kolom submission_status: TIDAK ADA"
    exit 1
fi

# STEP 10: Test Syntax
echo ""
print_info "STEP 10: Test syntax JavaScript..."

node -c src/routes/admin.js 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "admin.js: OK"
else
    print_error "admin.js: SYNTAX ERROR"
    exit 1
fi

node -c src/routes/student.js 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "student.js: OK"
else
    print_error "student.js: SYNTAX ERROR"
    exit 1
fi

node -c src/utils/submission-utils.js 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "submission-utils.js: OK"
else
    print_error "submission-utils.js: SYNTAX ERROR"
    exit 1
fi

# STEP 11: Start Aplikasi
echo ""
print_info "STEP 11: Start aplikasi..."

pm2 start $APP_NAME > /dev/null 2>&1
sleep 3

# Cek apakah aplikasi running
APP_STATUS=$(pm2 jlist | grep -o "\"status\":\"online\"" | wc -l)

if [ "$APP_STATUS" -gt 0 ]; then
    print_success "Aplikasi berhasil di-start"
else
    print_error "Aplikasi gagal start!"
    print_info "Cek log: pm2 logs $APP_NAME"
    exit 1
fi

# STEP 12: Save PM2
pm2 save > /dev/null 2>&1

# STEP 13: Test Aplikasi
echo ""
print_info "STEP 12: Test aplikasi..."

sleep 2

# Cek apakah ada error di log
ERROR_COUNT=$(pm2 logs $APP_NAME --nostream --lines 20 --err 2>/dev/null | grep -i "error" | wc -l)

if [ "$ERROR_COUNT" -eq 0 ]; then
    print_success "Tidak ada error di log"
else
    print_warning "Ada $ERROR_COUNT error di log (cek dengan: pm2 logs $APP_NAME)"
fi

# STEP 14: Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              UPDATE BERHASIL! ✅                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
print_info "Backup tersimpan di:"
echo "  - Database: ${BACKUP_FILE}_db.sql"
echo "  - Aplikasi: ${BACKUP_FILE}_app.tar.gz"
echo ""
print_info "Langkah selanjutnya:"
echo "  1. Test login ke aplikasi"
echo "  2. Cek dashboard admin"
echo "  3. Akses /admin/failed-submissions"
echo "  4. Monitor log: pm2 logs $APP_NAME"
echo ""
print_warning "Jika ada masalah, restore dengan:"
echo "  mysql -u $DB_USER -p $DB_NAME < ${BACKUP_FILE}_db.sql"
echo "  tar -xzf ${BACKUP_FILE}_app.tar.gz"
echo ""

# STEP 15: Cleanup old backups (optional)
if confirm "Hapus backup yang lebih dari 7 hari?"; then
    find $BACKUP_DIR -name "lms_backup_*" -mtime +7 -delete 2>/dev/null
    print_success "Backup lama berhasil dihapus"
fi

echo ""
print_success "Selesai! Aplikasi sudah running dengan fitur baru."
echo ""