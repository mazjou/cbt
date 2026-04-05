require('dotenv').config();
const pool = require('../src/db/pool');

async function checkTables() {
  try {
    console.log('Checking live_classes table...\n');
    
    const [tables] = await pool.query("SHOW TABLES LIKE 'live_classes'");
    
    if (tables.length === 0) {
      console.log('❌ Table live_classes NOT found!');
      console.log('Run: node -e "require(\'dotenv\').config(); const pool = require(\'./src/db/pool\'); const fs = require(\'fs\'); (async () => { const sql = fs.readFileSync(\'sql/add_live_classes.sql\', \'utf8\'); const stmts = sql.split(\';\').filter(s => s.trim() && !s.trim().startsWith(\'--\')); for (const stmt of stmts) { await pool.query(stmt); } console.log(\'Tables created\'); process.exit(0); })()"');
      process.exit(1);
    }
    
    console.log('✅ Table live_classes exists\n');
    
    const [columns] = await pool.query('DESCRIBE live_classes');
    console.log('Columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
    console.log('\n✅ All checks passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTables();
