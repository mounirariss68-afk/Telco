# Dhow — an agentic layer on a telecom operator's own systems

**Design document · v1 · 10 October 2026 · Cognirise, working example for the Telecoms industry page**

Status: built. This document records what was designed, what was decided during the build, and what the example must not be mistaken for.

**Name.** *Dhow* is the fictional operator (Dhow Telecom). The agents carry Arabic names in the same way as Rafeeq (Tasama HR), Mizan (Tasama lead-to-cash) and Jahiz (QIB). Dhow is a working example of a way of working, not a product; nothing in the code, the screens or the documents calls it a product, a platform or a solution.

**Markers.** **[M]** stated by Mounir · **[R]** research-sourced, with the source in the Telecoms page research notes · **[D]** our design decision.

---

## 1. Why this exists

[M] What Cognirise is about is changing the way work is done. Cognirise does not compete with Amdocs or the other system vendors; what differentiates it is speed, cost, agility and being technology agnostic, and deep industry expertise against small players and generic startups. The pattern of every Cognirise engagement is the same: take a use case or a set of use cases and run it end to end; what is developed sits on top of the systems of record; no overhaul is proposed; a layer is set up with agentic workflows and specific agents, governed by the agent authority model and the guardrail model.

[D] The Telecoms page had to show that pattern on telecom work rather than describe it. A description of "agentic workflows on top of your systems" reads like every other vendor's page. A working example, with a fictional operator, real engine, real records and a person's approval in the loop, shows what the layer is, where it stops, and what a telecom CXO would be buying.

[D] The risk Mounir named: a prototype can make Cognirise look like a product company. The design answers it in four ways. The operator is fictional and says so on every screen. The workflows are the ones a specific operator's difficulties call for, not a catalogue; WF-06 is listed as designed and not built precisely so that the catalogue does not look like a product roadmap. The page presents Dhow as "a working example", never as a case study and never as something to license. Every measure carries the sentence that targets are agreed in discovery against the operator's own baseline.

## 2. The difficulties each workflow answers

The page's first section lists what regional operators are investing in and the commercial and operating difficulties behind those investments [R]. Each built workflow answers one of them:

| Difficulty on the page | Workflow |
|---|---|
| Dispute cost sitting on a billing system the operator has just paid to modernise | WF-01 Billing dispute investigation |
| Settlement complexity and fraud exposure rising with 5G roaming and more partners | WF-02 Roaming fraud investigation |
| Discount leakage: generic retention offers that cost margin without changing the experience | WF-03 Retention after a service problem |
| Being measured on deflection and judged on complaints | WF-04 Complaint resolution |
| Enterprise revenue softer than plan, orders that stall between quote and activation | WF-05 Enterprise service activation |
| Leakage no single system can see | WF-06 Revenue leakage reconciliation (designed) |

## 3. The loop

Every workflow runs the same five steps: **detect, investigate, propose, approve, verify.** The agent does four; a person does the one that costs money, changes a tariff, restricts a customer or touches the network. What changes between workflows is the trigger (a queue the operator already runs), the boundary (what never happens without a person), and the measure (defined with the owner, computed from closed cases against a baseline).

Two consequences are deliberate. The agent never creates work: Raqib opens one case per event from a queue that already exists, so the operator sees the same volume as before, handled differently. And the agent never acts on the network: steering, provisioning and faults are handoffs to the NOC and the delivery team, as tasks with the context attached. [D]

## 4. The agent authority model

**Exposure sets the ceiling; evidence moves the rung within it, both ways.** [M] [D]

The ladder: A0 observes · A1 recommends · A2 acts on approval · A3 acts and reports · A4 acts autonomously. Nothing in this example reaches A4. Each workflow has a ceiling set by its exposure: A3 for WF-01 (small credits are reversible and bounded) and WF-04 (explanations and permitted fixes), A2 for everything that restricts a customer, touches a partner, prices an offer or provisions a service.

Within the ceiling the rung moves on evidence: accuracy over the last fifty verified decisions against a gate of 90%. Below the gate the workflow is demoted automatically, the owner gets a task, and the trail records the change with the three cases that caused it. Promotion back needs the owner's approval; it is never automatic. S7 runs this live.

Authority attaches to an action and an amount, never to an agent. The limits in the UAE edition: small credit AED 50, billing officer AED 500, billing manager AED 5,000, finance AED 50,000. Above every limit a case escalates to a person regardless of rung. A decision against the recommendation needs a reason and is recorded as an override; overrides count in the workflow's accuracy.

Hami, the guardian, is the guardrail model as a colleague: it blocks any write without a recorded approval, any offer without consent, any network action anywhere, and it watches both error directions, what was wrongly done and what was wrongly blocked. Hami routes and refuses; it never approves.

## 5. The example's shape

- **Operator.** Dhow Telecom, fictional, 3,000 subscribers (prepaid, postpaid, enterprise lines), one enterprise account for S8, eight roaming partners, all synthetic, all `DEMO-` prefixed.
- **Systems of record, simulated.** Billing (invoices, charges, a dispute queue, credits), CRM (subscribers, consent, churn risk), mediation (usage, sessions, cells), the roaming platform (partners, TAP files with lag, flags, restrictions, settlement queries), CVM (signals, the approved offer set, registrations), the complaint system, order management. All in the `core` schema; the only writer is `apps/server/src/core/connector.ts`, which logs the call the real system would receive.
- **The layer.** Cases, runs, steps, approvals, tasks, trail, activity, messages, authority and its history, outcomes, fixture snapshots, in the `layer` schema.
- **History.** 380 closed cases over the preceding months give each measure a baseline and each workflow its fifty-decision window at seed. WF-01 starts at A3 with 96% accuracy so that S7 has something to take away.
- **Personas.** Ten people with names, a scope and a limit: the billing officer, billing manager and finance controller; the roaming fraud analyst; the NOC liaison; the CVM manager; the service agent; the enterprise sales manager; the revenue assurance lead; the COO, who sees everything and approves nothing. Switching persona changes the inbox, what is approvable and what Dalil will answer.
- **Market editions.** UAE (AED, TDRA), KSA (SAR, CST with SDAIA for personal data), Türkiye (TRY, BTK), Europe (EUR, the national regulator under the EECC). Amounts are stored in AED and shown through the market's rate; the limits move with it; the data rule named on screen changes. The editions change the frame, not the logic. [D]
- **Customer messages.** Rafiq writes from approved templates in English and Arabic, only after the action behind the message is approved, and only tells the customer what was found and what was done.

## 6. Scenarios

Eight, each a different shape, each run live against the engine with fixtures restored at start: happy path (S1, S8), escalation (S2), handoff (S3), refusal (S4), exception (S5), reversal (S6), demotion (S7). S1 is the case the web page tells in prose, so the reader can see on the page what the Director then runs. The world checker (`npm run check`) runs all eight and 29 checks over the resulting world: WF-01 holds A3 at seed and A2 at 88% after S7; S6 leaves a reversed credit and both decisions on the trail; S4 closes the unconsented case with no evidence step; S3 leaves a NOC task and a restriction approved by the analyst; S8 ends in an activated order with matching billing records.

## 7. Measures

Eleven, each with a definition the owner agreed, a baseline from history, a current value computed from closed cases, and a Watch column naming the way the measure can be gamed so that it is not. Two are compliance numbers rather than targets: responses with verified consent must be 100%; disputes resolved within approved authority must be 100%. Where an illustrative target is shown it is marked illustrative and the screen says that targets are agreed in discovery against the operator's baseline and validated in a scoped pilot. No achieved result, forecast or guarantee is stated anywhere. [M]

## 8. Claude's place

Claude writes the words; the engine decides the facts. Fahis's finding, Mushir's proposal and Rafiq's message are computed from the records first, then phrased by Claude through Replit AI Integrations for the approver and the customer; Dalil answers staff questions over the same records with the same permissions and never acts. Without the connection every step runs offline from templates over the same data, labelled on screen. No key of Cognirise's own is stored anywhere. [M]

## 9. Design system

The Atelier template, copied as a package, with Pulse tokens (ink, deep, paper, soft, line, violet, pink, coral; Comfortaa and Inter), both themes, contrast checked, quiet backdrops regenerated in the Pulse colours. Archetypes used: Inbox (decisions and handoffs), Workspace (cases), Agents, Workflows, Scenarios with the Director bar, Settings with persona cards, Provenance (the Source line under every table naming the simulated system and call), Trail. Every chip is an action or a state; the reversible option sits left of the irreversible one.

## 10. What this example is not

Not a product, platform or solution. Not a case study: no client is named and no result is claimed. Not a replacement for billing, CRM or any system of record. Not a roadmap: WF-06 is designed, not built, and says so. Not autonomous: nothing reaches A4, and the one A3 authority in the example is taken away on screen when the evidence fails.

## 11. Build decisions recorded on 10 October 2026

- Approvals are keyed on action type and amount, not on step; the approver is whoever holds the limit for that amount (`approverFor(action, amount)`), and a reversal is routed to finance regardless of amount. [D]
- Automatic demotion happens inside the gate check after every verified outcome; the trail entry names the window, the accuracy and the cases. Promotion is a task to the owner, not a button for the agent. [D]
- Raqib's scan matches planted fixtures by subscriber or account edge key so each scenario finds its own case; half the generic disputes in the queue are real duplicates so the history and the live queue have believable mixes of credit and decline. [D]
- Virtual clock in Dubai time; "today" at seed is 10 October 2026; settlement verification for S6 waits on a TAP file whose arrival the scenario provides. [D]
- The web app renders every screen in both themes with no console errors and no horizontal overflow at 1440 px (`tools/shots.mjs`). [D]
