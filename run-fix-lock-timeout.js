/**
 * Fix Lock Timeout Issues
 * - Add unique index to submission_backups
 * - Optimize table
 * - Test retry logic
 */

require('dotenv').config();
const pool = require('./src/db/pool');

async function fixLockTimeout() {
  console.log('🔧 Fixing Lock Timeout Issues...\n');
  
  try {
    // Step 1: Check if unique index exists
    console.log('Step 1: Checking unique index...');
    const [indexes] = await pool.query(`
      SELECT COUNT(*) as index_exists 
      FROM information_schema.statistics 
      WHERE table_schema = DATABASE() 
        AND table_name = 'submission_backups' 
        AND index_name = 'idx_attempt_unique'
    `);
    
    if (indexes[0].index_exists > 0) {
      console.log('  ⚠️  Unique index already exists');
    } else {
      console.log('  ℹ️  Adding unique index...');
      await pool.query(`
        ALTER TABLE submission_backups 
        ADD UNIQUE INDEX idx_attempt_unique (attempt_id)
      `);
      console.log('  ✅ Unique index added');
    }
    
    // Step 2: Optimize table
    console.log('\nStep 2: Optimizing table...');
    await pool.query('OPTIMIZE TABLE submission_backups');
    console.log('  ✅ Table optimized');
    
    // Step 3: Show current indexes
    console.log('\nStep 3: Current indexes:');
    const [currentIndexes] = await pool.query('SHOW INDEX FROM submission_backups');
    currentIndexes.forEach(idx => {
      console.log(`  - ${idx.Key_name}: ${idx.Column_name} (${idx.Non_unique ? 'non-unique' : 'unique'})`);
    });
    
    // Step 4: Check for duplicate backups
    console.log('\nStep 4: Checking for duplicate backups...');
    const [duplicates] = await pool.query(`
      SELECT attempt_id, COUNT(*) as count
      FROM submission_backups
      GROUP BY attempt_id
      HAVING count > 1
    `);
    
    if (duplicates.length > 0) {
      console.log(`  ⚠️  Found ${duplicates.length} attempts with duplicate backups`);
      console.log('  ℹ️  Cleaning up duplicates...');
      
      for (const dup of duplicates) {
        // Keep only the latest backup
        await pool.query(`
          DELETE FROM submission_backups
          WHERE attempt_id = :aid
            AND id NOT IN (
              SELECT * FROM (
                SELECT MAX(id) FROM submission_backups WHERE attempt_id = :aid
              ) as temp
            )
        `, { aid: dup.attempt_id });
      }
      
      console.log('  ✅ Duplicates cleaned up');
    } else {
      console.log('  ✅ No duplicate backups found');
    }
    
    // Step 5: Test retry logic
    console.log('\nStep 5: Testing retry logic...');
    const { retryOperation } = require('./src/utils/submission-utils');
    
    let attemptCount = 0;
    const testOperation = async () => {
      attemptCount++;
      if (attemptCount < 2) {
        // Simulate lock timeout on first attempt
        const error = new Error('Lock wait timeout exceeded');
        error.code = 'ER_LOCK_WAIT_TIMEOUT';
        throw error;
      }
      return 'success';
    };
    
    const result = await retryOperation(testOperation, 3, 100);
    console.log(`  ✅ Retry logic works (attempts: ${attemptCount}, result: ${result})`);
    
    // Step 6: Show statistics
    console.log('\nStep 6: Statistics:');
    const [[stats]] = await pool.query(`
      SELECT 
        COUNT(*) as total_backups,
        COUNT(DISTINCT attempt_id) as unique_attempts,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_backups,
        SUM(CASE WHEN status = 'RESTORED' THEN 1 ELSE 0 END) as restored_backups
      FROM submission_backups
    `);
    
    console.log(`  Total backups: ${stats.total_backups}`);
    console.log(`  Unique attempts: ${stats.unique_attempts}`);
    console.log(`  Active backups: ${stats.active_backups}`);
    console.log(`  Restored backups: ${stats.restored_backups}`);
    
    console.log('\n✅ All fixes applied successfully!\n');
    console.log('📝 Changes made:');
    console.log('  1. Added unique index on attempt_id');
    console.log('  2. Optimized submission_backups table');
    console.log('  3. Cleaned up duplicate backups');
    console.log('  4. Verified retry logic');
    console.log('\n💡 Benefits:');
    console.log('  - Faster queries on submission_backups');
    console.log('  - No more duplicate backups');
    console.log('  - Auto-retry on lock timeout (3 attempts)');
    console.log('  - Better concurrency handling');
    console.log('\n🚀 Restart server to apply changes:');
    console.log('  pm2 restart cbt-smk');
    console.log('  or: npm start\n');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('\n⚠️  Duplicate entry error. This means:');
      console.log('  - There are duplicate backups for same attempt_id');
      console.log('  - Run this script again to clean them up');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixLockTimeout();
