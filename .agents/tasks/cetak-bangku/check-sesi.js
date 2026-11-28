const path = require('path');
// Try loading .env if present
try { require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); } catch(e) {}

const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'lmsuser',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cbt_smk',
});

pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='sesi'"
).then(r => {
  const exists = r.rows.length > 0;
  console.log(JSON.stringify({ exists, rows: r.rows }));
  process.exit(0);
}).catch(e => {
  console.error('DB error:', e.code, e.message, e);
  process.exit(1);
});
