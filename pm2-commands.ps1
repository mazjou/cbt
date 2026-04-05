# PM2 Management Script untuk LMS SMKN 1 Kras (Windows PowerShell)
# Usage: .\pm2-commands.ps1 [command]

param(
    [Parameter(Position=0)]
    [string]$Command
)

$APP_NAME = "lms-smkn1kras"
$ECOSYSTEM_FILE = "ecosystem.config.js"

function Show-Help {
    Write-Host "LMS SMKN 1 Kras - PM2 Management Script (Windows)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\pm2-commands.ps1 [command]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Application Commands:" -ForegroundColor Green
    Write-Host "  start          - Start the application"
    Write-Host "  stop           - Stop the application"
    Write-Host "  restart        - Restart the application"
    Write-Host "  reload         - Reload with zero-downtime"
    Write-Host "  delete         - Remove from PM2"
    Write-Host "  update         - Pull code, install deps, reload"
    Write-Host ""
    Write-Host "Monitoring Commands:" -ForegroundColor Green
    Write-Host "  status         - Show application status"
    Write-Host "  logs           - Show application logs"
    Write-Host "  logs-error     - Show error logs only"
    Write-Host "  monitor        - Monitor CPU & Memory"
    Write-Host "  info           - Show detailed info"
    Write-Host "  health         - Full health check"
    Write-Host ""
    Write-Host "PM2 Commands:" -ForegroundColor Green
    Write-Host "  flush          - Clear all logs"
    Write-Host "  save           - Save process list"
    Write-Host "  startup        - Setup auto-start on boot"
    Write-Host ""
    Write-Host "Redis Commands:" -ForegroundColor Green
    Write-Host "  redis-status   - Check Redis connection"
    Write-Host "  redis-keys     - Show session keys"
    Write-Host "  redis-flush    - Clear all sessions (WARNING!)"
    Write-Host ""
    Write-Host "Backup Commands:" -ForegroundColor Green
    Write-Host "  backup         - Create full backup"
    Write-Host ""
}

switch ($Command) {
    "start" {
        Write-Host "🚀 Starting $APP_NAME..." -ForegroundColor Green
        pm2 start $ECOSYSTEM_FILE
    }
    
    "stop" {
        Write-Host "🛑 Stopping $APP_NAME..." -ForegroundColor Yellow
        pm2 stop $APP_NAME
    }
    
    "restart" {
        Write-Host "🔄 Restarting $APP_NAME..." -ForegroundColor Cyan
        pm2 restart $APP_NAME
    }
    
    "reload" {
        Write-Host "🔄 Reloading $APP_NAME (zero-downtime)..." -ForegroundColor Cyan
        pm2 reload $APP_NAME
    }
    
    "delete" {
        Write-Host "🗑️  Deleting $APP_NAME from PM2..." -ForegroundColor Red
        pm2 delete $APP_NAME
    }
    
    "status" {
        Write-Host "📊 Status of $APP_NAME:" -ForegroundColor Cyan
        pm2 status
    }
    
    "logs" {
        Write-Host "📋 Showing logs for $APP_NAME..." -ForegroundColor Cyan
        pm2 logs $APP_NAME
    }
    
    "logs-error" {
        Write-Host "❌ Showing error logs for $APP_NAME..." -ForegroundColor Red
        pm2 logs $APP_NAME --err
    }
    
    "monitor" {
        Write-Host "📈 Monitoring $APP_NAME..." -ForegroundColor Cyan
        pm2 monit
    }
    
    "info" {
        Write-Host "ℹ️  Info for $APP_NAME:" -ForegroundColor Cyan
        pm2 info $APP_NAME
    }
    
    "flush" {
        Write-Host "🧹 Flushing logs..." -ForegroundColor Yellow
        pm2 flush
    }
    
    "save" {
        Write-Host "💾 Saving PM2 process list..." -ForegroundColor Green
        pm2 save
    }
    
    "startup" {
        Write-Host "🔧 Setting up auto-start on boot..." -ForegroundColor Cyan
        pm2 startup
        Write-Host ""
        Write-Host "⚠️  Run the command above, then run:" -ForegroundColor Yellow
        Write-Host "   .\pm2-commands.ps1 save" -ForegroundColor Yellow
    }
    
    "update" {
        Write-Host "🔄 Updating application..." -ForegroundColor Cyan
        Write-Host "1. Pulling latest code..." -ForegroundColor Yellow
        git pull origin main
        Write-Host "2. Installing dependencies..." -ForegroundColor Yellow
        npm install
        Write-Host "3. Reloading application (zero-downtime)..." -ForegroundColor Yellow
        pm2 reload $APP_NAME
        Write-Host "✅ Update complete!" -ForegroundColor Green
    }
    
    "redis-status" {
        Write-Host "🔍 Checking Redis status..." -ForegroundColor Cyan
        redis-cli ping
    }
    
    "redis-keys" {
        Write-Host "🔑 Showing Redis session keys..." -ForegroundColor Cyan
        redis-cli KEYS "lms:sess:*"
    }
    
    "redis-flush" {
        Write-Host "⚠️  WARNING: This will delete all sessions!" -ForegroundColor Red
        $confirm = Read-Host "Are you sure? (yes/no)"
        if ($confirm -eq "yes") {
            redis-cli FLUSHDB
            Write-Host "✅ Redis database flushed" -ForegroundColor Green
        } else {
            Write-Host "❌ Cancelled" -ForegroundColor Yellow
        }
    }
    
    "backup" {
        Write-Host "💾 Creating backup..." -ForegroundColor Cyan
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backupDir = "backups\$timestamp"
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        
        Write-Host "Backing up uploads..." -ForegroundColor Yellow
        Compress-Archive -Path "src\public\uploads\*" -DestinationPath "$backupDir\uploads.zip" -Force
        
        Write-Host "Backing up .env..." -ForegroundColor Yellow
        Copy-Item ".env" -Destination "$backupDir\.env"
        
        Write-Host "✅ Backup created in $backupDir" -ForegroundColor Green
    }
    
    "health" {
        Write-Host "🏥 Health Check:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. PM2 Status:" -ForegroundColor Yellow
        pm2 status | Select-String $APP_NAME
        Write-Host ""
        Write-Host "2. Redis Status:" -ForegroundColor Yellow
        redis-cli ping
        Write-Host ""
        Write-Host "3. Disk Space:" -ForegroundColor Yellow
        Get-PSDrive C | Select-Object Used,Free
        Write-Host ""
        Write-Host "4. Memory Usage:" -ForegroundColor Yellow
        $os = Get-CimInstance Win32_OperatingSystem
        $totalMemory = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        $freeMemory = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        $usedMemory = $totalMemory - $freeMemory
        Write-Host "Total: $totalMemory GB, Used: $usedMemory GB, Free: $freeMemory GB"
    }
    
    default {
        Show-Help
    }
}
