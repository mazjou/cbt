#!/bin/bash

# Script untuk sinkronisasi otomatis ke VPS
# Jalankan dengan: bash sync-to-vps.sh

VPS_HOST="10.10.102.15"
VPS_USER="root"  # Ganti dengan username VPS Anda
VPS_PATH="/var/www/lms-smkn1kras"  # Ganti dengan path di VPS
LOCAL_PATH="."

echo "🚀 Memulai sinkronisasi ke VPS..."
echo "Target: $VPS_USER@$VPS_HOST:$VPS_PATH"
echo ""

# Exclude files yang tidak perlu di-sync
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'src/public/uploads' \
  --exclude '.kiro' \
  $LOCAL_PATH/ $VPS_USER@$VPS_HOST:$VPS_PATH/

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Sinkronisasi berhasil!"
  echo ""
  echo "🔄 Restart aplikasi di VPS..."
  ssh $VPS_USER@$VPS_HOST "cd $VPS_PATH && pm2 restart lms-smkn1kras"
  
  if [ $? -eq 0 ]; then
    echo "✅ Aplikasi berhasil di-restart!"
  else
    echo "⚠️  Gagal restart aplikasi. Silakan restart manual."
  fi
else
  echo "❌ Sinkronisasi gagal!"
  exit 1
fi
