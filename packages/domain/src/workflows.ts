/**
 * The workflows. Five are built; one is designed and listed as such. Every
 * workflow runs the same loop: detect, investigate, propose, approve, verify.
 * The agent does four of the five; a person does the one that costs money,
 * changes a tariff, restricts a customer or touches the network. The
 * `boundary` says what may never happen without a person; `ceiling` is the
 * highest rung the workflow may ever earn, set by exposure, not by evidence.
 */
import type { WorkflowDef } from './types.js';

export const WORKFLOWS: WorkflowDef[] = [
  {
    id: 'WF-01', domain: 'BILLING', name: 'Billing dispute investigation', owner: 'Billing process owner (billing manager)', status: 'BUILT', ceiling: 'A3',
    trigger: 'A disputed charge enters the billing case queue from the app, the call centre or a store.',
    boundary: 'Credits need a financial limit and a named approver: the billing officer within her limit, the billing manager above it, finance above his. Credits under the small-credit limit may post without a person only while the workflow holds A3 authority. Rating-engine changes never happen here; they go to change control.',
    answers: 'Dispute cost sitting on a billing system the operator has just paid to modernise.',
    measureIds: ['dispute-cost', 'dispute-authority'],
    steps: [
      { key: 'detect', label: 'Detect', actor_type: 'AGENT', actor: 'raqib', what: 'Reads the billing case queue the operator already owns and opens one case per dispute. Writes nothing outside the case.' },
      { key: 'investigate', label: 'Investigate', actor_type: 'AGENT', actor: 'fahis', what: 'Retrieves the usage records, the tariff and the partner TAP log for the disputed period and checks them against each other. If a record is missing it asks rather than guesses.' },
      { key: 'propose', label: 'Propose', actor_type: 'AGENT', actor: 'mushir', what: 'Writes the finding, the proposed credit, the alternatives and the permission the credit needs. No write yet.' },
      { key: 'guard', label: 'Guard', actor_type: 'SYSTEM', actor: 'hami', what: 'Checks the proposal against the limits and the authority the workflow currently holds, and routes it to the right approver or, for a small credit under A3 authority, lets it post.' },
      { key: 'approve', label: 'Approve', actor_type: 'HUMAN', actor: 'approver:credit', what: 'A person approves within her financial limit. Above it, the case goes to the next limit holder. A decision that differs from the recommendation needs a reason.' },
      { key: 'execute', label: 'Execute', actor_type: 'SYSTEM', actor: 'munaffidh', what: 'Posts the credit through the billing system’s credit interface, only after a recorded approval (or under A3 authority for a small credit). Reversible.' },
      { key: 'notify', label: 'Notify', actor_type: 'AGENT', actor: 'rafiq', what: 'Tells the customer what was found and what was credited, from an approved template in their language.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Confirms the credit posted, the invoice state changed and the customer did not come back; compares with the baseline; closes only with evidence the owner accepts.' },
    ],
  },
  {
    id: 'WF-02', domain: 'ROAMING', name: 'Roaming fraud investigation', owner: 'Roaming process owner (roaming fraud analyst)', status: 'BUILT', ceiling: 'A2',
    trigger: 'Partner files or read-only telemetry flag an unusual usage pattern on a roaming subscriber. No restriction is applied by the flag.',
    boundary: 'A roaming restriction needs the analyst’s approval and a documented reversal. A settlement query to the partner needs the same. Any steering or network change is a handoff to the NOC; the agent never acts on the network.',
    answers: 'Settlement complexity and fraud exposure rising with 5G roaming and more partners.',
    measureIds: ['fraud-loss', 'settlement-time'],
    steps: [
      { key: 'detect', label: 'Detect', actor_type: 'AGENT', actor: 'raqib', what: 'Opens a case for each flagged pattern above the score threshold. Reads telemetry; never changes it.' },
      { key: 'investigate', label: 'Investigate', actor_type: 'AGENT', actor: 'fahis', what: 'Assembles the usage, the partner TAP records, the subscriber’s history and the device changes, and tests the pattern against each.' },
      { key: 'propose', label: 'Propose', actor_type: 'AGENT', actor: 'mushir', what: 'Proposes a restriction, a settlement query to the partner, or dismissal, with the evidence, and names the NOC handoff if steering would help.' },
      { key: 'guard', label: 'Guard', actor_type: 'SYSTEM', actor: 'hami', what: 'Confirms the proposal is within the roaming owner’s authority and that no network action is embedded in it.' },
      { key: 'approve', label: 'Approve', actor_type: 'HUMAN', actor: 'roaming_analyst', what: 'The roaming fraud analyst approves the restriction or the query, or dismisses the case, with the reversal path recorded.' },
      { key: 'execute', label: 'Execute', actor_type: 'SYSTEM', actor: 'munaffidh', what: 'Applies the approved restriction through the roaming platform interface and raises the settlement query; opens a NOC task for any steering. Never touches the network.' },
      { key: 'notify', label: 'Notify', actor_type: 'AGENT', actor: 'rafiq', what: 'Tells the subscriber about the restriction and how to lift it, from an approved template.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Confirms the restriction holds, the partner acknowledged the query, and the loss stopped; records the outcome against the baseline.' },
    ],
  },
  {
    id: 'WF-03', domain: 'CVM', name: 'Retention after a service problem', owner: 'Marketing & CVM process owner (CVM manager)', status: 'BUILT', ceiling: 'A2',
    trigger: 'A subscriber with recent service problems and rising churn risk becomes eligible for a reviewed response.',
    boundary: 'Only subscribers with marketing consent; only offers from the approved set; fairness checked before a person sees the proposal; resolving the fault is preferred to discounting it. No unrestricted repricing.',
    answers: 'Discount leakage: generic retention offers that cost margin without changing the customer’s experience.',
    measureIds: ['retained-contribution', 'offer-consent'],
    steps: [
      { key: 'detect', label: 'Detect', actor_type: 'AGENT', actor: 'raqib', what: 'Reads churn risk and service history and opens a case when both cross the thresholds the CVM owner set.' },
      { key: 'consent', label: 'Consent', actor_type: 'SYSTEM', actor: 'hami', what: 'Checks marketing consent and the contact rules before anything else happens. No consent, no case: it closes here and says why.' },
      { key: 'investigate', label: 'Investigate', actor_type: 'AGENT', actor: 'fahis', what: 'Finds the cause: the unresolved complaint, the coverage fault, the bill shock. Establishes what the operator can actually fix.' },
      { key: 'propose', label: 'Propose', actor_type: 'AGENT', actor: 'mushir', what: 'Proposes the response: fix the cause, explain the service, or one eligible offer from the approved set, with the retained contribution it protects and the comparison group.' },
      { key: 'approve', label: 'Approve', actor_type: 'HUMAN', actor: 'cvm_manager', what: 'The CVM manager approves the response. An offer outside the approved set cannot be approved here at all.' },
      { key: 'execute', label: 'Execute', actor_type: 'SYSTEM', actor: 'munaffidh', what: 'Registers the approved offer or the fix in the CVM system, within the approved terms.' },
      { key: 'notify', label: 'Notify', actor_type: 'AGENT', actor: 'rafiq', what: 'Presents the response to the subscriber in their language, from an approved template.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Checks whether the problem improved and whether the subscriber stayed, against the comparison group and net of the offer’s cost.' },
    ],
  },
  {
    id: 'WF-04', domain: 'SERVICE', name: 'Complaint resolution', owner: 'Service process owner (service agent, with the head of service)', status: 'BUILT', ceiling: 'A3',
    trigger: 'A complaint arrives from the app, a call, a store, social media or the regulator.',
    boundary: 'The agent resolves only what it is allowed to: explanations, status, permitted fixes within the small-credit limit. Anything else is handed to a person with the full context attached. The measure is first-time resolution and repeat contact, never deflection.',
    answers: 'Being measured on deflection and judged on complaints.',
    measureIds: ['first-time-resolution', 'repeat-contact'],
    steps: [
      { key: 'detect', label: 'Detect', actor_type: 'AGENT', actor: 'raqib', what: 'Opens a case per complaint and attaches every previous contact about the same problem.' },
      { key: 'investigate', label: 'Investigate', actor_type: 'AGENT', actor: 'fahis', what: 'Reads the account, the service state, the usage and the billing records the complaint points at, and names the actual problem.' },
      { key: 'propose', label: 'Propose', actor_type: 'AGENT', actor: 'mushir', what: 'Proposes a resolution and says whether it is within the agent’s own authority or needs a person.' },
      { key: 'guard', label: 'Guard', actor_type: 'SYSTEM', actor: 'hami', what: 'Routes: a permitted resolution proceeds; anything else goes to the service agent’s inbox with the context.' },
      { key: 'handoff', label: 'Handoff', actor_type: 'HUMAN', actor: 'service_agent', what: 'A person takes the case with the full context attached and decides. Skipped when the resolution was within the agent’s authority.' },
      { key: 'execute', label: 'Execute', actor_type: 'SYSTEM', actor: 'munaffidh', what: 'Applies the permitted fix or records the person’s decision in the case system.' },
      { key: 'notify', label: 'Notify', actor_type: 'AGENT', actor: 'rafiq', what: 'Answers the customer in their language, with what was found and what was done.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Watches for a repeat contact or a reopening for fourteen days before the case counts as resolved.' },
    ],
  },
  {
    id: 'WF-05', domain: 'ENTERPRISE', name: 'Enterprise service activation', owner: 'Enterprise commercial owner (enterprise sales manager), delivery with the NOC', status: 'BUILT', ceiling: 'A2',
    trigger: 'An enterprise account requests a service through an approved channel.',
    boundary: 'The commercial approval is a person’s. Provisioning and any network change stay with the delivery team and the NOC; the agent prepares, tracks and confirms, and never provisions.',
    answers: 'Enterprise revenue softer than the plan, and orders that stall between quote and activation.',
    measureIds: ['quote-to-activation', 'order-rework'],
    steps: [
      { key: 'capture', label: 'Capture', actor_type: 'AGENT', actor: 'raqib', what: 'Opens a case from the order: sites, service, security needs, timing, procurement constraints.' },
      { key: 'feasibility', label: 'Feasibility', actor_type: 'AGENT', actor: 'fahis', what: 'Checks coverage, capacity and the product catalogue for each site and flags dependencies before any commitment.' },
      { key: 'quote', label: 'Quote', actor_type: 'AGENT', actor: 'mushir', what: 'Prepares the quote with assumptions, margin and partner responsibilities, and routes exceptions.' },
      { key: 'guard', label: 'Guard', actor_type: 'SYSTEM', actor: 'hami', what: 'Confirms the quote is within the price book and that provisioning is a handoff, not an action.' },
      { key: 'approve', label: 'Approve', actor_type: 'HUMAN', actor: 'enterprise_manager', what: 'The enterprise sales manager approves the quote commercially.' },
      { key: 'handoff', label: 'Handoff', actor_type: 'SYSTEM', actor: 'munaffidh', what: 'Passes the approved requirements into fulfilment as a task for the delivery team and waits for their confirmation. The delivery team controls provisioning.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Confirms the service was activated as agreed and the customer and billing records match the quote; escalates mismatches.' },
    ],
  },
  {
    id: 'WF-06', domain: 'RA', name: 'Revenue leakage reconciliation', owner: 'Revenue assurance process owner (RA lead)', status: 'DESIGNED', ceiling: 'A2',
    trigger: 'Reconciliation flags a mismatch between eligible usage, rating and billed amounts.',
    boundary: 'Corrections to rating or billing go through change control with a named approver; recovery and savings are counted separately so nothing is double-counted.',
    answers: 'Leakage that no single system can see because it sits between usage, rating and billing.',
    measureIds: ['leakage-rate'],
    steps: [
      { key: 'detect', label: 'Detect', actor_type: 'AGENT', actor: 'raqib', what: 'Opens a case when usage, rating and billing disagree beyond the tolerance.' },
      { key: 'investigate', label: 'Investigate', actor_type: 'AGENT', actor: 'fahis', what: 'Reconciles the three records and separates leakage from fraud and from timing.' },
      { key: 'propose', label: 'Propose', actor_type: 'AGENT', actor: 'mushir', what: 'Proposes the correction and the recovery, with the owner it needs.' },
      { key: 'approve', label: 'Approve', actor_type: 'HUMAN', actor: 'ra_lead', what: 'The RA lead approves; rating changes go to change control.' },
      { key: 'verify', label: 'Verify', actor_type: 'AGENT', actor: 'muraqib', what: 'Confirms recovered value against the baseline, counted once.' },
    ],
  },
];

export const WF: Record<string, WorkflowDef> = Object.fromEntries(WORKFLOWS.map((w) => [w.id, w]));
export const wf = (id: string): WorkflowDef => { const w = WF[id]; if (!w) throw new Error(`Unknown workflow ${id}`); return w; };
export const BUILT_WORKFLOWS = WORKFLOWS.filter((w) => w.status === 'BUILT');
