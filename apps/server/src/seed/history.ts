/**
 * Sixty days of history: closed cases with their trails, written directly
 * (not replayed through the engine) so the seed takes seconds. Every history
 * case is marked channel SEED in its run. The measures API computes "current"
 * from these and the baseline from layer.meta.
 */
import type { PoolClient } from 'pg';
import { insertMany, setMeta } from '../db.js';
import { rng, addDays } from './rng.js';
import { DEMO_TODAY, type Base } from './base.js';

export const BASELINE = {
  'dispute-cost': 76, 'dispute-authority': 71, 'fraud-loss': 184000, 'settlement-time': 23, 'retained-contribution': 0, 'offer-consent': 88, 'first-time-resolution': 61, 'repeat-contact': 31, 'quote-to-activation': 41, 'order-rework': 22, 'leakage-rate': 1.9,
};

export async function seedHistory(c: PoolClient, base: Base) {
  const r = rng(7);
  const cases: any[] = []; const trails: any[] = []; const runs: any[] = [];
  let n = 0;
  const at = (d: string, h = 9) => new Date(Date.parse(`${d}T${String(h).padStart(2, '0')}:15:00Z`) - 4 * 3600_000);
  const push = (k: { domain: string; wf: string; subject: string; subscriber: string | null; title: string; state: string; code: string; opened: string; closedDays: number; amount: number | null; proposed: number | null; owner: string | null; payload: any; trail: { h: number; actor: [string, string, string]; act: string; summary: string; autonomy?: string | null; override?: boolean; reason?: string }[] }) => {
    const id = ++n; const ref = `DEMO-C-${String(id).padStart(5, '0')}`; const closed = addDays(k.opened, k.closedDays);
    cases.push({ id, ref, domain: k.domain, workflow_id: k.wf, subject_type: k.subject.startsWith('DEMO-O') ? 'ORDER' : 'SUBSCRIBER', subject_id: k.subject, subscriber_id: k.subscriber, title: k.title, state: k.state, amount: k.amount, proposed_amount: k.proposed, owner_persona: k.owner, opened_at: at(k.opened), closed_at: at(closed, 16), close_code: k.code, edge_key: null, scenario_key: null, payload: k.payload, updated_at: at(closed, 16) });
    runs.push({ case_id: id, workflow_id: k.wf, title: k.title, status: 'COMPLETED', current_step: null, payload: k.payload, result: {}, channel: 'SEED', created_at: at(k.opened), updated_at: at(closed, 16), closed_at: at(closed, 16) });
    k.trail.forEach((t, i) => trails.push({ at: at(i < k.trail.length - 1 ? k.opened : closed, t.h), actor_type: t.actor[0], actor_id: t.actor[1], actor_name: t.actor[2], autonomy: t.autonomy ?? null, act: t.act, case_id: id, case_ref: ref, subject_id: k.subject, run_id: null, clause: null, system: null, before: null, after: null, override: t.override ?? false, reason: t.reason ?? null, evidence: null, summary: t.summary, scenario_key: null }));
  };
  const A = (id: string, name: string): [string, string, string] => ['AGENT', id, name];
  const S = (id: string, name: string): [string, string, string] => ['SYSTEM', id, name];
  const H = (id: string, name: string): [string, string, string] => ['HUMAN', id, name];

  // Billing disputes from the picked queue rows
  for (const q of base.queue.filter((x) => x.picked)) {
    const real = r.chance(0.55); const credit = real ? r.round(Number(q.disputed_amount) * (r.chance(0.6) ? 1 : 0.5)) : 0;
    const small = credit > 0 && credit <= 50; const approver = credit === 0 || credit <= 500 ? 'billing_officer' : credit <= 5000 ? 'billing_manager' : 'finance';
    const override = !small && r.chance(0.06);
    const handling = r.int(14, 30);
    push({ domain: 'BILLING', wf: 'WF-01', subject: q.subscriber_id, subscriber: q.subscriber_id, title: `Disputed charge of ${Number(q.disputed_amount)} on ${q.invoice_id}`, state: 'CLOSED', code: override ? 'DECLINED' : credit ? 'RESOLVED' : 'NOT_DUE', opened: q.raised_on, closedDays: r.int(1, 3), amount: override ? 0 : credit, proposed: credit, owner: approver, payload: { handling_min: handling, credit: override ? 0 : credit, delegated: small },
      trail: [
        { h: 9, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: `Opened from the billing case queue: ${Number(q.disputed_amount)} disputed on ${q.invoice_id}.`, autonomy: 'A0' },
        { h: 9, actor: A('fahis', 'Fahis'), act: 'INVESTIGATE', summary: real ? 'Compared the invoice, the usage records and the tariff: one charge has no matching usage record.' : 'Compared the invoice, the usage records and the tariff: every charge reconciles; the amount is due.', autonomy: 'A1' },
        { h: 9, actor: A('mushir', 'Mushir'), act: 'PROPOSE', summary: real ? `Proposed a credit of ${credit} with the evidence attached.` : 'Proposed to decline and explain the charge.', autonomy: 'A1' },
        ...(small ? [{ h: 10, actor: S('munaffidh', 'Munaffidh'), act: 'EXECUTE', summary: `Posted ${credit} under WF-01’s A3 authority (small credit); the billing manager was told.`, autonomy: 'A3' }]
          : [{ h: 11, actor: H(approver, approver === 'billing_officer' ? 'Noura Al Hashimi (Billing officer)' : approver === 'billing_manager' ? 'Khalid Mansoor (Billing manager)' : 'Dana Haddad (Finance controller)'), act: override ? 'OVERRIDE' : 'APPROVE', summary: override ? `Declined against the recommendation: ${r.pick(['the customer had already been credited for this session in August', 'the usage record was in the partner file received this morning'])}.` : `Approved: ${real ? `credit ${credit}` : 'decline with explanation'}.`, autonomy: null, override, reason: override ? 'Evidence outside the case' : undefined }]),
        { h: 16, actor: A('muraqib', 'Muraqib'), act: 'VERIFY', summary: 'Verified after fourteen days: no repeat contact.', autonomy: 'A1' },
      ] });
  }
  // Roaming cases from closed flags
  for (const e of base.partners.length ? (await c.query(`SELECT * FROM core.roaming_events WHERE status IN ('RESTRICTED','DISMISSED')`)).rows : []) {
    const confirmed = e.status === 'RESTRICTED'; const exposure = r.int(400, 9000);
    push({ domain: 'ROAMING', wf: 'WF-02', subject: e.subscriber_id, subscriber: e.subscriber_id, title: `Roaming flag: ${e.pattern.replace(/_/g, ' ').toLowerCase()} with ${e.partner_id}`, state: 'CLOSED', code: confirmed ? 'CONFIRMED' : 'DISMISSED', opened: e.on_date, closedDays: r.int(1, 2), amount: confirmed ? exposure : 0, proposed: exposure, owner: 'roaming_analyst', payload: { exposure, confirmed, settlement_days: confirmed ? r.int(6, 14) : null },
      trail: [
        { h: 8, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: `Flag ${e.id} opened from partner TAP records and read-only telemetry.`, autonomy: 'A0' },
        { h: 8, actor: A('fahis', 'Fahis'), act: 'INVESTIGATE', summary: confirmed ? 'Usage, TAP records and telemetry confirm the pattern.' : 'The pattern is consistent with the subscriber’s travel; not confirmed.', autonomy: 'A1' },
        { h: 9, actor: H('roaming_analyst', 'Omar Siddiqui (Roaming fraud analyst)'), act: 'APPROVE', summary: confirmed ? 'Approved the restriction and the settlement query; reversal recorded.' : 'Approved the dismissal.', autonomy: null },
        { h: 15, actor: A('muraqib', 'Muraqib'), act: 'VERIFY', summary: confirmed ? `Partner acknowledged the query in ${r.int(6, 14)} days; restriction holds.` : 'Monitoring continued; nothing further.', autonomy: 'A1' },
      ] });
  }
  // Retention cases from picked signals
  for (const s of base.signals.filter((x) => x.picked)) {
    const sub = base.subs.find((x) => x.id === s.subscriber_id)!; const consent = sub.consent_marketing; const retained = consent ? r.round(Number(sub.arpu) * 3 * 0.6 - 25) : 0;
    push({ domain: 'CVM', wf: 'WF-03', subject: s.subscriber_id, subscriber: s.subscriber_id, title: `Retention: churn risk ${(Number(s.churn_risk) * 100).toFixed(0)}% after ${s.service_problems} service problems`, state: consent ? 'CLOSED' : 'BLOCKED', code: consent ? 'RETAINED' : 'NO_CONSENT', opened: s.on_date, closedDays: consent ? 2 : 0, amount: consent ? 25 : 0, proposed: consent ? 25 : null, owner: 'cvm_manager', payload: { retained, consent },
      trail: consent ? [
        { h: 9, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: 'Opened from a CVM signal.', autonomy: 'A0' },
        { h: 9, actor: S('hami', 'Hami'), act: 'GUARD', summary: 'Marketing consent on record; contact rules allow one contact.', autonomy: 'A2' },
        { h: 10, actor: A('mushir', 'Mushir'), act: 'PROPOSE', summary: `Proposed fixing the ${s.cause} problem and a 5 GB top-up from the approved set.`, autonomy: 'A1' },
        { h: 11, actor: H('cvm_manager', 'Layla Farouk (CVM manager)'), act: 'APPROVE', summary: 'Approved the response.', autonomy: null },
        { h: 16, actor: A('muraqib', 'Muraqib'), act: 'VERIFY', summary: `Retained; contribution ${retained} against the comparison group, net of the top-up.`, autonomy: 'A1' },
      ] : [
        { h: 9, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: 'Opened from a CVM signal.', autonomy: 'A0' },
        { h: 9, actor: S('hami', 'Hami'), act: 'REFUSE', summary: 'Marketing consent not on record: closed before investigation; no person saw it.', autonomy: 'A2' },
      ] });
  }
  // Service cases from resolved/reopened complaints
  for (const cp of base.complaints.filter((x) => x.status !== 'OPEN')) {
    const within = ['SPEED', 'COVERAGE', 'OTHER'].includes(cp.category); const repeat = cp.reopened;
    push({ domain: 'SERVICE', wf: 'WF-04', subject: cp.subscriber_id, subscriber: cp.subscriber_id, title: `Complaint ${cp.id}: ${cp.category.toLowerCase()} via ${cp.channel.toLowerCase()}`, state: 'CLOSED', code: repeat ? 'REPEAT_CONTACT' : 'RESOLVED_FIRST_TIME', opened: cp.raised_on, closedDays: 14, amount: null, proposed: null, owner: within ? null : 'service_agent', payload: { within, repeat },
      trail: [
        { h: 9, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: `Opened from complaint ${cp.id}; previous contacts attached.`, autonomy: 'A0' },
        { h: 9, actor: A('fahis', 'Fahis'), act: 'INVESTIGATE', summary: 'Read the account, the service state and the records the complaint points at.', autonomy: 'A1' },
        ...(within ? [{ h: 9, actor: S('munaffidh', 'Munaffidh'), act: 'EXECUTE', summary: 'Resolved within WF-04’s A3 authority: explanation and, where allowed, a small add-on.', autonomy: 'A3' }] : [{ h: 11, actor: H('service_agent', 'Yusuf Rahman (Service agent)'), act: 'APPROVE', summary: 'Decided with the full context attached.', autonomy: null }]),
        { h: 16, actor: A('muraqib', 'Muraqib'), act: 'VERIFY', summary: repeat ? 'Repeat contact within fourteen days: not counted as resolved.' : 'No repeat contact in fourteen days: resolved first time.', autonomy: 'A1' },
      ] });
  }
  // Enterprise cases from active / rework orders
  for (const o of base.orders.filter((x) => x.stage === 'ACTIVE' || x.stage === 'REWORK')) {
    const acc = base.accounts.find((a) => a.id === o.account_id)!; const days = o.activated_on ? Math.round((Date.parse(o.activated_on) - Date.parse(o.requested_on)) / 86_400_000) : null;
    push({ domain: 'ENTERPRISE', wf: 'WF-05', subject: o.id, subscriber: null, title: `${acc.name}: ${o.service.replace(/_/g, ' ')} for ${o.sites} sites`, state: 'CLOSED', code: o.stage === 'ACTIVE' ? 'ACTIVATED' : 'REWORK', opened: o.requested_on, closedDays: days ?? 12, amount: Number(o.monthly_value) * o.term_months, proposed: Number(o.monthly_value) * o.term_months, owner: 'enterprise_manager', payload: { days, rework: o.stage === 'REWORK' },
      trail: [
        { h: 9, actor: A('raqib', 'Raqib'), act: 'DETECT', summary: 'Captured from the order.', autonomy: 'A0' },
        { h: 9, actor: A('fahis', 'Fahis'), act: 'INVESTIGATE', summary: 'Checked coverage, capacity and the catalogue per site.', autonomy: 'A1' },
        { h: 11, actor: H('enterprise_manager', 'Sara Qasimi (Enterprise sales manager)'), act: 'APPROVE', summary: 'Approved the quote commercially.', autonomy: null },
        { h: 15, actor: A('muraqib', 'Muraqib'), act: 'VERIFY', summary: o.stage === 'ACTIVE' ? `Activated in ${days} days; billing records match the quote.` : 'Returned to feasibility: a dependency missed at the first pass.', autonomy: 'A1' },
      ] });
  }
  await insertMany(c, 'layer.cases', cases);
  await c.query(`SELECT setval(pg_get_serial_sequence('layer.cases','id'), (SELECT MAX(id) FROM layer.cases))`);
  await insertMany(c, 'layer.runs', runs);
  await insertMany(c, 'layer.trail', trails);
  await setMeta(c, 'baseline', BASELINE);
  await setMeta(c, 'seed', { version: 'dhow-1.0', today: DEMO_TODAY, cases: cases.length, subscribers: base.subs.length });
  return { cases: cases.length };
}
