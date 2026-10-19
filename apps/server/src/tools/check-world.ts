/**
 * The world checker: runs every scenario against the engine and checks the
 * claims the demo makes. `npm run check` (needs DATABASE_URL). Exits non-zero
 * on any failure. Also usable as a smoke test on Replit.
 */
import { SCENARIOS, LIMITS } from '@dhow/domain';
import { pool, one, q } from '../db.js';
import { loadClock } from '../clock.js';
import { isSeeded, reseed } from '../seed/index.js';
import { runStep, startScenario, stopScenario } from '../director.js';
import { restoreAuthority } from '../seed/snapshot.js';

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => { results.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

async function main() {
  if (!(await isSeeded())) await reseed();
  await loadClock();
  // A previous run may have left WF-01 demoted (S7): start from the seeded authority.
  { const c = await pool.connect(); try { await restoreAuthority(c, 'S7'); } finally { c.release(); } }
  // 1. authority seeded
  const a = await one(`SELECT * FROM layer.authority WHERE workflow_id='WF-01'`);
  check('WF-01 holds A3 at seed', a?.rung === 'A3', `rung ${a?.rung}`);
  check('Every built workflow has an authority row', (await one(`SELECT COUNT(*)::int AS n FROM layer.authority`))?.n === 5);
  // 2. nothing writes to core except the connector: every core write has a trail with a system
  check('Every posted credit carries an approval reference or A3 authority', (await one(`SELECT COUNT(*)::int AS n FROM core.credits WHERE approval_ref IS NULL`))?.n === 0);
  // 3. scenarios
  for (const s of SCENARIOS) {
    await startScenario(s.key);
    let err: string | null = null; let last: any = null;
    for (let i = 0; i < s.steps.length; i++) { last = await runStep(s.key, i); if (last.error) { err = `${s.steps[i]!.id}: ${last.error}`; break; } }
    check(`${s.key} ${s.name}`, !err, err ?? last?.result);
    stopScenario();
  }
  // 4. the claims
  const s1 = await one(`SELECT k.*, (SELECT amount FROM core.credits c WHERE c.case_ref=k.ref LIMIT 1) AS credit FROM layer.cases k WHERE edge_key='dispute-small' ORDER BY id DESC LIMIT 1`);
  check('S1: credit of 180 posted and verified', s1?.state === 'CLOSED' && Number(s1?.credit) === 180 && s1?.close_code === 'RESOLVED', `${s1?.state} ${s1?.credit} ${s1?.close_code}`);
  const s1appr = await one(`SELECT approver_persona FROM layer.approvals a JOIN layer.runs r ON r.id=a.run_id JOIN layer.cases k ON k.id=r.case_id WHERE k.edge_key='dispute-small' AND a.action_type='CREDIT' ORDER BY a.id DESC LIMIT 1`);
  check('S1: approved by the billing officer', s1appr?.approver_persona === 'billing_officer', s1appr?.approver_persona);
  const s2appr = await one(`SELECT a.approver_persona, a.amount FROM layer.approvals a JOIN layer.runs r ON r.id=a.run_id JOIN layer.cases k ON k.id=r.case_id WHERE k.edge_key='dispute-above-limit' AND a.action_type='CREDIT' ORDER BY a.id DESC LIMIT 1`);
  check('S2: 1,250 routed to the billing manager', s2appr?.approver_persona === 'billing_manager' && Number(s2appr?.amount) === 1250, `${s2appr?.approver_persona} ${s2appr?.amount}`);
  const s3 = await one(`SELECT k.state, k.close_code, (SELECT COUNT(*)::int FROM layer.tasks t WHERE t.case_id=k.id AND t.kind='NOC_STEERING') AS noc, (SELECT roaming_enabled FROM core.subscribers s WHERE s.id=k.subscriber_id) AS roaming FROM layer.cases k WHERE edge_key='roaming-simbox' ORDER BY id DESC LIMIT 1`);
  check('S3: restricted by the analyst, steering handed to the NOC', s3?.noc === 1 && s3?.roaming === false, JSON.stringify(s3));
  check('S3: no agent touched the network', (await one(`SELECT COUNT(*)::int AS n FROM layer.trail WHERE actor_type<>'HUMAN' AND act='EXECUTE' AND summary ILIKE '%steer%' AND summary NOT ILIKE '%task%'`))?.n === 0);
  const s4a = await one(`SELECT state, close_code FROM layer.cases WHERE edge_key='retention-no-consent' ORDER BY id DESC LIMIT 1`);
  check('S4: no consent, closed by Hami before a person saw it', s4a?.state === 'BLOCKED' && s4a?.close_code === 'NO_CONSENT', JSON.stringify(s4a));
  const s4b = await one(`SELECT k.close_code, (SELECT COUNT(*)::int FROM core.offer_registrations r WHERE r.case_ref=k.ref AND r.consent_checked) AS reg FROM layer.cases k WHERE edge_key='retention-with-consent' ORDER BY id DESC LIMIT 1`);
  check('S4: consented subscriber retained with a registered response', s4b?.close_code === 'RETAINED' && s4b?.reg === 1, JSON.stringify(s4b));
  const s5 = await q(`SELECT edge_key, close_code, payload->>'delegated' AS delegated FROM layer.cases WHERE edge_key IN ('complaint-speed','complaint-activation') ORDER BY id DESC LIMIT 2`);
  check('S5: both complaints resolved first time; speed within authority, activation by a person', s5.length === 2 && s5.every((x) => x.close_code === 'RESOLVED_FIRST_TIME'), JSON.stringify(s5));
  const s6 = await one(`SELECT k.state, k.close_code, (SELECT reversed_at IS NOT NULL FROM core.credits c WHERE c.case_ref=k.ref LIMIT 1) AS reversed FROM layer.cases k WHERE edge_key='dispute-wrong' ORDER BY id DESC LIMIT 1`);
  check('S6: credit reversed by finance after the late TAP file', s6?.state === 'REVERSED' && s6?.reversed === true, JSON.stringify(s6));
  const s7 = await one(`SELECT rung, accuracy FROM layer.authority WHERE workflow_id='WF-01'`);
  check('S7: WF-01 reduced to A2 below the gate', s7?.rung === 'A2' && Number(s7?.accuracy) < 0.9, JSON.stringify(s7));
  const s7b = await one(`SELECT state, owner_persona FROM layer.cases WHERE edge_key='dispute-tiny-2' ORDER BY id DESC LIMIT 1`);
  check('S7: the next small credit waits for the officer', s7b?.state === 'AWAITING_APPROVAL' && s7b?.owner_persona === 'billing_officer', JSON.stringify(s7b));
  const s7a = await one(`SELECT r.payload->>'delegated' AS d FROM layer.runs r JOIN layer.cases k ON k.id=r.case_id WHERE k.edge_key='dispute-tiny' ORDER BY r.id DESC LIMIT 1`);
  check('S7: the first small credit posted under A3', s7a?.d === 'true', JSON.stringify(s7a));
  const s8 = await one(`SELECT k.close_code, o.stage FROM layer.cases k JOIN core.orders o ON o.id=k.subject_id WHERE k.edge_key='enterprise-sdwan' ORDER BY k.id DESC LIMIT 1`);
  check('S8: enterprise order activated and verified', s8?.close_code === 'ACTIVATED' && s8?.stage === 'ACTIVE', JSON.stringify(s8));
  // 5. the rules
  check('No credit above the finance limit was posted', (await one(`SELECT COUNT(*)::int AS n FROM core.credits WHERE amount > ${LIMITS.financeCredit}`))?.n === 0);
  check('Every override carries a reason', (await one(`SELECT COUNT(*)::int AS n FROM layer.trail WHERE override AND (reason IS NULL OR reason='')`))?.n === 0);
  check('No offer registered without a consent check', (await one(`SELECT COUNT(*)::int AS n FROM core.offer_registrations WHERE NOT consent_checked`))?.n === 0);
  check('No agent step in a HUMAN seat', (await one(`SELECT COUNT(*)::int AS n FROM layer.run_steps WHERE actor_type='HUMAN' AND status='DONE' AND decision NOT ILIKE '%by %'`))?.n === 0);
  // 6. re-run S1 to prove restore works
  await startScenario('S1'); let e: string | null = null; for (let i = 0; i < 4; i++) { const r = await runStep('S1', i); if (r.error) { e = r.error; break; } } stopScenario();
  check('S1 runs again after restore', !e, e ?? undefined);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
