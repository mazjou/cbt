#!/bin/bash
# ============================================================
# optimize-postgres.sh - Optimasi PostgreSQL untuk 1000+ siswa
# Jalankan di SERVER DATABASE (bukan VPS app)
# Cara: bash optimize-postgres.sh
# ============================================================

# Cari lokasi postgresql.conf
PG_CONF=$(sudo -u postgres psql -t -c "SHOW config_file;" 2>/dev/null | tr -d ' ')
if [ -z "$PG_CONF" ]; then
  # Coba lokasi umum
  for f in /etc/postgresql/*/main/postgresql.conf /var/lib/pgsql/data/postgresql.conf; do
    [ -f "$f" ] && PG_CONF="$f" && break
  done
fi

if [ -z "$PG_CONF" ]; then
  echo "❌ Tidak bisa menemukan postgresql.conf"
  echo "   Cari manual: sudo find / -name postgresql.conf 2>/dev/null"
  exit 1
fi

echo "📋 Config: $PG_CONF"
echo ""

# Backup dulu
sudo cp "$PG_CONF" "${PG_CONF}.backup.$(date +%Y%m%d)"
echo "✅ Backup: ${PG_CONF}.backup.$(date +%Y%m%d)"

# Fungsi set/replace parameter
set_param() {
  local key=$1
  local val=$2
  if grep -q "^${key}" "$PG_CONF"; then
    sudo sed -i "s/^${key}.*/${key} = ${val}/" "$PG_CONF"
  elif grep -q "^#${key}" "$PG_CONF"; then
    sudo sed -i "s/^#${key}.*/${key} = ${val}/" "$PG_CONF"
  else
    echo "${key} = ${val}" | sudo tee -a "$PG_CONF" > /dev/null
  fi
  echo "  ✅ ${key} = ${val}"
}

echo ""
echo "🔧 Mengoptimasi postgresql.conf untuk 1000+ user..."
echo ""

# Koneksi — 4 worker × 45 + overhead = 200 cukup, tapi naikkan ke 300 untuk aman
set_param "max_connections" "300"

# Memory — shared_buffers sudah 4GB (bagus), pastikan work_mem cukup
# work_mem per sort per koneksi: 300 koneksi × 4MB = 1.2GB max
set_param "work_mem" "4MB"
set_param "maintenance_work_mem" "256MB"

# WAL & checkpoint — kurangi I/O burst saat ujian ramai
set_param "checkpoint_completion_target" "0.9"
set_param "wal_buffers" "64MB"
set_param "max_wal_size" "2GB"

# Koneksi idle — bebaskan koneksi yang tidak aktif lebih cepat
set_param "idle_in_transaction_session_timeout" "30000"  # 30 detik
set_param "statement_timeout" "60000"                    # 60 detik max per query

# Logging — jangan log semua query (makan disk saat ramai)
set_param "log_min_duration_statement" "1000"  # log hanya query > 1 detik

echo ""
echo "🔄 Reload PostgreSQL (tidak perlu restart)..."
sudo -u postgres pg_ctl reload 2>/dev/null || \
  sudo systemctl reload postgresql 2>/dev/null || \
  sudo service postgresql reload 2>/dev/null || \
  echo "⚠️  Reload manual: sudo systemctl restart postgresql"

echo ""
echo "✅ Selesai! Cek dengan:"
echo "   psql -U lmsuser -h localhost -d cbt_smk -c \"SHOW max_connections;\""
