/**
 * The measures each workflow is held to. Baselines are the operator's own
 * (synthetic here); the current value is computed by Muraqib from verified
 * cases, never reported by the agent that acted. Targets are illustrative
 * ranges from the approved launch content, to be agreed in discovery.
 */
import type { Domain } from './types.js';

export type MeasureDef = { id: string; domain: Domain; name: string; unit: 'AED' | '%' | 'days' | 'hours' | 'count'; better: 'lower' | 'higher'; definition: string; watch: string; target: string | null };

export const MEASURES: MeasureDef[] = [
  { id: 'dispute-cost', domain: 'BILLING', name: 'Cost per resolved dispute', unit: 'AED', better: 'lower', definition: 'Handling time at loaded cost, plus any credit later reversed, divided by disputes closed as resolved (no reopening within fourteen days). A credit that was due is not a cost.', watch: 'Wrongful credits, reopened disputes, disputes closed without evidence.', target: '30–50% relative reduction (illustrative)' },
  { id: 'dispute-authority', domain: 'BILLING', name: 'Disputes resolved within approved authority', unit: '%', better: 'higher', definition: 'Share of credits posted with a recorded approval by a person holding the limit, or under an authority the workflow currently holds; any other credit counts against it.', watch: 'Credits above a limit, credits without an approval row, authority used after it was reduced.', target: null },
  { id: 'fraud-loss', domain: 'ROAMING', name: 'Confirmed fraud loss', unit: 'AED', better: 'lower', definition: 'Rated value of confirmed fraudulent roaming usage in the period, net of partner recoveries.', watch: 'False positives (restrictions lifted on verification), partner disputes raised against our queries.', target: '30–50% relative reduction (illustrative)' },
  { id: 'settlement-time', domain: 'ROAMING', name: 'Settlement query resolution time', unit: 'days', better: 'lower', definition: 'Days from a settlement query to the partner’s acknowledgement and adjustment.', watch: 'Queries withdrawn, adjustments reversed.', target: '20–30% relative reduction (illustrative)' },
  { id: 'retained-contribution', domain: 'CVM', name: 'Retained contribution', unit: 'AED', better: 'higher', definition: 'Contribution retained from subscribers who received a response, against a comparison group that did not, net of the response’s cost, over ninety days.', watch: 'Benefits that would have happened anyway, discount leakage, intervention cost.', target: null },
  { id: 'offer-consent', domain: 'CVM', name: 'Responses with verified consent', unit: '%', better: 'higher', definition: 'Share of retention responses presented to subscribers with marketing consent on record at the time. The number must be 100; anything else is a breach, not a measure.', watch: 'Cases Hami closed for missing consent (expected), any response without consent (never).', target: null },
  { id: 'first-time-resolution', domain: 'SERVICE', name: 'First-time resolution', unit: '%', better: 'higher', definition: 'Share of complaints with no repeat contact or reopening about the same problem within fourteen days.', watch: 'Deflected contacts counted as resolved; complaints to the regulator.', target: null },
  { id: 'repeat-contact', domain: 'SERVICE', name: 'Repeat-contact rate', unit: '%', better: 'lower', definition: 'Share of complaints followed by another contact about the same problem within fourteen days.', watch: 'Repeat contacts hidden by closing and reopening under a new reference.', target: null },
  { id: 'quote-to-activation', domain: 'ENTERPRISE', name: 'Quote-to-activation time', unit: 'days', better: 'lower', definition: 'Days from the order request to confirmed activation with matching billing records.', watch: 'Rework after approval, provisioning failures, SLA exposure.', target: null },
  { id: 'order-rework', domain: 'ENTERPRISE', name: 'Orders reworked after approval', unit: '%', better: 'lower', definition: 'Share of approved orders returned to quote or feasibility before activation.', watch: 'Dependencies missed at feasibility.', target: null },
  { id: 'leakage-rate', domain: 'RA', name: 'Confirmed revenue leakage rate', unit: '%', better: 'lower', definition: 'Confirmed unbilled or under-billed eligible usage as a share of rated revenue, counted once and separately from fraud.', watch: 'Double-counted recovery, timing differences counted as leakage.', target: '40–60% relative reduction (illustrative)' },
];
export const MEASURE: Record<string, MeasureDef> = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
