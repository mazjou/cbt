require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration: add schedule columns to exam_classes...');
    await client.query('ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS start_at TIMESTAMP NULL');
    console.log('✓ start_at column added');
    await client.query('ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS end_at TIMESTAMP NULL');
    console.log('✓ end_at column added');
    await client.query('ALTER TABLE exam_classes ADD COLUMN IF NOT EXISTS duration_minutes INT NULL');
    console.log('✓ duration_minutes column added');
    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
