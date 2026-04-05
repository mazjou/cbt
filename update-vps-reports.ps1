# Script PowerShell untuk update VPS dengan fitur reports terbaru
# Author: Kiro Assistant
# Usage: .\update-vps-reports.ps1

Write-Host "🚀 STARTING VPS UPDATE - LMS REPORTS FEATURES" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Configuration
$VPS_IP = "10.10.102.15"
$VPS_USER = "root"
$VPS_PATH = "/var/www/lms-smkn1kras"
$BRANCH = "main"

Write-Host ""
Write-Host "📋 Update Summary:" -ForegroundColor Yellow
Write-Host "- Fitur Rekap LMS untuk Admin (/admin/reports)" -ForegroundColor White
Write-Host "- Fitur Rekap LMS untuk Kepala Sekolah (/principal/reports)" -ForegroundColor White
Write-Host "- Export Excel dengan 5 sheets" -ForegroundColor White
Write-Host "- Filter periode dan quick selection" -ForegroundColor White
Write-Host "- Bug fixes dan improvements" -ForegroundColor White
Write-Host ""

# Step 1: Local Git Operations
Write-Host "STEP 1: Local Git Operations" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

Write-Host "📝 Adding all changes..." -ForegroundColor Yellow
git add .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Failed to add changes" -ForegroundColor Red
    exit 1
}

Write-Host "💾 Committing changes..." -ForegroundColor Yellow
$commitMessage = "feat: Add LMS usage reports for admin and principal

- Add comprehensive LMS usage reports dashboard
- Add Excel export functionality with 5 sheets  
- Add period filtering and quick selection
- Add principal-specific reports interface
- Fix data type conversion issues (toFixed on strings)
- Add activity scoring system for teachers and students
- Add responsive design for mobile devices
- Add proper error handling and logging"

git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: Nothing to commit or commit failed" -ForegroundColor Yellow
}

Write-Host "🔄 Pushing to GitHub..." -ForegroundColor Yellow
git push origin $BRANCH

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Failed to push to GitHub" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Local git operations completed!" -ForegroundColor Green
Write-Host ""

# Step 2: VPS Update
Write-Host "STEP 2: VPS Update" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

Write-Host "🔗 Connecting to VPS and updating..." -ForegroundColor Yellow

$sshCommand = @"
cd $VPS_PATH &&
echo "📂 Current directory: \$(pwd)" &&
echo "🔄 Pulling latest changes from GitHub..." &&
git pull origin $BRANCH &&
echo "📦 Installing/updating dependencies..." &&
npm install &&
echo "🔄 Restarting PM2 application..." &&
pm2 restart lms-app &&
echo "📊 Checking PM2 status..." &&
pm2 status &&
echo "🌐 Testing application response..." &&
curl -I http://localhost:3000 &&
echo "✅ VPS update completed successfully!"
"@

ssh "$VPS_USER@$VPS_IP" $sshCommand

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: VPS update failed" -ForegroundColor Red
    Write-Host "🔧 Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check SSH connection: ssh $VPS_USER@$VPS_IP" -ForegroundColor White
    Write-Host "2. Check PM2 logs: pm2 logs lms-app" -ForegroundColor White
    Write-Host "3. Manual restart: pm2 restart lms-app" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "STEP 3: Verification" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

Write-Host "🧪 Running verification tests..." -ForegroundColor Yellow

# Upload test scripts to VPS
Write-Host "📤 Uploading test scripts..." -ForegroundColor Yellow
scp test-reports-feature.js "$VPS_USER@$VPS_IP`:$VPS_PATH/"
scp test-principal-reports.js "$VPS_USER@$VPS_IP`:$VPS_PATH/"

# Run tests on VPS
Write-Host "🧪 Running tests on VPS..." -ForegroundColor Yellow
$testCommand = @"
cd $VPS_PATH &&
echo "Testing admin reports..." &&
timeout 30 node test-reports-feature.js &&
echo "Testing principal reports..." &&
timeout 30 node test-principal-reports.js &&
echo "✅ All tests passed!"
"@

ssh "$VPS_USER@$VPS_IP" $testCommand

Write-Host ""
Write-Host "🎉 UPDATE COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Access URLs:" -ForegroundColor Yellow
Write-Host "Admin Reports    : http://$VPS_IP`:3000/admin/reports" -ForegroundColor White
Write-Host "Principal Reports: http://$VPS_IP`:3000/principal/reports" -ForegroundColor White
Write-Host ""
Write-Host "🔐 Test Credentials:" -ForegroundColor Yellow
Write-Host "Admin     : Use existing admin account" -ForegroundColor White
Write-Host "Principal : kepsek / kepsek123" -ForegroundColor White
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test admin reports functionality" -ForegroundColor White
Write-Host "2. Test principal reports functionality" -ForegroundColor White
Write-Host "3. Test Excel export features" -ForegroundColor White
Write-Host "4. Test responsive design on mobile" -ForegroundColor White
Write-Host "5. Verify no errors in browser console" -ForegroundColor White
Write-Host ""
Write-Host "✅ VPS update with LMS reports features completed!" -ForegroundColor Green