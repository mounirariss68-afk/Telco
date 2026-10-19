/** Read routes. Every route applies the persona's scope; nothing here writes. */
import { Router } from 'express';
import { AGENTS, BUILT_WORKFLOWS, MARKETS, MEASURES, SCENARIOS, WORKFLOWS, LIMITS, market, type MeasureDef } from '@dhow/domain';
import { pool, q, one, meta } from '../db.js';
import { now, today, isVirtual } from '../clock.js';
import { aiStatus } from '../ai.js';
import { settings } from '../settings.js';
import { allAuthority } from '../engine/authority.js';
import { personaOf, personas, rebase, scopeSql } from './session.js';
import { currentScenario } from '../director.js';

export const data = Router();

data.get('/me', async (req, res) => {
  const p = personaOf(req);
  const s = await settings(pool);
  const sc = scopeSql(p);
  const inbox = (await one(`SELECT COUNT(*)::int AS n FROM layer.approvals a JOIN layer.runs r ON r.id=a.run_id JOIN layer.cases k ON k.id=r.case_id WHERE a.decision='PENDING' AND a.approver_persona=$1`, [p.key]))?.n ?? 0;
  const tasks = (await one(`SELECT COUNT(*)::int AS n FROM layer.tasks WHERE state='OPEN' AND assignee_persona=$1`, [p.key]))?.n ?? 0;
  const seed = await meta(pool, 'seed');
  res.json({ persona: personas().find((x) => x.key === p.key), personas: personas(), clock: { now: now().toISOString(), today: today(), virtual: isVirtual() }, ai: aiStatus(), market: market(s.market), markets: Object.values(MARKETS), settings: s, inbox: inbox + tasks, scenario: currentScenario(), seed, scope: sc.params[0] ?? null, limits: LIMITS });
});

data.get('/overview', async (req, res) => {
  const p = personaOf(req); const sc = scopeSql(p);
  const byDomain = await q(`SELECT domain, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE state NOT IN ('CLOSED','DECLINED','REVERSED','BLOCKED'))::int AS open, COUNT(*) FILTER (WHERE state='AWAITING_APPROVAL')::int AS waiting, COUNT(*) FILTER (WHERE closed_at > now() - interval '60 days' AND state IN ('CLOSED','REVERSED','DECLINED','BLOCKED'))::int AS closed60 FROM layer.cases k WHERE ${sc.sql} GROUP BY domain ORDER BY domain`, sc.params);
  const waiting = await q(`SELECT a.approver_persona, COUNT(*)::int AS n FROM layer.approvals a JOIN layer.runs r ON r.id=a.run_id JOIN layer.cases k ON k.id=r.case_id WHERE a.decision='PENDING' AND ${sc.sql} GROUP BY a.approver_persona`, sc.params);
  const overrides = await q(`SELECT t.case_ref, t.actor_name, t.summary, t.at FROM layer.trail t JOIN layer.cases k ON k.id=t.case_id WHERE t.override AND ${sc.sql} ORDER BY t.at DESC LIMIT 6`, sc.params);
  const delegated = await one(`SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::float AS amount FROM core.credits WHERE approval_ref LIKE 'A3-%' AND reversed_at IS NULL`);
  const activity = await q(`SELECT * FROM layer.activity ORDER BY id DESC LIMIT 12`);
  const authority = await allAuthority(pool);
  res.json({ byDomain, waiting, overrides, delegated, activity, authority, measures: await computeMeasures() });
});

data.get('/inbox', async (req, res) => {
  const p = personaOf(req);
  const approvals = await q(`SELECT a.id AS approval_id, a.run_id, a.step_key, a.action_type, a.amount, a.created_at AS waiting_since, r.workflow_id, r.title, r.result, r.status AS run_status, k.ref AS case_ref, k.domain, k.subject_id, k.subscriber_id, k.state, k.proposed_amount, s.name AS subscriber_name, s.segment
    FROM layer.approvals a JOIN layer.runs r ON r.id=a.run_id JOIN layer.cases k ON k.id=r.case_id LEFT JOIN core.subscribers s ON s.id=k.subscriber_id
    WHERE a.decision='PENDING' AND a.approver_persona=$1 ORDER BY a.created_at DESC`, [p.key]);
  const tasks = await q(`SELECT t.*, k.ref AS case_ref FROM layer.tasks t LEFT JOIN layer.cases k ON k.id=t.case_id WHERE t.state='OPEN' AND t.assignee_persona=$1 ORDER BY t.due`, [p.key]);
  res.json({ approvals, tasks });
});

data.get('/cases', async (req, res) => {
  const p = personaOf(req); const sc = scopeSql(p);
  const domain = req.query.domain ? String(req.query.domain) : null; const state = req.query.state ? String(req.query.state) : null; const search = req.query.q ? String(req.query.q) : null;
  const params: unknown[] = [...sc.params];
  let where = sc.sql;
  if (domain) { params.push(domain); where += ` AND k.domain=$${params.length}`; }
  if (state === 'open') where += ` AND k.state NOT IN ('CLOSED','DECLINED','REVERSED','BLOCKED')`; else if (state === 'closed') where += ` AND k.state IN ('CLOSED','DECLINED','REVERSED','BLOCKED')`;
  if (search) { params.push(`%${search}%`); where += ` AND (k.ref ILIKE $${params.length} OR k.title ILIKE $${params.length} OR k.subject_id ILIKE $${params.length})`; }
  const rows = await q(`SELECT k.*, s.name AS subscriber_name, s.segment, r.status AS run_status, r.waiting_on_persona, r.current_step FROM layer.cases k LEFT JOIN core.subscribers s ON s.id=k.subscriber_id LEFT JOIN LATERAL (SELECT status, waiting_on_persona, current_step FROM layer.runs WHERE case_id=k.id ORDER BY id DESC LIMIT 1) r ON TRUE WHERE ${where} ORDER BY k.updated_at DESC LIMIT 300`, params);
  res.json(rows);
});

data.get('/cases/:ref', async (req, res) => {
  const k = await one(`SELECT k.*, s.name AS subscriber_name, s.segment, s.language, s.msisdn FROM layer.cases k LEFT JOIN core.subscribers s ON s.id=k.subscriber_id WHERE k.ref=$1`, [req.params.ref]);
  if (!k) return res.status(404).json({ error: 'Case not found' });
  const runs = await q(`SELECT * FROM layer.runs WHERE case_id=$1 ORDER BY id`, [k.id]);
  const steps = runs.length ? await q(`SELECT * FROM layer.run_steps WHERE run_id = ANY($1) ORDER BY run_id, seq`, [runs.map((r) => r.id)]) : [];
  const approvals = runs.length ? await q(`SELECT * FROM layer.approvals WHERE run_id = ANY($1) ORDER BY id`, [runs.map((r) => r.id)]) : [];
  const trail = await q(`SELECT * FROM layer.trail WHERE case_id=$1 ORDER BY at, id`, [k.id]);
  const events = await q(`SELECT * FROM layer.case_events WHERE case_id=$1 ORDER BY at, id`, [k.id]);
  const tasks = await q(`SELECT * FROM layer.tasks WHERE case_id=$1 ORDER BY id`, [k.id]);
  const messages = await q(`SELECT * FROM layer.messages WHERE case_ref=$1 ORDER BY id`, [k.ref]);
  const order = k.subject_type === 'ORDER' ? await one(`SELECT o.*, a.name AS account_name, a.sector FROM core.orders o JOIN core.accounts a ON a.id=o.account_id WHERE o.id=$1`, [k.subject_id]) : null;
  res.json({ ...k, runs, steps, approvals, trail, events, tasks, messages, order });
});

data.get('/runs/:id', async (req, res) => {
  const r = await one(`SELECT r.*, k.ref AS case_ref FROM layer.runs r LEFT JOIN layer.cases k ON k.id=r.case_id WHERE r.id=$1`, [Number(req.params.id)]);
  if (!r) return res.status(404).json({ error: 'Run not found' });
  res.json({ ...r, steps: await q(`SELECT * FROM layer.run_steps WHERE run_id=$1 ORDER BY seq`, [r.id]) });
});

data.get('/subscribers', async (req, res) => {
  const search = req.query.q ? `%${String(req.query.q)}%` : null; const seg = req.query.segment ? String(req.query.segment) : null; const edge = req.query.edge === '1';
  const params: unknown[] = []; const where: string[] = [];
  if (search) { params.push(search); where.push(`(s.id ILIKE $${params.length} OR s.name ILIKE $${params.length} OR s.msisdn ILIKE $${params.length})`); }
  if (seg) { params.push(seg); where.push(`s.segment=$${params.length}`); }
  if (edge) where.push(`s.edge_key IS NOT NULL`);
  const rows = await q(`SELECT s.*, (SELECT COUNT(*)::int FROM layer.cases k WHERE k.subscriber_id=s.id) AS cases FROM core.subscribers s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.edge_key NULLS LAST, s.id LIMIT 200`, params);
  const stats = await one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE segment='PREPAID')::int AS prepaid, COUNT(*) FILTER (WHERE segment='POSTPAID')::int AS postpaid, COUNT(*) FILTER (WHERE segment='ENTERPRISE')::int AS enterprise, COUNT(*) FILTER (WHERE consent_marketing)::int AS consented, COUNT(*) FILTER (WHERE roaming_enabled)::int AS roaming FROM core.subscribers`);
  res.json({ rows, stats });
});
data.get('/subscribers/:id', async (req, res) => {
  const s = await one(`SELECT * FROM core.subscribers WHERE id=$1`, [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Subscriber not found' });
  const invoices = await q(`SELECT * FROM core.invoices WHERE subscriber_id=$1 ORDER BY issued_on DESC`, [s.id]);
  const charges = invoices.length ? await q(`SELECT * FROM core.charges WHERE invoice_id = ANY($1) ORDER BY rated_on, id`, [invoices.map((i) => i.id)]) : [];
  const usage = await q(`SELECT * FROM core.usage WHERE subscriber_id=$1 ORDER BY on_date DESC, id LIMIT 80`, [s.id]);
  const events = await q(`SELECT * FROM core.roaming_events WHERE subscriber_id=$1 ORDER BY on_date DESC`, [s.id]);
  const complaints = await q(`SELECT * FROM core.complaints WHERE subscriber_id=$1 ORDER BY raised_on DESC`, [s.id]);
  const credits = await q(`SELECT * FROM core.credits WHERE subscriber_id=$1 ORDER BY posted_at DESC`, [s.id]);
  const restrictions = await q(`SELECT * FROM core.restrictions WHERE subscriber_id=$1 ORDER BY applied_at DESC`, [s.id]);
  const registrations = await q(`SELECT r.*, o.name AS offer_name FROM core.offer_registrations r LEFT JOIN core.offers o ON o.id=r.offer_id WHERE r.subscriber_id=$1 ORDER BY r.registered_at DESC`, [s.id]);
  const messages = await q(`SELECT * FROM layer.messages WHERE subscriber_id=$1 ORDER BY sent_at DESC`, [s.id]);
  const cases = await q(`SELECT ref, domain, workflow_id, title, state, amount, opened_at, closed_at, close_code FROM layer.cases WHERE subscriber_id=$1 ORDER BY opened_at DESC`, [s.id]);
  const account = s.account_id ? await one(`SELECT * FROM core.accounts WHERE id=$1`, [s.account_id]) : null;
  res.json({ ...s, account, invoices, charges, usage, events, complaints, credits, restrictions, registrations, messages, cases });
});

data.get('/roaming', async (_req, res) => {
  const partners = await q(`SELECT p.*, (SELECT COUNT(*)::int FROM core.roaming_events e WHERE e.partner_id=p.id AND e.status='OPEN') AS open_flags, (SELECT COUNT(*)::int FROM core.settlement_queries s WHERE s.partner_id=p.id) AS queries FROM core.partners p ORDER BY p.id`);
  const events = await q(`SELECT e.*, s.name AS subscriber_name, p.name AS partner_name, k.ref AS case_ref, k.state AS case_state FROM core.roaming_events e JOIN core.subscribers s ON s.id=e.subscriber_id JOIN core.partners p ON p.id=e.partner_id LEFT JOIN layer.cases k ON k.workflow_id='WF-02' AND k.payload->>'event_id'=e.id ORDER BY e.on_date DESC, e.id DESC LIMIT 100`);
  const queries = await q(`SELECT s.*, p.name AS partner_name FROM core.settlement_queries s JOIN core.partners p ON p.id=s.partner_id ORDER BY s.raised_at DESC LIMIT 50`);
  const restrictions = await q(`SELECT r.*, s.name AS subscriber_name FROM core.restrictions r JOIN core.subscribers s ON s.id=r.subscriber_id ORDER BY r.applied_at DESC LIMIT 50`);
  res.json({ partners, events, queries, restrictions });
});
data.get('/cvm', async (_req, res) => {
  const offers = await q(`SELECT o.*, (SELECT COUNT(*)::int FROM core.offer_registrations r WHERE r.offer_id=o.id) AS registrations FROM core.offers o ORDER BY o.approved DESC, o.id`);
  const signals = await q(`SELECT g.*, s.name AS subscriber_name, s.consent_marketing, k.ref AS case_ref, k.state AS case_state, k.close_code FROM core.cvm_signals g JOIN core.subscribers s ON s.id=g.subscriber_id LEFT JOIN layer.cases k ON k.workflow_id='WF-03' AND (k.payload->>'signal_id')::int=g.id ORDER BY g.on_date DESC, g.id DESC LIMIT 100`);
  const registrations = await q(`SELECT r.*, s.name AS subscriber_name, o.name AS offer_name FROM core.offer_registrations r JOIN core.subscribers s ON s.id=r.subscriber_id LEFT JOIN core.offers o ON o.id=r.offer_id ORDER BY r.registered_at DESC LIMIT 50`);
  const consent = await one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE consent_marketing)::int AS consented FROM core.subscribers`);
  res.json({ offers, signals, registrations, consent });
});
data.get('/complaints', async (_req, res) => {
  const rows = await q(`SELECT c.*, s.name AS subscriber_name, k.ref AS case_ref, k.state AS case_state, k.close_code FROM core.complaints c JOIN core.subscribers s ON s.id=c.subscriber_id LEFT JOIN layer.cases k ON k.workflow_id='WF-04' AND k.payload->>'complaint_id'=c.id ORDER BY c.raised_on DESC, c.id DESC LIMIT 200`);
  const stats = await one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='OPEN')::int AS open, COUNT(*) FILTER (WHERE reopened)::int AS reopened, COUNT(*) FILTER (WHERE channel='REGULATOR')::int AS regulator FROM core.complaints`);
  res.json({ rows, stats });
});
data.get('/orders', async (_req, res) => {
  const rows = await q(`SELECT o.*, a.name AS account_name, a.sector, k.ref AS case_ref, k.state AS case_state FROM core.orders o JOIN core.accounts a ON a.id=o.account_id LEFT JOIN layer.cases k ON k.workflow_id='WF-05' AND k.subject_id=o.id ORDER BY o.requested_on DESC`);
  const accounts = await q(`SELECT a.*, (SELECT COUNT(*)::int FROM core.orders o WHERE o.account_id=a.id) AS orders FROM core.accounts a ORDER BY a.edge_key NULLS LAST, a.name`);
  res.json({ rows, accounts });
});

data.get('/agents', async (_req, res) => {
  const activity = await q(`SELECT agent, COUNT(*)::int AS n FROM layer.activity WHERE agent IS NOT NULL GROUP BY agent`);
  const trail = await q(`SELECT actor_id, COUNT(*)::int AS n FROM layer.trail WHERE actor_type IN ('AGENT','SYSTEM') GROUP BY actor_id`);
  res.json({ agents: AGENTS.map((a) => ({ ...a, activity: activity.find((x) => x.agent === a.id)?.n ?? 0, trail: trail.find((x) => x.actor_id === a.id)?.n ?? 0 })) });
});
data.get('/workflows', async (_req, res) => {
  const counts = await q(`SELECT workflow_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE state NOT IN ('CLOSED','DECLINED','REVERSED','BLOCKED'))::int AS open FROM layer.cases GROUP BY workflow_id`);
  res.json({ workflows: WORKFLOWS.map((w) => ({ ...w, ...(counts.find((x) => x.workflow_id === w.id) ?? { total: 0, open: 0 }) })), authority: await allAuthority(pool), history: await q(`SELECT * FROM layer.authority_history ORDER BY at DESC LIMIT 20`), outcomes: await q(`SELECT workflow_id, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE correct)::int AS correct, COUNT(*) FILTER (WHERE delegated)::int AS delegated FROM layer.outcomes GROUP BY workflow_id`) });
});
data.get('/authority', async (_req, res) => {
  res.json({ authority: await allAuthority(pool), history: await q(`SELECT * FROM layer.authority_history ORDER BY at DESC`), outcomes: await q(`SELECT * FROM layer.outcomes ORDER BY id DESC LIMIT 60`), limits: LIMITS, built: BUILT_WORKFLOWS.map((w) => ({ id: w.id, name: w.name, ceiling: w.ceiling, boundary: w.boundary })) });
});
data.get('/scenarios', async (_req, res) => { res.json({ scenarios: SCENARIOS, current: currentScenario() }); });
data.get('/trail', async (req, res) => {
  const p = personaOf(req); const sc = scopeSql(p);
  const params: unknown[] = [...sc.params]; let where = `(t.case_id IS NULL OR ${sc.sql})`;
  if (req.query.case) { params.push(String(req.query.case)); where += ` AND t.case_ref=$${params.length}`; }
  if (req.query.subject) { params.push(String(req.query.subject)); where += ` AND t.subject_id=$${params.length}`; }
  if (req.query.overrides === '1') where += ` AND t.override`;
  if (req.query.actor) { params.push(String(req.query.actor)); where += ` AND t.actor_id=$${params.length}`; }
  res.json(await q(`SELECT t.* FROM layer.trail t LEFT JOIN layer.cases k ON k.id=t.case_id WHERE ${rebase(where, 0)} ORDER BY t.at DESC, t.id DESC LIMIT 200`, params));
});
data.get('/activity', async (_req, res) => { res.json(await q(`SELECT * FROM layer.activity ORDER BY id DESC LIMIT 80`)); });
data.get('/messages', async (_req, res) => { res.json(await q(`SELECT m.*, s.name AS subscriber_name FROM layer.messages m LEFT JOIN core.subscribers s ON s.id=m.subscriber_id ORDER BY m.sent_at DESC LIMIT 100`)); });
data.get('/measures', async (_req, res) => { res.json(await computeMeasures()); });

export async function computeMeasures() {
  const baseline = (await meta<Record<string, number>>(pool, 'baseline')) ?? {};
  const s = await settings(pool); const m = market(s.market);
  const dispute = await one(`SELECT AVG((payload->>'handling_min')::float * 1.9 + CASE WHEN state='REVERSED' THEN COALESCE((payload->>'credit')::float, 0) ELSE 0 END)::float AS cost, COUNT(*)::int AS n FROM layer.cases WHERE workflow_id='WF-01' AND state IN ('CLOSED','REVERSED') AND payload ? 'handling_min'`);
  const authority = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE approval_ref IS NOT NULL)::int AS ok FROM core.credits`);
  const fraud = await one(`SELECT COALESCE(SUM(amount),0)::float AS loss FROM layer.cases WHERE workflow_id='WF-02' AND close_code='CONFIRMED' AND closed_at > now() - interval '60 days'`);
  const settle = await one(`SELECT AVG((payload->>'settlement_days')::float)::float AS d FROM layer.cases WHERE workflow_id='WF-02' AND payload->>'settlement_days' IS NOT NULL`);
  const retained = await one(`SELECT COALESCE(SUM((payload->>'retained')::float),0)::float AS v FROM layer.cases WHERE workflow_id='WF-03' AND close_code='RETAINED'`);
  const consent = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE consent_checked)::int AS ok FROM core.offer_registrations`);
  const ftr = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE close_code='RESOLVED_FIRST_TIME')::int AS ok FROM layer.cases WHERE workflow_id='WF-04' AND state='CLOSED'`);
  const q2a = await one(`SELECT AVG(activated_on - requested_on)::float AS d, COUNT(*)::int AS n FROM core.orders WHERE stage='ACTIVE' AND activated_on IS NOT NULL`);
  const rework = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE stage='REWORK')::int AS rw FROM core.orders WHERE stage IN ('ACTIVE','REWORK')`);
  const cur: Record<string, number | null> = {
    'dispute-cost': dispute?.cost ?? null, 'dispute-authority': authority?.n ? (100 * authority.ok) / authority.n : null, 'fraud-loss': fraud?.loss ?? null, 'settlement-time': settle?.d ?? null,
    'retained-contribution': retained?.v ?? null, 'offer-consent': consent?.n ? (100 * consent.ok) / consent.n : 100, 'first-time-resolution': ftr?.n ? (100 * ftr.ok) / ftr.n : null, 'repeat-contact': ftr?.n ? 100 - (100 * ftr.ok) / ftr.n : null,
    'quote-to-activation': q2a?.d ?? null, 'order-rework': rework?.n ? (100 * rework.rw) / rework.n : null, 'leakage-rate': null,
  };
  return MEASURES.map((d: MeasureDef) => ({ ...d, baseline: baseline[d.id] ?? null, current: cur[d.id] === null || cur[d.id] === undefined ? null : Math.round((cur[d.id] as number) * 10) / 10, currency: d.unit === 'AED' ? m.currency : null, rate: m.rate, designed: d.id === 'leakage-rate' }));
}
