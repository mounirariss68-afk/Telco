/**
 * The promotion gate (Agent Authority Model). Each built workflow has one
 * delegated action it may perform without a person while it holds the rung;
 * exposure sets the ceiling, evidence moves the rung within it. Reduction is
 * automatic (the safe direction needs no permission); raising it needs the
 * owner's approval once the window is back above the gate.
 */
import type { PoolClient } from 'pg';
import { BUILT_WORKFLOWS, LIMITS, type Autonomy } from '@dhow/domain';
import type { Q } from '../db.js';
import { now } from '../clock.js';
import { addTrail, addActivity } from './core.js';

export type AuthorityRow = { workflow_id: string; rung: Autonomy; ceiling: Autonomy; delegated_action: string; delegated_limit: number | null; gate: number; window_size: number; accuracy: number; decisions: number; changed_at: string; changed_by: string; note: string | null };

export const DEFAULT_AUTHORITY: Record<string, { rung: Autonomy; action: string; limit: number | null; note: string }> = {
  'WF-01': { rung: 'A3', action: 'Credit under the small-credit limit', limit: LIMITS.smallCredit, note: 'Earned on 12 September 2026: 50 consecutive small-credit proposals, 96% accepted at verification. Approved by the billing manager.' },
  'WF-02': { rung: 'A2', action: 'none: every restriction and query needs the analyst', limit: null, note: 'Ceiling A2 by exposure: a restriction is a customer-facing, partner-facing action.' },
  'WF-03': { rung: 'A2', action: 'none: every response needs the CVM manager', limit: null, note: 'Ceiling A2 by exposure: offers touch consent and fairness.' },
  'WF-04': { rung: 'A3', action: 'Resolve a complaint with an explanation or an add-on under the small-credit limit', limit: LIMITS.smallCredit, note: 'Earned on 2 September 2026 over 50 resolutions with 94% first-time resolution.' },
  'WF-05': { rung: 'A2', action: 'none: quotes need commercial approval; provisioning is never the agent’s', limit: null, note: 'Ceiling A2 by exposure.' },
};

export async function ensureAuthority(c: Q) {
  for (const w of BUILT_WORKFLOWS) {
    const d = DEFAULT_AUTHORITY[w.id];
    await c.query(`INSERT INTO layer.authority (workflow_id, rung, ceiling, delegated_action, delegated_limit, gate, window_size, accuracy, decisions, changed_at, changed_by, note) VALUES ($1,$2,$3,$4,$5,0.90,50,0.96,50,$6,'billing_manager',$7) ON CONFLICT (workflow_id) DO NOTHING`, [w.id, d.rung, w.ceiling, d.action, d.limit, new Date('2026-09-12T06:00:00Z'), d.note]);
  }
}
export const authorityOf = async (c: Q, wfId: string): Promise<AuthorityRow> => (await c.query(`SELECT * FROM layer.authority WHERE workflow_id=$1`, [wfId])).rows[0];
export const allAuthority = async (c: Q): Promise<AuthorityRow[]> => (await c.query(`SELECT * FROM layer.authority ORDER BY workflow_id`)).rows;

/** Record a verified outcome and apply the gate. Returns the change if one happened. */
export async function recordOutcome(c: PoolClient, p: { workflowId: string; caseRef: string | null; delegated: boolean; correct: boolean; note: string; scenario?: string | null }) {
  await c.query(`INSERT INTO layer.outcomes (workflow_id, case_ref, at, delegated, correct, note) VALUES ($1,$2,$3,$4,$5,$6)`, [p.workflowId, p.caseRef, now(), p.delegated, p.correct, p.note]);
  return applyGate(c, p.workflowId, p.scenario ?? null);
}

export async function applyGate(c: PoolClient, workflowId: string, scenario: string | null) {
  const a = await authorityOf(c, workflowId);
  if (!a) return null;
  const rows = (await c.query(`SELECT correct FROM layer.outcomes WHERE workflow_id=$1 ORDER BY id DESC LIMIT $2`, [workflowId, a.window_size])).rows;
  // The window starts from the seeded 96% over 50 decisions; new outcomes replace the oldest.
  const seededCorrect = Math.round(0.96 * a.window_size);
  const n = rows.length;
  const correctNew = rows.filter((r: any) => r.correct).length;
  const remaining = Math.max(0, a.window_size - n);
  const accuracy = (correctNew + Math.round(seededCorrect * (remaining / a.window_size))) / a.window_size;
  await c.query(`UPDATE layer.authority SET accuracy=$2, decisions=$3 WHERE workflow_id=$1`, [workflowId, accuracy.toFixed(3), a.window_size]);
  if (accuracy < a.gate && a.rung === 'A3') {
    const at = now();
    await c.query(`UPDATE layer.authority SET rung='A2', changed_at=$2, changed_by='hami', note=$3 WHERE workflow_id=$1`, [workflowId, at, `Reduced automatically: accuracy ${(accuracy * 100).toFixed(0)}% over the last ${a.window_size} decisions, below the ${Math.round(a.gate * 100)}% gate. Raising it again needs the owner’s approval after ${a.window_size} decisions above the gate.`]);
    await c.query(`INSERT INTO layer.authority_history (workflow_id, at, from_rung, to_rung, accuracy, direction, by, reason) VALUES ($1,$2,'A3','A2',$3,'DOWN','hami',$4)`, [workflowId, at, accuracy.toFixed(3), `Accuracy fell below the gate (${(accuracy * 100).toFixed(0)}% < ${Math.round(a.gate * 100)}%)`]);
    await addTrail(c, { actor_type: 'SYSTEM', actor_id: 'hami', actor_name: 'Hami', autonomy: 'A2', act: 'AUTHORITY_DOWN', summary: `${workflowId}: authority reduced from A3 to A2. Accuracy ${(accuracy * 100).toFixed(0)}% over the last ${a.window_size} decisions is below the ${Math.round(a.gate * 100)}% gate. Small credits now need a person.`, before: { rung: 'A3' }, after: { rung: 'A2' }, clause: 'AAM · promotion gate', scenario_key: scenario });
    await addActivity(c, { trigger: 'Verification outcome', agent: 'hami', action: `Reduced ${workflowId} to A2`, result: `accuracy ${(accuracy * 100).toFixed(0)}% < gate`, autonomy: 'A2', scenario_key: scenario });
    await c.query(`INSERT INTO layer.tasks (kind, case_id, run_id, assignee_persona, title, brief, due, state, created_at) VALUES ('AUTHORITY_CHANGED', NULL, NULL, 'billing_manager', $1, $2, $3, 'OPEN', $4)`, [`${workflowId} authority reduced to A2`, `Hami reduced the dispute workflow’s authority: ${(accuracy * 100).toFixed(0)}% accuracy over the last ${a.window_size} decisions. Every small credit now waits for the officer. Review the three wrong credits in the trail.`, new Date(at.getTime() + 2 * 86_400_000), at]);
    return { from: 'A3', to: 'A2', accuracy };
  }
  return null;
}
