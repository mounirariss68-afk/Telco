# Dhow — an agentic layer on a telecom operator's own systems (working example)

Dhow Telecom is a fictional operator. This is a working example, built by Cognirise, of how agentic workflows sit on top of an operator's systems of record (billing, CRM, mediation, roaming platform, CVM, order management) without replacing any of them. Agents detect, investigate, propose and verify; a person approves anything that costs money, changes a tariff, restricts a customer or touches the network. Every action has a named approver and an amount limit; every step is on an append-only trail; the authority each workflow holds is earned from evidence and reduced automatically when the evidence fails.

**Agents prepare; people decide.** No record in the simulated systems changes without a recorded approval, and every write goes through one connector that logs what the real system would have been asked.

**Data:** every subscriber, partner, invoice, flag, complaint and figure is synthetic and generated for this example; every identifier starts with `DEMO-`. The operator's systems are simulated behind a connector; a client's version sits on the client's own systems.

## Run it on Replit (no terminal needed)

1. **Import.** Go to replit.com/import, choose **ZIP**, upload `dhow-telecom.zip` and press **Import**.
2. **Paste `REPLIT-PROMPT.md` into Replit's Agent.** The Agent creates the PostgreSQL database (Replit sets `DATABASE_URL`), confirms the Anthropic connection and starts the app. If Replit asks to use **Replit AI Integrations** for this app, choose **Approve**. The prompt tells the Agent not to change any code and not to add any API key.
3. **Wait for the first start** (two to three minutes: install, build, generate 3,000 subscribers and 380 history cases). The console prints `Dhow is running on port 5000` when it is ready. Later starts take seconds.
4. **Open the web view.** It opens as Faisal Al Nuaimi, COO, who sees everything and approves nothing. The persona badge (top right) switches to any of the ten people; **Scenarios** (left menu) runs the eight scripted productions.

**Claude.** Fahis, Mushir, Rafiq and Dalil use Claude through Replit's built-in Anthropic connection (Replit AI Integrations), billed against the workspace's credits; the app stores no API key. The server reads `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY`. Claude writes the words; the engine decides the facts. Every finding and proposal is computed from the records first and Claude only phrases it. Without the connection, the same steps run in *Offline* mode (deterministic text from the same data, labelled "Offline" on screen).

**Rebuild the world** is on Settings. It reseeds in about a minute. Each scenario restores its own fixtures and the workflow authority when it starts, so any scenario can be run again at any time.

## Running the demo

The **Director bar** docks at the bottom when a scenario starts. Every step names its trigger, runs a real engine action (nothing is pre-recorded), switches to the persona and screen the step is about, opens the record and lists what changed. The **Activity console** (top bar) streams every trigger → agent → action → result on any screen.

| Scenario | Shape | What it proves |
|---|---|---|
| S1 A disputed roaming charge, settled within the officer's limit | happy path | The loop end to end: a session rated twice, a credit of AED 180 proposed, approved by the billing officer within her limit, posted through the billing interface, the customer told, verified. |
| S2 Above her limit, her manager decides | escalation | Exposure decides who approves: a proposed credit of AED 1,250 routes to the billing manager, not to the agent. |
| S3 Roaming fraud: restricted by a person, steering handed to the NOC | handoff | The analyst approves the restriction and the settlement query; steering is a NOC task, because an agent never acts on the network. |
| S4 No consent, no offer | refusal | Two subscribers, same churn risk, same complaint. Without marketing consent Hami closes the case before any evidence is gathered. With consent, the proposal is to fix the fault rather than discount it. |
| S5 A complaint resolved first time, and one handed to a person | exception | Within its authority the agent resolves; beyond it a person decides with the full context attached. The measure is first-time resolution, never deflection. |
| S6 A credit reversed: the proposal was wrong | reversal | The partner's late TAP file shows two real sessions. Muraqib flags it, finance approves the reversal, and the trail keeps both decisions. |
| S7 Authority is reduced when the evidence fails | demotion | Three wrong small credits push accuracy below the 90% gate; Hami reduces the dispute workflow from A3 to A2 automatically; the next small credit needs a person. |
| S8 An enterprise service, quote to activation in one case | happy path | Feasibility, quote and commercial approval in one case; provisioning stays with the delivery team. |

Also worth showing by hand: **Authority** (what each workflow may do without a person, the accuracy over the last fifty decisions against the gate, and the history of every change); **Measures** (each with its definition, baseline, current value and the way it can be gamed); **Trail** (every step of every case, filterable by agent, action and override); **Settings → Market edition** (UAE, KSA, Türkiye, Europe: the currency, the regulator named and the data rule change; the amounts and limits move with the rate); **Dalil** (the rail on the left: ask what waits on you, why Mushir proposed a credit, what Hami blocked, what a workflow may do; it answers from the same records with the same permissions and never acts).

## The six workflows

| | Workflow | Domain | Ceiling | What it answers |
|---|---|---|---|---|
| WF-01 | Billing dispute investigation | Billing | A3 | Dispute cost sitting on a billing system the operator has just paid to modernise. |
| WF-02 | Roaming fraud investigation | Roaming & wholesale | A2 | Settlement complexity and fraud exposure rising with 5G roaming and more partners. |
| WF-03 | Retention after a service problem | Marketing & CVM | A2 | Discount leakage: generic retention offers that cost margin without changing the experience. |
| WF-04 | Complaint resolution | Service | A3 | Being measured on deflection and judged on complaints. |
| WF-05 | Enterprise service activation | Enterprise | A2 | Enterprise revenue softer than plan, and orders that stall between quote and activation. |
| WF-06 | Revenue leakage reconciliation | Revenue assurance | A2 | Leakage that no single system can see. *Designed, not built; in the catalogue so nobody mistakes the demo for more than it is.* |

Every workflow runs the same loop: detect, investigate, propose, approve, verify. What changes is the trigger, the boundary of what may be done without a person, and the measure.

## The authority model

Each workflow has a **ceiling** set by exposure (A0 observes · A1 recommends · A2 acts on approval · A3 acts and reports · A4 acts autonomously; nothing here reaches A4). Within the ceiling, the **rung** moves on evidence: accuracy over the last fifty verified decisions against a 90% gate. Falling below the gate demotes the workflow automatically and tells the owner; promotion back needs the owner's approval. Authority attaches to an action and an amount: the small-credit limit (AED 50), the officer's limit (AED 500), the manager's (AED 5,000), finance's (AED 50,000); anything above goes to a person regardless of rung. The Authority screen shows all of it and its history.

## The eight agents

Raqib (watcher, A0) · Fahis (investigator, A1) · Mushir (proposer, A1) · Hami (guardian, A2: blocks writes without approval, offers without consent, any network action) · Munaffidh (executor, A2; A3 for small credits while WF-01 holds it) · Rafiq (customer communication, A2, EN/AR templates) · Muraqib (verifier, A1) · Dalil (staff assistant, A1). Each has an accountable owner among the personas.

## What's real and what's simulated

- **Real:** the engine (runs, steps, approvals keyed on action and amount, escalation above every limit, override reasons, resume on human tasks), the authority model and its gate, the guard, the connector as the only writer, the trail, the measures computed from closed cases against a seeded baseline, the Director, the market editions, the eight scenarios run live against the engine (`npm run check` runs all of them and 29 checks over the resulting world). With Replit AI Integrations connected: the narration of findings, proposals and customer messages, and Dalil's conversation.
- **Simulated:** billing, CRM, mediation, the roaming platform (partners, TAP files, flags), the CVM signals and offer set, the complaint system and order management are Postgres schemas under `core`, reached only through `apps/server/src/core/connector.ts`, which logs the call the real system would receive. A virtual clock (Dubai time) moves the world.
- **Not in this version:** authentication and SSO (personas are a switcher), an Arabic staff UI (customer messages are bilingual), live connectors, WF-06.

## Project layout

```
apps/server            Express API, engine, authority model, agents, Director, Dalil, seed (TypeScript, run with tsx)
  src/core/connector.ts   the only module that writes to the simulated systems
  src/engine/             runs, steps, approvals, decide/resume; authority.ts holds the gate
  src/agents/             Raqib's scan and the narration layer
  src/seed/               generator, planted fixtures, history, fixture snapshots
  src/tools/check-world.ts  `npm run check`: runs the eight scenarios and 29 checks
apps/web               React 19 / Vite 7 / Tailwind 4 on the Cognirise Atelier design system (Pulse colours)
packages/domain        markets, workflows, agents, personas and limits, scenarios, measures, templates
packages/design-system Atelier, with Dhow's tokens
db/schema.sql          core (simulated operator systems) and layer (the agentic layer)
design/DESIGN.md       the design and the build decisions
tools/replit-run.sh    install once, build, start
tools/shots.mjs        render check: every screen in both themes, console errors and overflow
```

Environment: `DATABASE_URL` (set by Replit's Database tool), `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` and `AI_INTEGRATIONS_ANTHROPIC_API_KEY` (set by Replit AI Integrations), `PORT` (5000 on Replit). Nothing else.
