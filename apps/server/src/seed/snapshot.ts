/**
 * Seeded-state snapshots of the planted fixtures. When a scenario starts, its
 * fixtures are restored: core rows put back as seeded, the layer's cases,
 * runs, approvals, tasks, trail, messages and outcomes for those fixtures
 * removed, and WF-01's authority put back to its seeded rung. So every
 * scenario runs the same way every time.
 */
import type { PoolClient } from 'pg';
import { insertMany } from '../db.js';
import { DEFAULT_AUTHORITY } from '../engine/authority.js';

const TABLES_BY_SUB = ['invoices', 'charges', 'usage', 'roaming_events', 'complaints', 'cvm_signals', 'billing_queue'] as const;
const DERIVED_BY_SUB = ['credits', 'restrictions', 'offer_registrations'] as const;

export const FIXTURES = ['dispute-small', 'dispute-above-limit', 'dispute-wrong', 'dispute-tiny', 'dispute-tiny-2', 'roaming-simbox', 'retention-no-consent', 'retention-with-consent', 'complaint-speed', 'complaint-activation', 'enterprise-sdwan'];

async function subscriberOf(c: PoolClient, edge: string): Promise<string | null> { return (await c.query(`SELECT id FROM core.subscribers WHERE edge_key=$1`, [edge])).rows[0]?.id ?? null; }

export async function snapshotFixtures(c: PoolClient) {
  for (const edge of FIXTURES) {
    const data: Record<string, any> = {};
    const subId = await subscriberOf(c, edge);
    if (subId) {
      data.subscriber = (await c.query(`SELECT * FROM core.subscribers WHERE id=$1`, [subId])).rows[0];
      for (const t of TABLES_BY_SUB) data[t] = (await c.query(`SELECT * FROM core.${t} WHERE subscriber_id=$1`, [subId])).rows;
    }
    if (edge === 'enterprise-sdwan') {
      data.account = (await c.query(`SELECT * FROM core.accounts WHERE edge_key=$1`, [edge])).rows[0];
      data.orders = (await c.query(`SELECT * FROM core.orders WHERE account_id=$1`, [data.account.id])).rows;
    }
    await c.query(`INSERT INTO layer.snapshots (edge_key, data) VALUES ($1,$2) ON CONFLICT (edge_key) DO UPDATE SET data=EXCLUDED.data`, [edge, JSON.stringify(data)]);
  }
}

export async function restoreFixture(c: PoolClient, edge: string): Promise<boolean> {
  const snap = (await c.query(`SELECT data FROM layer.snapshots WHERE edge_key=$1`, [edge])).rows[0]?.data;
  if (!snap) return false;
  const subId: string | null = snap.subscriber?.id ?? null;
  // The layer: everything about this fixture's cases.
  const caseIds = (await c.query(`SELECT id, ref FROM layer.cases WHERE edge_key=$1`, [edge])).rows;
  if (caseIds.length) {
    const ids = caseIds.map((k: any) => k.id); const refs = caseIds.map((k: any) => k.ref);
    const runIds = (await c.query(`SELECT id FROM layer.runs WHERE case_id = ANY($1)`, [ids])).rows.map((x: any) => x.id);
    if (runIds.length) { await c.query(`DELETE FROM layer.approvals WHERE run_id = ANY($1)`, [runIds]); await c.query(`DELETE FROM layer.run_steps WHERE run_id = ANY($1)`, [runIds]); }
    await c.query(`DELETE FROM layer.tasks WHERE case_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM layer.trail WHERE case_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM layer.activity WHERE case_ref = ANY($1)`, [refs]);
    await c.query(`DELETE FROM layer.messages WHERE case_ref = ANY($1)`, [refs]);
    await c.query(`DELETE FROM layer.outcomes WHERE case_ref = ANY($1)`, [refs]);
    await c.query(`DELETE FROM layer.case_events WHERE case_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM layer.runs WHERE case_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM layer.cases WHERE id = ANY($1)`, [ids]);
  }
  // The core: put the fixture's rows back as seeded.
  if (subId) {
    for (const t of DERIVED_BY_SUB) await c.query(`DELETE FROM core.${t} WHERE subscriber_id=$1`, [subId]);
    await c.query(`DELETE FROM core.settlement_queries WHERE case_ref IN (SELECT ref FROM layer.cases WHERE edge_key=$1) OR case_ref LIKE 'DEMO-C-%' AND partner_id IN (SELECT partner_id FROM core.roaming_events WHERE subscriber_id=$2) AND raised_at > now() - interval '1 day'`, [edge, subId]);
    await c.query(`DELETE FROM layer.messages WHERE subscriber_id=$1`, [subId]);
    await c.query(`DELETE FROM core.charges WHERE subscriber_id=$1`, [subId]);
    for (const t of TABLES_BY_SUB) if (t !== 'charges') await c.query(`DELETE FROM core.${t} WHERE subscriber_id=$1`, [subId]);
    await c.query(`DELETE FROM core.subscribers WHERE id=$1`, [subId]);
    await insertMany(c, 'core.subscribers', [snap.subscriber]);
    for (const t of ['invoices', 'charges', 'usage', 'roaming_events', 'complaints', 'cvm_signals', 'billing_queue'] as const) if (snap[t]?.length) await insertMany(c, `core.${t}`, snap[t].map(({ id: _id, ...row }: any) => (t === 'billing_queue' || t === 'cvm_signals' ? row : { id: _id, ...row })));
  }
  if (snap.account) {
    await c.query(`DELETE FROM core.orders WHERE account_id=$1`, [snap.account.id]);
    await insertMany(c, 'core.orders', snap.orders);
    await c.query(`DELETE FROM layer.messages WHERE account_id=$1`, [snap.account.id]);
  }
  return true;
}

/** WF-01 back to its seeded authority (A3) and the scenario's extra outcomes removed. */
export async function restoreAuthority(c: PoolClient, scenario: string) {
  const d = DEFAULT_AUTHORITY['WF-01']!;
  await c.query(`UPDATE layer.authority SET rung=$1, accuracy=0.96, decisions=50, changed_at=$2, changed_by='billing_manager', note=$3 WHERE workflow_id='WF-01'`, [d.rung, new Date('2026-09-12T06:00:00Z'), d.note]);
  await c.query(`DELETE FROM layer.outcomes WHERE note LIKE $1`, [`[${scenario}]%`]);
  await c.query(`DELETE FROM layer.authority_history WHERE workflow_id='WF-01' AND at > $1`, [new Date('2026-09-13T00:00:00Z')]);
  await c.query(`DELETE FROM layer.tasks WHERE kind='AUTHORITY_CHANGED'`);
  await c.query(`DELETE FROM layer.trail WHERE act IN ('AUTHORITY_DOWN','AUTHORITY_UP') AND case_id IS NULL`);
}
