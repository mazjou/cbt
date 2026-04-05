#!/bin/bash

# PM2 Management Script untuk LMS SMKN 1 Kras
# Chmod: chmod +x pm2-commands.sh
# Usage: ./pm2-commands.sh [command]

APP_NAME="lms-smkn1kras"
ECOSYSTEM_FILE="ecosystem.config.js"

case "$1" in
  start)
    echo "🚀 Starting $APP_NAME..."
    pm2 start $ECOSYSTEM_FILE
    ;;
  
  stop)
    echo "🛑 Stopping $APP_NAME..."
    pm2 stop $APP_NAME
    ;;
  
  restart)
    echo "🔄 Restarting $APP_NAME..."
    pm2 restart $APP_NAME
    ;;
  
  reload)
    echo "🔄 Reloading $APP_NAME (zero-downtime)..."
    pm2 reload $APP_NAME
    ;;
  
  delete)
    echo "🗑️  Deleting $APP_NAME from PM2..."
    pm2 delete $APP_NAME
    ;;
  
  status)
    echo "📊 Status of $APP_NAME:"
    pm2 status
    ;;
  
  logs)
    echo "📋 Showing logs for $APP_NAME..."
    pm2 logs $APP_NAME
    ;;
  
  logs-error)
    echo "❌ Showing error logs for $APP_NAME..."
    pm2 logs $APP_NAME --err
    ;;
  
  monitor)
    echo "📈 Monitoring $APP_NAME..."
    pm2 monit
    ;;
  
  info)
    echo "ℹ️  Info for $APP_NAME:"
    pm2 info $APP_NAME
    ;;
  
  flush)
    echo "🧹 Flushing logs..."
    pm2 flush
    ;;
  
  save)
    echo "💾 Saving PM2 process list..."
    pm2 save
    ;;
  
  startup)
    echo "🔧 Setting up auto-start on boot..."
    pm2 startup
    echo ""
    echo "⚠️  Run the command above with sudo, then run:"
    echo "   ./pm2-commands.sh save"
    ;;
  
  update)
    echo "🔄 Updating application..."
    echo "1. Pulling latest code..."
    git pull origin main
    echo "2. Installing dependencies..."
    npm install
    echo "3. Reloading application (zero-downtime)..."
    pm2 reload $APP_NAME
    echo "✅ Update complete!"
    ;;
  
  redis-status)
    echo "🔍 Checking Redis status..."
    redis-cli ping
    ;;
  
  redis-monitor)
    echo "👀 Monitoring Redis commands..."
    redis-cli monitor
    ;;
  
  redis-keys)
    echo "🔑 Showing Redis session keys..."
    redis-cli KEYS "lms:sess:*"
    ;;
  
  redis-flush)
    echo "⚠️  WARNING: This will delete all sessions!"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
      redis-cli FLUSHDB
      echo "✅ Redis database flushed"
    else
      echo "❌ Cancelled"
    fi
    ;;
  
  backup)
    echo "💾 Creating backup..."
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    
    # Backup database
    echo "Backing up database..."
    mysqldump -u root -p cbt_smk > $BACKUP_DIR/database.sql
    
    # Backup Redis
    echo "Backing up Redis..."
    redis-cli BGSAVE
    sleep 2
    cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis.rdb 2>/dev/null || echo "Redis backup skipped"
    
    # Backup uploads
    echo "Backing up uploads..."
    tar -czf $BACKUP_DIR/uploads.tar.gz src/public/uploads/
    
    # Backup .env
    echo "Backing up .env..."
    cp .env $BACKUP_DIR/.env
    
    echo "✅ Backup created in $BACKUP_DIR"
    ;;
  
  health)
    echo "🏥 Health Check:"
    echo ""
    echo "1. PM2 Status:"
    pm2 status | grep $APP_NAME
    echo ""
    echo "2. Redis Status:"
    redis-cli ping
    echo ""
    echo "3. Database Status:"
    mysql -u root -p -e "SELECT 1" 2>/dev/null && echo "✅ Database OK" || echo "❌ Database Error"
    echo ""
    echo "4. Disk Space:"
    df -h | grep -E "Filesystem|/$"
    echo ""
    echo "5. Memory Usage:"
    free -h
    ;;
  
  *)
    echo "LMS SMKN 1 Kras - PM2 Management Script"
    echo ""
    echo "Usage: ./pm2-commands.sh [command]"
    echo ""
    echo "Application Commands:"
    echo "  start          - Start the application"
    echo "  stop           - Stop the application"
    echo "  restart        - Restart the application"
    echo "  reload         - Reload with zero-downtime"
    echo "  delete         - Remove from PM2"
    echo "  update         - Pull code, install deps, reload"
    echo ""
    echo "Monitoring Commands:"
    echo "  status         - Show application status"
    echo "  logs           - Show application logs"
    echo "  logs-error     - Show error logs only"
    echo "  monitor        - Monitor CPU & Memory"
    echo "  info           - Show detailed info"
    echo "  health         - Full health check"
    echo ""
    echo "PM2 Commands:"
    echo "  flush          - Clear all logs"
    echo "  save           - Save process list"
    echo "  startup        - Setup auto-start on boot"
    echo ""
    echo "Redis Commands:"
    echo "  redis-status   - Check Redis connection"
    echo "  redis-monitor  - Monitor Redis commands"
    echo "  redis-keys     - Show session keys"
    echo "  redis-flush    - Clear all sessions (WARNING!)"
    echo ""
    echo "Backup Commands:"
    echo "  backup         - Create full backup"
    echo ""
    ;;
esac
