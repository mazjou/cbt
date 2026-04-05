require('dotenv').config();
const pool = require('../src/db/pool');

async function createTables() {
  try {
    console.log('🚀 Creating live class tables...\n');
    
    // Create tables one by one
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        teacher_id INT NOT NULL,
        subject_id INT NOT NULL,
        class_id INT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NULL,
        room_id VARCHAR(100) NOT NULL UNIQUE,
        scheduled_at DATETIME NOT NULL,
        duration_minutes INT NOT NULL DEFAULT 60,
        status ENUM('SCHEDULED','LIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
        recording_url VARCHAR(500) NULL,
        max_participants INT NULL DEFAULT 100,
        started_at DATETIME NULL,
        ended_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_live_teacher (teacher_id),
        INDEX idx_live_class (class_id),
        INDEX idx_live_status (status),
        INDEX idx_live_scheduled (scheduled_at),
        CONSTRAINT fk_live_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        CONSTRAINT fk_live_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log('✅ live_classes created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_class_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        live_class_id INT NOT NULL,
        user_id INT NOT NULL,
        joined_at DATETIME NOT NULL,
        left_at DATETIME NULL,
        duration_minutes INT NULL,
        is_present TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_live_participant (live_class_id, user_id),
        INDEX idx_participant_user (user_id),
        CONSTRAINT fk_participant_live FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE,
        CONSTRAINT fk_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ live_class_participants created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_type ENUM('CLASS','MATERIAL','EXAM','LIVE_CLASS','PRIVATE') NOT NULL,
        room_id INT NOT NULL,
        sender_id INT NOT NULL,
        receiver_id INT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_chat_room (room_type, room_id),
        INDEX idx_chat_sender (sender_id),
        INDEX idx_chat_receiver (receiver_id),
        INDEX idx_chat_created (created_at),
        CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_chat_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ chat_messages created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS forum_discussions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        material_id INT NULL,
        exam_id INT NULL,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        votes INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_forum_material (material_id),
        INDEX idx_forum_exam (exam_id),
        INDEX idx_forum_user (user_id),
        INDEX idx_forum_pinned (is_pinned),
        CONSTRAINT fk_forum_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
        CONSTRAINT fk_forum_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
        CONSTRAINT fk_forum_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ forum_discussions created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS forum_replies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        discussion_id INT NOT NULL,
        user_id INT NOT NULL,
        content TEXT NOT NULL,
        is_answer TINYINT(1) NOT NULL DEFAULT 0,
        votes INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_reply_discussion (discussion_id),
        INDEX idx_reply_user (user_id),
        CONSTRAINT fk_reply_discussion FOREIGN KEY (discussion_id) REFERENCES forum_discussions(id) ON DELETE CASCADE,
        CONSTRAINT fk_reply_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ forum_replies created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_quizzes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        live_class_id INT NOT NULL,
        question TEXT NOT NULL,
        options JSON NOT NULL,
        correct_answer VARCHAR(10) NOT NULL,
        duration_seconds INT NOT NULL DEFAULT 30,
        points INT NOT NULL DEFAULT 10,
        status ENUM('PENDING','ACTIVE','ENDED') NOT NULL DEFAULT 'PENDING',
        started_at DATETIME NULL,
        ended_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_quiz_live (live_class_id),
        CONSTRAINT fk_quiz_live FOREIGN KEY (live_class_id) REFERENCES live_classes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ live_quizzes created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_quiz_answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id INT NOT NULL,
        user_id INT NOT NULL,
        answer VARCHAR(10) NOT NULL,
        is_correct TINYINT(1) NOT NULL,
        answered_at DATETIME NOT NULL,
        response_time_ms INT NOT NULL,
        points_earned INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_quiz_answer (quiz_id, user_id),
        INDEX idx_answer_user (user_id),
        CONSTRAINT fk_answer_quiz FOREIGN KEY (quiz_id) REFERENCES live_quizzes(id) ON DELETE CASCADE,
        CONSTRAINT fk_answer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ live_quiz_answers created');

    console.log('\n🎉 All tables created successfully!');
    console.log('\nYou can now:');
    console.log('1. Refresh browser');
    console.log('2. Try creating live class again');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

createTables();
