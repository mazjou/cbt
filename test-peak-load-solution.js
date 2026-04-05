/**
 * Test Script: Peak Load Submission Solution
 * 
 * Tests:
 * 1. Database connection pool configuration
 * 2. Submission backup system
 * 3. Failed submissions recovery
 * 4. Client-side backup integration
 */

require('dotenv').config();
const pool = require('./src/db/pool');

async function testConnectionPool() {
  console.log('\n🔍 Testing Database Connection Pool...\n');
  
  try {
    // Get pool configuration
    const poolConfig = pool.pool.config.connectionConfig;
    const poolOptions = pool.pool.config;
    
    console.log('📊 Connection Pool Configuration:');
    console.log('  - Host:', poolConfig.host);
    console.log('  - Database:', poolConfig.database);
    console.log('  - Connection Limit:', poolOptions.connectionLimit);
    console.log('  - Queue Limit:', poolOptions.queueLimit);
    console.log('  - Wait for Connections:', poolOptions.waitForConnections);
    
    if (poolOptions.connectionLimit >= 50) {
      console.log('  ✅ Connection limit is optimized for peak load (50+)');
    } else {
      console.log('  ⚠️  Connection limit might be too low for peak load');
    }
    
    // Test connection
    const [result] = await pool.query('SELECT 1 as test');
    console.log('\n✅ Database connection successful');
    
  } catch (error) {
    console.error('❌ Connection pool test failed:', error.message);
  }
}

async function testSubmissionBackupTable() {
  console.log('\n🔍 Testing Submission Backup Table...\n');
  
  try {
    // Check if table exists
    const [tables] = await pool.query(`
      SHOW TABLES LIKE 'submission_backups'
    `);
    
    if (tables.length === 0) {
      console.log('❌ Table submission_backups does not exist');
      console.log('   Run: mysql -u root -p bank_soal < create-submission-backup-table.sql');
      return;
    }
    
    console.log('✅ Table submission_backups exists');
    
    // Check table structure
    const [columns] = await pool.query(`
      DESCRIBE submission_backups
    `);
    
    console.log('\n📋 Table Structure:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Check for backups
    const [[count]] = await pool.query(`
      SELECT COUNT(*) as total FROM submission_backups
    `);
    
    console.log(`\n📦 Total backups in database: ${count.total}`);
    
    // Check active backups
    const [[activeCount]] = await pool.query(`
      SELECT COUNT(*) as total FROM submission_backups WHERE status = 'ACTIVE'
    `);
    
    console.log(`📦 Active backups: ${activeCount.total}`);
    
  } catch (error) {
    console.error('❌ Backup table test failed:', error.message);
  }
}

async function testSubmissionStatusColumn() {
  console.log('\n🔍 Testing Submission Status Column...\n');
  
  try {
    // Check if column exists
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM attempts LIKE 'submission_status'
    `);
    
    if (columns.length === 0) {
      console.log('❌ Column submission_status does not exist in attempts table');
      console.log('   Run: mysql -u root -p bank_soal < create-submission-backup-table.sql');
      return;
    }
    
    console.log('✅ Column submission_status exists');
    console.log(`   Type: ${columns[0].Type}`);
    
    // Check submission status distribution
    const [stats] = await pool.query(`
      SELECT 
        submission_status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM attempts
      WHERE submission_status IS NOT NULL
      GROUP BY submission_status
      ORDER BY count DESC
    `);
    
    if (stats.length > 0) {
      console.log('\n📊 Submission Status Distribution:');
      stats.forEach(stat => {
        const emoji = stat.submission_status === 'SUBMITTED' ? '✅' : 
                     stat.submission_status === 'FAILED' ? '❌' : 
                     stat.submission_status === 'SUBMITTING' ? '⏳' : '⏸️';
        console.log(`  ${emoji} ${stat.submission_status}: ${stat.count} (${stat.percentage}%)`);
      });
    } else {
      console.log('\n📊 No submission status data yet');
    }
    
  } catch (error) {
    console.error('❌ Submission status test failed:', error.message);
  }
}

async function testFailedSubmissions() {
  console.log('\n🔍 Testing Failed Submissions...\n');
  
  try {
    const [failed] = await pool.query(`
      SELECT a.id, a.exam_id, a.student_id, a.status, a.submission_status,
             a.started_at, a.finished_at,
             u.full_name as student_name, u.username as student_username,
             e.title as exam_title,
             sb.id as backup_id, sb.created_at as backup_created
      FROM attempts a
      JOIN users u ON u.id = a.student_id
      JOIN exams e ON e.id = a.exam_id
      LEFT JOIN submission_backups sb ON sb.attempt_id = a.id AND sb.status = 'ACTIVE'
      WHERE a.submission_status = 'FAILED'
      ORDER BY a.started_at DESC
      LIMIT 10
    `);
    
    if (failed.length === 0) {
      console.log('✅ No failed submissions found (good!)');
    } else {
      console.log(`⚠️  Found ${failed.length} failed submission(s):\n`);
      
      failed.forEach((attempt, index) => {
        console.log(`${index + 1}. Attempt ID: ${attempt.id}`);
        console.log(`   Student: ${attempt.student_name} (@${attempt.student_username})`);
        console.log(`   Exam: ${attempt.exam_title}`);
        console.log(`   Started: ${attempt.started_at}`);
        console.log(`   Backup: ${attempt.backup_id ? '✅ Available' : '❌ Not found'}`);
        console.log('');
      });
      
      console.log('💡 Admin can recover these at: /admin/failed-submissions');
    }
    
  } catch (error) {
    console.error('❌ Failed submissions test failed:', error.message);
  }
}

async function testSubmissionUtils() {
  console.log('\n🔍 Testing Submission Utils...\n');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const utilsPath = path.join(__dirname, 'src', 'utils', 'submission-utils.js');
    
    if (!fs.existsSync(utilsPath)) {
      console.log('❌ File src/utils/submission-utils.js not found');
      return;
    }
    
    console.log('✅ File src/utils/submission-utils.js exists');
    
    const utils = require('./src/utils/submission-utils');
    
    if (typeof utils.createSubmissionBackup === 'function') {
      console.log('✅ Function createSubmissionBackup exists');
    } else {
      console.log('❌ Function createSubmissionBackup not found');
    }
    
    if (typeof utils.finalizeAttemptWithBackup === 'function') {
      console.log('✅ Function finalizeAttemptWithBackup exists');
    } else {
      console.log('❌ Function finalizeAttemptWithBackup not found');
    }
    
  } catch (error) {
    console.error('❌ Submission utils test failed:', error.message);
  }
}

async function testAdminRecoveryRoute() {
  console.log('\n🔍 Testing Admin Recovery Routes...\n');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const adminRoutesPath = path.join(__dirname, 'src', 'routes', 'admin.js');
    const adminRoutesContent = fs.readFileSync(adminRoutesPath, 'utf8');
    
    const routes = [
      { path: '/failed-submissions', method: 'GET', description: 'View failed submissions' },
      { path: '/failed-submissions/:id/recover', method: 'POST', description: 'Recover from backup' },
      { path: '/failed-submissions/:id/retry', method: 'POST', description: 'Retry submission' }
    ];
    
    console.log('📋 Checking admin recovery routes:\n');
    
    routes.forEach(route => {
      const pattern = new RegExp(`router\\.${route.method.toLowerCase()}\\(['"]${route.path.replace(/:\w+/g, ':\\w+')}['"]`);
      if (pattern.test(adminRoutesContent)) {
        console.log(`✅ ${route.method} ${route.path} - ${route.description}`);
      } else {
        console.log(`❌ ${route.method} ${route.path} - Not found`);
      }
    });
    
    // Check view file
    const viewPath = path.join(__dirname, 'src', 'views', 'admin', 'failed_submissions.ejs');
    if (fs.existsSync(viewPath)) {
      console.log('\n✅ View file admin/failed_submissions.ejs exists');
    } else {
      console.log('\n❌ View file admin/failed_submissions.ejs not found');
    }
    
  } catch (error) {
    console.error('❌ Admin recovery route test failed:', error.message);
  }
}

async function testClientSideBackup() {
  console.log('\n🔍 Testing Client-Side Backup Implementation...\n');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    const attemptTakePath = path.join(__dirname, 'src', 'views', 'student', 'attempt_take.ejs');
    const content = fs.readFileSync(attemptTakePath, 'utf8');
    
    const features = [
      { name: 'LocalStorage backup key', pattern: /BACKUP_KEY.*exam_backup/ },
      { name: 'saveBackupToLocalStorage function', pattern: /function saveBackupToLocalStorage/ },
      { name: 'loadBackupFromLocalStorage function', pattern: /function loadBackupFromLocalStorage/ },
      { name: 'clearBackup function', pattern: /function clearBackup/ },
      { name: 'submitWithRetry function', pattern: /async function submitWithRetry/ },
      { name: 'Exponential backoff', pattern: /Math\.pow\(2,.*\).*1000/ },
      { name: 'Retry count header', pattern: /X-Retry-Count/ },
      { name: 'Client backup in request', pattern: /backup_data.*loadBackupFromLocalStorage/ }
    ];
    
    console.log('📋 Checking client-side features:\n');
    
    features.forEach(feature => {
      if (feature.pattern.test(content)) {
        console.log(`✅ ${feature.name}`);
      } else {
        console.log(`❌ ${feature.name} - Not found`);
      }
    });
    
  } catch (error) {
    console.error('❌ Client-side backup test failed:', error.message);
  }
}

async function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 PEAK LOAD SOLUTION SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  try {
    // Connection pool
    const poolOptions = pool.pool.config;
    console.log('1️⃣  Database Connection Pool:');
    console.log(`   Connection Limit: ${poolOptions.connectionLimit}`);
    console.log(`   Status: ${poolOptions.connectionLimit >= 50 ? '✅ Optimized' : '⚠️  Needs optimization'}\n`);
    
    // Backup table
    const [tables] = await pool.query(`SHOW TABLES LIKE 'submission_backups'`);
    console.log('2️⃣  Server-Side Backup:');
    console.log(`   Status: ${tables.length > 0 ? '✅ Enabled' : '❌ Not enabled'}\n`);
    
    // Submission status
    const [columns] = await pool.query(`SHOW COLUMNS FROM attempts LIKE 'submission_status'`);
    console.log('3️⃣  Submission Status Tracking:');
    console.log(`   Status: ${columns.length > 0 ? '✅ Enabled' : '❌ Not enabled'}\n`);
    
    // Failed submissions
    const [[failedCount]] = await pool.query(`
      SELECT COUNT(*) as total FROM attempts WHERE submission_status = 'FAILED'
    `);
    console.log('4️⃣  Failed Submissions:');
    console.log(`   Count: ${failedCount.total}`);
    console.log(`   Status: ${failedCount.total === 0 ? '✅ None' : '⚠️  Needs recovery'}\n`);
    
    // Client-side backup
    const fs = require('fs');
    const path = require('path');
    const attemptTakePath = path.join(__dirname, 'src', 'views', 'student', 'attempt_take.ejs');
    const hasClientBackup = fs.existsSync(attemptTakePath) && 
                           fs.readFileSync(attemptTakePath, 'utf8').includes('saveBackupToLocalStorage');
    console.log('5️⃣  Client-Side Backup:');
    console.log(`   Status: ${hasClientBackup ? '✅ Implemented' : '❌ Not implemented'}\n`);
    
    console.log('='.repeat(60));
    console.log('✅ All systems checked!');
    console.log('📖 Read PEAK_LOAD_SUBMISSION_SOLUTION.md for details');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Summary generation failed:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting Peak Load Solution Tests...');
  console.log('='.repeat(60));
  
  await testConnectionPool();
  await testSubmissionBackupTable();
  await testSubmissionStatusColumn();
  await testFailedSubmissions();
  await testSubmissionUtils();
  await testAdminRecoveryRoute();
  await testClientSideBackup();
  await printSummary();
  
  await pool.end();
  console.log('✅ All tests completed!\n');
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
