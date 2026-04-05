/**
 * Cleanup Duplicate Backups
 */

require('dotenv').config();
const pool = require('./src/db/pool');

async function cleanupDuplicates() {
  console.log('🧹 Cleaning up duplicate backups...\n');
  
  try {
    // Find duplicates
    console.log('Step 1: Finding duplicates...');
    const [duplicates] = await pool.query(`
      SELECT attempt_id, COUNT(*) as count
      FROM submission_backups
      GROUP BY attempt_id
      HAVING count > 1
      ORDER BY count DESC
    `);
    
    if (duplicates.length === 0) {
      console.log('  ✅ No duplicates found!\n');
      return;
    }
    
    console.log(`  Found ${duplicates.length} attempts with duplicates:\n`);
    duplicates.forEach(dup => {
      console.log(`  - Attempt ${dup.attempt_id}: ${dup.count} backups`);
    });
    
    // Clean up duplicates (keep only the latest)
    console.log('\nStep 2: Cleaning up...');
    let totalDeleted = 0;
    
    for (const dup of duplicates) {
      const [result] = await pool.query(`
        DELETE FROM submission_backups
        WHERE attempt_id = :aid
          AND id NOT IN (
            SELECT * FROM (
              SELECT MAX(id) FROM submission_backups WHERE attempt_id = :aid
            ) as temp
          )
      `, { aid: dup.attempt_id });
      
      totalDeleted += result.affectedRows;
      console.log(`  ✅ Cleaned attempt ${dup.attempt_id}: deleted ${result.affectedRows} duplicate(s)`);
    }
    
    console.log(`\n✅ Cleanup complete! Deleted ${totalDeleted} duplicate backups\n`);
    
    // Verify
    console.log('Step 3: Verifying...');
    const [remaining] = await pool.query(`
      SELECT attempt_id, COUNT(*) as count
      FROM submission_backups
      GROUP BY attempt_id
      HAVING count > 1
    `);
    
    if (remaining.length === 0) {
      console.log('  ✅ All duplicates removed!\n');
      console.log('💡 Now run: node run-fix-lock-timeout.js');
    } else {
      console.log(`  ⚠️  Still ${remaining.length} duplicates remaining`);
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

cleanupDuplicates();
