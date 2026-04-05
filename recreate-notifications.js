const mysql = require('mysql2/promise');
require('dotenv').config();

async function recreateTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cbt_kras'
  });

  try {
    console.log('🔄 Dropping old tables...');
    
    await connection.query('DROP TABLE IF EXISTS notification_reads');
    await connection.query('DROP TABLE IF EXISTS notifications');
    
    console.log('✅ Old tables dropped');
    console.log('🔄 Creating new tables...');
    
    await connection.query(`
      CREATE TABLE notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type ENUM('info', 'warning', 'success', 'error') DEFAULT 'info',
        sender_id INT NOT NULL,
        sender_role ENUM('admin', 'teacher') NOT NULL,
        target_type ENUM('all', 'class', 'student') DEFAULT 'all',
        target_id INT NULL COMMENT 'class_id atau student_id jika target_type bukan all',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_active (is_active),
        INDEX idx_target (target_type, target_id),
        INDEX idx_expires (expires_at),
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Table notifications created');
    
    await connection.query(`
      CREATE TABLE notification_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_id INT NOT NULL,
        student_id INT NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_read (notification_id, student_id),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Table notification_reads created');
    console.log('🎉 All tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

recreateTable();
