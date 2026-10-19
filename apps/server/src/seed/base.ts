/**
 * The synthetic world of Dhow Telecom: 3,000 subscribers, 40 enterprise
 * accounts, 24 roaming partners, three months of invoices, usage behind every
 * roaming charge, flags, complaints, orders, signals, and the planted
 * fixtures the scenarios use (edge_key). Deterministic.
 */
import type { PoolClient } from 'pg';
import { insertMany } from '../db.js';
import { rng, addDays, type Rng } from './rng.js';
import { ACCOUNTS, CELLS, FIRST_AR, FIRST_INTL, LAST_AR, LAST_INTL, PARTNERS, PLANS_ENTERPRISE, PLANS_POSTPAID, PLANS_PREPAID } from './names.js';

export const DEMO_TODAY = '2026-10-10';
const N_SUBS = 3000;
const sid = (i: number) => `DEMO-S-${String(i).padStart(6, '0')}`;
const aid = (i: number) => `DEMO-E-${String(i).padStart(3, '0')}`;

type Sub = { id: string; name: string; msisdn: string; segment: string; plan: string; tenure_months: number; arpu: number; language: string; status: string; roaming_enabled: boolean; consent_marketing: boolean; consent_offers: boolean; churn_risk: number; account_id: string | null; nps_last: number | null; edge_key: string | null; home_cell: string; device_changed_on: string | null };

export async function seedBase(c: PoolClient) {
  const r = rng();
  // ---- partners and tariffs
  const partners = PARTNERS.map((p) => ({ id: p[0], name: p[1], country: p[2], agreement: p[3], settlement_cycle_days: p[4], tap_lag_days: p[5], open_queries: 0 }));
  await insertMany(c, 'core.partners', partners);
  const tariffs: any[] = [];
  for (const p of partners) {
    const zone = ['Egypt', 'Jordan', 'Lebanon', 'Iraq', 'Morocco', 'Sudan'].includes(p.country) ? 'A' : ['United Kingdom', 'Germany', 'France', 'Austria', 'Latvia', 'United States', 'Japan', 'South Korea', 'Türkiye', 'Azerbaijan'].includes(p.country) ? 'B' : 'C';
    const data = zone === 'A' ? 0.165 : zone === 'B' ? 0.21 : 0.29;
    tariffs.push({ id: `T-${p.id}-D`, partner_id: p.id, zone, type: 'ROAMING_DATA', unit_price: data, unit: 'MB' });
    tariffs.push({ id: `T-${p.id}-V`, partner_id: p.id, zone, type: 'ROAMING_VOICE', unit_price: zone === 'A' ? 1.9 : zone === 'B' ? 2.6 : 3.4, unit: 'MIN' });
  }
  await insertMany(c, 'core.tariffs', tariffs);

  // ---- accounts
  const accounts = ACCOUNTS.map((a, i) => ({ id: aid(i + 1), name: a[0], sector: a[1], lines: r.int(12, 420), contract_value: r.int(40, 900) * 1000, owner: r.pick(['Sara Qasimi', 'Hamad Al Ketbi', 'Priya Nair']), edge_key: i === 0 ? 'enterprise-sdwan' : null }));
  await insertMany(c, 'core.accounts', accounts);

  // ---- subscribers
  const subs: Sub[] = [];
  for (let i = 1; i <= N_SUBS; i++) {
    const ar = r.chance(0.62);
    const name = ar ? `${r.pick(FIRST_AR)} ${r.pick(LAST_AR)}` : `${r.pick(FIRST_INTL)} ${r.pick(LAST_INTL)}`;
    const seg = r.chance(0.55) ? 'PREPAID' : r.chance(0.86) ? 'POSTPAID' : 'ENTERPRISE';
    const plan = seg === 'PREPAID' ? r.pick(PLANS_PREPAID) : seg === 'POSTPAID' ? r.pick(PLANS_POSTPAID) : r.pick(PLANS_ENTERPRISE);
    const arpu = seg === 'PREPAID' ? r.int(35, 140) : seg === 'POSTPAID' ? r.int(180, 620) : r.int(220, 900);
    subs.push({ id: sid(i), name, msisdn: `+971 5${r.int(0, 8)} ${r.int(100, 999)} ${r.int(1000, 9999)}`, segment: seg, plan, tenure_months: r.int(1, 120), arpu, language: ar ? (r.chance(0.7) ? 'ar' : 'en') : 'en', status: r.chance(0.97) ? 'ACTIVE' : 'SUSPENDED', roaming_enabled: seg !== 'PREPAID' || r.chance(0.3), consent_marketing: r.chance(0.68), consent_offers: r.chance(0.6), churn_risk: r.round(r.next() * 0.5, 2), account_id: seg === 'ENTERPRISE' ? aid(r.int(1, accounts.length)) : null, nps_last: r.chance(0.4) ? r.int(-100, 100) : null, edge_key: null, home_cell: r.pick(CELLS), device_changed_on: r.chance(0.08) ? addDays(DEMO_TODAY, -r.int(1, 40)) : null });
  }
  // Planted fixtures: specific subscribers with specific properties.
  const fx = (i: number, patch: Partial<Sub>) => Object.assign(subs[i - 1]!, patch);
  fx(101, { edge_key: 'dispute-small', name: 'Mariam Al Shamsi', segment: 'POSTPAID', plan: 'Dhow Plus 299', language: 'ar', roaming_enabled: true, status: 'ACTIVE', tenure_months: 41, arpu: 310 });
  fx(102, { edge_key: 'dispute-above-limit', name: 'Hamad Al Ketbi', segment: 'ENTERPRISE', plan: 'Dhow Business Pro', language: 'en', roaming_enabled: true, status: 'ACTIVE', account_id: aid(2), tenure_months: 66, arpu: 780 });
  fx(103, { edge_key: 'dispute-wrong', name: 'Deepa Menon', segment: 'POSTPAID', plan: 'Dhow Plus 199', language: 'en', roaming_enabled: true, status: 'ACTIVE', tenure_months: 18, arpu: 215 });
  fx(104, { edge_key: 'dispute-tiny', name: 'Saeed Al Hammadi', segment: 'POSTPAID', plan: 'Dhow Plus 199', language: 'ar', status: 'ACTIVE', tenure_months: 9, arpu: 205 });
  fx(105, { edge_key: 'dispute-tiny-2', name: 'Elif Yilmaz', segment: 'POSTPAID', plan: 'Dhow Family 349', language: 'en', status: 'ACTIVE', tenure_months: 27, arpu: 355 });
  fx(106, { edge_key: 'roaming-simbox', name: 'Arun Pillai', segment: 'PREPAID', plan: 'Dhow Flex 100', language: 'en', roaming_enabled: true, status: 'ACTIVE', tenure_months: 2, arpu: 95, device_changed_on: addDays(DEMO_TODAY, -3) });
  fx(107, { edge_key: 'retention-no-consent', name: 'Latifa Al Mazrouei', segment: 'POSTPAID', plan: 'Dhow Plus 299', language: 'ar', consent_marketing: false, consent_offers: false, churn_risk: 0.72, status: 'ACTIVE', tenure_months: 34, arpu: 305, home_cell: 'SHJ-0119' });
  fx(108, { edge_key: 'retention-with-consent', name: 'Omar Haddad', segment: 'POSTPAID', plan: 'Dhow Plus 299', language: 'en', consent_marketing: true, consent_offers: true, churn_risk: 0.71, status: 'ACTIVE', tenure_months: 29, arpu: 298, home_cell: 'SHJ-0119' });
  fx(109, { edge_key: 'complaint-speed', name: 'Grace Okafor', segment: 'POSTPAID', plan: 'Dhow Plus 199', language: 'en', status: 'ACTIVE', tenure_months: 14, arpu: 199 });
  fx(110, { edge_key: 'complaint-activation', name: 'Khalid Al Suwaidi', segment: 'POSTPAID', plan: 'Dhow Unlimited 499', language: 'ar', status: 'ACTIVE', tenure_months: 1, arpu: 499 });
  await insertMany(c, 'core.subscribers', subs);

  // ---- invoices and charges (postpaid and enterprise lines, three periods)
  const invoices: any[] = []; const charges: any[] = []; const usage: any[] = [];
  let invN = 0, chN = 0, usN = 0;
  const periods = ['2026-07', '2026-08', '2026-09'];
  const mkUsage = (sub: Sub, on: string, type: 'DATA' | 'VOICE', partner: any | null, volume: number, rated: number, extra: Partial<any> = {}) => {
    const u = { id: `DEMO-U-${String(++usN).padStart(6, '0')}`, subscriber_id: sub.id, on_date: on, type, partner_id: partner?.id ?? null, volume, unit: type === 'DATA' ? 'MB' : 'MIN', rated_amount: rated, session_ref: `S-${sub.id.slice(-6)}-${usN}`, cell_id: partner ? `${partner.country.slice(0, 3).toUpperCase()}-${r.int(100, 999)}` : sub.home_cell, tap_received_on: partner ? addDays(on, partner.tap_lag_days) : null, ...extra };
    usage.push(u); return u;
  };
  const mkCharge = (inv: any, sub: Sub, type: string, description: string, amount: number, session_ref: string | null, partner_id: string | null, rated_on: string) => {
    const ch = { id: `DEMO-CH-${String(++chN).padStart(6, '0')}`, invoice_id: inv.id, subscriber_id: sub.id, type, description, amount, session_ref, partner_id, rated_on };
    charges.push(ch); inv.amount += amount; return ch;
  };
  const fixtures: Record<string, any> = {};
  for (const sub of subs) {
    if (sub.segment === 'PREPAID') continue;
    for (const period of periods) {
      const issued = `${period}-28`; const inv = { id: `DEMO-INV-${String(++invN).padStart(6, '0')}`, subscriber_id: sub.id, period, amount: 0, status: period === '2026-09' ? (r.chance(0.55) ? 'ISSUED' : 'PAID') : 'PAID', issued_on: issued, due_on: addDays(issued, 21) };
      invoices.push(inv);
      mkCharge(inv, sub, 'PLAN', sub.plan, sub.segment === 'ENTERPRISE' ? 220 : Number(sub.plan.match(/\d+/)?.[0] ?? 199), null, null, `${period}-01`);
      if (r.chance(0.35)) mkCharge(inv, sub, 'ADDON', r.pick(['Caller tunes', 'Data booster 5 GB', 'International minutes 100', 'Device protection']), r.pick([11, 29, 38, 41, 55]), null, null, `${period}-${String(r.int(2, 26)).padStart(2, '0')}`);
      if (sub.roaming_enabled && r.chance(0.18) && period === '2026-09') {
        const partner = r.pick(partners); const t = tariffs.find((x) => x.partner_id === partner.id && x.type === 'ROAMING_DATA')!;
        for (let k = 0; k < r.int(1, 3); k++) { const on = `2026-09-${String(r.int(3, 22)).padStart(2, '0')}`; const vol = r.int(80, 900); const rated = r.round(vol * t.unit_price); const u = mkUsage(sub, on, 'DATA', partner, vol, rated); mkCharge(inv, sub, 'ROAMING_DATA', `Roaming data ${partner.country} ${vol} MB`, rated, u.session_ref, partner.id, on); }
      }
      // ---- fixtures live on the September invoice
      if (period !== '2026-09') continue;
      if (sub.edge_key === 'dispute-small') {
        const partner = partners.find((p) => p.id === 'P-05')!; const t = tariffs.find((x) => x.partner_id === 'P-05' && x.type === 'ROAMING_DATA')!;
        const u1 = mkUsage(sub, '2026-09-14', 'DATA', partner, 857, r.round(857 * t.unit_price)); // 180.0
        mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data United Kingdom 857 MB', 180, u1.session_ref, partner.id, '2026-09-14');
        const dup = mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data United Kingdom 857 MB', 180, u1.session_ref, partner.id, '2026-09-14'); // the same session rated twice
        const u2 = mkUsage(sub, '2026-09-15', 'DATA', partner, 286, 60); mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data United Kingdom 286 MB', 60, u2.session_ref, partner.id, '2026-09-15');
        fixtures[sub.edge_key] = { invoice: inv, charge: dup, disputed: 420, text: 'I was charged AED 420 for roaming in the UK but my app showed much less data used. Please check.', channel: 'APP' };
      }
      if (sub.edge_key === 'dispute-above-limit') {
        const partner = partners.find((p) => p.id === 'P-01')!; // Egypt, zone A, 0.165/MB
        const u = mkUsage(sub, '2026-09-09', 'DATA', partner, 10000, 1650);
        const ch = mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data Egypt 10,000 MB', 2900, u.session_ref, partner.id, '2026-09-09'); // rated at zone C by mistake
        fixtures[sub.edge_key] = { invoice: inv, charge: ch, disputed: 2900, text: 'Our Cairo site line was charged AED 2,900 for 10 GB; our agreement rate is far lower. Please review.', channel: 'CALL' };
      }
      if (sub.edge_key === 'dispute-wrong') {
        const partner = partners.find((p) => p.id === 'P-02')!; // Türkiye, lag 4 days
        const u1 = mkUsage(sub, '2026-09-20', 'DATA', partner, 457, 96, { tap_received_on: null, cell_id: 'IST-214' });
        const u2 = mkUsage(sub, '2026-09-20', 'DATA', partner, 457, 96, { tap_received_on: null, cell_id: 'IST-388' });
        const ch1 = mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data Türkiye 457 MB', 96, u1.session_ref, partner.id, '2026-09-20');
        mkCharge(inv, sub, 'ROAMING_DATA', 'Roaming data Türkiye 457 MB', 96, u2.session_ref, partner.id, '2026-09-20');
        fixtures[sub.edge_key] = { invoice: inv, charge: ch1, disputed: 192, text: 'Two identical roaming charges of AED 96 three minutes apart in Istanbul. That must be a duplicate.', channel: 'APP' };
      }
      if (sub.edge_key === 'dispute-tiny') {
        mkCharge(inv, sub, 'ADDON', 'Caller tunes', 38, null, null, '2026-09-11'); const dup = mkCharge(inv, sub, 'ADDON', 'Caller tunes', 38, null, null, '2026-09-11');
        fixtures[sub.edge_key] = { invoice: inv, charge: dup, disputed: 38, text: 'Caller tunes charged twice this month.', channel: 'APP' };
      }
      if (sub.edge_key === 'dispute-tiny-2') {
        mkCharge(inv, sub, 'ADDON', 'Device protection', 41, null, null, '2026-09-05'); const dup = mkCharge(inv, sub, 'ADDON', 'Device protection', 41, null, null, '2026-09-05');
        fixtures[sub.edge_key] = { invoice: inv, charge: dup, disputed: 41, text: 'Device protection appears twice on my bill.', channel: 'STORE' };
      }
    }
  }
  // roaming-simbox usage: a prepaid line, 60 short calls from one cell in India
  const sim = subs[105]!; const simPartner = partners.find((p) => p.id === 'P-04')!;
  for (let k = 0; k < 60; k++) mkUsage(sim, addDays(DEMO_TODAY, -(k % 3) - 1), 'VOICE', simPartner, r.round(0.4 + r.next() * 0.6, 1), r.round(2.6 * 0.6), { cell_id: 'MUM-771', tap_received_on: k % 2 ? addDays(DEMO_TODAY, -1) : null });
  // ---- roaming events (flags)
  const events: any[] = [];
  let evN = 0;
  for (let k = 0; k < 38; k++) {
    const s = r.pick(subs.filter((x) => x.roaming_enabled && !x.edge_key)); const p = r.pick(partners);
    const pattern = r.pick(['DATA_SPIKE', 'SIM_BOX', 'IRSF', 'WANGIRI', 'SIM_SWAP', 'IMPOSSIBLE_TRAVEL']);
    const score = r.round(0.3 + r.next() * 0.65, 2);
    events.push({ id: `DEMO-RF-${String(++evN).padStart(4, '0')}`, subscriber_id: s.id, partner_id: p.id, on_date: addDays(DEMO_TODAY, -r.int(0, 55)), pattern, score, detail: `${pattern.replace(/_/g, ' ').toLowerCase()} with ${p.name}; score ${score}`, status: k < 30 ? (score >= 0.75 ? 'RESTRICTED' : 'DISMISSED') : 'OPEN' });
  }
  events.push({ id: `DEMO-RF-${String(++evN).padStart(4, '0')}`, subscriber_id: sim.id, partner_id: simPartner.id, on_date: addDays(DEMO_TODAY, -1), pattern: 'SIM_BOX', score: 0.91, detail: '60 outbound calls under a minute from one cell (MUM-771) in three days; device changed three days ago', status: 'OPEN' });
  await insertMany(c, 'core.roaming_events', events);

  // ---- offers
  await insertMany(c, 'core.offers', [
    { id: 'OFF-01', name: '5 GB data top-up', kind: 'RETENTION', value: 25, terms: 'one month, no change to the plan', approved: true, segments: ['PREPAID', 'POSTPAID'], min_tenure: 3 },
    { id: 'OFF-02', name: 'International minutes 100', kind: 'RETENTION', value: 35, terms: 'one month', approved: true, segments: ['POSTPAID', 'ENTERPRISE'], min_tenure: 6 },
    { id: 'OFF-03', name: 'Recharge bonus 20%', kind: 'RECHARGE', value: 20, terms: 'next recharge', approved: true, segments: ['PREPAID'], min_tenure: 1 },
    { id: 'OFF-04', name: 'Plan upgrade trial', kind: 'UPGRADE', value: 60, terms: 'one month, reverts automatically', approved: true, segments: ['POSTPAID'], min_tenure: 12 },
    { id: 'OFF-05', name: 'Device protection, one month free', kind: 'RETENTION', value: 41, terms: 'one month', approved: true, segments: ['POSTPAID', 'ENTERPRISE'], min_tenure: 1 },
    { id: 'OFF-06', name: '15% price discount', kind: 'RETENTION', value: 45, terms: 'three months', approved: false, segments: ['POSTPAID'], min_tenure: 1 },
  ]);

  // ---- complaints (ninety days)
  const complaints: any[] = []; let cpN = 0;
  const texts: Record<string, string[]> = { BILLING: ['My bill is higher than last month and I did not change anything.', 'There is a charge I do not recognise.'], COVERAGE: ['No signal at home in the evenings for a week.', 'Calls drop inside my building since last month.'], SPEED: ['Internet is very slow this week even though I have data left.', 'Speed dropped to nothing after the 20th.'], ACTIVATION: ['My number port has been pending for days.', 'New SIM not activated after three days.'], ROAMING: ['Roaming did not work in Istanbul.', 'Charged for roaming I did not use.'], OTHER: ['The app logs me out constantly.', 'Store staff could not help with my request.'] };
  for (let k = 0; k < 240; k++) {
    const s = r.pick(subs.filter((x) => !x.edge_key)); const cat = r.pick(['BILLING', 'COVERAGE', 'SPEED', 'ACTIVATION', 'ROAMING', 'OTHER']); const on = addDays(DEMO_TODAY, -r.int(0, 90));
    const old = Date.parse(on) < Date.parse(addDays(DEMO_TODAY, -16));
    complaints.push({ id: `DEMO-CP-${String(++cpN).padStart(5, '0')}`, subscriber_id: s.id, channel: r.pick(['APP', 'CALL', 'STORE', 'SOCIAL', 'APP', 'CALL']), category: cat, text: r.pick(texts[cat]!), raised_on: on, contacts: r.int(1, 3), status: old ? (r.chance(0.8) ? 'RESOLVED' : 'REOPENED') : 'OPEN', reopened: old && r.chance(0.17), resolved_on: old ? addDays(on, r.int(1, 6)) : null, resolution: old ? 'Resolved by the service desk' : null });
  }
  for (const key of ['retention-no-consent', 'retention-with-consent']) {
    const s = subs.find((x) => x.edge_key === key)!;
    for (const d of [-21, -9]) complaints.push({ id: `DEMO-CP-${String(++cpN).padStart(5, '0')}`, subscriber_id: s.id, channel: 'APP', category: 'COVERAGE', text: 'No signal at home in the evenings; calls drop.', raised_on: addDays(DEMO_TODAY, d), contacts: 1, status: 'RESOLVED', reopened: false, resolved_on: addDays(DEMO_TODAY, d + 2), resolution: 'Fault ticket opened with the NOC' });
  }
  const sp = subs.find((x) => x.edge_key === 'complaint-speed')!;
  complaints.push({ id: `DEMO-CP-${String(++cpN).padStart(5, '0')}`, subscriber_id: sp.id, channel: 'APP', category: 'SPEED', text: 'My internet has been crawling since the 28th although I still have data on my plan. Please fix it.', raised_on: DEMO_TODAY, contacts: 1, status: 'OPEN', reopened: false, resolved_on: null, resolution: null });
  const ac = subs.find((x) => x.edge_key === 'complaint-activation')!;
  complaints.push({ id: `DEMO-CP-${String(++cpN).padStart(5, '0')}`, subscriber_id: ac.id, channel: 'CALL', category: 'ACTIVATION', text: 'Third time I call: my number port from my old operator has been pending for six days and nobody can tell me when it will complete.', raised_on: DEMO_TODAY, contacts: 3, status: 'OPEN', reopened: false, resolved_on: null, resolution: null });
  await insertMany(c, 'core.complaints', complaints);
  fixtures['complaint-speed'] = { complaintId: complaints[complaints.length - 2].id };
  fixtures['complaint-activation'] = { complaintId: complaints[complaints.length - 1].id };

  // ---- enterprise orders
  const orders: any[] = []; let oN = 0;
  for (let k = 0; k < 44; k++) {
    const a = accounts[r.int(1, accounts.length - 1)]!; const service = r.pick(['DEDICATED_INTERNET', 'SD_WAN', 'PRIVATE_APN', 'IOT_SIMS', 'SIP_TRUNK']); const requested = addDays(DEMO_TODAY, -r.int(2, 80));
    const stage = Date.parse(requested) < Date.parse(addDays(DEMO_TODAY, -30)) ? r.pick(['ACTIVE', 'ACTIVE', 'ACTIVE', 'REWORK']) : r.pick(['REQUESTED', 'FEASIBILITY', 'QUOTED', 'PROVISIONING']);
    orders.push({ id: `DEMO-O-${String(++oN).padStart(4, '0')}`, account_id: a.id, service, sites: r.int(1, 12), requested_on: requested, stage, monthly_value: r.int(4, 60) * 500, term_months: r.pick([12, 24, 36]), detail: `${r.int(50, 1000)} Mbps, standard SLA`, activated_on: stage === 'ACTIVE' ? addDays(requested, r.int(18, 46)) : null, quote: null });
  }
  orders.push({ id: `DEMO-O-${String(++oN).padStart(4, '0')}`, account_id: aid(1), service: 'SD_WAN', sites: 4, requested_on: addDays(DEMO_TODAY, -2), stage: 'REQUESTED', monthly_value: 18500, term_months: 36, detail: '4 sites (Jebel Ali, Abu Dhabi, Sharjah, Al Ain), 200 Mbps each, encrypted overlay, go-live in six weeks', activated_on: null, quote: null });
  await insertMany(c, 'core.orders', orders);
  fixtures['enterprise-sdwan'] = { orderId: orders[orders.length - 1].id };

  // ---- the billing queue (disputes) and CVM signals
  const queue: any[] = [];
  for (let k = 0; k < 84; k++) {
    const inv = r.pick(invoices.filter((i) => i.period === '2026-09' || i.period === '2026-08')); const s = subs.find((x) => x.id === inv.subscriber_id)!; if (s.edge_key) continue;
    const invCharges = charges.filter((x) => x.invoice_id === inv.id);
    const ch = r.pick(invCharges.filter((x) => x.type !== 'PLAN').length ? invCharges.filter((x) => x.type !== 'PLAN') : invCharges);
    // Half the disputes are real: the charge was duplicated on the invoice.
    if (r.chance(0.5) && ch.type !== 'PLAN') mkCharge(inv, s, ch.type, ch.description, Number(ch.amount), ch.session_ref, ch.partner_id, ch.rated_on);
    queue.push({ subscriber_id: s.id, invoice_id: inv.id, charge_id: ch.id, disputed_amount: r.round(Number(ch.amount) * (1 + (r.chance(0.5) ? 1 : 0))), customer_text: r.pick(texts.BILLING!), channel: r.pick(['APP', 'CALL', 'STORE']), raised_on: addDays(DEMO_TODAY, -r.int(0, 58)), picked: k < 72, edge_key: null });
  }
  for (const key of ['dispute-small', 'dispute-above-limit', 'dispute-wrong', 'dispute-tiny', 'dispute-tiny-2']) {
    const f = fixtures[key]; const s = subs.find((x) => x.edge_key === key)!;
    queue.push({ subscriber_id: s.id, invoice_id: f.invoice.id, charge_id: f.charge.id, disputed_amount: f.disputed, customer_text: f.text, channel: f.channel, raised_on: DEMO_TODAY, picked: false, edge_key: key });
  }
  await insertMany(c, 'core.invoices', invoices);
  await insertMany(c, 'core.charges', charges);
  await insertMany(c, 'core.usage', usage);
  await insertMany(c, 'core.billing_queue', queue);
  const signals: any[] = [];
  for (let k = 0; k < 56; k++) { const s = r.pick(subs.filter((x) => !x.edge_key && x.churn_risk > 0.3)); signals.push({ subscriber_id: s.id, on_date: addDays(DEMO_TODAY, -r.int(0, 58)), churn_risk: r.round(0.55 + r.next() * 0.35), service_problems: r.int(1, 3), cause: r.pick(['coverage', 'billing', 'speed']), picked: k < 50, edge_key: null }); }
  for (const key of ['retention-no-consent', 'retention-with-consent']) { const s = subs.find((x) => x.edge_key === key)!; signals.push({ subscriber_id: s.id, on_date: DEMO_TODAY, churn_risk: s.churn_risk, service_problems: 2, cause: 'coverage', picked: false, edge_key: key }); }
  await insertMany(c, 'core.cvm_signals', signals);

  return { subs, accounts, partners, invoices, charges, usage, complaints, orders, queue, signals, fixtures };
}
export type Base = Awaited<ReturnType<typeof seedBase>>;
