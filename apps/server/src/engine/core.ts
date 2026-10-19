/**
 * The workflow engine. A run executes one workflow's steps in order for one
 * case. AGENT and SYSTEM steps execute immediately through their handler; a
 * HUMAN step parks the run in one persona's inbox with an approval row; a step
 * that `waits` parks the run until an event resumes it. Nothing writes to the
 * core schema except SYSTEM steps (Munaffidh through the connector), and only
 * after every human step before them has approved, or under an authority the
 * workflow currently holds. The only way past a HUMAN step is decide().
 */
import type { PoolClient } from 'pg';
import { AGENT, PERSONA, approverFor, wf, type ActionType, type CaseState, type PersonaKey, type StepDef, type WorkflowDef } from '@dhow/domain';
import { now } from '../clock.js';
import type { Ctx } from '../core/connector.js';
import { subscriberFacts, type SubscriberFacts } from '../core/connector.js';
import { HANDLERS, executeReversal } from './handlers.js';

export type Run = { id: number; case_id: number | null; workflow_id: string; title: string; status: string; current_step: string | null; waiting_on_persona: string | null; waiting_event: string | null; payload: Record<string, any>; result: Record<string, any>; channel: string; scenario_key: string | null; created_at: string };
export type CaseRow = { id: number; ref: string; domain: string; workflow_id: string; subject_type: string; subject_id: string; subscriber_id: string | null; title: string; state: CaseState; amount: number | null; proposed_amount: number | null; owner_persona: string | null; opened_at: string; closed_at: string | null; close_code: string | null; edge_key: string | null; scenario_key: string | null; payload: Record<string, any> };
export type StepRow = { id: number; run_id: number; seq: number; step_key: string; actor_type: string; actor_id: string; label: string; status: string; outputs: Record<string, any>; decision: string | null };

export type StepOutcome = {
  status?: 'DONE' | 'SKIPPED' | 'REFUSED' | 'FAILED';
  decision?: string;
  outputs?: Record<string, any>;
  stop?: 'COMPLETED' | 'REJECTED' | 'ESCALATED';
  skip?: string[];
  wait?: 'EVENT';
  /** What the agent recommends; shown in the reader and used to detect overrides. */
  recommend?: { verdict: 'APPROVE' | 'DECLINE' | 'REVIEW'; summary: string };
  /** The action and amount the next human step decides (the authority matrix is keyed on these). */
  actionType?: ActionType; amount?: number;
};

export type TrailIn = { act: string; summary: string; actor_id?: string; actor_type?: 'AGENT' | 'HUMAN' | 'SYSTEM'; actor_name?: string; autonomy?: string | null; clause?: string; system?: string; before?: any; after?: any; override?: boolean; reason?: string; evidence?: any; case_id?: number | null; case_ref?: string | null; subject_id?: string | null };
export type HCtx = {
  c: PoolClient; run: Run; kase: CaseRow; step: StepRow; def: StepDef; wf: WorkflowDef; at: Date; conn: Ctx;
  facts: () => Promise<SubscriberFacts>;
  trail: (t: TrailIn) => Promise<void>;
  patch: (p: Record<string, any>) => Promise<void>;
  setResult: (p: Record<string, any>) => Promise<void>;
  caseState: (state: CaseState, note?: string, extra?: Record<string, any>) => Promise<void>;
  closeCase: (code: string, note?: string, state?: CaseState) => Promise<void>;
  task: (t: { kind: string; assignee: PersonaKey; title: string; brief?: string; dueDays?: number }) => Promise<number>;
  activity: (a: { trigger: string; action: string; result: string; agent?: string }) => Promise<void>;
  event: { kind: string; payload: Record<string, any> } | null;
};

const agentName = (id: string) => AGENT[id]?.name ?? id;
const agentAutonomy = (id: string) => AGENT[id]?.autonomy ?? null;

export async function addTrail(c: { query: PoolClient['query'] }, t: TrailIn & { actor_id: string; actor_type: 'AGENT' | 'HUMAN' | 'SYSTEM'; actor_name: string; run_id?: number | null; scenario_key?: string | null }) {
  await c.query(
    `INSERT INTO layer.trail (at, actor_type, actor_id, actor_name, autonomy, act, case_id, case_ref, subject_id, run_id, clause, system, before, after, override, reason, evidence, summary, scenario_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [now(), t.actor_type, t.actor_id, t.actor_name, t.autonomy ?? null, t.act, t.case_id ?? null, t.case_ref ?? null, t.subject_id ?? null, t.run_id ?? null, t.clause ?? null, t.system ?? null,
      t.before === undefined ? null : JSON.stringify(t.before), t.after === undefined ? null : JSON.stringify(t.after), t.override ?? false, t.reason ?? null, t.evidence === undefined ? null : JSON.stringify(t.evidence), t.summary, t.scenario_key ?? null],
  );
}
export async function addActivity(c: { query: PoolClient['query'] }, a: { trigger: string; agent?: string | null; action: string; result: string; autonomy?: string | null; case_ref?: string | null; scenario_key?: string | null }) {
  await c.query(`INSERT INTO layer.activity (at, trigger, agent, action, result, autonomy, case_ref, scenario_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [now(), a.trigger, a.agent ?? null, a.action, a.result, a.autonomy ?? null, a.case_ref ?? null, a.scenario_key ?? null]);
}

export async function loadRun(c: PoolClient, id: number, lock = true): Promise<Run> {
  const r = await c.query(`SELECT * FROM layer.runs WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!r.rows[0]) throw new Error(`run ${id} not found`);
  return r.rows[0];
}
export async function loadCase(c: { query: PoolClient['query'] }, id: number): Promise<CaseRow> {
  const k = (await c.query(`SELECT * FROM layer.cases WHERE id=$1`, [id])).rows[0];
  if (!k) throw new Error(`case ${id} not found`);
  return k;
}

export type StartIn = { caseId: number; workflowId: string; title: string; channel: 'SCAN' | 'EVENT' | 'SCENARIO' | 'CHAT' | 'SEED'; payload?: Record<string, any>; scenario?: string | null };

export async function startRun(c: PoolClient, s: StartIn): Promise<Run> {
  const def = wf(s.workflowId);
  const at = now();
  const run = (await c.query(
    `INSERT INTO layer.runs (case_id, workflow_id, title, status, payload, result, channel, scenario_key, created_at, updated_at) VALUES ($1,$2,$3,'RUNNING',$4,'{}',$5,$6,$7,$7) RETURNING *`,
    [s.caseId, def.id, s.title, JSON.stringify(s.payload ?? {}), s.channel, s.scenario ?? null, at],
  )).rows[0] as Run;
  for (const [i, st] of def.steps.entries()) {
    await c.query(`INSERT INTO layer.run_steps (run_id, seq, step_key, actor_type, actor_id, label, status) VALUES ($1,$2,$3,$4,$5,$6,'PENDING')`, [run.id, i + 1, st.key, st.actor_type, st.actor, st.label]);
  }
  await advance(c, run.id);
  return loadRun(c, run.id, false);
}

/** Resolve a HUMAN step's persona from the actor rule and the pending action. Returns null to skip. */
function resolveWho(run: Run, sdef: StepDef): PersonaKey | null {
  const a = sdef.actor;
  if (a.startsWith('approver:')) {
    const action = (run.result?.actionType ?? 'CREDIT') as ActionType;
    const amount = Number(run.result?.amount ?? 0);
    return approverFor(action, amount);
  }
  if (PERSONA[a as PersonaKey]) return a as PersonaKey;
  return null;
}

/** Run steps until the run needs a person, an event, ends, or runs out of steps. */
export async function advance(c: PoolClient, runId: number, event: HCtx['event'] = null) {
  for (let guardN = 0; guardN < 40; guardN++) {
    const run = await loadRun(c, runId);
    if (run.status !== 'RUNNING') return;
    const def = wf(run.workflow_id);
    const kase = await loadCase(c, run.case_id!);
    const step = (await c.query(`SELECT * FROM layer.run_steps WHERE run_id=$1 AND status IN ('PENDING','WAITING_EVENT') ORDER BY seq LIMIT 1`, [runId])).rows[0] as StepRow | undefined;
    if (!step) {
      await c.query(`UPDATE layer.runs SET status='COMPLETED', current_step=NULL, waiting_on_persona=NULL, waiting_event=NULL, closed_at=$2, updated_at=$2 WHERE id=$1`, [runId, now()]);
      return;
    }
    const sdef = def.steps.find((x) => x.key === step.step_key)!;
    const at = now();
    await c.query(`UPDATE layer.run_steps SET status='RUNNING', started_at=COALESCE(started_at,$2) WHERE id=$1`, [step.id, at]);
    await c.query(`UPDATE layer.runs SET current_step=$2, updated_at=$3 WHERE id=$1`, [runId, step.step_key, at]);
    let cachedFacts: SubscriberFacts | null = null;
    const conn: Ctx = { c, actor: sdef.actor, runId };
    const facts = async () => { if (!kase.subscriber_id) throw new Error('No subscriber on this case'); return (cachedFacts ??= await subscriberFacts(conn, kase.subscriber_id)); };

    if (sdef.actor_type === 'HUMAN') {
      const who = resolveWho(run, sdef);
      if (!who) {
        // Above every limit in the demo: escalate rather than pretend.
        if (sdef.actor.startsWith('approver:')) {
          await c.query(`UPDATE layer.run_steps SET status='FAILED', ended_at=$2, decision='No limit holder in this demo may approve this amount' WHERE id=$1`, [step.id, at]);
          await addTrail(c, { actor_type: 'SYSTEM', actor_id: 'hami', actor_name: 'Hami', autonomy: 'A2', act: 'ESCALATE', summary: `Credit of ${run.result?.amount} is above every limit in this demo; escalated to finance for a manual decision outside the workflow.`, case_id: kase.id, case_ref: kase.ref, subject_id: kase.subject_id, run_id: runId, scenario_key: run.scenario_key });
          await c.query(`UPDATE layer.runs SET status='ESCALATED', waiting_on_persona='finance', updated_at=$2 WHERE id=$1`, [runId, now()]);
          await c.query(`INSERT INTO layer.approvals (run_id, step_key, approver_persona, action_type, amount, decision, created_at) VALUES ($1,$2,'finance','DECIDE',$3,'PENDING',$4)`, [runId, sdef.key, run.result?.amount ?? null, now()]);
          await setCaseState(c, kase, 'ESCALATED', 'Hami', 'Above every limit');
          return;
        }
        await c.query(`UPDATE layer.run_steps SET status='SKIPPED', ended_at=$2, decision='Not required' WHERE id=$1`, [step.id, at]);
        continue;
      }
      const actionType = run.result?.actionType ?? 'DECIDE';
      await c.query(`INSERT INTO layer.approvals (run_id, step_key, approver_persona, action_type, amount, decision, created_at) VALUES ($1,$2,$3,$4,$5,'PENDING',$6)`, [runId, sdef.key, who, actionType, run.result?.amount ?? null, at]);
      await c.query(`UPDATE layer.run_steps SET status='WAITING' WHERE id=$1`, [step.id]);
      await c.query(`UPDATE layer.runs SET status='WAITING', waiting_on_persona=$2, waiting_event=NULL, sla_due=$3, updated_at=$4 WHERE id=$1`, [runId, who, new Date(at.getTime() + 2 * 86_400_000), at]);
      await c.query(`UPDATE layer.cases SET owner_persona=$2, updated_at=$3 WHERE id=$1`, [kase.id, who, at]);
      await setCaseState(c, kase, 'AWAITING_APPROVAL', 'Hami', `Waiting on ${PERSONA[who].role}`);
      await addActivity(c, { trigger: `${def.id} ${sdef.key}`, agent: null, action: `Waiting on ${PERSONA[who].role}`, result: sdef.label, case_ref: kase.ref, scenario_key: run.scenario_key });
      return;
    }

    const handler = HANDLERS[`${def.id}:${sdef.key}`] ?? HANDLERS[`*:${sdef.key}`];
    const h: HCtx = {
      c, run, kase, step, def: sdef, wf: def, at, conn, facts, event,
      trail: (t) => addTrail(c, { actor_type: t.actor_type ?? (sdef.actor_type as any), actor_id: t.actor_id ?? sdef.actor, actor_name: t.actor_name ?? agentName(t.actor_id ?? sdef.actor), autonomy: t.autonomy === undefined ? agentAutonomy(t.actor_id ?? sdef.actor) : t.autonomy, case_id: kase.id, case_ref: kase.ref, subject_id: kase.subject_id, run_id: runId, scenario_key: run.scenario_key, ...t }),
      patch: async (p) => { await c.query(`UPDATE layer.runs SET payload = payload || $2::jsonb WHERE id=$1`, [runId, JSON.stringify(p)]); Object.assign(run.payload, p); },
      setResult: async (p) => { await c.query(`UPDATE layer.runs SET result = result || $2::jsonb WHERE id=$1`, [runId, JSON.stringify(p)]); Object.assign(run.result, p); },
      caseState: async (state, note, extra) => { await setCaseState(c, kase, state, agentName(sdef.actor), note, extra); },
      closeCase: async (code, note, state) => { await closeCase(c, kase, code, agentName(sdef.actor), note, state); },
      task: async (t) => (await c.query(`INSERT INTO layer.tasks (kind, case_id, run_id, assignee_persona, title, brief, due, state, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$8) RETURNING id`, [t.kind, kase.id, runId, t.assignee, t.title, t.brief ?? null, new Date(at.getTime() + (t.dueDays ?? 1) * 86_400_000), at])).rows[0].id,
      activity: (a) => addActivity(c, { trigger: a.trigger, agent: a.agent ?? sdef.actor, action: a.action, result: a.result, autonomy: agentAutonomy(a.agent ?? sdef.actor), case_ref: kase.ref, scenario_key: run.scenario_key }),
    };
    let out: StepOutcome;
    await c.query('SAVEPOINT step_sp');
    try {
      out = handler ? await handler(h) : { status: 'DONE', decision: 'No handler: recorded as done (designed step)' };
      await c.query('RELEASE SAVEPOINT step_sp');
    } catch (e: any) {
      await c.query('ROLLBACK TO SAVEPOINT step_sp');
      console.error(`[engine] run ${run.id} ${def.id}:${sdef.key} failed:`, e.message);
      out = { status: 'FAILED', decision: `Error: ${e.message}` };
      await h.trail({ act: 'ESCALATE', summary: `Step failed and was escalated to the workflow owner: ${e.message}` });
      await c.query(`UPDATE layer.runs SET status='ESCALATED', waiting_on_persona='billing_manager', updated_at=$2 WHERE id=$1`, [runId, now()]);
      await c.query(`INSERT INTO layer.approvals (run_id, step_key, approver_persona, action_type, decision, created_at) VALUES ($1,$2,'billing_manager','DECIDE','PENDING',$3)`, [runId, sdef.key, now()]);
    }
    event = null;
    if (out.wait) {
      await c.query(`UPDATE layer.run_steps SET status='WAITING_EVENT', outputs=$2 WHERE id=$1`, [step.id, JSON.stringify(out.outputs ?? {})]);
      await c.query(`UPDATE layer.runs SET status='WAITING_EVENT', waiting_event=$2, waiting_on_persona=NULL, updated_at=$3 WHERE id=$1`, [runId, out.wait, now()]);
      return;
    }
    await c.query(`UPDATE layer.run_steps SET status=$2, decision=$3, outputs=$4, ended_at=$5 WHERE id=$1`, [step.id, out.status ?? 'DONE', out.decision ?? null, JSON.stringify(out.outputs ?? {}), now()]);
    if (out.recommend) await h.setResult({ recommendation: out.recommend });
    if (out.actionType) await h.setResult({ actionType: out.actionType });
    if (out.amount !== undefined) await h.setResult({ amount: out.amount });
    if (out.skip?.length) await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision='Not required', ended_at=$3 WHERE run_id=$1 AND step_key = ANY($2) AND status='PENDING'`, [runId, out.skip, now()]);
    if (out.status === 'FAILED') return;
    if (out.stop) {
      await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision=$3, ended_at=$4 WHERE run_id=$1 AND status='PENDING' AND seq > $2`, [runId, step.seq, out.stop === 'ESCALATED' ? 'Stopped: escalated to a person' : 'Stopped', now()]);
      if (out.stop === 'ESCALATED') await c.query(`UPDATE layer.runs SET status='ESCALATED', updated_at=$2 WHERE id=$1`, [runId, now()]);
      else await c.query(`UPDATE layer.runs SET status=$2, current_step=NULL, waiting_on_persona=NULL, waiting_event=NULL, closed_at=$3, updated_at=$3 WHERE id=$1`, [runId, out.stop, now()]);
      return;
    }
  }
}

/** Resume a run parked on an event with that event. */
export async function resume(c: PoolClient, runId: number, event: { kind: string; payload: Record<string, any> }) {
  const run = await loadRun(c, runId);
  if (run.status !== 'WAITING_EVENT') throw new Error(`run ${runId} is not waiting for an event (${run.status})`);
  await c.query(`UPDATE layer.runs SET status='RUNNING', waiting_event=NULL, updated_at=$2 WHERE id=$1`, [runId, now()]);
  await advance(c, runId, event);
}

export type DecideIn = { runId: number; persona: PersonaKey; decision: 'APPROVED' | 'REJECTED'; reason?: string; edits?: Record<string, any>; scenario?: boolean };

export async function decide(c: PoolClient, d: DecideIn) {
  const run = await loadRun(c, d.runId);
  if (!['WAITING', 'ESCALATED'].includes(run.status)) throw new Error(`Run ${run.id} is not waiting for a decision (${run.status})`);
  const appr = (await c.query(`SELECT * FROM layer.approvals WHERE run_id=$1 AND decision='PENDING' ORDER BY id DESC LIMIT 1`, [run.id])).rows[0];
  if (!appr) throw new Error('No pending approval');
  const p = PERSONA[d.persona];
  const at = now();
  const kase = await loadCase(c, run.case_id!);
  const rec = run.result?.recommendation as StepOutcome['recommend'] | undefined;
  const overrides = !!rec && ((rec.verdict === 'DECLINE' && d.decision === 'APPROVED') || (rec.verdict === 'APPROVE' && d.decision === 'REJECTED'));
  if (overrides && !d.reason) throw new Error('A reason is required when the decision differs from the agent’s recommendation.');
  if (d.edits) await c.query(`UPDATE layer.runs SET payload = payload || $2::jsonb WHERE id=$1`, [run.id, JSON.stringify(d.edits)]);
  await c.query(`UPDATE layer.approvals SET decision=$2, reason=$3, decided_at=$4, decided_by=$5 WHERE id=$1`, [appr.id, d.decision, d.reason ?? null, at, d.persona]);
  const stepLabel = wf(run.workflow_id).steps.find((s) => s.key === appr.step_key)!;
  const verb = d.decision === 'APPROVED' ? 'Approved' : 'Declined';
  await addTrail(c, {
    actor_type: 'HUMAN', actor_id: d.persona, actor_name: `${p.name} (${p.role})${d.scenario ? ' · decided in the scenario' : ''}`, autonomy: null,
    act: overrides ? 'OVERRIDE' : d.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
    summary: `${verb}: ${stepLabel.label} (${String(appr.action_type).replace(/_/g, ' ').toLowerCase()}${appr.amount ? ` ${appr.amount}` : ''})${d.reason ? ` — ${d.reason}` : ''}`,
    override: overrides, reason: d.reason, case_id: kase.id, case_ref: kase.ref, subject_id: kase.subject_id, run_id: run.id, scenario_key: run.scenario_key,
  });
  await addActivity(c, { trigger: `${p.role} decided`, agent: null, action: `${verb}: ${stepLabel.label}`, result: d.reason ?? '', case_ref: kase.ref, scenario_key: run.scenario_key });
  await c.query(`UPDATE layer.run_steps SET status='DONE', decision=$3, ended_at=$4 WHERE run_id=$1 AND step_key=$2`, [run.id, appr.step_key, `${verb} by ${p.name}`, at]);
  await c.query(`UPDATE layer.runs SET payload = payload || $2::jsonb WHERE id=$1`, [run.id, JSON.stringify({ lastDecision: d.decision, lastDecisionReason: d.reason ?? null, lastDecidedBy: d.persona, approvalRef: `APR-${appr.id}` })]);
  if (d.decision === 'APPROVED' && appr.action_type === 'REVERSE_CREDIT') {
    const conn: Ctx = { c, actor: 'munaffidh', runId: run.id };
    let cachedFacts: SubscriberFacts | null = null;
    await executeReversal({
      c, run, kase, at, conn,
      facts: async () => (cachedFacts ??= await subscriberFacts(conn, kase.subscriber_id!)),
      trail: (t) => addTrail(c, { actor_type: t.actor_type ?? 'SYSTEM', actor_id: t.actor_id ?? 'munaffidh', actor_name: t.actor_name ?? agentName(t.actor_id ?? 'munaffidh'), autonomy: t.autonomy === undefined ? 'A2' : t.autonomy, case_id: kase.id, case_ref: kase.ref, subject_id: kase.subject_id, run_id: run.id, scenario_key: run.scenario_key, ...t }),
      caseState: async (state, note, extra) => { await setCaseState(c, kase, state, p.name, note, extra); },
      closeCase: async (code, note, state) => { await closeCase(c, kase, code, p.name, note, state); },
    }, d.reason ?? 'Reversal approved by finance');
    return;
  }
  if (d.decision === 'APPROVED') {
    await setCaseState(c, kase, 'APPROVED', p.name, d.reason);
    await c.query(`UPDATE layer.runs SET status='RUNNING', waiting_on_persona=NULL, sla_due=NULL, updated_at=$2 WHERE id=$1`, [run.id, at]);
    await advance(c, run.id);
  } else {
    await c.query(`UPDATE layer.run_steps SET status='SKIPPED', decision='Declined upstream', ended_at=$2 WHERE run_id=$1 AND status='PENDING'`, [run.id, at]);
    await c.query(`UPDATE layer.runs SET status='REJECTED', waiting_on_persona=NULL, sla_due=NULL, closed_at=$2, updated_at=$2 WHERE id=$1`, [run.id, at]);
    await closeCase(c, kase, 'DECLINED', p.name, d.reason, 'DECLINED');
    // A declined recommendation is an outcome against the workflow's accuracy.
    await c.query(`INSERT INTO layer.outcomes (workflow_id, case_ref, at, delegated, correct, note) VALUES ($1,$2,$3,false,false,$4)`, [run.workflow_id, kase.ref, at, `Declined by ${p.role}: ${d.reason ?? ''}`]);
  }
}

export async function setCaseState(c: { query: PoolClient['query'] }, kase: CaseRow, state: CaseState, actor: string, note?: string, extra: Record<string, any> = {}) {
  const at = now();
  const sets = Object.keys(extra).map((k, i) => `${k}=$${i + 4}`);
  await c.query(`UPDATE layer.cases SET state=$2, updated_at=$3${sets.length ? ', ' + sets.join(', ') : ''} WHERE id=$1`, [kase.id, state, at, ...Object.values(extra)]);
  if (kase.state !== state) await c.query(`INSERT INTO layer.case_events (case_id, at, from_state, to_state, actor, note) VALUES ($1,$2,$3,$4,$5,$6)`, [kase.id, at, kase.state, state, actor, note ?? null]);
  kase.state = state;
}
export async function closeCase(c: { query: PoolClient['query'] }, kase: CaseRow, code: string, actor: string, note?: string, state: CaseState = 'CLOSED') {
  const at = now();
  await c.query(`UPDATE layer.cases SET state=$2, close_code=$3, closed_at=$4, updated_at=$4 WHERE id=$1`, [kase.id, state, code, at]);
  await c.query(`INSERT INTO layer.case_events (case_id, at, from_state, to_state, actor, note) VALUES ($1,$2,$3,$4,$5,$6)`, [kase.id, at, kase.state, state, actor, `${code}${note ? ` — ${note}` : ''}`]);
  kase.state = state;
}
