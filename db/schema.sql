-- Dhow Telecom (fictional). Two schemas: core = the operator's simulated systems of record
-- (billing, CRM/cases, usage, roaming partners, CVM/consent, enterprise orders); layer = the
-- agentic layer (cases, runs, approvals, trail, authority). Only the connector writes to core.
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS layer;

-- ---------------------------------------------------------------- core (simulated systems)
CREATE TABLE IF NOT EXISTS core.subscribers (
  id text PRIMARY KEY, name text NOT NULL, msisdn text NOT NULL, segment text NOT NULL, plan text NOT NULL, tenure_months int NOT NULL, arpu numeric NOT NULL,
  language text NOT NULL, status text NOT NULL, roaming_enabled boolean NOT NULL, consent_marketing boolean NOT NULL, consent_offers boolean NOT NULL,
  churn_risk numeric NOT NULL, account_id text, nps_last int, edge_key text, home_cell text, device_changed_on date
);
CREATE TABLE IF NOT EXISTS core.accounts (id text PRIMARY KEY, name text NOT NULL, sector text NOT NULL, lines int NOT NULL, contract_value numeric NOT NULL, owner text NOT NULL, edge_key text);
CREATE TABLE IF NOT EXISTS core.partners (id text PRIMARY KEY, name text NOT NULL, country text NOT NULL, agreement text NOT NULL, settlement_cycle_days int NOT NULL, tap_lag_days int NOT NULL, open_queries int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS core.invoices (id text PRIMARY KEY, subscriber_id text NOT NULL REFERENCES core.subscribers(id), period text NOT NULL, amount numeric NOT NULL, status text NOT NULL, issued_on date NOT NULL, due_on date NOT NULL);
CREATE INDEX IF NOT EXISTS invoices_sub ON core.invoices(subscriber_id);
CREATE TABLE IF NOT EXISTS core.charges (id text PRIMARY KEY, invoice_id text NOT NULL REFERENCES core.invoices(id), subscriber_id text NOT NULL, type text NOT NULL, description text NOT NULL, amount numeric NOT NULL, session_ref text, partner_id text, rated_on date NOT NULL);
CREATE INDEX IF NOT EXISTS charges_inv ON core.charges(invoice_id);
CREATE TABLE IF NOT EXISTS core.usage (id text PRIMARY KEY, subscriber_id text NOT NULL, on_date date NOT NULL, type text NOT NULL, partner_id text, volume numeric NOT NULL, unit text NOT NULL, rated_amount numeric NOT NULL, session_ref text NOT NULL, cell_id text, tap_received_on date);
CREATE INDEX IF NOT EXISTS usage_sub ON core.usage(subscriber_id, on_date);
CREATE TABLE IF NOT EXISTS core.tariffs (id text PRIMARY KEY, partner_id text, zone text NOT NULL, type text NOT NULL, unit_price numeric NOT NULL, unit text NOT NULL);
CREATE TABLE IF NOT EXISTS core.roaming_events (id text PRIMARY KEY, subscriber_id text NOT NULL, partner_id text NOT NULL, on_date date NOT NULL, pattern text NOT NULL, score numeric NOT NULL, detail text NOT NULL, status text NOT NULL);
CREATE TABLE IF NOT EXISTS core.restrictions (id serial PRIMARY KEY, subscriber_id text NOT NULL, kind text NOT NULL, applied_at timestamptz NOT NULL, lifted_at timestamptz, reason text, reversal text, case_ref text);
CREATE TABLE IF NOT EXISTS core.settlement_queries (id serial PRIMARY KEY, partner_id text NOT NULL, raised_at timestamptz NOT NULL, amount numeric NOT NULL, status text NOT NULL, acknowledged_at timestamptz, case_ref text);
CREATE TABLE IF NOT EXISTS core.offers (id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL, value numeric NOT NULL, terms text NOT NULL, approved boolean NOT NULL, segments text[] NOT NULL, min_tenure int NOT NULL);
CREATE TABLE IF NOT EXISTS core.offer_registrations (id serial PRIMARY KEY, subscriber_id text NOT NULL, offer_id text, fix text, registered_at timestamptz NOT NULL, case_ref text, consent_checked boolean NOT NULL);
CREATE TABLE IF NOT EXISTS core.complaints (id text PRIMARY KEY, subscriber_id text NOT NULL, channel text NOT NULL, category text NOT NULL, text text NOT NULL, raised_on date NOT NULL, contacts int NOT NULL, status text NOT NULL, reopened boolean NOT NULL DEFAULT false, resolved_on date, resolution text);
CREATE TABLE IF NOT EXISTS core.orders (id text PRIMARY KEY, account_id text NOT NULL REFERENCES core.accounts(id), service text NOT NULL, sites int NOT NULL, requested_on date NOT NULL, stage text NOT NULL, monthly_value numeric NOT NULL, term_months int NOT NULL, detail text NOT NULL, activated_on date, quote jsonb);
CREATE TABLE IF NOT EXISTS core.credits (id serial PRIMARY KEY, subscriber_id text NOT NULL, invoice_id text NOT NULL, amount numeric NOT NULL, reason text NOT NULL, posted_at timestamptz NOT NULL, posted_by text NOT NULL, approval_ref text, reversed_at timestamptz, reversal_reason text, case_ref text);
CREATE TABLE IF NOT EXISTS core.billing_queue (id serial PRIMARY KEY, subscriber_id text NOT NULL, invoice_id text NOT NULL, charge_id text, disputed_amount numeric NOT NULL, customer_text text NOT NULL, channel text NOT NULL, raised_on date NOT NULL, picked boolean NOT NULL DEFAULT false, edge_key text);
CREATE TABLE IF NOT EXISTS core.cvm_signals (id serial PRIMARY KEY, subscriber_id text NOT NULL, on_date date NOT NULL, churn_risk numeric NOT NULL, service_problems int NOT NULL, cause text, picked boolean NOT NULL DEFAULT false, edge_key text);

-- ---------------------------------------------------------------- layer (the agentic layer)
CREATE TABLE IF NOT EXISTS layer.meta (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS layer.cases (
  id serial PRIMARY KEY, ref text UNIQUE NOT NULL, domain text NOT NULL, workflow_id text NOT NULL, subject_type text NOT NULL, subject_id text NOT NULL, subscriber_id text,
  title text NOT NULL, state text NOT NULL, amount numeric, proposed_amount numeric, owner_persona text, opened_at timestamptz NOT NULL, closed_at timestamptz, close_code text,
  edge_key text, scenario_key text, payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cases_state ON layer.cases(state);
CREATE TABLE IF NOT EXISTS layer.case_events (id serial PRIMARY KEY, case_id int NOT NULL REFERENCES layer.cases(id), at timestamptz NOT NULL, from_state text, to_state text NOT NULL, actor text NOT NULL, note text);
CREATE TABLE IF NOT EXISTS layer.runs (
  id serial PRIMARY KEY, case_id int REFERENCES layer.cases(id), workflow_id text NOT NULL, title text NOT NULL, status text NOT NULL, current_step text, waiting_on_persona text, waiting_event text,
  payload jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}', channel text NOT NULL, scenario_key text, sla_due timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS runs_case ON layer.runs(case_id);
CREATE TABLE IF NOT EXISTS layer.run_steps (id serial PRIMARY KEY, run_id int NOT NULL REFERENCES layer.runs(id), seq int NOT NULL, step_key text NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL, label text NOT NULL, status text NOT NULL, started_at timestamptz, ended_at timestamptz, decision text, outputs jsonb NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS steps_run ON layer.run_steps(run_id);
CREATE TABLE IF NOT EXISTS layer.approvals (id serial PRIMARY KEY, run_id int NOT NULL REFERENCES layer.runs(id), step_key text NOT NULL, approver_persona text NOT NULL, action_type text NOT NULL, amount numeric, decision text NOT NULL, reason text, created_at timestamptz NOT NULL, decided_at timestamptz, decided_by text);
CREATE INDEX IF NOT EXISTS approvals_pending ON layer.approvals(approver_persona) WHERE decision = 'PENDING';
CREATE TABLE IF NOT EXISTS layer.tasks (id serial PRIMARY KEY, kind text NOT NULL, case_id int REFERENCES layer.cases(id), run_id int, assignee_persona text NOT NULL, title text NOT NULL, brief text, due timestamptz NOT NULL, state text NOT NULL, outcome text, created_at timestamptz NOT NULL, done_at timestamptz);
CREATE TABLE IF NOT EXISTS layer.trail (
  id serial PRIMARY KEY, at timestamptz NOT NULL, actor_type text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, autonomy text, act text NOT NULL, case_id int, case_ref text, subject_id text, run_id int,
  clause text, system text, before jsonb, after jsonb, override boolean NOT NULL DEFAULT false, reason text, evidence jsonb, summary text NOT NULL, scenario_key text
);
CREATE INDEX IF NOT EXISTS trail_case ON layer.trail(case_id);
CREATE TABLE IF NOT EXISTS layer.activity (id serial PRIMARY KEY, at timestamptz NOT NULL, trigger text NOT NULL, agent text, action text NOT NULL, result text NOT NULL, autonomy text, case_ref text, scenario_key text);
CREATE TABLE IF NOT EXISTS layer.messages (id serial PRIMARY KEY, subscriber_id text, account_id text, case_ref text, channel text NOT NULL, lang text NOT NULL, template text NOT NULL, body text NOT NULL, status text NOT NULL, sent_at timestamptz NOT NULL, note text);
-- The promotion gate. One row per workflow: the rung the workflow currently holds for its delegated action, the gate, and the rolling window.
CREATE TABLE IF NOT EXISTS layer.authority (workflow_id text PRIMARY KEY, rung text NOT NULL, ceiling text NOT NULL, delegated_action text NOT NULL, delegated_limit numeric, gate numeric NOT NULL, window_size int NOT NULL, accuracy numeric NOT NULL, decisions int NOT NULL, changed_at timestamptz NOT NULL, changed_by text NOT NULL, note text);
CREATE TABLE IF NOT EXISTS layer.authority_history (id serial PRIMARY KEY, workflow_id text NOT NULL, at timestamptz NOT NULL, from_rung text NOT NULL, to_rung text NOT NULL, accuracy numeric NOT NULL, direction text NOT NULL, by text NOT NULL, reason text NOT NULL);
-- Every verified outcome of a delegated or recommended action, for the accuracy window.
CREATE TABLE IF NOT EXISTS layer.outcomes (id serial PRIMARY KEY, workflow_id text NOT NULL, case_ref text, at timestamptz NOT NULL, delegated boolean NOT NULL, correct boolean NOT NULL, note text);
-- Seeded-state snapshots of the planted fixtures, so scenarios can be run again.
CREATE TABLE IF NOT EXISTS layer.snapshots (edge_key text PRIMARY KEY, data jsonb NOT NULL);
