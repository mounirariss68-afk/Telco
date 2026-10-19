/**
 * The Demo Director: runs a scenario's steps against the live engine. Nothing
 * is faked in the UI; every step is a real case, a real decision by the named
 * persona, a real event. Fixtures are restored when a scenario starts so it
 * can be run again.
 */
import { SCENARIO, type ScenarioDef, type ScenarioStep } from '@dhow/domain';
import { pool, tx } from './db.js';
import { now, today, tick, persistClock, isVirtual, setClock } from './clock.js';
import { decide, resume, addTrail } from './engine/core.js';
import { applyGate } from './engine/authority.js';
import { scan } from './agents/raqib.js';
import { restoreAuthority, restoreFixture } from './seed/snapshot.js';

type State = { key: string; index: number; lastRef: string | null; refs: string[]; startedAt: string };
let state: State | null = null;
export const currentScenario = () => (state ? { key: state.key, step: state.index, lastRef: state.lastRef } : null);
export const stopScenario = () => { state = null; };

const FIXTURES_OF: Record<string, string[]> = {
  S1: ['dispute-small'], S2: ['dispute-above-limit'], S3: ['roaming-simbox'], S4: ['retention-no-consent', 'retention-with-consent'], S5: ['complaint-speed', 'complaint-activation'], S6: ['dispute-wrong'], S7: ['dispute-tiny', 'dispute-tiny-2'], S8: ['enterprise-sdwan'],
};
const FIXTURE_ORDER: Record<string, string[]> = { S4: ['retention-no-consent', 'retention-with-consent'], S5: ['complaint-speed', 'complaint-activation'], S7: ['dispute-tiny', 'dispute-tiny-2'] };

export async function startScenario(key: string) {
  const def = SCENARIO[key]; if (!def) throw new Error(`Unknown scenario ${key}`);
  const restored: string[] = [];
  await tx(async (c) => {
    for (const f of FIXTURES_OF[key] ?? []) if (await restoreFixture(c, f)) restored.push(f);
    if (def.workflowId === 'WF-01') await restoreAuthority(c, key);
  });
  if (!isVirtual()) { setClock(now()); await persistClock(); }
  state = { key, index: -1, lastRef: null, refs: [], startedAt: now().toISOString() };
  return { scenario: def, restored };
}

function screenFor(st: ScenarioStep, ref: string | null) {
  if (st.screen === 'case') return ref ? `case:${ref}` : 'cases';
  if (st.screen === 'trail') return ref ? `trail:case=${ref}` : 'trail';
  return st.screen;
}

export async function runStep(key: string, index: number) {
  const def = SCENARIO[key]; if (!def) throw new Error(`Unknown scenario ${key}`);
  if (!state || state.key !== key) await startScenario(key);
  const st = def.steps[index]; if (!st) throw new Error(`No step ${index}`);
  const t0 = now();
  let result = '';
  let error: string | null = null;
  try {
    await tx(async (c) => {
      const a = st.action;
      if (a.kind === 'open') {
        const opened = await scan(c, { onlyEdge: a.fixture, scenario: key });
        if (!opened.length) throw new Error(`Fixture ${a.fixture} had nothing to open (already opened?)`);
        state!.lastRef = opened[0]!; state!.refs.push(...opened);
        const k = (await c.query(`SELECT state, owner_persona FROM layer.cases WHERE ref=$1`, [opened[0]])).rows[0];
        result = `Opened ${opened[0]}; now ${String(k.state).replace(/_/g, ' ').toLowerCase()}${k.owner_persona ? `, waiting on ${k.owner_persona.replace(/_/g, ' ')}` : ''}.`;
      } else if (a.kind === 'decide') {
        const ref = state!.lastRef; if (!ref) throw new Error('No case open in this scenario');
        const run = (await c.query(`SELECT r.* FROM layer.runs r JOIN layer.cases k ON k.id=r.case_id WHERE k.ref=$1 AND r.status IN ('WAITING','ESCALATED') ORDER BY r.id DESC LIMIT 1`, [ref])).rows[0];
        if (!run) throw new Error(`${ref} is not waiting for a decision`);
        await decide(c, { runId: run.id, persona: a.persona, decision: a.decision, reason: a.reason, scenario: true });
        const k = (await c.query(`SELECT state FROM layer.cases WHERE ref=$1`, [ref])).rows[0];
        result = `${a.persona.replace(/_/g, ' ')} ${a.decision.toLowerCase()}; ${ref} is now ${String(k.state).replace(/_/g, ' ').toLowerCase()}.`;
      } else if (a.kind === 'verify' || a.kind === 'event') {
        const refs = state!.refs.length ? state!.refs : [state!.lastRef!];
        if (key === 'S6') {
          // The partner's late TAP file arrives: both sessions now carry a receipt date and their distinct cell identifiers.
          await c.query(`UPDATE core.usage u SET tap_received_on=$1::date FROM core.subscribers s WHERE s.id=u.subscriber_id AND s.edge_key='dispute-wrong' AND u.partner_id='P-02'`, [today()]);
        }
        if (a.kind === 'verify') { tick(14 * 86_400_000); await persistClock(); }
        let n = 0;
        for (const ref of refs) {
          const run = (await c.query(`SELECT r.* FROM layer.runs r JOIN layer.cases k ON k.id=r.case_id WHERE k.ref=$1 AND r.status='WAITING_EVENT' ORDER BY r.id DESC LIMIT 1`, [ref])).rows[0];
          if (!run) continue;
          if (a.kind === 'event' && a.event === 'PROVISIONED') await c.query(`UPDATE layer.tasks SET state='DONE', outcome='Provisioned and tested', done_at=$2 WHERE run_id=$1 AND kind='PROVISION'`, [run.id, now()]);
          await resume(c, run.id, { kind: a.kind === 'verify' ? 'VERIFY' : a.event, payload: {} });
          n++;
        }
        result = a.kind === 'verify' ? `Clock advanced fourteen days; Muraqib verified ${n} case${n === 1 ? '' : 's'}.` : `${a.event.replace(/_/g, ' ').toLowerCase()}: ${n} run${n === 1 ? '' : 's'} resumed.`;
      } else if (a.kind === 'overrides') {
        for (let i = 0; i < a.n; i++) await c.query(`INSERT INTO layer.outcomes (workflow_id, case_ref, at, delegated, correct, note) VALUES ('WF-01', NULL, $1, true, false, $2)`, [new Date(t0.getTime() - (a.n - i) * 86_400_000), `[${key}] Small credit posted under A3 found not due at verification (${['duplicate already credited in August', 'partner TAP record arrived late', 'add-on was active on a second line'][i % 3]})`]);
        await addTrail(c, { actor_type: 'AGENT', actor_id: 'muraqib', actor_name: 'Muraqib', autonomy: 'A1', act: 'VERIFY', summary: `Verification over the week found ${a.n} small credits posted under A3 authority that were not due. Each is recorded as a wrong outcome against WF-01.`, scenario_key: key });
        const change = await applyGate(c, 'WF-01', key);
        result = change ? `Accuracy ${(change.accuracy * 100).toFixed(0)}%: Hami reduced WF-01 from ${change.from} to ${change.to}.` : 'Outcomes recorded; the gate did not trigger.';
      } else {
        result = 'Showing.';
      }
    });
  } catch (e: any) { error = e.message; result = `Could not run the step: ${e.message}`; }
  state!.index = index;
  const changes = await changesSince(t0, key);
  return { step: { ...st, screenResolved: screenFor(st, state!.lastRef) }, result, error, changes, clock: { now: now().toISOString(), today: today() } };
}

async function changesSince(t0: Date, key: string) {
  const cases = (await pool.query(`SELECT ref, state, close_code, subject_id FROM layer.cases WHERE scenario_key=$1 AND updated_at >= $2`, [key, t0])).rows;
  const tasks = (await pool.query(`SELECT id, kind, assignee_persona, title FROM layer.tasks WHERE created_at >= $1`, [t0])).rows;
  const messages = (await pool.query(`SELECT id, template, lang, subscriber_id FROM layer.messages WHERE sent_at >= $1`, [t0])).rows;
  const trail = (await pool.query(`SELECT COUNT(*)::int AS n FROM layer.trail WHERE at >= $1`, [t0])).rows[0].n;
  const activity = (await pool.query(`SELECT id, agent, action, result FROM layer.activity WHERE at >= $1 ORDER BY id`, [t0])).rows;
  return { cases, tasks, messages, trail, activity };
}
export const scenarioDefs = (): ScenarioDef[] => Object.values(SCENARIO);
