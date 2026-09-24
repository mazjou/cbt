'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve('/cbt/.env') });
const pool = require('./pool');

// Pool LMS bisa return [rows, fields] atau {rows}
const q = async (sql, p = []) => {
  const r = await pool.query(sql, p);
  return r.rows || (Array.isArray(r) ? r[0] : []);
};

async function main() {
  const tables = ['classes', 'subjects', 'sdms_kelas', 'sdms_mapel'];
  for (const tbl of tables) {
    try {
      const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='${tbl}' ORDER BY ordinal_position`);
      const cnt  = await q(`SELECT COUNT(*) as c FROM ${tbl}`);
      console.log(`[${tbl}] count=${cnt[0]?.c} | cols: ${cols.map(x=>x.column_name).join(', ')}`);
    } catch (e) {
      console.log(`[${tbl}] ERROR: ${e.message}`);
    }
  }
  // Sample kelas dari SDMS
  const k = await q('SELECT sdms_id, nama, tingkat, jurusan_kode FROM sdms_kelas LIMIT 5');
  console.log('\nSample sdms_kelas:');
  k.forEach(r => console.log(' ', JSON.stringify(r)));

  // Sample classes LMS
  const c = await q('SELECT * FROM classes LIMIT 3');
  console.log('\nSample classes LMS:');
  c.forEach(r => console.log(' ', JSON.stringify(r)));

  // Sample mapel SDMS
  const m = await q('SELECT sdms_id, kode, nama FROM sdms_mapel LIMIT 3');
  console.log('\nSample sdms_mapel:');
  m.forEach(r => console.log(' ', JSON.stringify(r)));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
