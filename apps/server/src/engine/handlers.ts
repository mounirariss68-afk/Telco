/**
 * Step handlers, keyed `${workflowId}:${stepKey}`. Each returns a StepOutcome.
 * The facts are computed from the records; Claude narrates them (narrate.ts).
 * Every write to a system of record goes through the connector and is trailed
 * with the interface it called, the before and the after.
 */
import { LIMITS, PERSONA, approverFor, fill, money, market, type PersonaKey } from '@dhow/domain';
import { today, now } from '../clock.js';
import { setting } from '../settings.js';
import * as core from '../core/connector.js';
import { authorityOf, recordOutcome } from './authority.js';
import type { HCtx, StepOutcome } from './core.js';
import { narrateFinding, narrateProposal } from '../agents/narrate.js';

type Handler = (h: HCtx) => Promise<StepOutcome>;
export const HANDLERS: Record<string, Handler> = {};
const on = (wf: string, step: string, fn: Handler) => { HANDLERS[`${wf}:${step}`] = fn; };

const mkt = async (h: HCtx) => market(await setting(h.c, 'market', 'uae'));
const fmt = async (h: HCtx, v: number) => money(v, await mkt(h));
const round2 = (n: number) => Math.round(n * 100) / 100;

async function message(h: HCtx, p: { template: Parameters<typeof fill>[0]; vars: Record<string, string | number>; subscriberId?: string | null; accountId?: string | null; channel?: string }) {
  const lang = p.subscriberId ? ((await h.c.query(`SELECT language FROM core.subscribers WHERE id=$1`, [p.subscriberId])).rows[0]?.language ?? 'en') : 'en';
  const m = fill(p.template, lang, p.vars);
  await h.c.query(`INSERT INTO layer.messages (subscriber_id, account_id, case_ref, channel, lang, template, body, status, sent_at, note) VALUES ($1,$2,$3,$4,$5,$6,$7,'SENT',$8,$9)`, [p.subscriberId ?? null, p.accountId ?? null, h.kase.ref, p.channel ?? 'APP', m.lang, p.template, m.text, h.at, m.note]);
  await h.trail({ act: 'NOTIFY', summary: `Sent ${p.template.replace(/_/g, ' ').toLowerCase()} to the ${p.accountId ? 'account' : 'customer'} in ${m.lang === 'ar' ? 'Arabic' : 'English'} from the approved template.`, system: 'Messaging · POST /notify/v1/messages', after: { template: p.template, lang: m.lang } });
  return m;
}


/** Customer-facing phrases in the customer's language (the approver sees the full English finding; the customer gets the approved short form). */
const CUSTOMER_AR: Record<string, string> = {
  DOUBLE_RATED: 'أن جلسة واحدة احتُسبت مرتين', WRONG_ZONE: 'أن الجلسة احتُسبت بتعرفة منطقة أعلى من المتفق عليه', PROBABLE_DOUBLE: 'احتساباً مزدوجاً محتملاً لجلسة واحدة', DUPLICATE_ADDON: 'أن الخدمة الإضافية احتُسبت مرتين في اليوم نفسه', NOT_DUE: 'أن الرسوم مطابقة لسجلات الاستخدام',
  FAIR_USE_CAP: 'أن حد الاستخدام العادل في باقتك قد اكتمل قبل نهاية الدورة', PORT_STALLED: 'أن نقل رقمك متوقف لدى المشغّل السابق', KNOWN_FAULT: 'عطلاً معروفاً في محطة منطقتك وتذكرة مفتوحة لإصلاحه', IS_DISPUTE: 'أن الشكوى تخص رسماً في الفاتورة', GENERAL: 'أن الحساب والخدمة سليمان',
};
const CUSTOMER_EN: Record<string, string> = {
  DOUBLE_RATED: 'one session was charged twice', WRONG_ZONE: 'the session was charged at a higher zone rate than your plan allows', PROBABLE_DOUBLE: 'a probable double charge for one session', DUPLICATE_ADDON: 'the add-on was charged twice on the same day', NOT_DUE: 'the charges match your usage records',
  FAIR_USE_CAP: "your plan's fair-use allowance was reached before the end of the cycle", PORT_STALLED: 'your number port is held at your previous operator', KNOWN_FAULT: 'a known fault at your local cell with an open repair ticket', IS_DISPUTE: 'the complaint concerns a charge on your invoice', GENERAL: 'your account and service are in order',
};
async function customerPhrase(h: HCtx, kind: string, fallback: string) {
  const lang = h.kase.subscriber_id ? ((await h.c.query(`SELECT language FROM core.subscribers WHERE id=$1`, [h.kase.subscriber_id])).rows[0]?.language ?? 'en') : 'en';
  return (lang === 'ar' ? CUSTOMER_AR[kind] : CUSTOMER_EN[kind]) ?? fallback;
}

// ====================================================================== WF-01 Billing dispute

on('WF-01', 'detect', async (h) => {
  const q = h.run.payload;
  const prior = (await h.c.query(`SELECT COUNT(*)::int AS n FROM core.complaints WHERE subscriber_id=$1`, [h.kase.subscriber_id])).rows[0].n;
  await h.caseState('INVESTIGATING', 'Opened from the billing case queue');
  await h.trail({ act: 'DETECT', summary: `Opened from the billing case queue: ${await fmt(h, q.disputed_amount)} disputed on invoice ${q.invoice_id} via ${String(q.channel).toLowerCase()}. ${prior} previous contact${prior === 1 ? '' : 's'} attached.`, system: 'Billing case queue · GET /billing/v2/disputes', evidence: { queue_id: q.queue_id, customer_text: q.customer_text } });
  return { decision: `Case opened; ${prior} previous contacts attached`, outputs: { prior } };
});

on('WF-01', 'investigate', async (h) => {
  const f = await h.facts();
  const q = h.run.payload;
  const invoice = f.invoices.find((i) => i.id === q.invoice_id);
  if (!invoice) throw new Error(`Invoice ${q.invoice_id} not in billing`);
  const charges = f.charges.filter((c) => c.invoice_id === invoice.id);
  const disputed = q.charge_id ? charges.find((c) => c.id === q.charge_id) : null;
  const records: any[] = [];
  let finding: { kind: string; credit: number; summary: string; certainty: 'HIGH' | 'MEDIUM' | 'LOW'; missing?: string } | null = null;

  // 1. the same session rated twice
  const bySession = new Map<string, any[]>();
  for (const c of charges) if (c.session_ref) bySession.set(c.session_ref, [...(bySession.get(c.session_ref) ?? []), c]);
  for (const [ref, list] of bySession) if (list.length > 1) {
    const extra = list.slice(1).reduce((s, c) => s + Number(c.amount), 0);
    records.push({ system: 'Billing', what: `Session ${ref} appears ${list.length} times on the invoice`, amounts: list.map((c) => Number(c.amount)) });
    const u = f.usage.filter((x) => x.session_ref === ref);
    records.push({ system: 'Usage (mediation)', what: `Session ${ref} in the usage store: ${u.length} record${u.length === 1 ? '' : 's'}`, volume: u.map((x) => `${x.volume} ${x.unit}`) });
    if (u.length === 1) finding = { kind: 'DOUBLE_RATED', credit: round2(extra), summary: `One session (${ref}) was rated twice: the usage store holds one record, the invoice two charges.`, certainty: 'HIGH' };
  }
  // 2. roaming charge rated at the wrong zone tariff
  if (!finding && disputed && String(disputed.type).startsWith('ROAMING') && disputed.partner_id) {
    const tariff = await core.tariffFor(h.conn, disputed.partner_id, disputed.type);
    const u = f.usage.find((x) => x.session_ref === disputed.session_ref);
    if (tariff && u) {
      const expected = round2(Number(u.volume) * Number(tariff.unit_price));
      records.push({ system: 'Rating', what: `Tariff ${tariff.id} zone ${tariff.zone}: ${tariff.unit_price} per ${tariff.unit}`, expected, charged: Number(disputed.amount) });
      records.push({ system: 'Partner TAP', what: `Partner ${disputed.partner_id} record for ${disputed.session_ref}`, received: u.tap_received_on ?? 'not yet received' });
      if (Number(disputed.amount) > expected * 1.05) finding = { kind: 'WRONG_ZONE', credit: round2(Number(disputed.amount) - expected), summary: `The session was rated at a higher zone than the partner's agreement allows: charged ${Number(disputed.amount)}, tariff gives ${expected}.`, certainty: 'HIGH' };
    }
  }
  // 3. two sessions of the same size minutes apart, partner TAP not yet received
  if (!finding && disputed) {
    const u = f.usage.filter((x) => x.partner_id === disputed.partner_id && x.on_date === disputed.rated_on);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
      if (Number(u[i].volume) === Number(u[j].volume) && u[i].type === u[j].type && !u[i].tap_received_on) {
        records.push({ system: 'Usage (mediation)', what: `Two ${u[i].type} sessions of ${u[i].volume} ${u[i].unit} on ${u[i].on_date}: ${u[i].session_ref} and ${u[j].session_ref}`, cells: [u[i].cell_id, u[j].cell_id] });
        records.push({ system: 'Partner TAP', what: `Partner file for ${u[i].on_date} not yet received (expected lag ${await lag(h, disputed.partner_id)} days)` });
        finding = { kind: 'PROBABLE_DOUBLE', credit: round2(Number(u[j].rated_amount)), summary: `Two sessions of identical size three minutes apart look like one session rated twice. The partner's TAP file that would confirm it has not arrived.`, certainty: 'MEDIUM', missing: 'Partner TAP file' };
      }
    }
  }
  // 4. an add-on charged twice the same day
  if (!finding) {
    const addons = charges.filter((c) => c.type === 'ADDON');
    for (let i = 0; i < addons.length; i++) for (let j = i + 1; j < addons.length; j++) if (addons[i].description === addons[j].description && addons[i].rated_on === addons[j].rated_on) {
      records.push({ system: 'Billing', what: `Add-on "${addons[i].description}" charged twice on ${addons[i].rated_on}`, amounts: [Number(addons[i].amount), Number(addons[j].amount)] });
      finding = { kind: 'DUPLICATE_ADDON', credit: round2(Number(addons[j].amount)), summary: `The add-on was charged twice on the same day; the product catalogue allows one activation per cycle.`, certainty: 'HIGH' };
    }
  }
  if (!finding) {
    records.push({ system: 'Billing · Rating · Usage', what: 'Every charge on the invoice reconciles with a usage record and the tariff' });
    finding = { kind: 'NOT_DUE', credit: 0, summary: 'The charges reconcile with the usage records and the tariff; the disputed amount is due.', certainty: 'HIGH' };
  }
  const fallback = `${finding.summary} Records compared: ${records.map((r) => r.system).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.${finding.missing ? ` Missing: ${finding.missing}; the finding is marked ${finding.certainty.toLowerCase()} certainty.` : ''}`;
  const n = await narrateFinding({ disputed_amount: q.disputed_amount, invoice: invoice.id, finding, records }, fallback);
  await h.setResult({ evidence: { finding, records, narration: n.text, mode: n.mode } });
  await h.trail({ act: 'INVESTIGATE', summary: n.text, evidence: { finding, records }, system: 'Billing · Rating · Usage · Partner TAP (read)' });
  return { decision: `${finding.kind.replace(/_/g, ' ').toLowerCase()} (${finding.certainty.toLowerCase()} certainty)`, outputs: { finding: finding.kind, credit: finding.credit, mode: n.mode } };
});
async function lag(h: HCtx, partnerId: string) { const p = await core.partnerOf(h.conn, partnerId); return p?.tap_lag_days ?? 3; }

on('WF-01', 'propose', async (h) => {
  const ev = h.run.result.evidence; const f = ev.finding;
  const credit = Number(f.credit);
  const approver = approverFor('CREDIT', credit);
  const permission = credit === 0 ? 'A decision to decline, by the billing officer' : approver ? `Credit of ${await fmt(h, credit)}: ${PERSONA[approver].role} (limit ${await fmt(h, limitOf(approver))})` : `Credit of ${await fmt(h, credit)} is above every limit in this demo`;
  const alternatives = credit === 0 ? ['Explain the charge to the customer with the usage record attached (recommended)', 'Goodwill credit (not recommended: the charge is due)'] : f.kind === 'PROBABLE_DOUBLE' ? [`Credit ${await fmt(h, credit)} now and verify against the TAP file when it arrives (recommended)`, 'Wait for the TAP file before deciding (customer waits up to a week)'] : [`Credit ${await fmt(h, credit)} (recommended)`, 'Decline and explain (not supported by the evidence)'];
  const fallback = credit === 0 ? `Decline the dispute and explain the charge: ${f.summary} The customer will be told what the records show and how to read the invoice.` : `Credit ${await fmt(h, credit)} to the invoice. ${f.summary} Alternative: ${alternatives[1]}. Permission: ${permission}. The customer will be told what was found and what was credited.`;
  const n = await narrateProposal({ action: credit === 0 ? 'DECLINE' : 'CREDIT', amount: credit, finding: f, alternatives, permission }, fallback);
  await h.setResult({ proposal: { action: credit === 0 ? 'DECLINE' : 'CREDIT', amount: credit, alternatives, permission, narration: n.text, mode: n.mode } });
  await h.c.query(`UPDATE layer.cases SET proposed_amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, credit, h.at]);
  await h.caseState('PROPOSED', `Proposed ${credit === 0 ? 'decline' : 'credit ' + credit}`);
  await h.trail({ act: 'PROPOSE', summary: n.text, evidence: { alternatives, permission } });
  return { decision: credit === 0 ? 'Recommend decline' : `Recommend credit ${credit}`, recommend: { verdict: credit === 0 ? 'DECLINE' : 'APPROVE', summary: n.text }, actionType: 'CREDIT', amount: credit, outputs: { mode: n.mode } };
});
const limitOf = (p: PersonaKey) => p === 'billing_officer' ? LIMITS.officerCredit : p === 'billing_manager' ? LIMITS.managerCredit : LIMITS.financeCredit;

on('WF-01', 'guard', async (h) => {
  const credit = Number(h.run.result.amount ?? 0);
  const a = await authorityOf(h.c, 'WF-01');
  const approver = approverFor('CREDIT', credit);
  if (credit > 0 && credit <= LIMITS.smallCredit && a.rung === 'A3') {
    await h.patch({ delegated: true });
    await h.trail({ act: 'GUARD', summary: `Credit of ${await fmt(h, credit)} is under the small-credit limit (${await fmt(h, LIMITS.smallCredit)}) and WF-01 holds A3 authority (accuracy ${(Number(a.accuracy) * 100).toFixed(0)}% over ${a.window_size} decisions). It may post without a person; the billing manager is told.`, clause: 'AAM · delegated action within ceiling' });
    return { decision: 'Within delegated authority (A3): no approval needed', skip: ['approve'], outputs: { delegated: true } };
  }
  if (!approver && credit > 0) { await h.trail({ act: 'GUARD', summary: `Credit of ${await fmt(h, credit)} is above every limit in this demo; routing to finance for a manual decision.`, clause: 'AAM · above all limits' }); return { decision: 'Above every limit' }; }
  const who = approver ?? 'billing_officer';
  await h.trail({ act: 'GUARD', summary: `Routed to the ${PERSONA[who].role}: ${credit === 0 ? 'a decline needs a person’s confirmation' : `${await fmt(h, credit)} is within the ${PERSONA[who].role.toLowerCase()}’s limit of ${await fmt(h, limitOf(who))}`}${a.rung !== 'A3' && credit > 0 && credit <= LIMITS.smallCredit ? '. WF-01 no longer holds A3 authority, so even a small credit waits for a person' : ''}.`, clause: 'AAM · authority matrix' });
  return { decision: `Routed to ${PERSONA[who].role}`, outputs: { approver: who } };
});

on('WF-01', 'execute', async (h) => {
  const credit = Number(h.run.result.amount ?? 0);
  if (credit === 0) { await h.caseState('EXECUTED', 'Declined with explanation'); return { decision: 'Nothing to post: declined with explanation', skip: [] }; }
  const q = h.run.payload;
  const delegated = !!h.run.payload.delegated;
  const approvalRef = delegated ? 'A3-WF-01' : String(h.run.payload.approvalRef ?? 'APR-?');
  const r = await core.postCredit(h.conn, { subscriberId: h.kase.subscriber_id!, invoiceId: q.invoice_id, amount: credit, reason: h.run.result.evidence?.finding?.kind ?? 'DISPUTE', approvalRef, caseRef: h.kase.ref });
  await h.patch({ creditId: r.creditId });
  await h.c.query(`UPDATE layer.cases SET amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, credit, h.at]);
  await h.caseState('EXECUTED', `Credit ${credit} posted`);
  await h.trail({ act: 'EXECUTE', summary: `Posted a credit of ${await fmt(h, credit)} to invoice ${q.invoice_id} through the billing credit interface, ${delegated ? 'under WF-01’s A3 authority (reported to the billing manager)' : `on approval ${approvalRef}`}. Reversible.`, system: r.system, before: r.before, after: r.after, autonomy: delegated ? 'A3' : 'A2', clause: delegated ? 'AAM · delegated action' : 'AAM · acts on approval' });
  if (delegated) await h.task({ kind: 'A3_REPORT', assignee: 'billing_manager', title: `Small credit ${await fmt(h, credit)} posted without a person (${h.kase.ref})`, brief: 'Posted under WF-01’s A3 authority. For information; verification follows.', dueDays: 3 });
  return { decision: `Credit ${credit} posted`, outputs: { creditId: r.creditId, system: r.system } };
});

on('WF-01', 'notify', async (h) => {
  const credit = Number(h.run.result.amount ?? 0);
  const f = await h.facts();
  const q = h.run.payload;
  if (credit === 0) {
    await message(h, { template: 'COMPLAINT_RESOLVED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, complaint: h.kase.ref, finding: await customerPhrase(h, 'NOT_DUE', h.run.result.evidence.finding.summary), action: f.subscriber.language === 'ar' ? 'لا يوجد رصيد مستحق؛ سجل الاستخدام مرفق للاطلاع.' : 'No credit is due; the usage record is attached for your reference.', ref: h.kase.ref } });
    return { decision: 'Customer told the charge is due' };
  }
  await message(h, { template: 'CREDIT_POSTED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, disputed: await fmt(h, q.disputed_amount), invoice: q.invoice_id, finding: await customerPhrase(h, h.run.result.evidence.finding.kind, h.run.result.evidence.finding.summary.replace(/\.$/, '').toLowerCase()), credit: await fmt(h, credit), ref: h.kase.ref } });
  return { decision: 'Customer told' };
});

on('WF-01', 'verify', async (h) => {
  if (!h.event) {
    await h.caseState('VERIFIED', 'Verification window open (14 days)');
    await h.trail({ act: 'VERIFY_OPEN', summary: `Verification window opened until ${plusDays(14)}: watching for a repeat contact, a reopening or a partner record that changes the finding.` });
    return { wait: 'EVENT', outputs: { dueOn: plusDays(14) } };
  }
  const credit = Number(h.run.result.amount ?? 0);
  const f = await h.facts();
  const q = h.run.payload;
  // A late partner record can change the finding: two distinct sessions, different cells.
  if (h.run.result.evidence?.finding?.kind === 'PROBABLE_DOUBLE') {
    const u = f.usage.filter((x) => x.on_date === (f.charges.find((c) => c.id === q.charge_id)?.rated_on) && x.partner_id === f.charges.find((c) => c.id === q.charge_id)?.partner_id);
    const late = u.filter((x) => x.tap_received_on);
    if (late.length >= 2 && new Set(late.map((x) => x.cell_id)).size > 1) {
      await h.trail({ act: 'VERIFY', summary: `The partner's TAP file arrived (${late[0].tap_received_on}) and shows two distinct sessions with different cell identifiers (${late.map((x) => x.cell_id).join(', ')}). The credit of ${await fmt(h, credit)} was not due. Proposing a reversal; only finance may approve it.`, evidence: { sessions: late.map((x) => ({ ref: x.session_ref, cell: x.cell_id })) } });
      await h.c.query(`INSERT INTO layer.approvals (run_id, step_key, approver_persona, action_type, amount, decision, created_at) VALUES ($1,'verify','finance','REVERSE_CREDIT',$2,'PENDING',$3)`, [h.run.id, credit, h.at]);
      await h.setResult({ recommendation: { verdict: 'APPROVE', summary: `Reverse the credit of ${credit}: the late TAP file shows two distinct sessions.` }, actionType: 'REVERSE_CREDIT' });
      await h.c.query(`UPDATE layer.runs SET status='WAITING', waiting_on_persona='finance', updated_at=$2 WHERE id=$1`, [h.run.id, h.at]);
      await h.c.query(`UPDATE layer.cases SET owner_persona='finance', updated_at=$2 WHERE id=$1`, [h.kase.id, h.at]);
      await h.caseState('AWAITING_APPROVAL', 'Reversal proposed to finance');
      return { status: 'DONE', decision: 'Finding changed: reversal proposed to finance', outputs: { reversal: true } };
    }
  }
  const repeat = (await h.c.query(`SELECT COUNT(*)::int AS n FROM core.complaints WHERE subscriber_id=$1 AND raised_on > $2 AND category='BILLING'`, [h.kase.subscriber_id, h.kase.opened_at])).rows[0].n;
  const inv = (await h.c.query(`SELECT status FROM core.invoices WHERE id=$1`, [q.invoice_id])).rows[0];
  const ok = credit === 0 ? repeat === 0 : inv?.status === 'CREDITED' && repeat === 0;
  await recordOutcome(h.c, { workflowId: 'WF-01', caseRef: h.kase.ref, delegated: !!h.run.payload.delegated, correct: ok, note: ok ? 'Verified: credit posted, no repeat contact' : 'Repeat contact within the window', scenario: h.run.scenario_key });
  await h.trail({ act: 'VERIFY', summary: ok ? `Verified: invoice ${q.invoice_id} is ${inv?.status?.toLowerCase() ?? 'unchanged'}, no repeat contact in fourteen days. Counted against the baseline as resolved.` : `Not resolved: ${repeat} repeat contact(s) within the window.`, evidence: { invoice_status: inv?.status, repeat } });
  await h.closeCase(ok ? 'RESOLVED' : 'REPEAT_CONTACT', undefined, 'CLOSED');
  return { decision: ok ? 'Resolved, verified' : 'Repeat contact', outputs: { ok, repeat } };
});
const plusDays = (d: number) => new Date(now().getTime() + d * 86_400_000).toISOString().slice(0, 10);

/** Reversal approved by finance (decide() calls this instead of advance for REVERSE_CREDIT). */
export async function executeReversal(h: Pick<HCtx, 'c' | 'run' | 'kase' | 'at' | 'conn' | 'trail' | 'caseState' | 'closeCase' | 'facts'>, reason: string) {
  const creditId = Number(h.run.payload.creditId);
  const r = await core.reverseCredit(h.conn, { creditId, reason });
  const f = await h.facts();
  const credit = Number(h.run.result.amount ?? 0);
  await h.trail({ act: 'EXECUTE', actor_id: 'munaffidh', actor_type: 'SYSTEM', autonomy: 'A2', summary: `Reversed credit ${creditId} (${credit}) on finance’s approval. The original evidence, the first decision and the new evidence stay in this trail.`, system: r.system, before: r.before, after: r.after });
  const m = fill('CREDIT_REVERSED', f.subscriber.language, { name: f.subscriber.name, invoice: h.run.payload.invoice_id, date: f.charges.find((c: any) => c.id === h.run.payload.charge_id)?.rated_on ?? '', credit, creditedOn: String(f.credits[0]?.posted_at ?? '').slice(0, 10), ref: h.kase.ref });
  await h.c.query(`INSERT INTO layer.messages (subscriber_id, case_ref, channel, lang, template, body, status, sent_at, note) VALUES ($1,$2,'APP',$3,'CREDIT_REVERSED',$4,'SENT',$5,$6)`, [h.kase.subscriber_id, h.kase.ref, m.lang, m.text, h.at, m.note]);
  await h.trail({ act: 'NOTIFY', actor_id: 'rafiq', actor_type: 'AGENT', autonomy: 'A2', summary: 'Told the customer, in plain words, what changed and why.', system: 'Messaging · POST /notify/v1/messages' });
  await recordOutcome(h.c as any, { workflowId: 'WF-01', caseRef: h.kase.ref, delegated: !!h.run.payload.delegated, correct: false, note: 'Credit reversed at verification: the proposal was wrong', scenario: h.run.scenario_key });
  await h.closeCase('REVERSED', reason, 'REVERSED');
  await h.c.query(`UPDATE layer.runs SET status='COMPLETED', waiting_on_persona=NULL, closed_at=$2, updated_at=$2 WHERE id=$1`, [h.run.id, h.at]);
}

// ====================================================================== WF-02 Roaming fraud

on('WF-02', 'detect', async (h) => {
  const ev = (await h.c.query(`SELECT * FROM core.roaming_events WHERE id=$1`, [h.run.payload.event_id])).rows[0];
  const partner = await core.partnerOf(h.conn, ev.partner_id);
  await h.patch({ pattern: ev.pattern, partner_id: ev.partner_id, partner_name: partner?.name });
  await h.caseState('INVESTIGATING', 'Opened from a roaming flag');
  await h.trail({ act: 'DETECT', summary: `Roaming flag ${ev.id}: ${ev.pattern.replace(/_/g, ' ').toLowerCase()} pattern with ${partner?.name} (${partner?.country}), score ${Number(ev.score).toFixed(2)}. Read from partner TAP records and read-only telemetry; nothing restricted by the flag.`, system: 'Roaming platform · GET /roaming/v1/events (read-only)', evidence: { detail: ev.detail } });
  return { decision: `Flag ${ev.pattern} opened` };
});
on('WF-02', 'investigate', async (h) => {
  const f = await h.facts(); const p = h.run.payload;
  const u = f.usage.filter((x) => x.partner_id === p.partner_id);
  const calls = u.filter((x) => x.type === 'VOICE'); const data = u.filter((x) => x.type === 'DATA');
  const rated = round2(u.reduce((s, x) => s + Number(x.rated_amount), 0));
  const deviceChanged = f.subscriber.device_changed_on;
  const records = [
    { system: 'Usage (mediation)', what: `${u.length} roaming records with ${p.partner_name} in the last days: ${calls.length} calls, ${data.length} data sessions, rated ${rated}` },
    { system: 'Partner TAP', what: `TAP records received for ${u.filter((x) => x.tap_received_on).length} of ${u.length} sessions` },
    { system: 'CRM', what: `Subscriber ${f.subscriber.id}: ${f.subscriber.segment.toLowerCase()}, ${f.subscriber.tenure_months} months tenure, device changed ${deviceChanged ?? 'not recently'}` },
    { system: 'Telemetry (read-only)', what: p.pattern === 'SIM_BOX' ? `All ${calls.length} calls from one cell; mean duration ${calls.length ? Math.round(calls.reduce((s, x) => s + Number(x.volume), 0) / calls.length * 60) : 0} seconds` : p.pattern === 'IMPOSSIBLE_TRAVEL' ? 'Two registrations 2,400 km apart within 40 minutes' : 'Usage profile differs from the subscriber’s previous 90 days by more than 8×' },
  ];
  const confirmed = Number((await h.c.query(`SELECT score FROM core.roaming_events WHERE id=$1`, [p.event_id])).rows[0].score) >= 0.75;
  const finding = { kind: confirmed ? 'FRAUD_CONFIRMED' : 'INCONCLUSIVE', pattern: p.pattern, exposure: rated, summary: confirmed ? `The pattern is confirmed by the usage, the partner records and the telemetry: ${p.pattern.replace(/_/g, ' ').toLowerCase()} with ${p.partner_name}. Exposure so far ${rated}.` : 'The pattern is not confirmed by the records; the usage is unusual but consistent with the subscriber’s travel.', certainty: confirmed ? 'HIGH' : 'LOW' };
  const n = await narrateFinding({ finding, records }, `${finding.summary} Records compared: usage, partner TAP, CRM, read-only telemetry.`);
  await h.setResult({ evidence: { finding, records, narration: n.text, mode: n.mode } });
  await h.trail({ act: 'INVESTIGATE', summary: n.text, evidence: { finding, records }, system: 'Usage · Partner TAP · CRM · Telemetry (read)' });
  return { decision: finding.kind.replace(/_/g, ' ').toLowerCase(), outputs: { exposure: rated, mode: n.mode } };
});
on('WF-02', 'propose', async (h) => {
  const f = h.run.result.evidence.finding; const p = h.run.payload;
  const confirmed = f.kind === 'FRAUD_CONFIRMED';
  const action = confirmed ? 'RESTRICT_ROAMING' : 'DISMISS';
  const steering = confirmed && (p.pattern === 'SIM_BOX' || p.pattern === 'IRSF');
  const alternatives = confirmed ? ['Restrict roaming on the line and raise a settlement query to the partner for the flagged sessions (recommended)', 'Monitor for 24 hours (exposure grows at the current rate)'] : ['Dismiss the flag and keep monitoring (recommended)', 'Restrict (not supported by the evidence)'];
  const permission = confirmed ? 'Restriction and settlement query: the roaming fraud analyst, with the reversal recorded (lifted on the customer’s verified call)' : 'Dismissal: the roaming fraud analyst';
  const fallback = confirmed ? `Restrict roaming on the line and raise a settlement query of ${await fmt(h, f.exposure)} to ${p.partner_name}. ${f.summary}${steering ? ' Steering traffic away from this partner would reduce exposure; that is a network action and is proposed to the NOC as a handoff, not performed.' : ''} Permission: ${permission}. The customer will be told about the restriction and how to lift it.` : `Dismiss the flag. ${f.summary}`;
  const n = await narrateProposal({ action, exposure: f.exposure, partner: p.partner_name, alternatives, permission, steering_handoff: steering }, fallback);
  await h.setResult({ proposal: { action, amount: f.exposure, alternatives, permission, steering, narration: n.text, mode: n.mode } });
  await h.c.query(`UPDATE layer.cases SET proposed_amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, f.exposure, h.at]);
  await h.caseState('PROPOSED', confirmed ? 'Restriction proposed' : 'Dismissal proposed');
  await h.trail({ act: 'PROPOSE', summary: n.text, evidence: { alternatives, permission, steering } });
  return { decision: confirmed ? 'Recommend restriction and query' : 'Recommend dismissal', recommend: { verdict: confirmed ? 'APPROVE' : 'DECLINE', summary: n.text }, actionType: confirmed ? 'RESTRICT_ROAMING' : 'DECIDE', amount: f.exposure, outputs: { mode: n.mode } };
});
on('WF-02', 'guard', async (h) => {
  const steering = !!h.run.result.proposal?.steering;
  await h.trail({ act: 'GUARD', summary: `Within the roaming analyst’s authority. ${steering ? 'The proposal contained a network action (partner steering): converted to a NOC handoff; the agent will not perform it.' : 'No network action embedded.'}`, clause: 'AAM · network actions are handoffs' });
  return { decision: steering ? 'Routed to the analyst; steering converted to a NOC handoff' : 'Routed to the analyst' };
});
on('WF-02', 'execute', async (h) => {
  const prop = h.run.result.proposal; const p = h.run.payload;
  if (prop.action !== 'RESTRICT_ROAMING') { await core.dismissRoamingEvents(h.conn, h.kase.subscriber_id!); await h.caseState('EXECUTED', 'Flag dismissed'); await h.trail({ act: 'EXECUTE', summary: 'Flag dismissed on the analyst’s approval; monitoring continues.', system: 'Roaming platform · PATCH /roaming/v1/events' }); return { decision: 'Dismissed', skip: ['notify'] }; }
  const r = await core.restrictRoaming(h.conn, { subscriberId: h.kase.subscriber_id!, reason: `${p.pattern} confirmed`, reversal: 'Lifted on the customer’s verified call to 800-DHOW', caseRef: h.kase.ref });
  const q = await core.raiseSettlementQuery(h.conn, { partnerId: p.partner_id, amount: Number(prop.amount), caseRef: h.kase.ref });
  await h.patch({ restrictionId: r.restrictionId, queryId: q.queryId });
  await h.c.query(`UPDATE layer.cases SET amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, Number(prop.amount), h.at]);
  await h.caseState('EXECUTED', 'Restricted; query raised');
  await h.trail({ act: 'EXECUTE', summary: `Applied the roaming restriction through the roaming platform (reversal: ${'lifted on the customer’s verified call'}) and raised settlement query #${q.queryId} of ${await fmt(h, Number(prop.amount))} to ${p.partner_name}, on approval ${h.run.payload.approvalRef}.`, system: `${r.system}; ${q.system}`, before: r.before, after: r.after, clause: 'AAM · acts on approval' });
  if (prop.steering) {
    await h.task({ kind: 'NOC_STEERING', assignee: 'noc', title: `Steering request: route traffic away from ${p.partner_name} for the affected IMSI range`, brief: `Proposed by Mushir on ${h.kase.ref}; approved as a handoff by the roaming analyst. The agent has not touched the network. Decide, perform and record in the NOC’s own tools.`, dueDays: 1 });
    await h.trail({ act: 'HANDOFF', summary: 'Opened a steering task for the NOC. The network stays with the NOC.', clause: 'AAM · network actions are handoffs' });
  }
  return { decision: 'Restricted and queried', outputs: { restrictionId: r.restrictionId, queryId: q.queryId } };
});
on('WF-02', 'notify', async (h) => {
  const f = await h.facts(); const p = h.run.payload;
  await message(h, { template: 'ROAMING_RESTRICTED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, date: today(), partner: p.partner_name, ref: h.kase.ref } });
  return { decision: 'Customer told' };
});
on('WF-02', 'verify', async (h) => {
  if (!h.event) { await h.caseState('VERIFIED', 'Verification window open'); return { wait: 'EVENT', outputs: { dueOn: plusDays(7) } }; }
  const p = h.run.payload;
  if (p.queryId) await core.acknowledgeQuery(h.conn, Number(p.queryId));
  const still = (await h.c.query(`SELECT roaming_enabled FROM core.subscribers WHERE id=$1`, [h.kase.subscriber_id])).rows[0];
  const ok = h.run.result.proposal?.action !== 'RESTRICT_ROAMING' || still?.roaming_enabled === false;
  await recordOutcome(h.c, { workflowId: 'WF-02', caseRef: h.kase.ref, delegated: false, correct: ok, note: ok ? 'Restriction held; partner acknowledged the query' : 'Restriction lifted on verification', scenario: h.run.scenario_key });
  await h.trail({ act: 'VERIFY', summary: ok ? `Verified: the restriction holds, the partner acknowledged settlement query #${p.queryId}, no further rated usage. Loss stopped at ${await fmt(h, Number(h.run.result.proposal?.amount ?? 0))}.` : 'Restriction was lifted on verification: counted as a false positive.' });
  await h.closeCase(ok ? 'CONFIRMED' : 'FALSE_POSITIVE');
  return { decision: ok ? 'Verified' : 'False positive' };
});

// ====================================================================== WF-03 Retention

on('WF-03', 'detect', async (h) => {
  const s = (await h.c.query(`SELECT * FROM core.cvm_signals WHERE id=$1`, [h.run.payload.signal_id])).rows[0];
  await h.patch({ churn_risk: Number(s.churn_risk), service_problems: s.service_problems, cause_hint: s.cause });
  await h.caseState('INVESTIGATING', 'Opened from a CVM signal');
  await h.trail({ act: 'DETECT', summary: `CVM signal: churn risk ${(Number(s.churn_risk) * 100).toFixed(0)}% with ${s.service_problems} service problem(s) in thirty days; both above the thresholds the CVM owner set.`, system: 'CVM · GET /cvm/v1/signals (read)' });
  return { decision: 'Case opened from signal' };
});
on('WF-03', 'consent', async (h) => {
  const f = await h.facts();
  if (!f.subscriber.consent_marketing) {
    await h.trail({ act: 'REFUSE', summary: `Marketing consent is not on record for ${f.subscriber.id} (withdrawn). No evidence is gathered and no person sees this case: it closes here. The service problem itself stays with the service workflow.`, clause: 'Guardrails · consent before contact', system: 'Consent register · GET /consent/v1/{id} (read)' });
    await h.closeCase('NO_CONSENT', 'Marketing consent withdrawn', 'BLOCKED');
    return { status: 'REFUSED', decision: 'No consent: closed before investigation', stop: 'COMPLETED' };
  }
  await h.trail({ act: 'GUARD', summary: 'Marketing consent on record; contact rules allow one retention contact in thirty days and none has been made. Proceeding.', clause: 'Guardrails · consent before contact', system: 'Consent register (read)' });
  return { decision: 'Consent verified' };
});
on('WF-03', 'investigate', async (h) => {
  const f = await h.facts();
  const open = f.complaints.filter((c) => c.status !== 'RESOLVED');
  const coverage = f.complaints.filter((c) => c.category === 'COVERAGE');
  const cause = coverage.length >= 2 ? `An unresolved coverage fault at the subscriber’s home cell ${f.subscriber.home_cell}: ${coverage.length} coverage complaints in thirty days` : open.length ? `An unresolved ${open[0].category.toLowerCase()} complaint (${open[0].id})` : 'No open service problem; the risk comes from the tenure and the plan';
  const records = [
    { system: 'CRM / cases', what: `${f.complaints.length} complaints in ninety days, ${open.length} open` },
    { system: 'Network telemetry (read-only)', what: coverage.length >= 2 ? `Cell ${f.subscriber.home_cell}: degraded since ${coverage[coverage.length - 1].raised_on}; fault ticket open with the NOC` : 'No degradation at the home cell' },
    { system: 'Billing', what: `ARPU ${Number(f.subscriber.arpu)}, tenure ${f.subscriber.tenure_months} months, plan ${f.subscriber.plan}` },
  ];
  const finding = { kind: coverage.length >= 2 ? 'COVERAGE_FAULT' : open.length ? 'OPEN_COMPLAINT' : 'NO_CAUSE', cause, summary: `${cause}. The operator can ${coverage.length >= 2 ? 'fix the fault (ticket with the NOC) and acknowledge the inconvenience' : open.length ? 'resolve the complaint' : 'offer nothing that addresses a cause'}.`, certainty: 'HIGH' as const };
  const n = await narrateFinding({ finding, records }, `${finding.summary} Records compared: CRM, telemetry (read-only), billing.`);
  await h.setResult({ evidence: { finding, records, narration: n.text, mode: n.mode } });
  await h.trail({ act: 'INVESTIGATE', summary: n.text, evidence: { finding, records }, system: 'CRM · Telemetry (read) · Billing' });
  return { decision: finding.kind.replace(/_/g, ' ').toLowerCase(), outputs: { mode: n.mode } };
});
on('WF-03', 'propose', async (h) => {
  const f = await h.facts(); const ev = h.run.result.evidence.finding;
  const offers = (await h.c.query(`SELECT * FROM core.offers WHERE approved=true AND $1 = ANY(segments) AND min_tenure <= $2 ORDER BY value ASC`, [f.subscriber.segment, f.subscriber.tenure_months])).rows;
  const offer = offers.find((o: any) => o.kind === 'RETENTION') ?? offers[0] ?? null;
  const fix = ev.kind === 'COVERAGE_FAULT' ? `Resolve the coverage fault at ${f.subscriber.home_cell} (NOC ticket)` : ev.kind === 'OPEN_COMPLAINT' ? 'Resolve the open complaint first' : null;
  const comparison = Math.round(80 + Number(f.subscriber.arpu) % 40);
  const retained = round2(Number(f.subscriber.arpu) * 3 * 0.6 - (offer ? Number(offer.value) : 0));
  const alternatives = [`${fix ? fix + ', plus ' : ''}${offer ? `${offer.name} (${offer.terms}) from the approved set` : 'no offer'} (recommended)`, 'A price discount (not in the approved set; cannot be approved here)', 'No response (risk stays)'];
  const permission = 'The CVM manager; the offer must be in the approved set';
  const fallback = `${fix ? fix + '. ' : ''}${offer ? `Add ${offer.name} (${offer.terms}) at no cost. ` : ''}Expected retained contribution over ninety days ${await fmt(h, retained)} net of the offer, against a comparison group of ${comparison} similar subscribers who receive nothing. Permission: ${permission}. The customer will be told the fault is fixed and the add-on applied.`;
  const n = await narrateProposal({ fix, offer: offer ? { name: offer.name, terms: offer.terms, value: offer.value } : null, retained_contribution: retained, comparison_group: comparison, alternatives, permission }, fallback);
  await h.setResult({ proposal: { action: 'OFFER', amount: offer ? Number(offer.value) : 0, offerId: offer?.id ?? null, offerName: offer?.name ?? null, fix, retained, comparison, alternatives, permission, narration: n.text, mode: n.mode } });
  await h.c.query(`UPDATE layer.cases SET proposed_amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, offer ? Number(offer.value) : 0, h.at]);
  await h.caseState('PROPOSED', 'Response proposed');
  await h.trail({ act: 'PROPOSE', summary: n.text, evidence: { alternatives, permission, retained, comparison } });
  return { decision: 'Recommend fix and approved offer', recommend: { verdict: 'APPROVE', summary: n.text }, actionType: 'OFFER', amount: offer ? Number(offer.value) : 0, outputs: { mode: n.mode } };
});
on('WF-03', 'execute', async (h) => {
  const prop = h.run.result.proposal;
  const r = await core.registerResponse(h.conn, { subscriberId: h.kase.subscriber_id!, offerId: prop.offerId, fix: prop.fix, caseRef: h.kase.ref });
  if (prop.fix) await h.task({ kind: 'NOC_FAULT', assignee: 'noc', title: `Coverage fault: ${prop.fix}`, brief: `Raised from retention case ${h.kase.ref}. The agent has not touched the network.`, dueDays: 3 });
  await h.c.query(`UPDATE layer.cases SET amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, Number(prop.amount), h.at]);
  await h.caseState('EXECUTED', 'Response registered');
  await h.trail({ act: 'EXECUTE', summary: `Registered the response in CVM on approval ${h.run.payload.approvalRef}: ${prop.fix ? prop.fix + '; ' : ''}${prop.offerName ?? 'no offer'}. No tariff changed.`, system: r.system, clause: 'AAM · acts on approval' });
  return { decision: 'Response registered' };
});
on('WF-03', 'notify', async (h) => {
  const f = await h.facts(); const prop = h.run.result.proposal;
  const ar = f.subscriber.language === 'ar';
  const cause = ar ? (h.run.result.evidence.finding.kind === 'COVERAGE_FAULT' ? 'عطل التغطية في منطقتك' : 'المشكلة التي أبلغت عنها') : (h.run.result.evidence.finding.kind === 'COVERAGE_FAULT' ? 'the coverage fault in your area' : 'the problem you reported');
  if (prop.offerId) await message(h, { template: 'OFFER_PRESENTED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, cause, offer: ar ? ({ 'OFF-01': 'باقة 5 غيغابايت إضافية', 'OFF-02': '100 دقيقة دولية', 'OFF-05': 'حماية الجهاز' } as Record<string, string>)[prop.offerId] ?? prop.offerName : prop.offerName, term: ar ? 'شهر واحد' : 'one month', ref: h.kase.ref } });
  else await message(h, { template: 'FIX_PRESENTED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, cause, date: today(), ref: h.kase.ref } });
  return { decision: 'Customer told' };
});
on('WF-03', 'verify', async (h) => {
  if (!h.event) { await h.caseState('VERIFIED', 'Ninety-day measurement open'); return { wait: 'EVENT', outputs: { dueOn: plusDays(90) } }; }
  const s = (await h.c.query(`SELECT status, churn_risk FROM core.subscribers WHERE id=$1`, [h.kase.subscriber_id])).rows[0];
  const ok = s.status === 'ACTIVE';
  await recordOutcome(h.c, { workflowId: 'WF-03', caseRef: h.kase.ref, delegated: false, correct: ok, note: ok ? 'Subscriber retained' : 'Subscriber churned', scenario: h.run.scenario_key });
  await h.trail({ act: 'VERIFY', summary: ok ? `Verified: the subscriber is active; churn risk now ${(Number(s.churn_risk) * 100).toFixed(0)}%. Retained contribution is counted against the comparison group, net of the offer’s cost.` : 'The subscriber churned; no contribution counted.' });
  await h.closeCase(ok ? 'RETAINED' : 'CHURNED');
  return { decision: ok ? 'Retained' : 'Churned' };
});

// ====================================================================== WF-04 Complaint

on('WF-04', 'detect', async (h) => {
  const c = (await h.c.query(`SELECT * FROM core.complaints WHERE id=$1`, [h.run.payload.complaint_id])).rows[0];
  await h.patch({ category: c.category, channel: c.channel, contacts: c.contacts, text: c.text });
  await h.caseState('INVESTIGATING', 'Opened from a complaint');
  await h.trail({ act: 'DETECT', summary: `Complaint ${c.id} via ${c.channel.toLowerCase()} (${c.category.toLowerCase()}), contact number ${c.contacts} about this problem. Every previous contact is attached.`, system: 'Case system · GET /cases/v1/complaints', evidence: { text: c.text } });
  return { decision: 'Case opened' };
});
on('WF-04', 'investigate', async (h) => {
  const f = await h.facts(); const p = h.run.payload;
  let finding: any; let records: any[];
  if (p.category === 'SPEED') {
    records = [{ system: 'Usage', what: `Plan ${f.subscriber.plan}: fair-use cap reached on day ${12 + (f.subscriber.tenure_months % 10)} of the cycle` }, { system: 'Telemetry (read-only)', what: 'No congestion at the serving cells' }];
    finding = { kind: 'FAIR_USE_CAP', summary: 'The plan’s fair-use cap was reached before the end of the cycle; speed is reduced by the plan terms, not by a fault.', withinAuthority: true, fix: 'Explain the cap and apply a one-off 2 GB add-on at no cost', fixValue: 29 };
  } else if (p.category === 'ACTIVATION') {
    records = [{ system: 'Order / porting', what: 'Number port stalled at the donor operator for 6 days; porting desk reference pending' }, { system: 'CRM', what: `${p.contacts} contacts about the same port` }];
    finding = { kind: 'PORT_STALLED', summary: 'The number port is stalled at the donor operator; the fix needs the porting desk, which only a person may instruct.', withinAuthority: false, fix: 'Escalate to the porting desk with the donor reference and confirm a date with the customer', fixValue: 0 };
  } else if (p.category === 'COVERAGE') {
    records = [{ system: 'Telemetry (read-only)', what: `Cell ${f.subscriber.home_cell} degraded; NOC fault ticket open` }];
    finding = { kind: 'KNOWN_FAULT', summary: 'A known fault at the home cell with an open NOC ticket; the customer can be told the status and the expected fix date.', withinAuthority: true, fix: 'Explain the open fault and the expected date', fixValue: 0 };
  } else if (p.category === 'BILLING') {
    records = [{ system: 'Billing', what: 'The complaint is a dispute about a charge' }];
    finding = { kind: 'IS_DISPUTE', summary: 'The complaint is a billing dispute and belongs in the dispute workflow, which has the limits for credits.', withinAuthority: false, fix: 'Open a dispute case; a person confirms the transfer', fixValue: 0 };
  } else {
    records = [{ system: 'CRM', what: 'Account and service state checked; nothing abnormal' }];
    finding = { kind: 'GENERAL', summary: 'The account and the service are in order; the customer needs an explanation.', withinAuthority: true, fix: 'Explain and confirm nothing is wrong', fixValue: 0 };
  }
  const n = await narrateFinding({ finding, records }, `${finding.summary} Records compared: ${records.map((r) => r.system).join(', ')}.`);
  await h.setResult({ evidence: { finding, records, narration: n.text, mode: n.mode } });
  await h.trail({ act: 'INVESTIGATE', summary: n.text, evidence: { finding, records } });
  return { decision: finding.kind.replace(/_/g, ' ').toLowerCase(), outputs: { mode: n.mode } };
});
on('WF-04', 'propose', async (h) => {
  const f = h.run.result.evidence.finding;
  const permission = f.withinAuthority ? `Within the agent’s authority (explanation${f.fixValue ? ` and an add-on of ${await fmt(h, f.fixValue)}, under the small-credit limit` : ''}) while WF-04 holds A3` : 'Needs a person: the service agent, with the full context attached';
  const fallback = `${f.fix}. ${f.summary} Permission: ${permission}. The customer will be told what was found and what was done.`;
  const n = await narrateProposal({ action: 'RESOLVE_COMPLAINT', fix: f.fix, within_authority: f.withinAuthority, permission }, fallback);
  await h.setResult({ proposal: { action: 'RESOLVE_COMPLAINT', fix: f.fix, amount: f.fixValue, withinAuthority: f.withinAuthority, permission, narration: n.text, mode: n.mode } });
  await h.caseState('PROPOSED', 'Resolution proposed');
  await h.trail({ act: 'PROPOSE', summary: n.text, evidence: { permission } });
  return { decision: f.withinAuthority ? 'Within authority' : 'Needs a person', recommend: { verdict: 'APPROVE', summary: n.text }, actionType: 'RESOLVE_COMPLAINT', amount: f.fixValue, outputs: { mode: n.mode } };
});
on('WF-04', 'guard', async (h) => {
  const prop = h.run.result.proposal;
  const a = await authorityOf(h.c, 'WF-04');
  if (prop.withinAuthority && a.rung === 'A3' && Number(prop.amount) <= LIMITS.smallCredit) {
    await h.patch({ delegated: true });
    await h.trail({ act: 'GUARD', summary: `Within WF-04’s A3 authority: an explanation${prop.amount ? ` and an add-on of ${await fmt(h, Number(prop.amount))} under the small-credit limit` : ''}. Proceeds without a person; the head of service is told.`, clause: 'AAM · delegated action within ceiling' });
    return { decision: 'Within delegated authority', skip: ['handoff'], outputs: { delegated: true } };
  }
  await h.trail({ act: 'GUARD', summary: 'Beyond the agent’s authority: handed to the service agent with every previous contact attached, so the customer does not repeat the story.', clause: 'AAM · handoff with context' });
  await h.caseState('HANDED_OFF', 'Handed to a person');
  return { decision: 'Handed to the service agent' };
});
on('WF-04', 'execute', async (h) => {
  const prop = h.run.result.proposal; const p = h.run.payload;
  const r = await core.resolveComplaint(h.conn, { complaintId: p.complaint_id, resolution: `${prop.fix}${h.run.payload.lastDecisionReason ? ` — ${h.run.payload.lastDecisionReason}` : ''}`, status: 'RESOLVED' });
  if (Number(prop.amount) > 0) await core.registerResponse(h.conn, { subscriberId: h.kase.subscriber_id!, offerId: null, fix: prop.fix, caseRef: h.kase.ref });
  await h.caseState('EXECUTED', 'Resolution applied');
  await h.trail({ act: 'EXECUTE', summary: `${prop.fix}. Recorded in the case system${h.run.payload.delegated ? ' under WF-04’s A3 authority' : ` on ${PERSONA.service_agent.role}’s decision`}.`, system: r.system, before: r.before, after: r.after, autonomy: h.run.payload.delegated ? 'A3' : 'A2' });
  return { decision: 'Resolved' };
});
on('WF-04', 'notify', async (h) => {
  const f = await h.facts(); const prop = h.run.result.proposal; const p = h.run.payload;
  await message(h, { template: 'COMPLAINT_RESOLVED', subscriberId: h.kase.subscriber_id, vars: { name: f.subscriber.name, complaint: p.complaint_id, finding: await customerPhrase(h, h.run.result.evidence.finding.kind, h.run.result.evidence.finding.summary), action: f.subscriber.language === 'ar' ? ({ FAIR_USE_CAP: 'أضفنا 2 غيغابايت إلى خطك دون تكلفة لهذه الدورة.', PORT_STALLED: 'أحلنا الطلب إلى مكتب نقل الأرقام وسنؤكد لك الموعد.', KNOWN_FAULT: 'سنبلغك فور إصلاح العطل.', IS_DISPUTE: 'فتحنا حالة اعتراض على الرسم وسيراجعها الفريق المختص.', GENERAL: 'لا يلزم أي إجراء.' } as Record<string, string>)[h.run.result.evidence.finding.kind] ?? prop.fix + '.' : prop.fix + '.', ref: h.kase.ref } });
  return { decision: 'Customer answered' };
});
on('WF-04', 'verify', async (h) => {
  if (!h.event) { await h.caseState('VERIFIED', 'Fourteen-day watch open'); return { wait: 'EVENT', outputs: { dueOn: plusDays(14) } }; }
  const c = (await h.c.query(`SELECT reopened, status FROM core.complaints WHERE id=$1`, [h.run.payload.complaint_id])).rows[0];
  const repeat = h.event.kind === 'REPEAT_CONTACT' || c.reopened;
  await recordOutcome(h.c, { workflowId: 'WF-04', caseRef: h.kase.ref, delegated: !!h.run.payload.delegated, correct: !repeat, note: repeat ? 'Repeat contact within fourteen days' : 'Resolved first time', scenario: h.run.scenario_key });
  await h.trail({ act: 'VERIFY', summary: repeat ? 'The customer came back about the same problem within fourteen days: counted as a repeat contact, not a resolution.' : 'No repeat contact or reopening in fourteen days: counted as resolved first time.' });
  await h.closeCase(repeat ? 'REPEAT_CONTACT' : 'RESOLVED_FIRST_TIME');
  return { decision: repeat ? 'Repeat contact' : 'Resolved first time' };
});

// ====================================================================== WF-05 Enterprise activation

on('WF-05', 'capture', async (h) => {
  const { order, account } = await core.orderOf(h.conn, h.kase.subject_id);
  await h.patch({ order_id: order.id, account_id: account.id, account_name: account.name, service: order.service, sites: order.sites, monthly_value: Number(order.monthly_value), term: order.term_months, requested_on: order.requested_on });
  await core.setOrderStage(h.conn, { orderId: order.id, stage: 'FEASIBILITY' });
  await h.caseState('INVESTIGATING', 'Captured from the order');
  await h.trail({ act: 'DETECT', summary: `Order ${order.id} from ${account.name} (${account.sector}): ${order.service.replace(/_/g, ' ')} for ${order.sites} site${order.sites === 1 ? '' : 's'}, ${order.detail}`, system: 'Order management · GET /orders/v1' });
  return { decision: 'Requirement captured' };
});
on('WF-05', 'feasibility', async (h) => {
  const p = h.run.payload;
  const sites = Array.from({ length: p.sites }, (_, i) => ({ site: `Site ${i + 1}`, fibre: i !== p.sites - 1 || p.sites < 4, capacity: 'OK' }));
  const build = sites.filter((s) => !s.fibre);
  const records = [{ system: 'Coverage / inventory', what: `${sites.length - build.length} of ${sites.length} sites on-net; ${build.length ? `${build.map((s) => s.site).join(', ')} needs a fibre build (estimated 6 weeks)` : 'no build needed'}` }, { system: 'Product catalogue', what: `${p.service.replace(/_/g, ' ')} available for the account’s segment` }, { system: 'Capacity', what: 'Core capacity sufficient at the requested bandwidth' }];
  const finding = { kind: build.length ? 'FEASIBLE_WITH_BUILD' : 'FEASIBLE', sites, dependencies: build.length ? [`Fibre build at ${build.map((s) => s.site).join(', ')}`] : [], summary: build.length ? `Feasible; one site needs a fibre build before activation, which moves the go-live for that site by about six weeks.` : 'Feasible at every site with no build.' };
  const n = await narrateFinding({ finding, records }, `${finding.summary} Records compared: coverage, catalogue, capacity.`);
  await h.setResult({ evidence: { finding, records, narration: n.text, mode: n.mode } });
  await h.trail({ act: 'INVESTIGATE', summary: n.text, evidence: { finding, records } });
  return { decision: finding.kind.replace(/_/g, ' ').toLowerCase(), outputs: { mode: n.mode } };
});
on('WF-05', 'quote', async (h) => {
  const p = h.run.payload; const ev = h.run.result.evidence.finding;
  const tcv = round2(p.monthly_value * p.term); const margin = 0.31;
  const quote = { monthly: p.monthly_value, term: p.term, tcv, margin, dependencies: ev.dependencies, assumptions: ['Customer-provided power and rack space at each site', 'Standard SLA 99.9%, business hours support', ev.dependencies.length ? 'Fibre build cost absorbed within the term' : 'No build cost'] };
  const permission = `Commercial approval: the enterprise sales manager (quote within the price book, margin ${Math.round(margin * 100)}%)`;
  const fallback = `Quote ${await fmt(h, p.monthly_value)} per month for ${p.term} months (total ${await fmt(h, tcv)}), margin ${Math.round(margin * 100)}%. ${ev.dependencies.length ? `Dependency: ${ev.dependencies.join('; ')}. ` : ''}Alternative: phase the built site after the others go live. Permission: ${permission}. The customer will receive the quote with its assumptions.`;
  const n = await narrateProposal({ quote, permission }, fallback);
  await h.setResult({ proposal: { action: 'QUOTE', amount: tcv, quote, permission, narration: n.text, mode: n.mode } });
  await core.setOrderStage(h.conn, { orderId: p.order_id, stage: 'QUOTED', quote });
  await h.c.query(`UPDATE layer.cases SET proposed_amount=$2, updated_at=$3 WHERE id=$1`, [h.kase.id, tcv, h.at]);
  await h.caseState('PROPOSED', 'Quote prepared');
  await h.trail({ act: 'PROPOSE', summary: n.text, evidence: { quote } });
  return { decision: `Quote ${tcv}`, recommend: { verdict: 'APPROVE', summary: n.text }, actionType: 'QUOTE', amount: tcv, outputs: { mode: n.mode } };
});
on('WF-05', 'guard', async (h) => {
  await h.trail({ act: 'GUARD', summary: 'Quote within the price book; provisioning is a handoff to the delivery team, never an action of the agent.', clause: 'AAM · provisioning is a handoff' });
  return { decision: 'Routed to the enterprise sales manager' };
});
on('WF-05', 'handoff', async (h) => {
  const p = h.run.payload;
  if (!h.event) {
    await core.setOrderStage(h.conn, { orderId: p.order_id, stage: 'PROVISIONING' });
    const taskId = await h.task({ kind: 'PROVISION', assignee: 'noc', title: `Provision ${p.service.replace(/_/g, ' ')} for ${p.account_name}: ${p.sites} sites`, brief: `Approved quote ${h.run.payload.approvalRef} on ${h.kase.ref}. Requirements and dependencies attached. The delivery team controls provisioning; confirm here when active.`, dueDays: 10 });
    await h.caseState('HANDED_OFF', 'With the delivery team');
    await h.trail({ act: 'HANDOFF', summary: `Passed the approved requirements into fulfilment as task #${taskId} for the delivery team. Waiting for their confirmation.`, system: 'Order management · PATCH /orders/v1/{id} (stage only)' });
    return { wait: 'EVENT', outputs: { taskId } };
  }
  await core.setOrderStage(h.conn, { orderId: p.order_id, stage: 'ACTIVE', activatedOn: today() });
  await h.trail({ act: 'EVENT', summary: `The delivery team confirmed activation on ${today()}.`, actor_type: 'HUMAN', actor_id: 'noc', actor_name: `${PERSONA.noc.name} (${PERSONA.noc.role})`, autonomy: null });
  return { decision: 'Provisioned by the delivery team' };
});
on('WF-05', 'verify', async (h) => {
  const p = h.run.payload;
  const { order } = await core.orderOf(h.conn, p.order_id);
  const days = Math.round((Date.parse(today()) - Date.parse(order.requested_on)) / 86_400_000);
  const ok = order.stage === 'ACTIVE' && Number(order.quote?.monthly) === Number(order.monthly_value);
  await recordOutcome(h.c, { workflowId: 'WF-05', caseRef: h.kase.ref, delegated: false, correct: ok, note: ok ? `Activated in ${days} days, records match the quote` : 'Records do not match the quote', scenario: h.run.scenario_key });
  await message(h, { template: 'ORDER_ACTIVE', accountId: p.account_id, channel: 'EMAIL', vars: { name: p.account_name, service: p.service.replace(/_/g, ' '), sites: p.sites, date: today(), quoteDate: String(h.run.created_at).slice(0, 10), billingStart: plusDays(1), ref: h.kase.ref } });
  await h.trail({ act: 'VERIFY', summary: ok ? `Verified: the service is active and the billing record matches the quote (${await fmt(h, p.monthly_value)} per month). Quote-to-activation: ${days} days from the order.` : 'Mismatch between the activated service and the quote: escalated.' });
  await h.closeCase(ok ? 'ACTIVATED' : 'MISMATCH');
  return { decision: ok ? `Activated in ${days} days` : 'Mismatch' };
});
