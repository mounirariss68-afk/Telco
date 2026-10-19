/**
 * The agent registry: eight named colleagues. `autonomy` is the rung the
 * PROTOTYPE runs at (A0 observe, A1 recommend, A2 acts on approval, A3 acts
 * and reports, A4 autonomous). None is A4; only Munaffidh reaches A3, and only
 * for small credits in the dispute workflow while that workflow holds A3
 * authority. `claude` says whether the agent calls Claude at all.
 */
import type { Autonomy } from './types.js';

export type AgentDef = {
  id: string; name: string; name_ar: string; title: string; purpose: string; autonomy: Autonomy; owner: string;
  claude: 'no' | 'yes' | 'drafts';
  functions: string[]; superpower: string; impact: string; reads: string[]; writes: string[]; decides: string;
};

export const AGENTS: AgentDef[] = [
  { id: 'raqib', name: 'Raqib', name_ar: 'رقيب', title: 'Watcher', autonomy: 'A0', owner: 'coo', claude: 'no',
    purpose: 'Reads the queues and the telemetry the operator already has, opens one case per event that crosses an owner-set threshold, and writes nothing anywhere else.',
    functions: ['Read the billing case queue, the roaming flags, churn and service signals, complaints and enterprise orders', 'Open or update one case per event, in the right workflow', 'Attach every previous contact about the same subject', 'Compute the detection measures: volume, lag, backlog'],
    superpower: 'Turns six queues into one list of cases with the right owner on each, every few minutes.',
    impact: 'Nothing waits in a queue nobody watches; nothing is opened twice.',
    reads: ['Billing cases', 'Roaming flags (read-only telemetry)', 'CVM signals', 'Complaints', 'Enterprise orders'], writes: ['Cases (the agentic layer only)'], decides: 'Nothing. It observes and opens.' },
  { id: 'fahis', name: 'Fahis', name_ar: 'فاحص', title: 'Investigator', autonomy: 'A1', owner: 'billing_manager', claude: 'yes',
    purpose: 'Retrieves the permitted records a case needs, checks identity, freshness and contradictions between them, and writes the evidence. If something is missing it asks for it rather than guessing.',
    functions: ['Retrieve usage, tariff, invoice and partner TAP records for the disputed period', 'Compare records against each other and name the discrepancy', 'Assemble the subscriber’s history, device changes and previous contacts', 'Check coverage, capacity and the catalogue for enterprise sites', 'Record provenance for every fact used'],
    superpower: 'Reads four systems in the time a person opens one, and says exactly where they disagree.',
    impact: 'Investigation time falls from hours to minutes; the officer judges evidence instead of collecting it.',
    reads: ['Usage records', 'Rating and tariffs', 'Invoices and charges', 'Partner TAP files', 'CRM and case history', 'Coverage and catalogue'], writes: ['Case evidence'], decides: 'Nothing. It recommends what the evidence shows.' },
  { id: 'mushir', name: 'Mushir', name_ar: 'مشير', title: 'Proposer', autonomy: 'A1', owner: 'billing_manager', claude: 'drafts',
    purpose: 'Turns the evidence into a recommendation: the action, the alternatives, the expected effect, and the permission the action needs. It never executes.',
    functions: ['Draft the finding in plain language for the approver and for the customer', 'Compute the proposed credit, restriction, offer or quote within the rules', 'List alternatives and what each would cost', 'Name the permission and the limit the action needs'],
    superpower: 'Every proposal arrives with its evidence, its alternatives and the name of the person who may approve it.',
    impact: 'Approvers decide in one reading; nothing is approved without knowing what it costs.',
    reads: ['Case evidence', 'Limits and approved offer set', 'Price book'], writes: ['Proposals'], decides: 'Nothing. It proposes.' },
  { id: 'hami', name: 'Hami', name_ar: 'حامي', title: 'Guardian', autonomy: 'A2', owner: 'coo', claude: 'no',
    purpose: 'The guardrails as a colleague: blocks any write without a recorded approval, any offer without consent, any network action anywhere, and watches both error directions, what was wrongly done and what was wrongly blocked.',
    functions: ['Check every proposal against the limits and the authority the workflow currently holds', 'Enforce consent before any marketing contact', 'Refuse any embedded network action and convert it to a NOC handoff', 'Compute accuracy over the last decisions and apply the promotion gate: raise or reduce a workflow’s authority', 'Report both error directions to the owner'],
    superpower: 'An available API is not a permission; Hami is the reason that sentence is true in practice.',
    impact: 'No silent charging change, no unconsented offer, no network action by an agent, and authority that moves only on evidence.',
    reads: ['Proposals', 'Limits', 'Consent register', 'Decision history'], writes: ['Routing decisions', 'Authority changes (with the owner’s approval)'], decides: 'Whether a proposal may proceed, to whom it goes, and when a workflow’s authority changes.' },
  { id: 'munaffidh', name: 'Munaffidh', name_ar: 'منفّذ', title: 'Executor', autonomy: 'A2', owner: 'billing_manager', claude: 'no',
    purpose: 'Acts only through the authorised interfaces of the systems of record, only after a recorded approval, and only within what was approved. For small credits in the dispute workflow it acts and reports (A3) while that authority is held.',
    functions: ['Post credits through the billing credit interface', 'Apply roaming restrictions and raise settlement queries through the roaming platform', 'Register approved offers and fixes in CVM and the case system', 'Open handoff tasks for the NOC and the delivery team', 'Record every write with before and after values, reversibly'],
    superpower: 'It cannot do anything that was not approved, and everything it does can be undone.',
    impact: 'Execution is immediate once approved, and auditable to the field.',
    reads: ['Approvals'], writes: ['Billing credits', 'Roaming restrictions', 'Offer registrations', 'Case updates', 'Handoff tasks'], decides: 'Nothing. It executes what was approved.' },
  { id: 'rafiq', name: 'Rafiq', name_ar: 'رفيق', title: 'Customer communication', autonomy: 'A2', owner: 'service_agent', claude: 'drafts',
    purpose: 'Tells the customer what was found and what was done, from approved templates, in their language, only once the action behind the message has been approved.',
    functions: ['Fill the approved template for the outcome in English or Arabic', 'Send through the channel the customer uses', 'Record delivery and any reply, and reopen the case on a reply that disputes the outcome'],
    superpower: 'The customer hears the same facts the approver saw, in their own language, the minute the action is done.',
    impact: 'Fewer repeat contacts; nothing told to a customer that was not approved.',
    reads: ['Approved outcomes', 'Templates', 'Contact preferences'], writes: ['Messages'], decides: 'Nothing. It communicates what was approved.' },
  { id: 'muraqib', name: 'Muraqib', name_ar: 'مراقب', title: 'Verifier', autonomy: 'A1', owner: 'coo', claude: 'no',
    purpose: 'Confirms the outcome happened, checks the customer and service impact, compares the measure with the agreed baseline, and closes only with evidence the owner accepts.',
    functions: ['Confirm the write landed and the record state changed', 'Watch for repeat contact, reopening or reversal within the verification window', 'Compare the measure with the baseline and the comparison group', 'Flag a wrong outcome for reversal'],
    superpower: 'Nothing counts as done because the system said so; it counts when the evidence says so.',
    impact: 'The measures on the Overview are verified, not reported.',
    reads: ['Cases', 'Billing', 'Complaints', 'CVM outcomes'], writes: ['Verification records', 'Measures'], decides: 'Whether a case is closed as resolved or flagged for reversal.' },
  { id: 'dalil', name: 'Dalil', name_ar: 'دليل', title: 'Staff assistant', autonomy: 'A1', owner: 'coo', claude: 'yes',
    purpose: 'Answers staff questions about cases, subscribers, measures and the rules, in the chat rail, using the same permissions as the person asking. It does not act.',
    functions: ['Look up a case, a subscriber, a partner or an order', 'Explain a recommendation and the evidence behind it', 'Explain who may approve what and why', 'Summarise the measures'],
    superpower: 'Every answer cites the record it came from; it says when it does not know.',
    impact: 'Staff find the evidence in one question instead of four screens.',
    reads: ['Everything the persona may see'], writes: ['Nothing'], decides: 'Nothing.' },
];

export const AGENT: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
export const agentName = (id: string) => AGENT[id]?.name ?? id;
