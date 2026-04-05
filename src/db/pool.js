const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = require('pg');

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`⚠️ Environment variable ${key} belum diisi`);
  }
}

const pgPool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: Number(process.env.DB_CONNECTION_LIMIT || 30),
  min: 5,                          // Selalu siapkan 5 koneksi
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: 5000,   // Gagal cepat jika DB penuh
  statement_timeout: 30000,        // Query max 30 detik
  query_timeout: 30000,
});

pgPool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// ─── Konversi MySQL → PostgreSQL ────────────────────────────────────────────

function convertMysqlToPostgres(sql) {
  // GROUP_CONCAT(x SEPARATOR 'sep') → STRING_AGG(x, 'sep')
  sql = sql.replace(/GROUP_CONCAT\s*\(\s*(.*?)\s+SEPARATOR\s+(['"])(.*?)\2\s*\)/gi, (m, expr, q, sep) => {
    const om = expr.match(/^(.*?)\s+ORDER\s+BY\s+(.+)$/i);
    return om ? `STRING_AGG(${om[1]}, '${sep}' ORDER BY ${om[2]})` : `STRING_AGG(${expr}, '${sep}')`;
  });
  sql = sql.replace(/GROUP_CONCAT\s*\(\s*(.*?)\s*\)/gi, (m, expr) => {
    const om = expr.match(/^(.*?)\s+ORDER\s+BY\s+(.+)$/i);
    return om ? `STRING_AGG(${om[1]}::text, ',' ORDER BY ${om[2]})` : `STRING_AGG(${expr}::text, ',')`;
  });

  // RAND() → RANDOM()
  sql = sql.replace(/\bRAND\s*\(\s*\)/gi, 'RANDOM()');

  // IF(cond, a, b) → CASE WHEN cond THEN a ELSE b END
  sql = sql.replace(/\bIF\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/gi,
    (m, cond, a, b) => `CASE WHEN ${cond} THEN ${a} ELSE ${b} END`);

  // TIMESTAMPDIFF
  sql = sql.replace(/TIMESTAMPDIFF\s*\(\s*MINUTE\s*,\s*([^,]+),\s*([^)]+)\)/gi,
    (m, a, b) => `FLOOR(EXTRACT(EPOCH FROM (${b.trim()} - ${a.trim()}))/60)`);
  sql = sql.replace(/TIMESTAMPDIFF\s*\(\s*SECOND\s*,\s*([^,]+),\s*([^)]+)\)/gi,
    (m, a, b) => `FLOOR(EXTRACT(EPOCH FROM (${b.trim()} - ${a.trim()})))`);
  sql = sql.replace(/TIMESTAMPDIFF\s*\(\s*HOUR\s*,\s*([^,]+),\s*([^)]+)\)/gi,
    (m, a, b) => `FLOOR(EXTRACT(EPOCH FROM (${b.trim()} - ${a.trim()}))/3600)`);

  // SET SESSION innodb_lock_wait_timeout → SELECT 1
  sql = sql.replace(/SET\s+SESSION\s+innodb_lock_wait_timeout\s*=\s*\d+/gi, 'SELECT 1');

  // Boolean literal dalam SQL: col=1 → col=true, col=0 → col=false
  const boolCols = [
    'is_active','is_published','is_correct','shuffle_questions','shuffle_options',
    'show_score_to_student','show_review_to_student','allow_late_submission','is_read'
  ];
  for (const col of boolCols) {
    sql = sql.replace(new RegExp(`(\\b${col}\\s*=\\s*)1\\b`, 'gi'), '$1true');
    sql = sql.replace(new RegExp(`(\\b${col}\\s*=\\s*)0\\b`, 'gi'), '$1false');
  }

  // Konversi literal 0/1 di akhir VALUES(...,0) atau VALUES(...,1) untuk is_published
  // Pola: is_published) VALUES (..., 0) - literal terakhir sebelum )
  sql = sql.replace(
    /(is_published\)[\s\S]*?VALUES[\s\S]*?),\s*0\s*\)/gi,
    '$1, false)'
  );
  sql = sql.replace(
    /(is_published\)[\s\S]*?VALUES[\s\S]*?),\s*1\s*\)/gi,
    '$1, true)'
  );

  return sql;
}

function convertOnDuplicateKey(sql) {
  sql = sql.replace(/INSERT\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (/INSERT\s+IGNORE/i.test(sql)) {
    sql = sql.replace(/INSERT\s+IGNORE/gi, 'INSERT');
    if (!/ON\s+CONFLICT/i.test(sql)) {
      sql = sql.trimEnd().replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
    }
  }
  sql = sql.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]+?)(?:;|$)/gi, (m, updates) => {
    const converted = updates.replace(/VALUES\s*\(\s*(\w+)\s*\)/gi, 'EXCLUDED.$1').trim();
    return `ON CONFLICT DO UPDATE SET ${converted}`;
  });
  return sql;
}

// ─── Kolom boolean: konversi nilai 0/1 → false/true ─────────────────────────

const BOOL_PARAMS = new Set([
  'is_active','is_published','is_correct','shuffle_questions','shuffle_options',
  'show_score_to_student','show_review_to_student','allow_late_submission','is_read',
  'allow_late','is_published'
]);

function toBool(val) {
  if (val === true || val === false) return val;
  if (val === 1 || val === '1') return true;
  if (val === 0 || val === '0') return false;
  return val;
}

// ─── Konversi placeholder ────────────────────────────────────────────────────

function convertNamedToPositional(sql, params) {
  // Array params (positional ?): konversi ? → $1, $2, ...
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    if (Array.isArray(params) && params.length > 0) {
      let i = 0;
      const text = sql.replace(/\?/g, () => `$${++i}`);
      return { text, values: params };
    }
    return { text: sql, values: Array.isArray(params) ? params : [] };
  }

  // Named params (:name): konversi → $1, $2, ...
  const values = [];
  const paramMap = {};

  const text = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    if (!(name in paramMap)) {
      let val = params[name] !== undefined ? params[name] : null;
      // Konversi 0/1 ke boolean untuk semua param yang dikenal sebagai boolean
      if (BOOL_PARAMS.has(name)) val = toBool(val);
      values.push(val);
      paramMap[name] = values.length;
    }
    return `$${paramMap[name]}`;
  });

  return { text, values };
}

// ─── Konversi hasil pg → format mysql2 ──────────────────────────────────────

function pgResultToMysql2(result) {
  const rows = result.rows || [];
  const insertId = rows[0]?.id || null;
  rows.forEach(row => { row.insertId = insertId; });
  const resultArray = [rows, result.fields || []];
  resultArray.insertId = insertId;
  resultArray.affectedRows = result.rowCount || 0;
  Object.assign(resultArray[0], { insertId, affectedRows: result.rowCount || 0 });
  return resultArray;
}

// ─── Proses SQL sebelum eksekusi ─────────────────────────────────────────────

function processSQL(sql) {
  let s = convertMysqlToPostgres(sql);
  s = convertOnDuplicateKey(s);
  if (/^\s*INSERT\s+INTO/i.test(s) && !/RETURNING/i.test(s)) {
    s = s.trimEnd().replace(/;?\s*$/, '') + ' RETURNING id';
  }
  return s;
}

// ─── Pool wrapper kompatibel mysql2 ─────────────────────────────────────────

const pool = {
  async query(sql, params) {
    const processedSql = processSQL(sql);
    const { text, values } = convertNamedToPositional(processedSql, params);
    try {
      const result = await pgPool.query(text, values);
      return pgResultToMysql2(result);
    } catch (err) {
      console.error('Query error:', err.message);
      console.error('SQL:', text);
      console.error('Values:', values);
      throw err;
    }
  },

  async getConnection() {
    const client = await pgPool.connect();
    return {
      async query(sql, params) {
        const processedSql = processSQL(sql);
        const { text, values } = convertNamedToPositional(processedSql, params);
        try {
          const result = await client.query(text, values);
          return pgResultToMysql2(result);
        } catch (err) {
          console.error('Transaction query error:', err.message);
          console.error('SQL:', text);
          throw err;
        }
      },
      async beginTransaction() { await client.query('BEGIN'); },
      async commit()           { await client.query('COMMIT'); },
      async rollback()         { await client.query('ROLLBACK'); },
      release()                { client.release(); }
    };
  },

  async end() { await pgPool.end(); }
};

module.exports = pool;
