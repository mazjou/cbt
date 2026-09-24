const path = require('path');
require('dotenv').config({ path: path.resolve('/cbt/.env') });
const pool = require('./pool');
async function main() {
  const r1 = await pool.query('SELECT COUNT(*) FROM sdms_siswa');
  const rows1 = r1.rows || r1[0] || r1;
  console.log('sdms_siswa:', rows1[0]?.count ?? rows1[0]);
  const r2 = await pool.query('SELECT COUNT(*) FROM users');
  const rows2 = r2.rows || r2[0] || r2;
  console.log('users:', rows2[0]?.count ?? rows2[0]);
  const r3 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
  const rows3 = r3.rows || r3[0] || r3;
  console.log('users columns:', rows3.map(r=>r.column_name).join(', '));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
