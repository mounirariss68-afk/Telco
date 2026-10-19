/**
 * PostgreSQL access. On Replit the database is provisioned from the Database
 * tool and its URL arrives as DATABASE_URL; locally the same variable is used.
 * Two schemas: `core` (the simulated operator systems) and `layer` (Dhow). One operator, so
 * no schema routing (unlike Tasama HR's multi-client layout).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\nDATABASE_URL is not set.\nOn Replit: open the Database tool, create a PostgreSQL database, then press Run again.\nLocally: export DATABASE_URL=postgres://user:pass@localhost:5432/dhow\n');
  process.exit(1);
}
const needsSsl = /neon\.tech|replit|sslmode=require/.test(url);
export const pool = new pg.Pool({ connectionString: url, ssl: needsSsl ? { rejectUnauthorized: false } : undefined, max: 10 });

// Dates come back as 'YYYY-MM-DD' strings, numerics as JS numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export type Q = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> { return (await pool.query(sql, params)).rows as T[]; }
export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> { return (await pool.query(sql, params)).rows[0] as T | undefined; }

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

/** Bulk insert helper: rows of objects with identical keys. */
export async function insertMany(c: Q, table: string, rows: Record<string, unknown>[], returning = '') {
  if (!rows.length) return [] as any[];
  const cols = Object.keys(rows[0]);
  const out: any[] = [];
  const chunk = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${cols.map((k) => { const v = r[k]; const isJson = v !== null && typeof v === 'object' && !(v instanceof Date) && (!Array.isArray(v) || (v.length > 0 && typeof v[0] === 'object')); params.push(isJson ? JSON.stringify(v) : v); return `$${params.length}`; }).join(',')})`).join(',');
    const r = await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values} ${returning ? `RETURNING ${returning}` : ''}`, params);
    out.push(...r.rows);
  }
  return out;
}

export async function meta<T = any>(c: Q, key: string): Promise<T | undefined> { return (await c.query(`SELECT value FROM layer.meta WHERE key=$1`, [key])).rows[0]?.value as T | undefined; }
export async function setMeta(c: Q, key: string, value: unknown) { await c.query(`INSERT INTO layer.meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [key, JSON.stringify(value)]); }
