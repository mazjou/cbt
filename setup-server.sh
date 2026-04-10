#!/bin/bash
# ============================================================
# setup-server.sh - Setup aplikasi CBT di server baru
# Cara pakai: bash setup-server.sh
# ============================================================

APP_DIR="/cbt"
REPO_URL="https://github.com/mazjou/cbt.git"
DB_NAME="cbt_smk"
DB_USER="lmsuser"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

echo ""
echo "========================================"
echo "  Setup CBT Server Baru"
echo "========================================"
echo ""

# ── 1. Cek root ───────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Jalankan sebagai root: sudo bash setup-server.sh"

# ── 2. Install dependencies sistem ───────────────────────
info "Install Node.js, PostgreSQL, Redis..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
apt-get install -y nodejs postgresql redis-server git 2>/dev/null | tail -3
npm install -g pm2 2>/dev/null | tail -1
log "Dependencies sistem terinstall"

# ── 3. Clone repo ─────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  warn "Folder $APP_DIR sudah ada, pull update saja..."
  cd $APP_DIR && git pull origin main
else
  info "Clone repo dari GitHub..."
  git clone $REPO_URL $APP_DIR || err "Gagal clone repo"
  log "Repo berhasil di-clone"
fi

cd $APP_DIR

# ── 4. Setup .env ─────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  warn "File .env dibuat dari template"
  echo ""
  echo "  ┌─────────────────────────────────────────┐"
  echo "  │  WAJIB edit .env sebelum lanjut!        │"
  echo "  │  nano /cbt/.env                         │"
  echo "  │                                         │"
  echo "  │  Yang perlu diisi:                      │"
  echo "  │  - DB_PASSWORD                          │"
  echo "  │  - REDIS_PASSWORD                       │"
  echo "  │  - SESSION_SECRET (random 64 char)      │"
  echo "  │  - APP_URL / CLIENT_URL (domain kamu)   │"
  echo "  │  - SCHOOL_NAME, PRINCIPAL_NAME, dll     │"
  echo "  └─────────────────────────────────────────┘"
  echo ""
  read -p "Sudah edit .env? (y/N): " confirm
  [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && err "Edit .env dulu lalu jalankan ulang."
else
  log ".env sudah ada"
fi

# Load .env untuk ambil nilai DB
source $APP_DIR/.env

# ── 5. Setup PostgreSQL ───────────────────────────────────
info "Setup PostgreSQL..."
DB_PASS="${DB_PASSWORD:-Kediri123!}"

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || warn "User $DB_USER sudah ada"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || warn "Database $DB_NAME sudah ada"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null

# Naikkan max_connections
PG_CONF=$(find /etc/postgresql -name "postgresql.conf" 2>/dev/null | head -1)
if [ -n "$PG_CONF" ]; then
  sed -i "s/^#*max_connections = .*/max_connections = 200/" $PG_CONF
  sed -i "s/^#*shared_buffers = .*/shared_buffers = 512MB/" $PG_CONF
  systemctl restart postgresql
  log "PostgreSQL dikonfigurasi (max_connections=200)"
fi

# ── 6. Setup Redis ────────────────────────────────────────
info "Setup Redis..."
REDIS_PASS="${REDIS_PASSWORD:-}"
if [ -n "$REDIS_PASS" ]; then
  REDIS_CONF=$(find /etc/redis -name "redis.conf" 2>/dev/null | head -1)
  if [ -n "$REDIS_CONF" ]; then
    sed -i "s/^#*requirepass .*/requirepass $REDIS_PASS/" $REDIS_CONF
    systemctl restart redis-server
    log "Redis dikonfigurasi dengan password"
  fi
fi

# ── 7. Install npm packages ───────────────────────────────
info "Install npm packages..."
npm install --production 2>&1 | tail -3
log "npm install selesai"

# ── 8. Buat folder uploads & logs ────────────────────────
mkdir -p $APP_DIR/src/public/uploads/{questions,materials,imports}
mkdir -p $APP_DIR/logs
chmod -R 755 $APP_DIR/src/public/uploads
log "Folder uploads & logs dibuat"

# ── 9. Setup database schema ──────────────────────────────
info "Setup schema database..."
PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -U $DB_USER -d $DB_NAME -f $APP_DIR/sql/schema_pg.sql 2>&1 | tail -5
log "Schema database selesai"

# ── 10. Tambah swap jika belum ada ───────────────────────
if [ ! -f /swapfile ]; then
  info "Tambah swap 2GB..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "Swap 2GB ditambahkan"
fi

# ── 11. Start PM2 ─────────────────────────────────────────
info "Start aplikasi dengan PM2..."
pm2 start $APP_DIR/ecosystem.config.js --env production 2>&1 | tail -5
pm2 save
pm2 startup | tail -3
log "PM2 berjalan"

# ── 12. Selesai ───────────────────────────────────────────
echo ""
echo "========================================"
log "Setup selesai!"
echo "========================================"
echo ""
info "Cek status: pm2 status"
info "Cek log:    pm2 logs lms-smkn1kras"
info "Monitoring: https://$(hostname -I | awk '{print $1}'):3000/admin/monitoring"
echo ""
warn "Jangan lupa setup Caddy/Nginx untuk domain!"
echo ""
