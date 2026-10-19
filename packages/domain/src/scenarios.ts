/**
 * Scenarios: the demo's remote control. Each is a list of steps the Director
 * performs against the live engine (nothing is faked in the UI). A step names
 * the screen the viewer should be looking at and, where a person acts, which
 * persona the viewer is switched to. Fixtures are planted subjects in the
 * synthetic data (edge_key), restored to their seeded state when a scenario
 * starts, so every scenario can be run again.
 */
import type { PersonaKey } from './personas.js';

export type ScenarioAction =
  | { kind: 'open'; fixture: string }
  | { kind: 'decide'; persona: PersonaKey; decision: 'APPROVED' | 'REJECTED'; reason?: string }
  | { kind: 'event'; event: 'PROVISIONED' | 'REPLY_DISPUTES' | 'REPEAT_CONTACT' }
  | { kind: 'verify' }
  | { kind: 'overrides'; n: number }
  | { kind: 'show' };

export type ScenarioStep = { id: string; title: string; narration: string; action: ScenarioAction; screen: string; persona?: PersonaKey };
export type ScenarioDef = { key: string; name: string; shape: 'happy path' | 'escalation' | 'refusal' | 'exception' | 'reversal' | 'demotion' | 'handoff'; workflowId: string; summary: string; steps: ScenarioStep[] };

export const SCENARIOS: ScenarioDef[] = [
  {
    key: 'S1', name: 'A disputed roaming charge, settled within the officer’s limit', shape: 'happy path', workflowId: 'WF-01',
    summary: 'The case from the web page. A disputed charge of AED 420; Fahis finds a session rated twice; Mushir proposes a credit of AED 180; the billing officer approves within her limit; the credit posts, the customer is told, the record is kept.',
    steps: [
      { id: 's1-1', title: 'A dispute enters the queue', narration: 'Raqib reads the billing case queue and opens a case for a disputed roaming charge of AED 420. Nothing is created outside the operator’s own queue.', action: { kind: 'open', fixture: 'dispute-small' }, screen: 'case', persona: 'billing_officer' },
      { id: 's1-2', title: 'Fahis investigates, Mushir proposes', narration: 'Fahis retrieves the usage records, the tariff and the partner’s TAP log and finds one session rated twice. Mushir proposes a credit of AED 180 with the evidence attached and names the permission it needs. Hami routes it to the billing officer: within her limit.', action: { kind: 'show' }, screen: 'case', persona: 'billing_officer' },
      { id: 's1-3', title: 'The officer approves', narration: 'Noura reads the evidence and approves. The approval is recorded before anything is executed; a decision that differed from the recommendation would have needed a reason.', action: { kind: 'decide', persona: 'billing_officer', decision: 'APPROVED' }, screen: 'case', persona: 'billing_officer' },
      { id: 's1-4', title: 'Posted, told, verified', narration: 'Munaffidh posts the credit through the billing credit interface; Rafiq tells the customer from an approved template in their language; Muraqib confirms the invoice changed and starts the fourteen-day watch for a repeat contact.', action: { kind: 'verify' }, screen: 'trail', persona: 'billing_officer' },
    ],
  },
  {
    key: 'S2', name: 'Above her limit, her manager decides', shape: 'escalation', workflowId: 'WF-01',
    summary: 'A dispute of AED 2,900 with a proposed credit of AED 1,250: above the officer’s limit, so Hami routes it to the billing manager. Exposure decides who approves, not the agent.',
    steps: [
      { id: 's2-1', title: 'A larger dispute', narration: 'An enterprise line disputes AED 2,900 of roaming data. Fahis finds a tariff applied from the wrong zone; Mushir proposes a credit of AED 1,250.', action: { kind: 'open', fixture: 'dispute-above-limit' }, screen: 'case', persona: 'billing_officer' },
      { id: 's2-2', title: 'Not in the officer’s inbox', narration: 'The credit is above Noura’s limit of AED 500. Her inbox does not show it; Hami has routed it to Khalid, the billing manager, whose limit is AED 5,000.', action: { kind: 'show' }, screen: 'inbox', persona: 'billing_officer' },
      { id: 's2-3', title: 'The manager approves', narration: 'Khalid sees the same evidence and approves. Above his limit, the case would have gone to finance; above finance’s limit, nobody in this demo may approve it at all.', action: { kind: 'decide', persona: 'billing_manager', decision: 'APPROVED' }, screen: 'case', persona: 'billing_manager' },
      { id: 's2-4', title: 'Executed and verified', narration: 'The credit posts, the customer is told, Muraqib verifies against the baseline.', action: { kind: 'verify' }, screen: 'case', persona: 'billing_manager' },
    ],
  },
  {
    key: 'S3', name: 'Roaming fraud: restricted by a person, steering handed to the NOC', shape: 'handoff', workflowId: 'WF-02',
    summary: 'A SIM-box pattern on a roaming partner. The analyst approves the restriction and the settlement query; the steering that would help is a NOC task, because an agent never acts on the network.',
    steps: [
      { id: 's3-1', title: 'A pattern is flagged', narration: 'Partner TAP records and read-only telemetry show a SIM-box pattern: hundreds of short calls from one roaming SIM in one cell. Raqib opens the case; the flag itself restricts nothing.', action: { kind: 'open', fixture: 'roaming-simbox' }, screen: 'case', persona: 'roaming_analyst' },
      { id: 's3-2', title: 'Evidence and a proposal', narration: 'Fahis assembles the usage, the TAP records and the device history. Mushir proposes a roaming restriction and a settlement query to the partner, and notes that steering traffic away from the partner would help. Hami converts the steering into a NOC handoff: the agent may propose it, not do it.', action: { kind: 'show' }, screen: 'case', persona: 'roaming_analyst' },
      { id: 's3-3', title: 'The analyst approves', narration: 'Omar approves the restriction and the query, with the reversal path recorded: the restriction lifts on the customer’s verified call.', action: { kind: 'decide', persona: 'roaming_analyst', decision: 'APPROVED' }, screen: 'case', persona: 'roaming_analyst' },
      { id: 's3-4', title: 'The NOC gets a task, not an instruction', narration: 'Munaffidh applies the restriction through the roaming platform and raises the query; the steering sits in Rashid’s inbox as a handoff. The network stays with the NOC.', action: { kind: 'show' }, screen: 'inbox', persona: 'noc' },
    ],
  },
  {
    key: 'S4', name: 'No consent, no offer', shape: 'refusal', workflowId: 'WF-03',
    summary: 'Two subscribers with the same churn risk and the same coverage complaint. One has withdrawn marketing consent: Hami closes the case before a person sees it. The other is consented: Fahis finds the cause, Mushir proposes fixing it rather than discounting it, and the CVM manager approves.',
    steps: [
      { id: 's4-1', title: 'Eligible, but not consented', narration: 'Raqib opens a retention case for a subscriber whose churn risk rose after two coverage complaints. Hami checks the consent register first: marketing consent was withdrawn in June. The case closes here, with the reason, before any evidence is gathered.', action: { kind: 'open', fixture: 'retention-no-consent' }, screen: 'case', persona: 'cvm_manager' },
      { id: 's4-2', title: 'The same problem, with consent', narration: 'A second subscriber, same risk, same complaints, consent in place. Fahis finds the cause: an unresolved coverage fault at the home cell. Mushir proposes resolving the fault and a one-month data top-up from the approved set, not a discount, and shows the retained contribution and the comparison group.', action: { kind: 'open', fixture: 'retention-with-consent' }, screen: 'case', persona: 'cvm_manager' },
      { id: 's4-3', title: 'The CVM manager approves', narration: 'Layla approves the response. An offer outside the approved set could not have been approved on this screen at all.', action: { kind: 'decide', persona: 'cvm_manager', decision: 'APPROVED' }, screen: 'case', persona: 'cvm_manager' },
      { id: 's4-4', title: 'Measured against the comparison group', narration: 'Rafiq presents the response in the subscriber’s language. Muraqib will measure retained contribution against the comparison group, net of the top-up’s cost, not accepted offers.', action: { kind: 'verify' }, screen: 'measures', persona: 'cvm_manager' },
    ],
  },
  {
    key: 'S5', name: 'A complaint resolved first time, and one handed to a person', shape: 'exception', workflowId: 'WF-04',
    summary: 'A speed complaint the agent may resolve within its authority, and an activation complaint it may not: the second arrives in the service agent’s inbox with the whole context attached.',
    steps: [
      { id: 's5-1', title: 'Within the agent’s authority', narration: 'A speed complaint from the app. Fahis finds the plan’s fair-use cap was reached on day nineteen; Mushir proposes the explanation and a one-off data add-on under the small-credit limit. Hami: within authority. Munaffidh applies it, Rafiq answers the customer.', action: { kind: 'open', fixture: 'complaint-speed' }, screen: 'case', persona: 'service_agent' },
      { id: 's5-2', title: 'Beyond it: handed over with the context', narration: 'An activation complaint after three contacts: the number port stalled at the donor operator. Mushir proposes the fix but it needs the porting desk; Hami hands the case to Yusuf with every previous contact attached, so the customer does not repeat the story.', action: { kind: 'open', fixture: 'complaint-activation' }, screen: 'inbox', persona: 'service_agent' },
      { id: 's5-3', title: 'The person decides', narration: 'Yusuf approves the proposed resolution and records the porting desk reference.', action: { kind: 'decide', persona: 'service_agent', decision: 'APPROVED', reason: 'Porting desk reference PORT-2210 attached' }, screen: 'case', persona: 'service_agent' },
      { id: 's5-4', title: 'Fourteen days later', narration: 'Muraqib watched both cases for fourteen days. Neither came back, so both count as resolved first time. A case that came back would count as a repeat contact, not a resolution.', action: { kind: 'verify' }, screen: 'measures', persona: 'service_agent' },
    ],
  },
  {
    key: 'S6', name: 'A credit reversed: the proposal was wrong', shape: 'reversal', workflowId: 'WF-01',
    summary: 'A dispute that looked like a double rating; the officer approved as recommended. At verification the partner’s late TAP file shows two real sessions. Muraqib flags it, finance approves the reversal, and the trail shows who decided what on which evidence.',
    steps: [
      { id: 's6-1', title: 'It looked like a double rating', narration: 'Two data sessions of the same size, three minutes apart, on the same partner. Fahis reports a probable double rating; Mushir proposes a credit of AED 96. Hami routes it to the officer.', action: { kind: 'open', fixture: 'dispute-wrong' }, screen: 'case', persona: 'billing_officer' },
      { id: 's6-2', title: 'Approved as recommended', narration: 'Noura approves, as the recommendation said. The credit posts and the customer is told.', action: { kind: 'decide', persona: 'billing_officer', decision: 'APPROVED' }, screen: 'case', persona: 'billing_officer' },
      { id: 's6-3', title: 'Verification finds the late record', narration: 'The partner’s TAP file arrives four days late and shows two distinct sessions with different cell identifiers. Muraqib flags the credit as wrong and proposes a reversal, which only finance may approve.', action: { kind: 'verify' }, screen: 'inbox', persona: 'finance' },
      { id: 's6-4', title: 'Finance reverses it', narration: 'Dana approves the reversal with the reason recorded. The customer is told, in plain words, what changed and why. The trail keeps the original evidence, the first decision, the new evidence and the second decision. This case also counts against the dispute workflow’s accuracy.', action: { kind: 'decide', persona: 'finance', decision: 'APPROVED', reason: 'Late TAP file shows two distinct sessions (different cell IDs); the original credit was not due' }, screen: 'trail', persona: 'finance' },
    ],
  },
  {
    key: 'S7', name: 'Authority is reduced when the evidence fails', shape: 'demotion', workflowId: 'WF-01',
    summary: 'The dispute workflow had earned A3 for small credits: the last fifty proposals were 96% accepted. Three wrong small credits in a week push accuracy below the gate, Hami reduces the workflow to A2, and the next small credit needs a person. Exposure set the ceiling; evidence moves authority within it, both ways.',
    steps: [
      { id: 's7-1', title: 'A small credit posts without a person', narration: 'A disputed add-on charge of AED 38, clearly duplicated. Under the A3 authority the workflow holds for credits under AED 50, Munaffidh posts the credit and reports it. The billing manager is told; nobody had to approve.', action: { kind: 'open', fixture: 'dispute-tiny' }, screen: 'case', persona: 'billing_manager' },
      { id: 's7-2', title: 'Three wrong small credits', narration: 'Over the week, verification finds three small credits that were not due. Hami recomputes the workflow’s accuracy over the last fifty decisions: 86%, below the 90% gate the owner set.', action: { kind: 'overrides', n: 3 }, screen: 'authority', persona: 'billing_manager' },
      { id: 's7-3', title: 'Hami reduces the authority', narration: 'The dispute workflow drops from A3 to A2. Reduction is automatic because the safe direction needs no permission; raising it again will need the manager’s approval once accuracy is back above the gate for fifty decisions. The change is in the trail.', action: { kind: 'show' }, screen: 'authority', persona: 'billing_manager' },
      { id: 's7-4', title: 'The next small credit needs a person', narration: 'Another duplicated charge of AED 41. This time it stops at the officer’s inbox. Raising the limit back is a change-control decision, not a setting.', action: { kind: 'open', fixture: 'dispute-tiny-2' }, screen: 'inbox', persona: 'billing_officer' },
    ],
  },
  {
    key: 'S8', name: 'An enterprise service, quote to activation in one case', shape: 'happy path', workflowId: 'WF-05',
    summary: 'A logistics company orders SD-WAN for four sites. Feasibility, quote and commercial approval in one case; provisioning is a handoff to the delivery team; Muraqib confirms the records match the quote.',
    steps: [
      { id: 's8-1', title: 'An order arrives', narration: 'Raqib opens the case from the order: four sites, SD-WAN, a security requirement and a go-live date. Fahis checks coverage and capacity at each site and flags that one site needs a fibre build.', action: { kind: 'open', fixture: 'enterprise-sdwan' }, screen: 'case', persona: 'enterprise_manager' },
      { id: 's8-2', title: 'The quote, with its assumptions', narration: 'Mushir prepares the quote from the price book with the fibre build as a dependency and the margin shown. Hami confirms it is within the price book and that provisioning is a handoff.', action: { kind: 'show' }, screen: 'case', persona: 'enterprise_manager' },
      { id: 's8-3', title: 'Commercial approval', narration: 'Sara approves the quote. Munaffidh passes the approved requirements to the delivery team as a task and waits.', action: { kind: 'decide', persona: 'enterprise_manager', decision: 'APPROVED' }, screen: 'inbox', persona: 'noc' },
      { id: 's8-4', title: 'Provisioned by the delivery team, confirmed by Muraqib', narration: 'Rashid’s team provisions the sites and confirms. Muraqib checks that the activated service and the billing records match the quote and closes the case. Quote-to-activation is measured from the order date.', action: { kind: 'event', event: 'PROVISIONED' }, screen: 'case', persona: 'enterprise_manager' },
    ],
  },
];
export const SCENARIO: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((s) => [s.key, s]));
