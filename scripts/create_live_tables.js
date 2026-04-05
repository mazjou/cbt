require('dotenv').config();
const pool = require('../src/db/pool');
const fs = require('fs');

async function createTables() {
  try {
    console.log('🚀 Creating live class tables...\n');
    
    const sql = fs.readFileSync('sql/add_live_classes.sql', 'utf8');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50) + '...');
      await pool.query(statement);
    }
    
    console.log('\n✅ All tables created successfully!\n');
    
    // Verify
    const tables = [
      'live_classes',
      'live_class_participants',
      'chat_messages',
      'forum_discussions',
      'forum_replies',
      'live_quizzes',
      'live_quiz_answers'
    ];
    
    console.log('Verifying tables:');
    for (const table of tables) {
      const [result] = await pool.query(`SHOW TABLES LIKE '${table}'`);
      if (result.length > 0) {
        console.log(`  ✅ ${table}`);
      } else {
        console.log(`  ❌ ${table} NOT FOUND`);
      }
    }
    
    console.log('\n🎉 Setup complete! You can now create live classes.');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

createTables();
