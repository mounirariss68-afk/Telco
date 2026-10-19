/** Write routes: decisions, tasks, events, Raqib passes, verification, settings. The server checks the authority matrix; the UI never does. */
import { Router } from 'express';
import { MARKET_KEYS, type ActionType, type PersonaKey } from '@dhow/domain';
import { pool, tx } from '../db.js';
import { now, setClock, persistClock, tick, isVirtual } from '../clock.js';
import { decide, resume, addTrail } from '../engine/core.js';
import { scan } from '../agents/raqib.js';
import { assertAllowed, personaOf } from './session.js';
import { updateSettings } from '../settings.js';

export const actions = Router();

actions.post('/runs/:id/decide', async (req, res) => {
  const p = personaOf(req);
  const runId = Number(req.params.id);
  const { decision, reason, edits } = req.body as { decision: 'APPROVED' | 'REJECTED'; reason?: string; edits?: Record<string, any> };
  const appr = (await pool.query(`SELECT * FROM layer.approvals WHERE run_id=$1 AND decision='PENDING' ORDER BY id DESC LIMIT 1`, [runId])).rows[0];
  if (!appr) return res.status(409).json({ error: 'Nothing is waiting for a decision on this run' });
  if (appr.approver_persona !== p.key) {
    if (appr.action_type === 'CREDIT') assertAllowed(p, 'CREDIT', Number(appr.amount ?? 0));
    else { const e: any = new Error(`${p.role} may not decide this: it waits on ${appr.approver_persona.replace(/_/g, ' ')}`); e.status = 403; throw e; }
  } else if (appr.action_type !== 'DECIDE') assertAllowed(p, appr.action_type as ActionType, Number(appr.amount ?? 0));
  await tx((c) => decide(c, { runId, persona: p.key, decision, reason, edits }));
  res.json({ ok: true });
});

actions.post('/tasks/:id/done', async (req, res) => {
  const p = personaOf(req);
  const id = Number(req.params.id);
  const t = (await pool.query(`SELECT * FROM layer.tasks WHERE id=$1`, [id])).rows[0];
  if (!t) return res.status(404).json({ error: 'Task not found' });
  if (t.assignee_persona !== p.key) return res.status(403).json({ error: `This task is ${t.assignee_persona.replace(/_/g, ' ')}’s` });
  const outcome = String(req.body?.outcome ?? 'Done');
  await tx(async (c) => {
    await c.query(`UPDATE layer.tasks SET state='DONE', outcome=$2, done_at=$3 WHERE id=$1`, [id, outcome, now()]);
    const kase = t.case_id ? (await c.query(`SELECT * FROM layer.cases WHERE id=$1`, [t.case_id])).rows[0] : null;
    await addTrail(c, { actor_type: 'HUMAN', actor_id: p.key, actor_name: `${p.name} (${p.role})`, autonomy: null, act: 'TASK_DONE', summary: `${t.title}: ${outcome}`, case_id: kase?.id ?? null, case_ref: kase?.ref ?? null, subject_id: kase?.subject_id ?? null, run_id: t.run_id ?? null, scenario_key: kase?.scenario_key ?? null });
    if (t.kind === 'PROVISION' && t.run_id) await resume(c, t.run_id, { kind: 'PROVISIONED', payload: { outcome } });
  });
  res.json({ ok: true, result: t.kind === 'PROVISION' ? 'Provisioning confirmed; Muraqib verifies the records' : 'Recorded' });
});

/** Fire an event into a waiting run (verification due, provisioning done, repeat contact). */
actions.post('/cases/:ref/event', async (req, res) => {
  const kind = String(req.body?.kind ?? 'VERIFY');
  const kase = (await pool.query(`SELECT * FROM layer.cases WHERE ref=$1`, [req.params.ref])).rows[0];
  if (!kase) return res.status(404).json({ error: 'Case not found' });
  const run = (await pool.query(`SELECT * FROM layer.runs WHERE case_id=$1 AND status='WAITING_EVENT' ORDER BY id DESC LIMIT 1`, [kase.id])).rows[0];
  if (!run) return res.status(409).json({ error: 'The case is not waiting for an event' });
  if (kind === 'VERIFY' && isVirtual()) { tick(14 * 86_400_000); await persistClock(); }
  await tx((c) => resume(c, run.id, { kind, payload: req.body ?? {} }));
  res.json({ ok: true });
});

actions.post('/scan', async (_req, res) => {
  const opened = await tx((c) => scan(c, { limit: 20 }));
  res.json({ opened });
});
actions.post('/clock/advance', async (req, res) => {
  const days = Number(req.body?.days ?? 1);
  if (!isVirtual()) setClock(now());
  tick(days * 86_400_000); await persistClock();
  res.json({ ok: true, now: now().toISOString() });
});
actions.post('/settings', async (req, res) => {
  const patch: any = {};
  if (req.body?.market && MARKET_KEYS.includes(req.body.market)) patch.market = req.body.market;
  res.json(await updateSettings(pool, patch));
});
actions.post('/reset', async (_req, res) => {
  const { reseed } = await import('../seed/index.js');
  await reseed();
  res.json({ ok: true });
});
export const PERSONA_KEYS: PersonaKey[] = ['billing_officer', 'billing_manager', 'finance', 'roaming_analyst', 'noc', 'cvm_manager', 'service_agent', 'enterprise_manager', 'ra_lead', 'coo'];
