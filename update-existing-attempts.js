/**
 * Update existing attempts with proper submission_status
 */

require('dotenv').config();
const pool = require('./src/db/pool');

async function updateExistingAttempts() {
  console.log('🔄 Updating existing attempts...\n');
  
  try {
    // Update SUBMITTED attempts
    const [result1] = await pool.query(`
      UPDATE attempts 
      SET submission_status = 'SUBMITTED' 
      WHERE status = 'SUBMITTED' AND submission_status = 'PENDING'
    `);
    console.log(`✅ Updated ${result1.affectedRows} SUBMITTED attempts`);
    
    // Update IN_PROGRESS attempts
    const [result2] = await pool.query(`
      UPDATE attempts 
      SET submission_status = 'PENDING' 
      WHERE status = 'IN_PROGRESS' AND submission_status != 'PENDING'
    `);
    console.log(`✅ Updated ${result2.affectedRows} IN_PROGRESS attempts`);
    
    // Check for any attempts that might have failed
    const [[count]] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM attempts 
      WHERE status = 'IN_PROGRESS' 
        AND started_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
        AND submission_status = 'PENDING'
    `);
    
    if (count.total > 0) {
      console.log(`\n⚠️  Found ${count.total} old IN_PROGRESS attempts (>24h)`);
      console.log('   These might be abandoned attempts. Check manually if needed.');
    }
    
    // Show summary
    const [summary] = await pool.query(`
      SELECT 
        submission_status,
        COUNT(*) as count
      FROM attempts
      GROUP BY submission_status
      ORDER BY count DESC
    `);
    
    console.log('\n📊 Current submission_status distribution:');
    summary.forEach(row => {
      const emoji = row.submission_status === 'SUBMITTED' ? '✅' : 
                   row.submission_status === 'FAILED' ? '❌' : 
                   row.submission_status === 'SUBMITTING' ? '⏳' : '⏸️';
      console.log(`   ${emoji} ${row.submission_status}: ${row.count}`);
    });
    
    console.log('\n✅ Update completed!\n');
    
  } catch (error) {
    console.error('❌ Update failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateExistingAttempts();
