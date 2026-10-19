/**
 * Personas and the authority matrix. Switching persona changes the inbox,
 * what is approvable and what Dalil will do. Limits are in AED (the base
 * currency; the market edition only changes how they are shown).
 *
 * The matrix is the delegation-of-authority form of the Agent Authority
 * Model: authority attaches to the ACTION and its amount, not to a job title
 * in general, and the ceiling of what may be delegated to an agent is set by
 * exposure (see WORKFLOWS[].ceiling).
 */
import type { ActionType } from './types.js';

export type PersonaKey = 'billing_officer' | 'billing_manager' | 'finance' | 'roaming_analyst' | 'noc' | 'cvm_manager' | 'service_agent' | 'enterprise_manager' | 'ra_lead' | 'coo';

export type Persona = {
  key: PersonaKey; name: string; role: string; initials: string; home: string; sees: string; owns: string[];
  /** Domains whose cases this persona sees in Cases and Inbox; null = all. */
  domains: string[] | null;
  approvesNothing?: boolean;
  suggestions: string[];
};

export const PERSONAS: Persona[] = [
  { key: 'billing_officer', name: 'Noura Al Hashimi', role: 'Billing officer', initials: 'NH', home: 'inbox', sees: 'Billing disputes within her limit', owns: ['Credits up to the officer limit'], domains: ['BILLING'],
    suggestions: ['What is waiting on me?', 'Why does Mushir propose a credit on this case?', 'Show me the disputes above my limit this week'] },
  { key: 'billing_manager', name: 'Khalid Mansoor', role: 'Billing manager', initials: 'KM', home: 'overview', sees: 'All billing disputes; the dispute workflow’s authority', owns: ['Credits up to the manager limit', 'The dispute workflow (WF-01)', 'Changes to its authority'], domains: ['BILLING'],
    suggestions: ['How accurate has the dispute workflow been this month?', 'Which credits were posted without a person, and why?', 'What would it take to move WF-01 back to A2?'] },
  { key: 'finance', name: 'Dana Haddad', role: 'Finance controller', initials: 'DH', home: 'inbox', sees: 'Credits above the manager limit; reversals', owns: ['Credits above the manager limit', 'Reversals'], domains: ['BILLING', 'RA'],
    suggestions: ['Show the credits above the manager limit', 'What was reversed this month and why?'] },
  { key: 'roaming_analyst', name: 'Omar Siddiqui', role: 'Roaming fraud analyst', initials: 'OS', home: 'inbox', sees: 'Roaming and wholesale cases', owns: ['Roaming restrictions', 'Settlement queries'], domains: ['ROAMING'],
    suggestions: ['Which roaming flags are open?', 'What did Fahis find on the SIM-box pattern?', 'Which partners have open settlement queries?'] },
  { key: 'noc', name: 'Rashid Al Marri', role: 'NOC liaison', initials: 'RM', home: 'inbox', sees: 'Handoffs that touch the network or provisioning; telemetry', owns: ['Network actions', 'Provisioning'], domains: ['ROAMING', 'ENTERPRISE'],
    suggestions: ['What handoffs are waiting for the NOC?', 'Has any agent tried to act on the network?'] },
  { key: 'cvm_manager', name: 'Layla Farouk', role: 'CVM manager', initials: 'LF', home: 'inbox', sees: 'Retention cases and the approved offer set', owns: ['Retention responses', 'The approved offer set'], domains: ['CVM'],
    suggestions: ['Which retention cases wait on me?', 'How many cases did Hami close for missing consent?', 'What did the comparison group do?'] },
  { key: 'service_agent', name: 'Yusuf Rahman', role: 'Service agent', initials: 'YR', home: 'inbox', sees: 'Complaints handed to a person', owns: ['Complaint decisions beyond the agent’s authority'], domains: ['SERVICE'],
    suggestions: ['What was handed to me and why?', 'Which complaints came back within fourteen days?'] },
  { key: 'enterprise_manager', name: 'Sara Qasimi', role: 'Enterprise sales manager', initials: 'SQ', home: 'inbox', sees: 'Enterprise orders and quotes', owns: ['Commercial approval of quotes'], domains: ['ENTERPRISE'],
    suggestions: ['Which quotes wait on me?', 'Where are orders stalling between quote and activation?'] },
  { key: 'ra_lead', name: 'Hessa Al Suwaidi', role: 'Revenue assurance lead', initials: 'HS', home: 'workflows', sees: 'The designed leakage workflow and the RA measures', owns: ['Leakage corrections (designed, not built)'], domains: ['RA', 'BILLING', 'ROAMING'],
    suggestions: ['What is designed but not built for revenue assurance?', 'How is recovery kept separate from savings?'] },
  { key: 'coo', name: 'Faisal Al Nuaimi', role: 'Chief Operating Officer', initials: 'FN', home: 'overview', sees: 'Everything; approves nothing', owns: [], domains: null, approvesNothing: true,
    suggestions: ['What changed since the baseline?', 'Which decisions did people override, and why?', 'What is the agents’ current authority and when did it last change?'] },
];
export const PERSONA: Record<PersonaKey, Persona> = Object.fromEntries(PERSONAS.map((p) => [p.key, p])) as Record<PersonaKey, Persona>;

/** Financial limits in AED. Exposure sets these; evidence never raises them. */
export const LIMITS = {
  smallCredit: 50,       // under this, WF-01 may post without a person while it holds A3 authority
  officerCredit: 500,
  managerCredit: 5000,
  financeCredit: 50000,
};

/** Who may approve an action of a given size. Returns null when nobody in the demo may (above every limit). */
export function approverFor(action: ActionType, amountAed = 0): PersonaKey | null {
  switch (action) {
    case 'CREDIT':
      if (amountAed <= LIMITS.officerCredit) return 'billing_officer';
      if (amountAed <= LIMITS.managerCredit) return 'billing_manager';
      if (amountAed <= LIMITS.financeCredit) return 'finance';
      return null;
    case 'REVERSE_CREDIT': return 'finance';
    case 'RESTRICT_ROAMING': case 'SETTLEMENT_QUERY': return 'roaming_analyst';
    case 'OFFER': return 'cvm_manager';
    case 'RESOLVE_COMPLAINT': return 'service_agent';
    case 'QUOTE': return 'enterprise_manager';
    case 'PROVISION': case 'NETWORK_ACTION': return 'noc';
    case 'CHANGE_AUTHORITY': return 'billing_manager';
    default: return null;
  }
}

/** May this persona decide this action at this amount? Finance may decide anything a lower limit holder may; nobody decides for another domain. */
export function may(persona: PersonaKey, action: ActionType, amountAed = 0): boolean {
  const p = PERSONA[persona];
  if (!p || p.approvesNothing) return false;
  const who = approverFor(action, amountAed);
  if (!who) return false;
  if (who === persona) return true;
  if (action === 'CREDIT' && persona === 'billing_manager' && who === 'billing_officer') return true;
  if (action === 'CREDIT' && persona === 'finance') return true;
  return false;
}
export const limitFor = (persona: PersonaKey): number | null => persona === 'billing_officer' ? LIMITS.officerCredit : persona === 'billing_manager' ? LIMITS.managerCredit : persona === 'finance' ? LIMITS.financeCredit : null;
