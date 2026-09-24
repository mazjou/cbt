'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve('/cbt/.env') });
const pool = require('./pool');
const q = async (sql, p = []) => {
  const r = await pool.query(sql, p);
  return r.rows || (Array.isArray(r) ? r[0] : []);
};
async function main() {
  // Cek kolom sdms_siswa
  const cols = await q("SELECT column_name FROM information_schema.columns WHERE table_name='sdms_siswa' ORDER BY ordinal_position");
  console.log('sdms_siswa cols:', cols.map(x=>x.column_name).join(', '));

  // Sample data siswa
  const rows = await q('SELECT sdms_id, nama, nisn, nis, jurusan_kode FROM sdms_siswa LIMIT 3');
  console.log('\nSample sdms_siswa:');
  rows.forEach(r => console.log(' ', JSON.stringify(r)));

  // Cek apakah sdms_siswa punya kolom kelas
  const hasKelas = cols.find(c => c.column_name === 'kelas_id' || c.column_name === 'kelas_nama' || c.column_name === 'kelas');
  console.log('\nKolom kelas di sdms_siswa:', hasKelas ? hasKelas.column_name : 'TIDAK ADA');

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
