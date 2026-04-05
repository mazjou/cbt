# Instalasi Redis - Semua Platform

## Windows

### Method 1: Download Binary (Recommended)
1. Download dari: https://github.com/microsoftarchive/redis/releases
2. Download file: `Redis-x64-3.0.504.zip`
3. Extract ke folder (misal: `C:\Redis`)
4. Jalankan `redis-server.exe`

### Method 2: Chocolatey
```powershell
# Install Chocolatey dulu (jika belum)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Redis
choco install redis-64 -y

# Start Redis
redis-server
```

### Method 3: WSL (Windows Subsystem for Linux)
```bash
# Install WSL dulu
wsl --install

# Di WSL, install Redis
sudo apt update
sudo apt install redis-server -y

# Start Redis
sudo service redis-server start
```

### Verifikasi (Windows)
```powershell
# Test connection
redis-cli ping
# Harus return: PONG
```

### Auto-Start (Windows)
1. Buat file `start-redis.bat`:
```batch
@echo off
cd C:\Redis
start redis-server.exe
```

2. Tambahkan ke Startup:
   - Press `Win + R`
   - Ketik `shell:startup`
   - Copy `start-redis.bat` ke folder tersebut

---

## Linux (Ubuntu/Debian)

### Install
```bash
# Update package list
sudo apt update

# Install Redis
sudo apt install redis-server -y

# Check version
redis-server --version
```

### Configure
```bash
# Edit config
sudo nano /etc/redis/redis.conf

# Recommended settings:
# supervised systemd
# bind 127.0.0.1
# requirepass your-password-here
```

### Start & Enable
```bash
# Start Redis
sudo systemctl start redis-server

# Enable auto-start on boot
sudo systemctl enable redis-server

# Check status
sudo systemctl status redis-server
```

### Verifikasi
```bash
# Test connection
redis-cli ping
# Harus return: PONG

# Check if running
ps aux | grep redis
```

---

## Linux (CentOS/RHEL/Fedora)

### Install
```bash
# Enable EPEL repository (CentOS/RHEL)
sudo yum install epel-release -y

# Install Redis
sudo yum install redis -y

# Or for Fedora
sudo dnf install redis -y
```

### Start & Enable
```bash
# Start Redis
sudo systemctl start redis

# Enable auto-start
sudo systemctl enable redis

# Check status
sudo systemctl status redis
```

---

## macOS

### Method 1: Homebrew (Recommended)
```bash
# Install Homebrew (jika belum)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Redis
brew install redis

# Start Redis
brew services start redis

# Or start manually
redis-server /usr/local/etc/redis.conf
```

### Method 2: MacPorts
```bash
# Install Redis
sudo port install redis

# Start Redis
redis-server
```

### Verifikasi
```bash
# Test connection
redis-cli ping
# Harus return: PONG
```

---

## Docker (All Platforms)

### Pull & Run
```bash
# Pull Redis image
docker pull redis:latest

# Run Redis container
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:latest

# Or with password
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:latest \
  redis-server --requirepass your-password
```

### With Docker Compose
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:latest
    container_name: redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

```bash
# Start
docker-compose up -d

# Stop
docker-compose down
```

### Verifikasi
```bash
# Test connection
docker exec -it redis redis-cli ping
# Harus return: PONG
```

---

## Cloud Redis

### Redis Cloud (Free Tier)
1. Daftar di: https://redis.com/try-free/
2. Create database
3. Copy connection details
4. Update .env:
```env
REDIS_HOST=your-redis-host.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-password
```

### AWS ElastiCache
```env
REDIS_HOST=your-cluster.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Azure Cache for Redis
```env
REDIS_HOST=your-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=your-access-key
```

---

## Verifikasi Instalasi

### Test Connection
```bash
redis-cli ping
# Expected: PONG
```

### Test Set/Get
```bash
redis-cli
> SET test "Hello Redis"
> GET test
# Expected: "Hello Redis"
> DEL test
> EXIT
```

### Check Info
```bash
redis-cli info server
redis-cli info memory
redis-cli info stats
```

---

## Configuration

### Basic Config
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf  # Linux
nano /usr/local/etc/redis.conf   # macOS
notepad C:\Redis\redis.conf      # Windows
```

### Recommended Settings

#### Security
```conf
# Bind to localhost only
bind 127.0.0.1

# Set password
requirepass your-strong-password-here

# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""
```

#### Performance
```conf
# Max memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# AOF
appendonly yes
appendfsync everysec
```

#### Networking
```conf
# Port
port 6379

# Timeout
timeout 300

# TCP backlog
tcp-backlog 511
```

---

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 6379
# Linux/Mac
sudo lsof -i :6379

# Windows
netstat -ano | findstr :6379

# Kill process
# Linux/Mac
sudo kill -9 <PID>

# Windows
taskkill /PID <PID> /F
```

### Permission Denied
```bash
# Linux - Fix permissions
sudo chown redis:redis /var/lib/redis
sudo chmod 755 /var/lib/redis

# Check Redis user
ps aux | grep redis
```

### Can't Connect
```bash
# Check if Redis is running
# Linux
sudo systemctl status redis-server

# Mac
brew services list

# Windows
tasklist | findstr redis

# Check firewall
# Linux
sudo ufw status
sudo ufw allow 6379

# Windows
# Add firewall rule in Windows Defender
```

### Memory Issues
```bash
# Check memory usage
redis-cli info memory

# Set max memory
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Or edit redis.conf
```

---

## Uninstall

### Windows
```powershell
# Chocolatey
choco uninstall redis-64

# Manual
# Delete folder C:\Redis
```

### Linux (Ubuntu/Debian)
```bash
sudo systemctl stop redis-server
sudo systemctl disable redis-server
sudo apt remove redis-server -y
sudo apt purge redis-server -y
sudo rm -rf /var/lib/redis
```

### macOS
```bash
brew services stop redis
brew uninstall redis
rm -rf /usr/local/var/db/redis
```

### Docker
```bash
docker stop redis
docker rm redis
docker rmi redis:latest
```

---

## Tools & GUI

### Redis Commander (Web UI)
```bash
npm install -g redis-commander
redis-commander
# Open: http://localhost:8081
```

### RedisInsight (Desktop)
Download: https://redis.com/redis-enterprise/redis-insight/

### Redis Desktop Manager
Download: https://resp.app/

---

## Testing

### Benchmark
```bash
redis-benchmark -q -n 10000
```

### Monitor Commands
```bash
redis-cli monitor
```

### Slowlog
```bash
redis-cli slowlog get 10
```

---

## Quick Reference

### Start Redis
```bash
# Linux
sudo systemctl start redis-server

# macOS
brew services start redis

# Windows
redis-server.exe

# Docker
docker start redis
```

### Stop Redis
```bash
# Linux
sudo systemctl stop redis-server

# macOS
brew services stop redis

# Windows
# Close redis-server.exe window

# Docker
docker stop redis
```

### Restart Redis
```bash
# Linux
sudo systemctl restart redis-server

# macOS
brew services restart redis

# Windows
# Close and reopen redis-server.exe

# Docker
docker restart redis
```

---

## Status
✅ Redis installation guide complete for all platforms!
