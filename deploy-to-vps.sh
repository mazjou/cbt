#!/bin/bash
# Script Bash untuk Deploy ke VPS dengan Git
# Jalankan dengan: bash deploy-to-vps.sh

VPS_HOST="10.10.102.15"
VPS_USER="root"
VPS_PATH="/var/www/lms-smkn1kras"
BRANCH="main"  # Ganti dengan "master" jika branch Anda master

echo "🚀 Deploy ke VPS dengan Git"
echo "Target: $VPS_USER@$VPS_HOST:$VPS_PATH"
echo ""

# Step 1: Cek status git
echo "📋 Cek status git..."
git status --short

if [ -n "$(git status --short)" ]; then
    echo ""
    echo "📝 Ada perubahan yang belum di-commit"
    
    read -p "Commit perubahan? (y/n) " commit
    
    if [ "$commit" = "y" ] || [ "$commit" = "Y" ]; then
        echo ""
        read -p "Masukkan pesan commit: " message
        
        if [ -z "$message" ]; then
            message="Update: $(date '+%Y-%m-%d %H:%M')"
        fi
        
        echo ""
        echo "📦 Commit perubahan..."
        git add .
        git commit -m "$message"
        
        if [ $? -eq 0 ]; then
            echo "✅ Commit berhasil!"
        else
            echo "❌ Commit gagal!"
            exit 1
        fi
    else
        echo "⚠️  Deploy dibatalkan. Commit perubahan terlebih dahulu."
        exit 0
    fi
fi

# Step 2: Push ke GitHub
echo ""
echo "📤 Push ke GitHub..."
git push origin $BRANCH

if [ $? -eq 0 ]; then
    echo "✅ Push berhasil!"
else
    echo "❌ Push gagal!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Pastikan Anda sudah login ke GitHub"
    echo "2. Pastikan branch '$BRANCH' ada di remote"
    echo "3. Coba: git push -u origin $BRANCH"
    exit 1
fi

# Step 3: Pull di VPS
echo ""
echo "📥 Pull perubahan di VPS..."

ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && git pull origin $BRANCH"

if [ $? -eq 0 ]; then
    echo "✅ Pull berhasil!"
else
    echo "❌ Pull gagal!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Pastikan git sudah terinstall di VPS"
    echo "2. Pastikan folder $VPS_PATH adalah git repository"
    echo "3. Login ke VPS dan cek: cd $VPS_PATH && git status"
    exit 1
fi

# Step 4: Install dependencies
echo ""
echo "📦 Install dependencies..."

ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && npm install --production"

if [ $? -eq 0 ]; then
    echo "✅ Install dependencies berhasil!"
else
    echo "⚠️  Install dependencies gagal, tapi lanjut restart..."
fi

# Step 5: Restart aplikasi
echo ""
echo "🔄 Restart aplikasi..."

ssh "$VPS_USER@$VPS_HOST" "pm2 restart lms-smkn1kras"

if [ $? -eq 0 ]; then
    echo "✅ Restart berhasil!"
else
    echo "❌ Restart gagal!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Cek status PM2: ssh $VPS_USER@$VPS_HOST 'pm2 status'"
    echo "2. Cek log: ssh $VPS_USER@$VPS_HOST 'pm2 logs lms-smkn1kras --lines 50'"
    exit 1
fi

# Step 6: Cek status
echo ""
echo "📊 Cek status aplikasi..."

ssh "$VPS_USER@$VPS_HOST" "pm2 status lms-smkn1kras"

echo ""
echo "🎉 Deploy selesai!"
echo ""
echo "Langkah selanjutnya:"
echo "1. Buka aplikasi di browser"
echo "2. Test fitur yang baru diupdate"
echo "3. Jika ada error, cek log: ssh $VPS_USER@$VPS_HOST 'pm2 logs lms-smkn1kras --lines 50'"
echo ""
echo "📝 Catatan:"
echo "- Jika ada perubahan database, jalankan: bash update-database-vps.sh"
echo "- Jika ada perubahan .env, update manual di VPS"
