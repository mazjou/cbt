#!/bin/bash
# ============================================================
# Script Deploy LMS ke VPS Ubuntu/Debian
# Jalankan: bash deploy.sh
# ============================================================

set -e  # Stop jika ada error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

APP_DIR="/cbt"
APP_USER="cbtapp"
LOG_DIR="/cbt/logs"
UPLOAD_DIR="/cbt/uploads"

echo ""
echo "============================================"
echo "  Deploy LMS SMKN - VPS Setup Script"
echo "============================================"
echo ""

# ── 1. Update sistem ──────────────────────────────────────
info "Update sistem..."
apt-get update -qq && apt-get upgrade -y -qq
log "Sistem diupdate"

# ── 2. Install Node.js 20 LTS ────────────────────────────
if ! command -v node &> /dev/null; then
  info "Install Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  log "Node.js $(node -v) terinstall"
else
  log "Node.js sudah ada: $(node -v)"
fi

# ── 3. Install PM2 ───────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  info "Install PM2..."
  npm install -g pm2
  log "PM2 terinstall"
else
  log "PM2 sudah ada"
fi

# ── 4. Install PostgreSQL ─────────────────────────────────
if ! command -v psql &> /dev/null; then
  info "Install PostgreSQL..."
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
  log "PostgreSQL terinstall"
else
  log "PostgreSQL sudah ada"
fi

# ── 5. Install Redis ──────────────────────────────────────
if ! command -v redis-cli &> /dev/null; then
  info "Install Redis..."
  apt-get install -y redis-server
  # Konfigurasi Redis untuk produksi
  sed -i 's/^# maxmemory .*/maxmemory 256mb/' /etc/redis/redis.conf
  sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
  systemctl enable redis-server
  systemctl start redis-server
  log "Redis terinstall"
else
  log "Redis sudah ada"
fi

# ── 6. Install Nginx ──────────────────────────────────────
if ! command -v nginx &> /dev/null; then
  info "Install Nginx..."
  apt-get install -y nginx
  systemctl enable nginx
  log "Nginx terinstall"
else
  log "Nginx sudah ada"
fi

# ── 7. Buat user aplikasi ─────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
  info "Buat user $APP_USER..."
  useradd -r -s /bin/bash -d $APP_DIR $APP_USER
  log "User $APP_USER dibuat"
fi

# ── 8. Buat direktori ────────────────────────────────────
info "Buat direktori..."
mkdir -p $APP_DIR $LOG_DIR $UPLOAD_DIR
mkdir -p $UPLOAD_DIR/{questions,materials,profiles,assignments,imports}
chown -R $APP_USER:$APP_USER $APP_DIR $LOG_DIR
chmod -R 755 $APP_DIR
log "Direktori siap"

# ── 9. Setup PostgreSQL database ─────────────────────────
info "Setup PostgreSQL..."
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=')
sudo -u postgres psql -c "CREATE USER lmsuser WITH PASSWORD '$DB_PASS';" 2>/dev/null || warn "User lmsuser sudah ada"
sudo -u postgres psql -c "CREATE DATABASE cbt_smk OWNER lmsuser ENCODING 'UTF8';" 2>/dev/null || warn "Database cbt_smk sudah ada"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cbt_smk TO lmsuser;" 2>/dev/null
log "PostgreSQL siap. Password DB: $DB_PASS"
echo "DB_PASSWORD=$DB_PASS" >> /tmp/lms_credentials.txt

# ── 10. Setup Redis password ──────────────────────────────
REDIS_PASS=$(openssl rand -base64 24 | tr -d '/+=')
echo "requirepass $REDIS_PASS" >> /etc/redis/redis.conf
systemctl restart redis-server
log "Redis password diset"
echo "REDIS_PASSWORD=$REDIS_PASS" >> /tmp/lms_credentials.txt

# ── 11. Konfigurasi Nginx ─────────────────────────────────
info "Konfigurasi Nginx..."
cat > /etc/nginx/sites-available/lms << 'NGINX'
# Rate limiting
limit_req_zone $binary_remote_addr zone=lms_general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=lms_answer:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=lms_conn:10m;

upstream lms_backend {
    least_conn;
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name _;  # Ganti dengan domain Anda

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Limit koneksi per IP
    limit_conn lms_conn 50;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    # Static files langsung dari disk (bypass Node.js)
    location /public/uploads/ {
        alias /cbt/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        limit_req zone=lms_general burst=20 nodelay;
    }

    location /public/ {
        alias /cbt/public/;
        expires 1d;
        add_header Cache-Control "public";
    }

    # Rate limit endpoint jawaban ujian
    location ~ ^/student/attempts/[0-9]+/answer {
        limit_req zone=lms_answer burst=5 nodelay;
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
    }

    # Socket.io
    location /socket.io/ {
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    # Semua request lain
    location / {
        limit_req zone=lms_general burst=50 nodelay;
        proxy_pass http://lms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        client_max_body_size 50M;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/lms /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx dikonfigurasi"

# ── 12. Konfigurasi PostgreSQL untuk performa ─────────────
info "Optimasi PostgreSQL..."
PG_CONF=$(find /etc/postgresql -name "postgresql.conf" | head -1)
if [ -f "$PG_CONF" ]; then
  # Sesuaikan dengan RAM VPS (contoh untuk 2GB RAM)
  cat >> $PG_CONF << 'PGCONF'

# === LMS Optimization ===
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
PGCONF
  systemctl restart postgresql
  log "PostgreSQL dioptimasi"
fi

# ── 13. Setup firewall ────────────────────────────────────
if command -v ufw &> /dev/null; then
  info "Setup firewall..."
  ufw allow ssh
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  log "Firewall aktif"
fi

# ── 14. PM2 startup ───────────────────────────────────────
info "Setup PM2 startup..."
pm2 startup systemd -u $APP_USER --hp $APP_DIR 2>/dev/null || true
log "PM2 startup dikonfigurasi"

# ── Selesai ───────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Setup VPS Selesai!"
echo "============================================"
echo ""
log "Kredensial tersimpan di: /tmp/lms_credentials.txt"
cat /tmp/lms_credentials.txt
echo ""
warn "LANGKAH SELANJUTNYA:"
echo "  1. Upload kode aplikasi ke $APP_DIR"
echo "  2. Copy .env.production.example ke $APP_DIR/.env"
echo "  3. Isi .env dengan kredensial di atas"
echo "  4. cd $APP_DIR && npm install --production"
echo "  5. npm run db:setup"
echo "  6. pm2 start ecosystem.config.js --env production"
echo "  7. pm2 save"
echo ""
warn "Untuk HTTPS, jalankan: certbot --nginx -d domain-anda.com"
echo ""
