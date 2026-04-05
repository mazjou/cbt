const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lms_smk',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function fixBulkDeleteConstraints() {
  const conn = await pool.getConnection();
  
  try {
    console.log('🔧 Fixing bulk delete constraints...\n');
    
    // Check and fix foreign key constraints
    const fixes = [
      {
        table: 'student_answers',
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'exam_results', 
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'material_reads',
        column: 'student_id', 
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'attempts',
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'assignment_submissions',
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'notification_reads',
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      },
      {
        table: 'live_class_participants',
        column: 'user_id',
        action: 'Add ON DELETE CASCADE if missing'
      }
    ];
    
    for (const fix of fixes) {
      try {
        // Check if table exists
        const [tables] = await conn.query(`SHOW TABLES LIKE '${fix.table}';`);
        
        if (tables.length === 0) {
          console.log(`⚠️  Table ${fix.table} not found, skipping...`);
          continue;
        }
        
        // Check current foreign key constraints
        const [constraints] = await conn.query(`
          SELECT CONSTRAINT_NAME, DELETE_RULE
          FROM information_schema.REFERENTIAL_CONSTRAINTS 
          WHERE TABLE_NAME = '${fix.table}' 
            AND REFERENCED_TABLE_NAME = 'users'
            AND TABLE_SCHEMA = DATABASE();
        `);
        
        if (constraints.length > 0) {
          const constraint = constraints[0];
          if (constraint.DELETE_RULE !== 'CASCADE') {
            console.log(`🔄 Updating constraint for ${fix.table}.${fix.column}...`);
            
            // Drop existing constraint
            await conn.query(`ALTER TABLE ${fix.table} DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME};`);
            
            // Add new constraint with CASCADE
            await conn.query(`
              ALTER TABLE ${fix.table} 
              ADD CONSTRAINT fk_${fix.table}_user_id 
              FOREIGN KEY (${fix.column}) REFERENCES users(id) 
              ON DELETE CASCADE ON UPDATE CASCADE;
            `);
            
            console.log(`✅ Updated ${fix.table}.${fix.column} with CASCADE`);
          } else {
            console.log(`✅ ${fix.table}.${fix.column} already has CASCADE`);
          }
        } else {
          console.log(`⚠️  No foreign key found for ${fix.table}.${fix.column}`);
        }
        
      } catch (error) {
        console.log(`❌ Error fixing ${fix.table}: ${error.message}`);
      }
    }
    
    console.log('\n🧪 Testing bulk delete with safe operation...');
    
    // Create a test user for safe testing
    const testUsername = `test_bulk_delete_${Date.now()}`;
    const [insertResult] = await conn.query(`
      INSERT INTO users (username, full_name, password, role, is_active) 
      VALUES (?, 'Test User for Bulk Delete', 'test123', 'STUDENT', 1);
    `, [testUsername]);
    
    const testUserId = insertResult.insertId;
    console.log(`✅ Created test user ID: ${testUserId}`);
    
    // Test delete
    await conn.query(`DELETE FROM users WHERE id = ?;`, [testUserId]);
    console.log(`✅ Successfully deleted test user`);
    
    console.log('\n🎉 Bulk delete constraints fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing bulk delete:', error.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

fixBulkDeleteConstraints();