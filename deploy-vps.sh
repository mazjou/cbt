#!/bin/bash

# ========================================
# Auto Deploy Script untuk VPS Ubuntu 24
# ========================================

set -e  # Exit on error

echo "🚀 CBT SMK - Auto Deploy Script"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
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
    echo -e "ℹ️  $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_warning "Jangan jalankan script ini sebagai root!"
    print_info "Gunakan: bash deploy-vps.sh"
    exit 1
fi

# Step 1: Update System
echo ""
print_info "Step 1: Update System"
echo "---------------------"
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git vim nano htop ufw
print_success "System updated"

# Step 2: Install Node.js 20
echo ""
print_info "Step 2: Install Node.js 20"
echo "-------------------------"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_warning "Node.js sudah terinstall: $NODE_VERSION"
    read -p "Install ulang? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
print_success "Node.js installed: $(node --version)"

# Install PM2
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_success "PM2 installed"
else
    print_warning "PM2 sudah terinstall"
fi

# Step 3: Install MySQL
echo ""
print_info "Step 3: Install MySQL"
echo "--------------------"
if command -v mysql &> /dev/null; then
    print_warning "MySQL sudah terinstall"
else
    sudo apt install -y mysql-server
    print_success "MySQL installed"
    print_warning "Jangan lupa jalankan: sudo mysql_secure_installation"
fi

# Step 4: Setup Firewall
echo ""
print_info "Step 4: Setup Firewall"
echo "---------------------"
read -p "Setup UFW firewall? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 3000/tcp
    sudo ufw --force enable
    print_success "Firewall configured"
fi

# Step 5: Setup Application Directory
echo ""
print_info "Step 5: Setup Application"
echo "------------------------"
APP_DIR="/var/www/cbt-smk-premium"

if [ -d "$APP_DIR" ]; then
    print_warning "Folder $APP_DIR sudah ada"
    read -p "Hapus dan clone ulang? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo rm -rf $APP_DIR
    else
        print_info "Skip clone, menggunakan folder existing"
        cd $APP_DIR
    fi
fi

if [ ! -d "$APP_DIR" ]; then
    sudo mkdir -p /var/www
    cd /var/www
    
    read -p "Git repository URL: " REPO_URL
    if [ -z "$REPO_URL" ]; then
        print_error "Repository URL tidak boleh kosong"
        exit 1
    fi
    
    sudo git clone $REPO_URL cbt-smk-premium
    sudo chown -R $USER:$USER $APP_DIR
    cd $APP_DIR
    print_success "Repository cloned"
fi

# Step 6: Install Dependencies
echo ""
print_info "Step 6: Install Dependencies"
echo "---------------------------"
cd $APP_DIR
npm install --production
print_success "Dependencies installed"

# Step 7: Setup Environment
echo ""
print_info "Step 7: Setup Environment"
echo "------------------------"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success ".env file created"
        print_warning "Edit .env file dengan konfigurasi Anda:"
        print_info "nano .env"
    else
        print_error ".env.example not found"
    fi
else
    print_warning ".env sudah ada"
fi

# Step 8: Database Setup
echo ""
print_info "Step 8: Database Setup"
echo "--------------------"
read -p "Setup database sekarang? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Database name [cbt_smk]: " DB_NAME
    DB_NAME=${DB_NAME:-cbt_smk}
    
    read -p "Database user [cbt_user]: " DB_USER
    DB_USER=${DB_USER:-cbt_user}
    
    read -sp "Database password: " DB_PASS
    echo
    
    print_info "Creating database..."
    sudo mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    sudo mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
    sudo mysql -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
    sudo mysql -e "FLUSH PRIVILEGES;"
    print_success "Database created"
    
    # Import SQL if exists
    if [ -f "database.sql" ]; then
        read -p "Import database.sql? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mysql -u $DB_USER -p$DB_PASS $DB_NAME < database.sql
            print_success "Database imported"
        fi
    fi
    
    # Run migration
    if [ -f "create-submission-backup-table.sql" ]; then
        read -p "Run migration? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mysql -u $DB_USER -p$DB_PASS $DB_NAME < create-submission-backup-table.sql
            print_success "Migration completed"
        fi
    fi
fi

# Step 9: Setup PM2
echo ""
print_info "Step 9: Setup PM2"
echo "---------------"
cd $APP_DIR

# Stop existing process
pm2 delete cbt-smk 2>/dev/null || true

# Start with PM2
pm2 start src/server.js --name cbt-smk
pm2 save
print_success "PM2 configured"

# Setup startup
print_info "Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp $HOME | tail -n 1 | sudo bash
print_success "PM2 startup configured"

# Step 10: Install Nginx
echo ""
print_info "Step 10: Install Nginx"
echo "--------------------"
if command -v nginx &> /dev/null; then
    print_warning "Nginx sudah terinstall"
else
    sudo apt install -y nginx
    print_success "Nginx installed"
fi

# Configure Nginx
read -p "Configure Nginx? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Domain name (atau IP): " DOMAIN
    
    sudo tee /etc/nginx/sites-available/cbt-smk > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    location /public {
        alias $APP_DIR/public;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF
    
    sudo ln -sf /etc/nginx/sites-available/cbt-smk /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    sudo nginx -t
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    print_success "Nginx configured for $DOMAIN"
fi

# Step 11: Setup SSL (Optional)
echo ""
print_info "Step 11: Setup SSL (Optional)"
echo "----------------------------"
read -p "Install SSL certificate dengan Let's Encrypt? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -z "$DOMAIN" ]; then
        read -p "Domain name: " DOMAIN
    fi
    
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || print_warning "SSL setup failed, skip"
    print_success "SSL configured"
fi

# Step 12: Setup Backup
echo ""
print_info "Step 12: Setup Backup"
echo "-------------------"
read -p "Setup automatic backup? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo mkdir -p /var/backups/cbt-smk
    
    # Get DB credentials from .env
    DB_USER=$(grep DB_USER .env | cut -d '=' -f2)
    DB_PASS=$(grep DB_PASSWORD .env | cut -d '=' -f2)
    DB_NAME=$(grep DB_NAME .env | cut -d '=' -f2)
    
    sudo tee /usr/local/bin/backup-cbt.sh > /dev/null <<EOF
#!/bin/bash
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/cbt-smk"
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME | gzip > \$BACKUP_DIR/db_\$DATE.sql.gz
tar -czf \$BACKUP_DIR/uploads_\$DATE.tar.gz $APP_DIR/public/uploads 2>/dev/null || true
find \$BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete
find \$BACKUP_DIR -name "uploads_*.tar.gz" -mtime +7 -delete
echo "Backup completed: \$DATE"
EOF
    
    sudo chmod +x /usr/local/bin/backup-cbt.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-cbt.sh >> /var/log/cbt-backup.log 2>&1") | crontab -
    
    print_success "Backup configured (daily at 2 AM)"
fi

# Final Steps
echo ""
echo "================================"
print_success "Deployment Completed!"
echo "================================"
echo ""
print_info "Application Status:"
pm2 status
echo ""
print_info "Access your application:"
if [ ! -z "$DOMAIN" ]; then
    echo "  🌐 http://$DOMAIN"
    echo "  🔒 https://$DOMAIN (if SSL enabled)"
else
    echo "  🌐 http://$(curl -s ifconfig.me):3000"
fi
echo ""
print_info "Useful Commands:"
echo "  pm2 logs cbt-smk       - View logs"
echo "  pm2 restart cbt-smk    - Restart app"
echo "  pm2 monit              - Monitor app"
echo "  sudo systemctl status nginx - Check Nginx"
echo ""
print_warning "Next Steps:"
echo "  1. Edit .env file: nano $APP_DIR/.env"
echo "  2. Configure database credentials"
echo "  3. Restart app: pm2 restart cbt-smk"
echo "  4. Test application in browser"
echo "  5. Setup monitoring and alerts"
echo ""
print_success "Happy deploying! 🚀"
