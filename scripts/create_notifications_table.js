require('dotenv').config();
const pool = require('../src/db/pool');

async function createTable() {
  try {
    console.log('🚀 Creating notifications table...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('MATERIAL','EXAM','ANNOUNCEMENT') NOT NULL,
        reference_id INT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notification_user (user_id),
        INDEX idx_notification_read (user_id, is_read),
        CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB;
    `;
    
    await pool.query(sql);
    
    console.log('✅ Table "notifications" created successfully!');
    
    // Verify
    const [result] = await pool.query("SHOW TABLES LIKE 'notifications'");
    if (result.length > 0) {
      console.log('✅ Verification: Table exists in database');
      
      // Show structure
      const [columns] = await pool.query("DESCRIBE notifications");
      console.log('\n📋 Table structure:');
      columns.forEach(col => {
        console.log(`   - ${col.Field} (${col.Type})`);
      });
    } else {
      console.log('❌ Verification failed: Table not found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTable();
