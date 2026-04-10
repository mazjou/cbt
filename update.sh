#!/bin/bash
# ============================================================
# update.sh - Update aplikasi CBT di VPS dari GitHub
# Cara pakai: bash update.sh
# Letakkan di VPS: /cbt/update.sh
# ============================================================

APP_DIR="/cbt"
APP_NAME="lms-smkn1kras"   # Sesuai nama di ecosystem.config.js
BRANCH="main"
LOG_FILE="/cbt/logs/update.log"
DB_USER="lmsuser"
DB_NAME="cbt_smk"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1" >> $LOG_FILE; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $1" >> $LOG_FILE; }
err()  { echo -e "${RED}[✗]${NC} $1"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERR: $1" >> $LOG_FILE; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

mkdir -p /cbt/logs

echo ""
echo "========================================"
echo "  Update CBT - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo "" | tee -a $LOG_FILE

cd $APP_DIR || err "Folder $APP_DIR tidak ditemukan! Clone dulu: git clone https://github.com/mazjou/cbt.git /cbt"

# ── 0. Cek .env ada, jika tidak copy dari .env.example ───────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
    warn ".env tidak ditemukan! Sudah dicopy dari .env.example"
    warn "WAJIB edit /cbt/.env sebelum lanjut: nano /cbt/.env"
    echo ""
    echo "  Nilai yang WAJIB diisi:"
    echo "  - DB_PASSWORD"
    echo "  - REDIS_PASSWORD"
    echo "  - SESSION_SECRET"
    echo "  - APP_URL / CLIENT_URL"
    echo ""
    err "Hentikan setup. Edit .env dulu lalu jalankan ulang update.sh"
  else
    err ".env dan .env.example tidak ditemukan!"
  fi
fi

# ── 1. Cek koneksi internet ───────────────────────────────
info "Cek koneksi ke GitHub..."
if ! curl -s --max-time 5 https://github.com > /dev/null; then
  err "Tidak bisa koneksi ke GitHub. Cek internet VPS."
fi
log "Koneksi OK"

# ── 2. Simpan versi sebelumnya (untuk rollback) ───────────
PREV_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Versi sekarang: $PREV_COMMIT"

# ── 3. Fetch update dari GitHub ───────────────────────────
info "Cek update dari GitHub..."
git fetch origin $BRANCH 2>&1 | tee -a $LOG_FILE

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
  warn "Tidak ada update baru. Kode sudah terbaru ($PREV_COMMIT)."
  echo ""
  exit 0
fi

# Tampilkan perubahan
echo ""
info "Perubahan yang akan diupdate:"
git log --oneline HEAD..origin/$BRANCH
echo ""

# ── 4. Cek file apa yang berubah ─────────────────────────
CHANGED_FILES=$(git diff HEAD..origin/$BRANCH --name-only 2>/dev/null)
PKG_CHANGED=$(echo "$CHANGED_FILES" | grep "package.json" || true)
SCHEMA_CHANGED=$(echo "$CHANGED_FILES" | grep "sql/schema_pg.sql" || true)
INDEX_CHANGED=$(echo "$CHANGED_FILES" | grep "sql/add_indexes.sql" || true)

# ── 5. Pull kode terbaru ──────────────────────────────────
git reset --hard origin/$BRANCH 2>&1 | tee -a $LOG_FILE
NEW_COMMIT=$(git rev-parse --short HEAD)
log "Kode diupdate: $PREV_COMMIT → $NEW_COMMIT"

# ── 6. Install dependency jika package.json berubah ───────
if [ -n "$PKG_CHANGED" ]; then
  info "package.json berubah, install dependency..."
  npm install --production 2>&1 | tee -a $LOG_FILE
  log "npm install selesai"
else
  log "package.json tidak berubah, skip npm install"
fi

# ── 7. Jalankan migrasi database jika schema berubah ──────
if [ -n "$SCHEMA_CHANGED" ]; then
  warn "Schema database berubah! Menjalankan migrasi..."
  node src/db/setup.js 2>&1 | tee -a $LOG_FILE
  log "Migrasi database selesai"
fi

# ── 8. Update indexes jika berubah ────────────────────────
if [ -n "$INDEX_CHANGED" ]; then
  info "Indexes berubah, update indexes database..."
  psql -U $DB_USER -d $DB_NAME -f sql/add_indexes.sql 2>&1 | tee -a $LOG_FILE
  log "Indexes diupdate"
fi

# ── 9. Reload aplikasi (zero downtime) ────────────────────
info "Reload aplikasi PM2..."
if pm2 list | grep -q "$APP_NAME"; then
  pm2 reload $APP_NAME 2>&1 | tee -a $LOG_FILE
  log "Aplikasi di-reload (zero downtime)"
else
  warn "PM2 process '$APP_NAME' tidak ditemukan."
  info "Mencoba start aplikasi..."
  pm2 start ecosystem.config.js --env production 2>&1 | tee -a $LOG_FILE
  pm2 save
fi

# ── 10. Verifikasi aplikasi berjalan ──────────────────────
sleep 3
info "Verifikasi aplikasi..."
if pm2 list | grep "$APP_NAME" | grep -q "online"; then
  log "Aplikasi berjalan normal ✅"
else
  warn "Aplikasi tidak online! Mencoba rollback ke $PREV_COMMIT..."
  git reset --hard $PREV_COMMIT 2>&1
  pm2 reload $APP_NAME 2>&1
  err "Update gagal! Sudah rollback ke $PREV_COMMIT. Cek log: pm2 logs $APP_NAME"
fi

# ── 11. Selesai ───────────────────────────────────────────
echo ""
echo "========================================"
log "Update selesai: $PREV_COMMIT → $NEW_COMMIT"
echo "========================================"
echo ""
info "Log: $LOG_FILE"
info "Cek status: pm2 status"
echo ""
