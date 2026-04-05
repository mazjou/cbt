#!/bin/bash
# Script Bash untuk Update Database VPS
# Jalankan dengan: bash update-database-vps.sh

VPS_HOST="10.10.102.15"
VPS_USER="root"
DB_NAME="lms_smk"
SQL_FILE="sql/update_vps_database.sql"

echo "🗄️  Update Database VPS"
echo "Target: $VPS_USER@$VPS_HOST"
echo "Database: $DB_NAME"
echo ""

# Cek apakah file SQL ada
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ File SQL tidak ditemukan: $SQL_FILE"
    exit 1
fi

echo "✅ File SQL ditemukan: $SQL_FILE"
echo ""

# Konfirmasi
echo "⚠️  PENTING: Pastikan Anda sudah backup database!"
echo ""
read -p "Lanjutkan update database? (y/n) " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "❌ Update dibatalkan."
    exit 0
fi

echo ""
echo "📤 Upload file SQL ke VPS..."

# Upload file SQL ke VPS
scp "$SQL_FILE" "$VPS_USER@$VPS_HOST:/root/update_vps_database.sql"

if [ $? -eq 0 ]; then
    echo "✅ Upload berhasil!"
    echo ""
    
    # Jalankan SQL di VPS
    echo "🔄 Menjalankan update database..."
    echo "⚠️  Anda akan diminta password MySQL"
    echo ""
    
    ssh "$VPS_USER@$VPS_HOST" "mysql -u root -p $DB_NAME < /root/update_vps_database.sql"
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Database berhasil diupdate!"
        echo ""
        
        # Verifikasi
        echo "🔍 Verifikasi tabel baru..."
        ssh "$VPS_USER@$VPS_HOST" "mysql -u root -p $DB_NAME -e 'SHOW TABLES;'"
        
        echo ""
        echo "🔄 Restart aplikasi..."
        ssh "$VPS_USER@$VPS_HOST" "pm2 restart lms-smkn1kras"
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "🎉 Update selesai!"
            echo ""
            echo "Langkah selanjutnya:"
            echo "1. Buka aplikasi di browser"
            echo "2. Logout dan login ulang"
            echo "3. Test fitur-fitur baru (profil, bank soal, tugas, dll)"
        else
            echo ""
            echo "⚠️  Gagal restart aplikasi. Silakan restart manual:"
            echo "ssh $VPS_USER@$VPS_HOST 'pm2 restart lms-smkn1kras'"
        fi
    else
        echo ""
        echo "❌ Gagal menjalankan update database!"
        echo ""
        echo "Troubleshooting:"
        echo "1. Pastikan password MySQL benar"
        echo "2. Pastikan nama database benar: $DB_NAME"
        echo "3. Cek manual: ssh $VPS_USER@$VPS_HOST"
    fi
else
    echo ""
    echo "❌ Upload gagal!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Pastikan SSH key sudah di-setup (jalankan: bash setup-ssh-key.sh)"
    echo "2. Pastikan VPS bisa diakses: ping $VPS_HOST"
    echo "3. Coba manual: scp $SQL_FILE $VPS_USER@$VPS_HOST:/root/"
fi
