/** Inbox: what waits on this persona. Decisions (runs waiting on them) and handoffs (tasks). Every item ends in the actual decision. */
import { useMemo, useState } from 'react';
import { InboxItem, InboxLayout, InboxList, InboxReader, InboxTabs } from '@cognirise/atelier/archetypes';
import { Loader2 } from 'lucide-react';
import { bump, post, useApi } from '../lib/api';
import { money, rel, title } from '../lib/format';
import { useApp, useFlash } from '../app/state';
import { CaseReader } from '../app/case';
import { Btn, Chip, DomainChip, Empty, Hero, Note, Ref, Screen } from '../app/ui';

function TaskCard({ t, onDone }: { t: any; onDone: () => void }) {
  const [outcome, setOutcome] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState('');
  const { open, session } = useApp();
  const flash = useFlash('tasks', t.id);
  const quick = t.kind === 'PROVISION' ? ['Provisioned and tested'] : t.kind === 'NOC_STEERING' ? ['Steering applied in the NOC tools', 'Not needed: pattern stopped'] : t.kind === 'NOC_FAULT' ? ['Fault cleared', 'Scheduled with the field team'] : t.kind === 'A3_REPORT' ? ['Noted'] : t.kind === 'AUTHORITY_CHANGED' ? ['Reviewed the three cases', 'Noted'] : ['Done'];
  return (
    <div className={`rounded-xl border border-border/60 bg-card/50 p-3 ${flash}`}>
      <p className="flex flex-wrap items-center gap-2 text-[12px]"><Chip tone="warn">{t.kind.replace(/_/g, ' ').toLowerCase()}</Chip>{t.case_ref ? <button type="button" className="font-mono text-primary" onClick={() => open(`case:${t.case_ref}`)}>{t.case_ref}</button> : null}<span className="ms-auto text-muted-foreground">due {rel(t.due, session?.clock.now)}</span></p>
      <p className="mt-1 text-sm font-medium">{t.title}</p>
      {t.brief ? <p className="mt-1 text-[12px] text-muted-foreground">{t.brief}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {quick.map((q) => <Btn key={q} small onClick={() => setOutcome(q)} className={outcome === q ? 'border-primary text-primary' : ''}>{q}</Btn>)}
        <input className="input h-8 flex-1 text-[12px]" placeholder="…or write the outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        <Btn small kind="primary" disabled={busy || !outcome} onClick={async () => { setBusy(true); try { const r = await post(`/tasks/${t.id}/done`, { outcome }); setResult(r.result); bump(); onDone(); } catch (e: any) { setResult(e.message); } finally { setBusy(false); } }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Record</Btn>
      </div>
      {result ? <p className="mt-1 text-[12px] text-muted-foreground">{result}</p> : null}
      {t.kind === 'NOC_STEERING' || t.kind === 'PROVISION' ? <p className="mt-1 text-[11px] text-muted-foreground">The agent prepared this and stopped. The network and provisioning are yours.</p> : null}
    </div>
  );
}

export function InboxScreen() {
  const { persona, session } = useApp();
  const { data, error, reload } = useApi<any>('/inbox', { poll: 10000 });
  const [tab, setTab] = useState<'decisions' | 'tasks'>('decisions');
  const [sel, setSel] = useState<string | null>(null);
  const approvals = useMemo(() => data?.approvals ?? [], [data]);
  const selected = approvals.find((a: any) => String(a.run_id) === sel) ?? approvals[0];
  if (error) return <Empty>{error}</Empty>;
  const tabs = [{ id: 'decisions', label: 'Decisions', count: approvals.length }, { id: 'tasks', label: 'Handoffs', count: data?.tasks?.length ?? 0 }];
  return (
    <Screen hero={<Hero eyebrow={`Inbox · ${persona?.role}`} title={<>{approvals.length + (data?.tasks?.length ?? 0)} things wait on you</>} lede="Every item names the actual decision and the amount. The agents prepared it; the reversible option sits left of the irreversible one; a decision that differs from the recommendation needs a reason." />} banner={false}>
      {persona?.approvesNothing ? <Note>The COO approves nothing in this layer. Switch persona from the badge at the top right to decide as a limit holder.</Note> : null}
      <InboxTabs items={tabs as any} value={tab} onChange={(id) => setTab(id as any)} />
      {tab === 'decisions' ? (
        <InboxLayout list={
          <InboxList label="Decisions" count={approvals.length} emptyState={<Empty>Nothing waits on you.</Empty>}>
            {approvals.map((a: any) => <ApprovalItem key={a.run_id} a={a} now={session?.clock.now} active={selected?.run_id === a.run_id} onSelect={() => setSel(String(a.run_id))} />)}
          </InboxList>}
          reader={<InboxReader>{selected ? <CaseReader key={selected.case_ref} refCode={selected.case_ref} /> : <Empty>Select an item.</Empty>}</InboxReader>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{(data?.tasks ?? []).map((t: any) => <TaskCard key={t.id} t={t} onDone={reload} />)}{!data?.tasks?.length ? <Empty>No handoffs.</Empty> : null}</div>
      )}
    </Screen>
  );
}

function ApprovalItem({ a, now, active, onSelect }: { a: any; now?: string; active: boolean; onSelect: () => void }) {
  const flash = useFlash('cases', a.case_ref);
  return (
    <div className={flash}>
      <InboxItem selected={active} onSelect={onSelect} reference={<Ref>{a.case_ref}</Ref>} state={<Chip tone="warn">{title(a.action_type)}{a.amount ? ` · ${money(a.amount)}` : ''}</Chip>} title={a.title}
        meta={<span className="flex flex-wrap items-center gap-1.5"><DomainChip d={a.domain} />{a.subscriber_name ? <span className="text-muted-foreground">{a.subscriber_name}</span> : null}<span className="text-muted-foreground">waiting {rel(a.waiting_since, now)}</span></span>}
        preview={a.result?.recommendation?.summary ?? a.title} />
    </div>
  );
}
