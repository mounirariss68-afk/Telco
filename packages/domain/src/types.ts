/**
 * Shared types for Dhow — the agentic layer over Dhow Telecom's systems of
 * record (billing, CRM and cases, usage, roaming partner settlement, CVM and
 * consent, enterprise orders). Pure data: no I/O here. Dhow Telecom is a
 * fictional operator; every identifier is prefixed DEMO-.
 */

export type Domain = 'BILLING' | 'ROAMING' | 'CVM' | 'SERVICE' | 'ENTERPRISE' | 'RA';
export const DOMAINS: Domain[] = ['BILLING', 'ROAMING', 'CVM', 'SERVICE', 'ENTERPRISE', 'RA'];
export const DOMAIN_LABEL: Record<Domain, string> = {
  BILLING: 'Billing & disputes', ROAMING: 'Roaming & wholesale', CVM: 'Growth: marketing & CVM', SERVICE: 'Service & customer experience', ENTERPRISE: 'Enterprise services', RA: 'Revenue integrity',
};

/** The autonomy ladder. The rung an agent RUNS at in this prototype, never the roadmap. */
export type Autonomy = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
export const AUTONOMY_LABEL: Record<Autonomy, string> = { A0: 'observe', A1: 'recommend', A2: 'acts on approval', A3: 'acts and reports', A4: 'autonomous' };

export type MarketKey = 'uae' | 'ksa' | 'tr' | 'eu';

export type Segment = 'PREPAID' | 'POSTPAID' | 'ENTERPRISE';
export const SEGMENT_LABEL: Record<Segment, string> = { PREPAID: 'Consumer prepaid', POSTPAID: 'Consumer postpaid', ENTERPRISE: 'Enterprise line' };

export type SubjectType = 'SUBSCRIBER' | 'PARTNER' | 'ORDER';

/** The action a person is asked to decide. The authority matrix is keyed on this. */
export type ActionType =
  | 'CREDIT'              // post a credit to a subscriber's bill
  | 'REVERSE_CREDIT'      // reverse a credit found wrong at verification
  | 'RESTRICT_ROAMING'    // restrict a subscriber's roaming after a fraud finding
  | 'SETTLEMENT_QUERY'    // raise a query on a partner settlement
  | 'OFFER'               // present an approved retention or recharge offer
  | 'RESOLVE_COMPLAINT'   // close a complaint with an explanation or a permitted fix
  | 'QUOTE'               // approve an enterprise quote commercially
  | 'PROVISION'           // provision an enterprise service (delivery teams only)
  | 'NETWORK_ACTION'      // anything that changes the network: always a NOC handoff
  | 'CHANGE_AUTHORITY'    // change what an agent may do without a person
  | 'DECIDE';

export type CaseState =
  | 'DETECTED' | 'INVESTIGATING' | 'PROPOSED' | 'AWAITING_APPROVAL' | 'APPROVED' | 'EXECUTED' | 'HANDED_OFF' | 'VERIFIED' | 'CLOSED' | 'DECLINED' | 'ESCALATED' | 'REVERSED' | 'BLOCKED';

export type Subscriber = {
  id: string; name: string; msisdn: string; segment: Segment; plan: string; tenure_months: number; arpu: number;
  language: 'en' | 'ar' | 'tr'; status: 'ACTIVE' | 'SUSPENDED' | 'CHURNED'; roaming_enabled: boolean;
  consent_marketing: boolean; consent_offers: boolean; churn_risk: number; account_id: string | null; nps_last: number | null; edge_key: string | null;
};
export type Account = { id: string; name: string; sector: string; lines: number; contract_value: number; owner: string; edge_key: string | null };
export type Partner = { id: string; name: string; country: string; agreement: 'BILATERAL' | 'HUB' | 'WHOLESALE'; settlement_cycle_days: number; tap_lag_days: number };
export type Invoice = { id: string; subscriber_id: string; period: string; amount: number; status: 'ISSUED' | 'PAID' | 'DISPUTED' | 'CREDITED' | 'OVERDUE'; issued_on: string; due_on: string };
export type Charge = { id: string; invoice_id: string; subscriber_id: string; type: 'PLAN' | 'ADDON' | 'ROAMING_DATA' | 'ROAMING_VOICE' | 'IDD' | 'PREMIUM'; description: string; amount: number; session_ref: string | null; partner_id: string | null; rated_on: string };
export type UsageRecord = { id: string; subscriber_id: string; on: string; type: 'DATA' | 'VOICE' | 'SMS'; partner_id: string | null; volume: number; unit: 'MB' | 'MIN' | 'SMS'; rated_amount: number; session_ref: string; tap_received_on: string | null };
export type RoamingEvent = { id: string; subscriber_id: string; partner_id: string; on: string; pattern: 'DATA_SPIKE' | 'SIM_BOX' | 'IRSF' | 'WANGIRI' | 'SIM_SWAP' | 'IMPOSSIBLE_TRAVEL'; score: number; detail: string; status: 'OPEN' | 'CONFIRMED' | 'DISMISSED' | 'RESTRICTED' };
export type Offer = { id: string; name: string; kind: 'RETENTION' | 'RECHARGE' | 'UPGRADE'; value: number; terms: string; approved: boolean; segments: Segment[]; min_tenure: number };
export type Complaint = { id: string; subscriber_id: string; channel: 'APP' | 'CALL' | 'STORE' | 'SOCIAL' | 'REGULATOR'; category: 'BILLING' | 'COVERAGE' | 'SPEED' | 'ACTIVATION' | 'ROAMING' | 'OTHER'; text: string; raised_on: string; contacts: number; status: 'OPEN' | 'RESOLVED' | 'HANDED_OFF' | 'REOPENED' | 'ESCALATED'; reopened: boolean };
export type EnterpriseOrder = { id: string; account_id: string; service: 'DEDICATED_INTERNET' | 'SD_WAN' | 'PRIVATE_APN' | 'IOT_SIMS' | 'SIP_TRUNK'; sites: number; requested_on: string; stage: 'REQUESTED' | 'FEASIBILITY' | 'QUOTED' | 'APPROVED' | 'PROVISIONING' | 'ACTIVE' | 'REWORK'; monthly_value: number; term_months: number; detail: string };

export type StepActorType = 'AGENT' | 'HUMAN' | 'SYSTEM';
export type StepDef = {
  key: string; label: string; actor_type: StepActorType;
  /** Agent id, system id, a persona key, or an approver rule ("approver:credit", "approver:roaming" …). */
  actor: string;
  /** One line a reader understands: what happens at this step and what it may not do. */
  what: string;
};
export type WorkflowDef = {
  id: string; domain: Domain; name: string; owner: string; trigger: string; boundary: string; measureIds: string[]; status: 'BUILT' | 'DESIGNED';
  /** The difficulty on the Telecoms page this workflow answers. */
  answers: string; steps: StepDef[];
  /** Exposure ceiling: the rung this workflow may never exceed, whatever the evidence. */
  ceiling: Autonomy;
};

export type Market = { key: MarketKey; label: string; kicker: string; currency: string; symbol: string; rate: number; regulator: string; dataRule: string; language: string; city: string };
