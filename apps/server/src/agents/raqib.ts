/**
 * Raqib: reads the six queues and opens one case per event. Also the entry
 * point the Director uses to open a planted fixture. Every case starts a run
 * of its workflow immediately; the run stops where a person is needed.
 */
import type { PoolClient } from 'pg';
import { DOMAIN_LABEL, type Domain } from '@dhow/domain';
import { now } from '../clock.js';
import { startRun, addActivity } from '../engine/core.js';
import { markPicked } from '../core/connector.js';

async function nextRef(c: PoolClient) {
  const r = await c.query(`SELECT COALESCE(MAX(id),0)+1 AS n FROM layer.cases`);
  return `DEMO-C-${String(r.rows[0].n).padStart(5, '0')}`;
}

export type OpenIn = { domain: Domain; workflowId: string; subjectType: 'SUBSCRIBER' | 'PARTNER' | 'ORDER'; subjectId: string; subscriberId: string | null; title: string; amount?: number | null; payload: Record<string, any>; edgeKey?: string | null; scenario?: string | null; channel?: 'SCAN' | 'SCENARIO' | 'SEED' };

export async function openCase(c: PoolClient, o: OpenIn) {
  const at = now();
  const ref = await nextRef(c);
  const k = (await c.query(
    `INSERT INTO layer.cases (ref, domain, workflow_id, subject_type, subject_id, subscriber_id, title, state, amount, opened_at, edge_key, scenario_key, payload, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'DETECTED',$8,$9,$10,$11,$12,$9) RETURNING *`,
    [ref, o.domain, o.workflowId, o.subjectType, o.subjectId, o.subscriberId, o.title, o.amount ?? null, at, o.edgeKey ?? null, o.scenario ?? null, JSON.stringify(o.payload)],
  )).rows[0];
  await addActivity(c, { trigger: `${DOMAIN_LABEL[o.domain]} queue`, agent: 'raqib', action: `Opened ${ref}`, result: o.title, autonomy: 'A0', case_ref: ref, scenario_key: o.scenario ?? null });
  const run = await startRun(c, { caseId: k.id, workflowId: o.workflowId, title: o.title, channel: o.channel ?? 'SCAN', payload: o.payload, scenario: o.scenario ?? null });
  return { kase: k, run };
}

/** One pass over every queue. Returns what was opened. */
export async function scan(c: PoolClient, opts: { limit?: number; scenario?: string | null; onlyEdge?: string | null } = {}) {
  const opened: string[] = [];
  const lim = opts.limit ?? 50;
  const edgeSql = opts.onlyEdge ? 'AND edge_key = $1' : 'AND edge_key IS NULL';
  const params = opts.onlyEdge ? [opts.onlyEdge] : [];
  // Billing disputes
  for (const q of (await c.query(`SELECT * FROM core.billing_queue WHERE picked=false ${edgeSql} ORDER BY raised_on, id LIMIT ${lim}`, params)).rows) {
    const { kase } = await openCase(c, { domain: 'BILLING', workflowId: 'WF-01', subjectType: 'SUBSCRIBER', subjectId: q.subscriber_id, subscriberId: q.subscriber_id, title: `Disputed charge of ${Number(q.disputed_amount)} on ${q.invoice_id}`, amount: Number(q.disputed_amount), payload: { queue_id: q.id, invoice_id: q.invoice_id, charge_id: q.charge_id, disputed_amount: Number(q.disputed_amount), customer_text: q.customer_text, channel: q.channel }, edgeKey: q.edge_key, scenario: opts.scenario, channel: opts.scenario ? 'SCENARIO' : 'SCAN' });
    await markPicked({ c, actor: 'raqib' }, 'billing_queue', q.id); opened.push(kase.ref);
  }
  // Roaming flags
  for (const e of (await c.query(`SELECT e.* FROM core.roaming_events e JOIN core.subscribers s ON s.id=e.subscriber_id WHERE e.status='OPEN' AND NOT EXISTS (SELECT 1 FROM layer.cases k WHERE k.workflow_id='WF-02' AND k.payload->>'event_id'=e.id) ${opts.onlyEdge ? 'AND s.edge_key=$1' : 'AND s.edge_key IS NULL'} ORDER BY e.on_date, e.id LIMIT ${lim}`, params)).rows) {
    const s = (await c.query(`SELECT edge_key FROM core.subscribers WHERE id=$1`, [e.subscriber_id])).rows[0];
    const { kase } = await openCase(c, { domain: 'ROAMING', workflowId: 'WF-02', subjectType: 'SUBSCRIBER', subjectId: e.subscriber_id, subscriberId: e.subscriber_id, title: `Roaming flag: ${e.pattern.replace(/_/g, ' ').toLowerCase()} with ${e.partner_id}`, payload: { event_id: e.id }, edgeKey: s?.edge_key ?? null, scenario: opts.scenario, channel: opts.scenario ? 'SCENARIO' : 'SCAN' });
    opened.push(kase.ref);
  }
  // CVM signals
  for (const s of (await c.query(`SELECT * FROM core.cvm_signals WHERE picked=false ${edgeSql} ORDER BY on_date, id LIMIT ${lim}`, params)).rows) {
    const { kase } = await openCase(c, { domain: 'CVM', workflowId: 'WF-03', subjectType: 'SUBSCRIBER', subjectId: s.subscriber_id, subscriberId: s.subscriber_id, title: `Retention: churn risk ${(Number(s.churn_risk) * 100).toFixed(0)}% after ${s.service_problems} service problems`, payload: { signal_id: s.id }, edgeKey: s.edge_key, scenario: opts.scenario, channel: opts.scenario ? 'SCENARIO' : 'SCAN' });
    await markPicked({ c, actor: 'raqib' }, 'cvm_signals', s.id); opened.push(kase.ref);
  }
  // Complaints
  for (const cp of (await c.query(`SELECT c.*, s.edge_key AS sub_edge FROM core.complaints c JOIN core.subscribers s ON s.id=c.subscriber_id WHERE c.status='OPEN' AND NOT EXISTS (SELECT 1 FROM layer.cases k WHERE k.workflow_id='WF-04' AND k.payload->>'complaint_id'=c.id) ${opts.onlyEdge ? 'AND s.edge_key=$1' : 'AND s.edge_key IS NULL'} ORDER BY c.raised_on, c.id LIMIT ${lim}`, params)).rows) {
    const { kase } = await openCase(c, { domain: 'SERVICE', workflowId: 'WF-04', subjectType: 'SUBSCRIBER', subjectId: cp.subscriber_id, subscriberId: cp.subscriber_id, title: `Complaint ${cp.id}: ${cp.category.toLowerCase()} via ${cp.channel.toLowerCase()}`, payload: { complaint_id: cp.id }, edgeKey: opts.onlyEdge ?? null, scenario: opts.scenario, channel: opts.scenario ? 'SCENARIO' : 'SCAN' });
    opened.push(kase.ref);
  }
  // Enterprise orders
  for (const o of (await c.query(`SELECT o.*, a.name AS account_name, a.edge_key AS acc_edge FROM core.orders o JOIN core.accounts a ON a.id=o.account_id WHERE o.stage='REQUESTED' AND NOT EXISTS (SELECT 1 FROM layer.cases k WHERE k.workflow_id='WF-05' AND k.subject_id=o.id) ${opts.onlyEdge ? 'AND a.edge_key=$1' : 'AND a.edge_key IS NULL'} ORDER BY o.requested_on LIMIT ${lim}`, params)).rows) {
    const { kase } = await openCase(c, { domain: 'ENTERPRISE', workflowId: 'WF-05', subjectType: 'ORDER', subjectId: o.id, subscriberId: null, title: `${o.account_name}: ${o.service.replace(/_/g, ' ')} for ${o.sites} sites`, amount: Number(o.monthly_value) * o.term_months, payload: {}, edgeKey: o.acc_edge, scenario: opts.scenario, channel: opts.scenario ? 'SCENARIO' : 'SCAN' });
    opened.push(kase.ref);
  }
  return opened;
}
