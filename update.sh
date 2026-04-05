#!/bin/bash
# ============================================================
# update.sh - Update aplikasi di VPS dari GitHub
# Cara pakai: bash update.sh
# Letakkan di VPS: /cbt/update.sh
# ============================================================

APP_DIR="/cbt"
APP_NAME="lms-smkn1kras"
BRANCH="main"
LOG_FILE="/cbt/logs/update.log"

# Warna
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
echo "  Update LMS - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo "" | tee -a $LOG_FILE

cd $APP_DIR || err "Folder $APP_DIR tidak ditemukan!"

# ── 1. Cek koneksi internet ───────────────────────────────
info "Cek koneksi ke GitHub..."
if ! curl -s --max-time 5 https://github.com > /dev/null; then
  err "Tidak bisa koneksi ke GitHub. Cek internet VPS."
fi
log "Koneksi OK"

# ── 2. Simpan versi sebelumnya ────────────────────────────
PREV_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
info "Versi sekarang: $PREV_COMMIT"

# ── 3. Pull kode terbaru ──────────────────────────────────
info "Pull kode terbaru dari GitHub..."
git fetch origin $BRANCH 2>&1 | tee -a $LOG_FILE

# Cek apakah ada update
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/$BRANCH)

if [ "$LOCAL" = "$REMOTE" ]; then
  warn "Tidak ada update baru. Kode sudah terbaru."
  echo ""
  exit 0
fi

# Tampilkan perubahan
echo ""
info "Perubahan yang akan diupdate:"
git log --oneline HEAD..origin/$BRANCH
echo ""

# Reset dan pull (hindari conflict)
git reset --hard origin/$BRANCH 2>&1 | tee -a $LOG_FILE
log "Kode diupdate ke versi terbaru"

NEW_COMMIT=$(git rev-parse --short HEAD)
info "Versi baru: $NEW_COMMIT"

# ── 4. Cek package.json berubah ───────────────────────────
PKGJSON_CHANGED=$(git diff $PREV_COMMIT HEAD --name-only 2>/dev/null | grep "package.json" || true)
if [ -n "$PKGJSON_CHANGED" ]; then
  info "package.json berubah, install dependency baru..."
  npm install --production 2>&1 | tee -a $LOG_FILE
  log "npm install selesai"
else
  log "package.json tidak berubah, skip npm install"
fi

# ── 5. Cek ada migrasi database ───────────────────────────
MIGRATION_CHANGED=$(git diff $PREV_COMMIT HEAD --name-only 2>/dev/null | grep "sql/schema_pg.sql" || true)
if [ -n "$MIGRATION_CHANGED" ]; then
  warn "Schema database berubah!"
  warn "Jalankan manual: node src/db/setup.js"
  warn "ATAU: psql -U lmsuser -d cbt_smk -f sql/schema_pg.sql"
fi

# ── 6. Reload aplikasi (zero downtime) ───────────────────
info "Reload aplikasi PM2..."
if pm2 list | grep -q "$APP_NAME"; then
  pm2 reload $APP_NAME 2>&1 | tee -a $LOG_FILE
  log "Aplikasi di-reload (zero downtime)"
else
  warn "PM2 process tidak ditemukan. Jalankan manual:"
  warn "pm2 start ecosystem.config.js --env production"
fi

# ── 7. Cek aplikasi berjalan normal ──────────────────────
sleep 3
info "Cek status aplikasi..."
if pm2 list | grep -q "online"; then
  log "Aplikasi berjalan normal ✅"
else
  err "Aplikasi tidak online! Cek log: pm2 logs $APP_NAME"
fi

# ── 8. Selesai ────────────────────────────────────────────
echo ""
echo "========================================"
log "Update selesai: $PREV_COMMIT → $NEW_COMMIT"
echo "========================================"
echo ""
info "Log tersimpan di: $LOG_FILE"
echo ""
