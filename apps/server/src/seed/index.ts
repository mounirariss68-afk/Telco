/** Build the synthetic world: schema, base data, history, authority, fixture snapshots, then one Raqib pass over the live queues. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool, tx, meta } from '../db.js';
import { setClock, persistClock, localAt } from '../clock.js';
import { seedBase, DEMO_TODAY } from './base.js';
import { seedHistory } from './history.js';
import { ensureAuthority } from '../engine/authority.js';
import { snapshotFixtures } from './snapshot.js';
import { scan } from '../agents/raqib.js';
import { resetSettingsCache } from '../settings.js';

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA = readFileSync(resolve(here, '../../../../db/schema.sql'), 'utf8');

export async function ensureSchema() { await pool.query(SCHEMA); }
export async function isSeeded(): Promise<boolean> {
  try { return !!(await meta(pool, 'seed')); } catch { return false; }
}
export async function reseed() {
  await pool.query(`DROP SCHEMA IF EXISTS layer CASCADE; DROP SCHEMA IF EXISTS core CASCADE;`);
  await ensureSchema();
  resetSettingsCache();
  setClock(localAt(DEMO_TODAY, '10:00'));
  await persistClock();
  const t0 = Date.now();
  const base = await tx(async (c) => seedBase(c));
  console.log(`[seed] base world in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${base.subs.length} subscribers, ${base.invoices.length} invoices, ${base.charges.length} charges, ${base.usage.length} usage records`);
  const h = await tx(async (c) => seedHistory(c, base));
  console.log(`[seed] ${h.cases} history cases`);
  await tx(async (c) => { await ensureAuthority(c); await snapshotFixtures(c); });
  const opened = await tx(async (c) => scan(c, { limit: 30 }));
  console.log(`[seed] Raqib opened ${opened.length} live cases from the queues`);
  return { base: base.subs.length, history: h.cases, opened: opened.length };
}
