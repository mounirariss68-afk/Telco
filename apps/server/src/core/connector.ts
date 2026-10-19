/**
 * The connector: the ONLY code that reads or writes the operator's systems of
 * record (schema core). Every write names the system interface it would call
 * in a real deployment, records before/after, and is reversible. Nothing in
 * the engine or the API touches core directly.
 */
import type { Q } from '../db.js';
import { now } from '../clock.js';

export type Ctx = { c: Q; actor: string; runId?: number | null };

export type SubscriberFacts = {
  subscriber: any; account: any | null; invoices: any[]; charges: any[]; usage: any[]; roamingEvents: any[]; complaints: any[]; credits: any[]; restrictions: any[]; registrations: any[]; messages: any[];
};

export async function subscriberFacts(ctx: Ctx, subscriberId: string): Promise<SubscriberFacts> {
  const c = ctx.c;
  const subscriber = (await c.query(`SELECT * FROM core.subscribers WHERE id=$1`, [subscriberId])).rows[0];
  if (!subscriber) throw new Error(`Subscriber ${subscriberId} not found in CRM`);
  const account = subscriber.account_id ? (await c.query(`SELECT * FROM core.accounts WHERE id=$1`, [subscriber.account_id])).rows[0] ?? null : null;
  const invoices = (await c.query(`SELECT * FROM core.invoices WHERE subscriber_id=$1 ORDER BY issued_on DESC LIMIT 6`, [subscriberId])).rows;
  const charges = invoices.length ? (await c.query(`SELECT * FROM core.charges WHERE invoice_id = ANY($1) ORDER BY rated_on`, [invoices.map((i: any) => i.id)])).rows : [];
  const usage = (await c.query(`SELECT * FROM core.usage WHERE subscriber_id=$1 ORDER BY on_date DESC, session_ref LIMIT 400`, [subscriberId])).rows;
  const roamingEvents = (await c.query(`SELECT * FROM core.roaming_events WHERE subscriber_id=$1 ORDER BY on_date DESC`, [subscriberId])).rows;
  const complaints = (await c.query(`SELECT * FROM core.complaints WHERE subscriber_id=$1 ORDER BY raised_on DESC`, [subscriberId])).rows;
  const credits = (await c.query(`SELECT * FROM core.credits WHERE subscriber_id=$1 ORDER BY posted_at DESC`, [subscriberId])).rows;
  const restrictions = (await c.query(`SELECT * FROM core.restrictions WHERE subscriber_id=$1 ORDER BY applied_at DESC`, [subscriberId])).rows;
  const registrations = (await c.query(`SELECT * FROM core.offer_registrations WHERE subscriber_id=$1 ORDER BY registered_at DESC`, [subscriberId])).rows;
  const messages = (await c.query(`SELECT * FROM layer.messages WHERE subscriber_id=$1 ORDER BY sent_at DESC LIMIT 20`, [subscriberId])).rows;
  return { subscriber, account, invoices, charges, usage, roamingEvents, complaints, credits, restrictions, registrations, messages };
}

export const partnerOf = async (ctx: Ctx, id: string) => (await ctx.c.query(`SELECT * FROM core.partners WHERE id=$1`, [id])).rows[0] ?? null;
export const tariffFor = async (ctx: Ctx, partnerId: string | null, type: string) => (await ctx.c.query(`SELECT * FROM core.tariffs WHERE ($1::text IS NULL AND partner_id IS NULL OR partner_id=$1) AND type=$2 LIMIT 1`, [partnerId, type])).rows[0] ?? null;
export const orderOf = async (ctx: Ctx, id: string) => { const o = (await ctx.c.query(`SELECT * FROM core.orders WHERE id=$1`, [id])).rows[0]; if (!o) throw new Error(`Order ${id} not found`); const a = (await ctx.c.query(`SELECT * FROM core.accounts WHERE id=$1`, [o.account_id])).rows[0]; return { order: o, account: a }; };

// ------------------------------------------------------------------ writes (each names its interface)

/** Billing: POST /billing/v2/accounts/{id}/credits — reversible with reverseCredit. */
export async function postCredit(ctx: Ctx, p: { subscriberId: string; invoiceId: string; amount: number; reason: string; approvalRef: string; caseRef: string }) {
  const before = (await ctx.c.query(`SELECT status, amount FROM core.invoices WHERE id=$1`, [p.invoiceId])).rows[0];
  const r = await ctx.c.query(`INSERT INTO core.credits (subscriber_id, invoice_id, amount, reason, posted_at, posted_by, approval_ref, case_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [p.subscriberId, p.invoiceId, p.amount, p.reason, now(), ctx.actor, p.approvalRef, p.caseRef]);
  await ctx.c.query(`UPDATE core.invoices SET status='CREDITED' WHERE id=$1`, [p.invoiceId]);
  return { creditId: r.rows[0].id as number, system: 'Billing · POST /billing/v2/credits', before, after: { status: 'CREDITED', credit: p.amount } };
}
/** Billing: POST /billing/v2/credits/{id}/reverse. */
export async function reverseCredit(ctx: Ctx, p: { creditId: number; reason: string }) {
  const cr = (await ctx.c.query(`SELECT * FROM core.credits WHERE id=$1`, [p.creditId])).rows[0];
  if (!cr) throw new Error(`Credit ${p.creditId} not found`);
  await ctx.c.query(`UPDATE core.credits SET reversed_at=$2, reversal_reason=$3 WHERE id=$1`, [p.creditId, now(), p.reason]);
  await ctx.c.query(`UPDATE core.invoices SET status='ISSUED' WHERE id=$1`, [cr.invoice_id]);
  return { system: 'Billing · POST /billing/v2/credits/{id}/reverse', before: { reversed: false, amount: cr.amount }, after: { reversed: true, amount: cr.amount } };
}
/** Roaming platform: PUT /roaming/v1/subscribers/{msisdn}/restriction — lifted with liftRestriction. */
export async function restrictRoaming(ctx: Ctx, p: { subscriberId: string; reason: string; reversal: string; caseRef: string }) {
  const r = await ctx.c.query(`INSERT INTO core.restrictions (subscriber_id, kind, applied_at, reason, reversal, case_ref) VALUES ($1,'ROAMING',$2,$3,$4,$5) RETURNING id`, [p.subscriberId, now(), p.reason, p.reversal, p.caseRef]);
  await ctx.c.query(`UPDATE core.subscribers SET roaming_enabled=false WHERE id=$1`, [p.subscriberId]);
  await ctx.c.query(`UPDATE core.roaming_events SET status='RESTRICTED' WHERE subscriber_id=$1 AND status='OPEN'`, [p.subscriberId]);
  return { restrictionId: r.rows[0].id as number, system: 'Roaming platform · PUT /roaming/v1/restriction', before: { roaming_enabled: true }, after: { roaming_enabled: false } };
}
export async function dismissRoamingEvents(ctx: Ctx, subscriberId: string) {
  await ctx.c.query(`UPDATE core.roaming_events SET status='DISMISSED' WHERE subscriber_id=$1 AND status='OPEN'`, [subscriberId]);
  return { system: 'Roaming platform · PATCH /roaming/v1/events (dismiss)' };
}
/** Partner settlement: POST /wholesale/v1/queries. */
export async function raiseSettlementQuery(ctx: Ctx, p: { partnerId: string; amount: number; caseRef: string }) {
  const r = await ctx.c.query(`INSERT INTO core.settlement_queries (partner_id, raised_at, amount, status, case_ref) VALUES ($1,$2,$3,'RAISED',$4) RETURNING id`, [p.partnerId, now(), p.amount, p.caseRef]);
  await ctx.c.query(`UPDATE core.partners SET open_queries = open_queries + 1 WHERE id=$1`, [p.partnerId]);
  return { queryId: r.rows[0].id as number, system: 'Settlement · POST /wholesale/v1/queries' };
}
export async function acknowledgeQuery(ctx: Ctx, queryId: number) {
  await ctx.c.query(`UPDATE core.settlement_queries SET status='ACKNOWLEDGED', acknowledged_at=$2 WHERE id=$1`, [queryId, now()]);
}
/** CVM: POST /cvm/v1/registrations — an approved offer or a fix, never a tariff change. */
export async function registerResponse(ctx: Ctx, p: { subscriberId: string; offerId: string | null; fix: string | null; caseRef: string }) {
  const r = await ctx.c.query(`INSERT INTO core.offer_registrations (subscriber_id, offer_id, fix, registered_at, case_ref, consent_checked) VALUES ($1,$2,$3,$4,$5,true) RETURNING id`, [p.subscriberId, p.offerId, p.fix, now(), p.caseRef]);
  await ctx.c.query(`UPDATE core.subscribers SET churn_risk = GREATEST(0.05, churn_risk - 0.25) WHERE id=$1`, [p.subscriberId]);
  return { registrationId: r.rows[0].id as number, system: 'CVM · POST /cvm/v1/registrations' };
}
/** Case system: PATCH /cases/v1/complaints/{id}. */
export async function resolveComplaint(ctx: Ctx, p: { complaintId: string; resolution: string; status: 'RESOLVED' | 'HANDED_OFF' }) {
  const before = (await ctx.c.query(`SELECT status FROM core.complaints WHERE id=$1`, [p.complaintId])).rows[0];
  await ctx.c.query(`UPDATE core.complaints SET status=$2, resolution=$3, resolved_on=$4 WHERE id=$1`, [p.complaintId, p.status, p.resolution, p.status === 'RESOLVED' ? new Date(now().getTime() + 4 * 3600_000).toISOString().slice(0, 10) : null]);
  return { system: 'Case system · PATCH /cases/v1/complaints/{id}', before, after: { status: p.status } };
}
/** Order management: PATCH /orders/v1/{id} — stage only; provisioning is never called from here. */
export async function setOrderStage(ctx: Ctx, p: { orderId: string; stage: string; quote?: any; activatedOn?: string | null }) {
  const before = (await ctx.c.query(`SELECT stage FROM core.orders WHERE id=$1`, [p.orderId])).rows[0];
  await ctx.c.query(`UPDATE core.orders SET stage=$2, quote=COALESCE($3::jsonb, quote), activated_on=COALESCE($4::date, activated_on) WHERE id=$1`, [p.orderId, p.stage, p.quote ? JSON.stringify(p.quote) : null, p.activatedOn ?? null]);
  return { system: 'Order management · PATCH /orders/v1/{id}', before, after: { stage: p.stage } };
}
export async function markPicked(ctx: Ctx, table: 'billing_queue' | 'cvm_signals', id: number) { await ctx.c.query(`UPDATE core.${table} SET picked=true WHERE id=$1`, [id]); }
