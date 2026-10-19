/**
 * The case reader, used by the Inbox and the case drawer. Top to bottom: what
 * the case is, the evidence Fahis assembled, Mushir's proposal with its
 * alternatives and the permission it needs, the decision bar when the case
 * waits on the signed-in person, the writes Munaffidh made (with the system
 * interface, before and after), the messages, the steps, the trail.
 */
import { useState, type ReactNode } from 'react';
import { DecisionTrail, ReaderSection, TrailEntry, type TrailKind } from '@cognirise/atelier/archetypes';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { CheckCircle2, CircleDashed, Clock, Loader2, XCircle, Hourglass } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { date, dateTime, money, rel, title } from '../lib/format';
import { useApp, useFlash } from './state';
import { AgentTag, Btn, Chip, DomainChip, Empty, Kv, Ref, StatusChip, Table, PERSONA_SHORT } from './ui';

export const KIND: Record<string, TrailKind> = {
  DETECT: 'observed', INVESTIGATE: 'observed', PROPOSE: 'proposed', GUARD: 'observed', REFUSE: 'rejected', EXECUTE: 'acted', NOTIFY: 'acted', VERIFY: 'observed', VERIFY_OPEN: 'observed', HANDOFF: 'acted', EVENT: 'observed',
  APPROVE: 'approved', REJECT: 'rejected', OVERRIDE: 'overridden', ESCALATE: 'escalated', TASK_DONE: 'approved', AUTHORITY_DOWN: 'escalated', AUTHORITY_UP: 'approved',
};

export function TrailList({ rows, compact }: { rows: any[]; compact?: boolean }) {
  const { session } = useApp();
  if (!rows.length) return <Empty>No activity yet.</Empty>;
  return (
    <DecisionTrail>
      {rows.map((e) => (
        <TrailEntry key={e.id} kind={KIND[e.act] ?? 'observed'}
          actor={e.actor_type === 'HUMAN' ? <span className="text-sm font-medium">{e.actor_name}</span> : <AgentTag id={e.actor_id} showChip={false} />}
          autonomy={e.autonomy ? <Chip>{e.autonomy}</Chip> : null}
          at={compact ? rel(e.at, session?.clock.now) : dateTime(e.at)}
          summary={e.summary}
          detail={e.system || e.clause || e.before || e.after ? <span className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">{e.system ? <span className="mono-chip">{e.system}</span> : null}{e.clause ? <span className="mono-chip is-primary">{e.clause}</span> : null}{e.before ? <span>before {JSON.stringify(e.before)}</span> : null}{e.after ? <span>after {JSON.stringify(e.after)}</span> : null}</span> : undefined}
          override={e.override ? { from: 'Agent recommendation', to: 'Human decision', reason: e.reason } : undefined} />
      ))}
    </DecisionTrail>
  );
}

function StepIcon({ s }: { s: string }) {
  if (s === 'DONE') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (s === 'WAITING') return <Clock className="h-4 w-4 text-warn" />;
  if (s === 'WAITING_EVENT') return <Hourglass className="h-4 w-4 text-primary" />;
  if (s === 'REFUSED' || s === 'FAILED') return <XCircle className="h-4 w-4 text-danger" />;
  if (s === 'RUNNING') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
}
export function Steps({ steps }: { steps: any[] }) {
  return (
    <ol className="space-y-1">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-3 rounded-lg px-2 py-1">
          <span className="mt-0.5"><StepIcon s={s.status} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm"><span className={s.status === 'SKIPPED' ? 'text-muted-foreground line-through' : ''}>{s.label}</span>{s.actor_type === 'HUMAN' ? <Chip tone="warn">{PERSONA_SHORT[s.actor_id] ?? (s.actor_id.startsWith('approver:') ? 'the limit holder' : s.actor_id)}</Chip> : <AgentTag id={s.actor_id} showChip={false} size={16} />}{s.actor_type === 'SYSTEM' && s.actor_id === 'munaffidh' ? <Chip>writes the record</Chip> : null}</p>
            {s.decision ? <p className="text-[12px] text-muted-foreground">{s.decision}</p> : null}
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{s.ended_at ? dateTime(s.ended_at) : s.started_at ? dateTime(s.started_at) : ''}</span>
        </li>
      ))}
    </ol>
  );
}

export function Messages({ rows }: { rows: any[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  if (!rows.length) return <Empty>No messages on this case yet.</Empty>;
  return (
    <ul className="space-y-1">{rows.map((m) => {
      const flash = useFlash('messages', m.id);
      return (
        <li key={m.id} className={`rounded-lg border border-border/60 bg-card/50 p-2 text-[12px] ${flash}`}>
          <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" onClick={() => setOpenId(openId === m.id ? null : m.id)}><span className="font-mono text-muted-foreground">{dateTime(m.sent_at)}</span><Chip>{m.channel}</Chip><Chip tone="primary">{m.template.replace(/_/g, ' ').toLowerCase()}</Chip><Chip>{m.lang === 'ar' ? 'Arabic' : 'English'}</Chip><StatusChip status={m.status} />{m.note ? <span className="text-warn">{m.note}</span> : null}</button>
          {openId === m.id ? <div className={`mt-2 whitespace-pre-wrap rounded-lg border border-border/60 bg-background/60 p-3 text-[13px] leading-relaxed ${m.lang === 'ar' ? 'ar text-end' : ''}`} dir={m.lang === 'ar' ? 'rtl' : 'ltr'}>{m.body}</div> : null}
        </li>
      );
    })}</ul>
  );
}

function Evidence({ run }: { run: any }) {
  const ev = run?.result?.evidence; if (!ev) return null;
  return (
    <ReaderSection label={<>Evidence · Fahis {ev.mode === 'claude' ? <Chip tone="success">Claude</Chip> : <Chip tone="warn">Offline</Chip>}</>}>
      <p className="text-sm leading-relaxed">{ev.narration}</p>
      {ev.finding ? <p className="mt-1 flex flex-wrap gap-2 text-[12px]"><Chip tone={ev.finding.certainty === 'HIGH' ? 'success' : ev.finding.certainty === 'MEDIUM' ? 'warn' : 'danger'}>{String(ev.finding.kind).replace(/_/g, ' ').toLowerCase()} · {String(ev.finding.certainty).toLowerCase()} certainty</Chip>{ev.finding.missing ? <Chip tone="warn">missing: {ev.finding.missing}</Chip> : null}</p> : null}
      {ev.records?.length ? <ul className="mt-2 space-y-1">{ev.records.map((r: any, i: number) => <li key={i} className="rounded-lg border border-border/60 bg-card/40 px-2.5 py-1.5 text-[12px]"><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{r.system}</span><span className="block">{r.what}{r.expected !== undefined ? ` · expected ${r.expected}, charged ${r.charged}` : ''}{r.amounts ? ` · ${r.amounts.join(' + ')}` : ''}{r.received ? ` · ${r.received}` : ''}{r.cells ? ` · cells ${r.cells.join(', ')}` : ''}</span></li>)}</ul> : null}
    </ReaderSection>
  );
}
function Proposal({ run }: { run: any }) {
  const p = run?.result?.proposal; if (!p) return null;
  return (
    <ReaderSection label={<>Proposal · Mushir {p.mode === 'claude' ? <Chip tone="success">Claude</Chip> : <Chip tone="warn">Offline</Chip>}</>}>
      <p className="text-sm leading-relaxed">{p.narration}</p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <Kv k="Action" v={<span className="flex flex-wrap items-center gap-2"><Chip tone="primary">{String(p.action).replace(/_/g, ' ').toLowerCase()}</Chip>{p.amount ? <span className="font-mono">{money(p.amount)}</span> : null}{p.offerName ? <span>{p.offerName}</span> : null}{p.fix ? <span>{p.fix}</span> : null}</span>} />
        <Kv k="Permission it needs" v={p.permission} />
        {p.alternatives?.length ? <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Alternatives considered</dt><dd className="mt-0.5 space-y-0.5 text-[13px]">{p.alternatives.map((a: string) => <p key={a}>· {a}</p>)}</dd></div> : null}
        {p.quote ? <Kv k="Quote" v={`${money(p.quote.monthly)} per month · ${p.quote.term} months · total ${money(p.quote.tcv)} · margin ${Math.round(p.quote.margin * 100)}%${p.quote.dependencies?.length ? ` · depends on: ${p.quote.dependencies.join('; ')}` : ''}`} /> : null}
        {p.retained !== undefined ? <Kv k="Retained contribution (90 days, net)" v={`${money(p.retained)} against a comparison group of ${p.comparison}`} /> : null}
        {p.steering ? <Kv k="Network action" v="Steering proposed as a NOC handoff; the agent does not perform it." /> : null}
      </dl>
    </ReaderSection>
  );
}

export function Recommendation({ run }: { run: any }) {
  const r = run?.result?.recommendation; if (!r) return null;
  const tone = r.verdict === 'APPROVE' ? 'success' : r.verdict === 'DECLINE' ? 'danger' : 'warn';
  return (
    <div className={`rounded-xl border p-3 ${tone === 'success' ? 'border-success/40 bg-success/5' : tone === 'danger' ? 'border-danger/40 bg-danger/5' : 'border-warn/40 bg-warn/5'}`}>
      <p className="flex items-center gap-2 text-[12px]"><span className="eyebrow">Agent recommendation</span><Chip tone={tone}>{r.verdict === 'APPROVE' ? 'Approve' : r.verdict === 'DECLINE' ? 'Decline' : 'Review'}</Chip></p>
      <p className="mt-1 text-sm leading-relaxed">{r.summary}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">A decision that differs from the recommendation needs a reason; it is recorded as an override on the trail and counts in the workflow’s accuracy.</p>
    </div>
  );
}

const LABELS: Record<string, [string, string]> = { CREDIT: ['Approve the credit', 'Decline the credit'], REVERSE_CREDIT: ['Approve the reversal', 'Keep the credit'], RESTRICT_ROAMING: ['Approve the restriction and the query', 'Dismiss the flag'], OFFER: ['Approve the response', 'Decline the response'], RESOLVE_COMPLAINT: ['Approve the resolution', 'Send back'], QUOTE: ['Approve the quote', 'Decline the quote'], DECIDE: ['Approve', 'Decline'] };

export function Decide({ run, onDone, extra }: { run: any; onDone?: () => void; extra?: ReactNode }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const rec = run?.result?.recommendation; const action = run?.result?.actionType ?? 'DECIDE';
  const [ok, no] = LABELS[action] ?? LABELS.DECIDE;
  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    const overrides = rec && ((rec.verdict === 'DECLINE' && decision === 'APPROVED') || (rec.verdict === 'APPROVE' && decision === 'REJECTED'));
    if ((overrides || decision === 'REJECTED') && !reason.trim()) { setErr('A reason is required'); return; }
    setBusy(true); setErr('');
    try { await post(`/runs/${run.id}/decide`, { decision, reason: reason.trim() || undefined }); bump(); onDone?.(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm text-muted-foreground">This waits on you: <strong>{title(action)}{run?.result?.amount ? ` of ${money(run.result.amount)}` : ''}</strong>. {rec ? `The agent recommends: ${rec.verdict.toLowerCase()}.` : ''}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Btn small onClick={() => decide('REJECTED')} disabled={busy}>{no}</Btn>
        <Btn small kind="primary" onClick={() => decide('APPROVED')} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{ok}</Btn>
      </div>
      <input className="input w-full" placeholder="Reason (required to decline or to override the recommendation)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err ? <p className="text-[12px] text-danger">{err}</p> : null}
      {extra}
    </div>
  );
}

export function CaseReader({ refCode, onClose }: { refCode: string; onClose?: () => void }) {
  const { persona, open } = useApp();
  const { data: k, error, reload } = useApi<any>(`/cases/${encodeURIComponent(refCode)}`);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  if (error) return <Empty>{error}</Empty>;
  if (!k) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const run = k.runs[k.runs.length - 1];
  const steps = run ? k.steps.filter((s: any) => s.run_id === run.id) : [];
  const pending = k.approvals.find((a: any) => a.decision === 'PENDING');
  const waitsOnMe = pending && run && (run.status === 'WAITING' || run.status === 'ESCALATED') && (pending.approver_persona === persona?.key || (pending.action_type === 'CREDIT' && (persona?.key === 'finance' || (persona?.key === 'billing_manager' && pending.approver_persona === 'billing_officer'))));
  const waitingEvent = run?.status === 'WAITING_EVENT';
  const fire = async (kind: string) => { setBusy(true); setMsg(''); try { await post(`/cases/${k.ref}/event`, { kind }); bump(); reload(); setMsg(kind === 'VERIFY' ? 'Clock advanced fourteen days; Muraqib verified.' : 'Event delivered.'); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-5">
      <header>
        <p className="flex flex-wrap items-center gap-2 text-[12px]"><Ref>{k.ref}</Ref><DomainChip d={k.domain} /><Chip>{k.workflow_id}</Chip><StatusChip status={k.state} />{k.close_code ? <StatusChip status={k.close_code} /> : null}{k.edge_key ? <Chip>{k.edge_key}</Chip> : null}{k.scenario_key ? <Chip tone="primary">{k.scenario_key}</Chip> : null}</p>
        <h2 className="mt-1 text-lg font-semibold">{k.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {k.subscriber_id ? <button type="button" className="font-mono text-primary" onClick={() => open(`subscriber:${k.subscriber_id}`)}>{k.subscriber_name} · {k.subscriber_id}</button> : <span className="font-mono">{k.subject_id}</span>}
          {k.segment ? <Chip>{String(k.segment).toLowerCase()}</Chip> : null}{k.language ? <Chip>{k.language === 'ar' ? 'Arabic' : k.language === 'tr' ? 'Turkish' : 'English'}</Chip> : null}
          <span>· opened {date(k.opened_at)}</span>{k.closed_at ? <span>· closed {date(k.closed_at)}</span> : null}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kv k="Disputed / exposure" v={k.amount !== null && k.state !== 'CLOSED' && !k.proposed_amount ? money(k.amount) : money(run?.payload?.disputed_amount ?? k.amount)} />
        <Kv k="Proposed" v={k.proposed_amount !== null ? money(k.proposed_amount) : '—'} />
        <Kv k="Owner now" v={k.owner_persona ? PERSONA_SHORT[k.owner_persona] : run?.status === 'WAITING_EVENT' ? 'Muraqib (verifying)' : '—'} />
        <Kv k="Run" v={run ? <span className="flex flex-wrap items-center gap-1"><StatusChip status={run.status} />{run.waiting_event ? <Chip>until {steps.find((s: any) => s.status === 'WAITING_EVENT')?.outputs?.dueOn ?? 'event'}</Chip> : null}</span> : '—'} />
      </dl>
      {run ? <Evidence run={run} /> : null}
      {run ? <Proposal run={run} /> : null}
      {waitsOnMe ? <><Recommendation run={run} /><Decide run={run} onDone={reload} /></> : pending ? <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[12px]">Waiting on the <strong>{PERSONA_SHORT[pending.approver_persona]}</strong> ({title(pending.action_type)}{pending.amount ? ` of ${money(pending.amount)}` : ''}). Switch persona from the badge at the top right to decide as them.</p> : null}
      {waitingEvent ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[12px]"><span className="flex-1">Muraqib is watching this case{steps.find((s: any) => s.status === 'WAITING_EVENT')?.outputs?.dueOn ? ` until ${steps.find((s: any) => s.status === 'WAITING_EVENT').outputs.dueOn}` : ''}. In the demo you can advance the clock.</span>{k.workflow_id === 'WF-05' ? <Btn small onClick={() => fire('PROVISIONED')} disabled={busy}>Delivery team confirms activation</Btn> : <><Btn small onClick={() => fire('VERIFY')} disabled={busy}>Advance 14 days and verify</Btn>{k.workflow_id === 'WF-04' ? <Btn small onClick={() => fire('REPEAT_CONTACT')} disabled={busy}>Customer comes back</Btn> : null}</>}{msg ? <span className="text-muted-foreground">{msg}</span> : null}</div> : null}
      {k.tasks.length ? <ReaderSection label="Handoffs to people"><ul className="space-y-1 text-[12px]">{k.tasks.map((t: any) => <li key={t.id} className="flex flex-wrap items-center gap-2"><Chip tone="warn">{t.kind.replace(/_/g, ' ').toLowerCase()}</Chip><span>{t.title}</span><span className="text-muted-foreground">→ {PERSONA_SHORT[t.assignee_persona]}</span><StatusChip status={t.state} />{t.outcome ? <span className="text-muted-foreground">· {t.outcome}</span> : null}</li>)}</ul></ReaderSection> : null}
      <ReaderSection label="Customer messages · Rafiq"><Messages rows={k.messages} /></ReaderSection>
      {k.approvals.length ? <ReaderSection label="Approvals"><Table><thead><tr><th>Step</th><th>Action</th><th>Amount</th><th>Approver</th><th>Decision</th><th>Reason</th></tr></thead><tbody>{k.approvals.map((a: any) => <tr key={a.id}><td>{a.step_key}</td><td>{title(a.action_type)}</td><td className="font-mono">{a.amount ? money(a.amount) : '—'}</td><td>{PERSONA_SHORT[a.approver_persona]}</td><td><StatusChip status={a.decision} />{a.decided_at ? <span className="block text-[11px] text-muted-foreground">{dateTime(a.decided_at)}</span> : null}</td><td className="text-[12px]">{a.reason ?? ''}</td></tr>)}</tbody></Table></ReaderSection> : null}
      {run ? <ReaderSection label="The loop"><Steps steps={steps} /></ReaderSection> : null}
      <ReaderSection label="Trail"><TrailList rows={[...k.trail].reverse()} compact /></ReaderSection>
      {onClose ? <div className="pt-2"><Btn small onClick={onClose}>Close</Btn></div> : null}
    </div>
  );
}

export function CaseDrawer() {
  const { caseRef, openCase, director } = useApp();
  const flash = useFlash('cases', caseRef);
  const directing = !!director;
  return (
    <Sheet open={!!caseRef} onOpenChange={(o) => !o && openCase(null)} modal={!directing}>
      <SheetContent side="right" className={`w-full overflow-y-auto sm:max-w-2xl ${directing ? 'pb-52 shadow-2xl' : ''} ${flash}`} onInteractOutside={(e) => { if (directing) e.preventDefault(); }}>
        <SheetTitle className="sr-only">Case {caseRef}</SheetTitle>
        {caseRef ? <CaseReader refCode={caseRef} onClose={() => openCase(null)} /> : null}
      </SheetContent>
    </Sheet>
  );
}
