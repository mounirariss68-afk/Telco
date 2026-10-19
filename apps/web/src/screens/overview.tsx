/** Overview: the layer on top of the systems, the measures against the baseline, what waits on whom, the authority each workflow holds, and the overrides. */
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { money, num, pct, rel, title } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, Bar, Chip, Empty, Hero, Screen, StatusChip, DOMAIN_LABEL, PERSONA_SHORT } from '../app/ui';

export function Overview() {
  const { persona, go, open, session } = useApp();
  const { data, error } = useApi<any>('/overview', { poll: 15000 });
  if (error) return <Empty>{error}</Empty>;
  const open_ = data?.byDomain?.reduce((s: number, d: any) => s + d.open, 0) ?? 0;
  const waiting = data?.byDomain?.reduce((s: number, d: any) => s + d.waiting, 0) ?? 0;
  return (
    <Screen hero={<Hero eyebrow={`Overview · ${persona?.role}`} title={<>{open_} open cases, {waiting} waiting on a person</>} lede="Agentic workflows on top of Dhow Telecom’s own systems. The agent does four of the five steps; a person does the one that costs money, changes a tariff, restricts a customer or touches the network. Nothing here is replaced; everything is read through a connector." />}>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="The layer on top">
          <div className="space-y-2">
            <p className="eyebrow">People decide</p>
            <div className="layer-row">{['Billing officer', 'Billing manager', 'Roaming analyst', 'CVM manager', 'Service agent', 'Enterprise sales', 'NOC'].map((p) => <div key={p} className="layer-box">{p}</div>)}</div>
            <p className="eyebrow pt-2">Agents work</p>
            <div className="layer-row">{['raqib', 'fahis', 'mushir', 'hami', 'munaffidh', 'rafiq', 'muraqib'].map((a) => <div key={a} className="layer-box flex items-center justify-between"><AgentTag id={a} showChip={false} size={18} /></div>)}</div>
            <p className="eyebrow pt-2">Systems of record, unchanged</p>
            <div className="layer-row">{['Billing & rating', 'CRM & cases', 'Usage (mediation)', 'Roaming & partner TAP', 'CVM & consent', 'Order management', 'Network telemetry (read only)'].map((s) => <div key={s} className="layer-box system">{s}</div>)}</div>
            <p className="text-[11px] text-muted-foreground">Governed by the Agent Authority Model: exposure sets the ceiling, evidence moves authority within it. The NOC keeps the network.</p>
          </div>
        </Panel>
        <Panel title="Authority held right now" action={<button type="button" className="text-[12px] text-primary" onClick={() => go('authority')}>the gate</button>}>
          <ul className="space-y-2">{(data?.authority ?? []).map((a: any) => (
            <li key={a.workflow_id} className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[12px]">
              <p className="flex flex-wrap items-center gap-2"><Chip tone="primary">{a.workflow_id}</Chip><StatusChip status={a.rung} /><span className="text-muted-foreground">ceiling {a.ceiling}</span><span className="ms-auto font-mono">{pct(Number(a.accuracy) * 100)} / gate {pct(Number(a.gate) * 100)}</span></p>
              <Bar value={Number(a.accuracy) * 100} tone={Number(a.accuracy) >= Number(a.gate) ? 'success' : 'danger'} className="mt-1.5" />
              <p className="mt-1 text-muted-foreground">{a.delegated_action}{a.changed_at ? ` · since ${String(a.changed_at).slice(0, 10)} by ${PERSONA_SHORT[a.changed_by] ?? a.changed_by}` : ''}</p>
            </li>))}</ul>
          {data?.delegated ? <p className="mt-2 text-[12px] text-muted-foreground">{data.delegated.n} small credits ({money(data.delegated.amount)}) posted without a person under A3, every one reported and verified.</p> : null}
        </Panel>
      </div>
      <Panel title="Measures, against the operator’s baseline" action={<button type="button" className="text-[12px] text-primary" onClick={() => go('measures')}>definitions</button>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(data?.measures ?? []).filter((m: any) => m.current !== null || m.designed).slice(0, 8).map((m: any) => {
          const fmt = (v: number | null) => (v === null ? '—' : m.unit === 'AED' ? money(v) : m.unit === '%' ? pct(v) : m.unit === 'days' ? `${num(v, 1)} days` : num(v, 1));
          const better = m.current !== null && m.baseline !== null ? (m.better === 'lower' ? m.current < m.baseline : m.current > m.baseline) : null;
          return (
            <div key={m.id} className="rounded-xl border border-border/60 bg-card/50 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.name}</p>
              <p className="mt-1 text-xl font-semibold leading-none">{m.designed ? <span className="text-muted-foreground">designed</span> : fmt(m.current)}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">baseline {fmt(m.baseline)}{better === null ? '' : better ? ' · better' : ' · worse'}</p>
            </div>
          );
        })}</div>
        <p className="mt-2 text-[11px] text-muted-foreground">Verified by Muraqib from closed cases on synthetic data; the baseline is the operator’s own (synthetic). Nothing here is a Cognirise result or a forecast.</p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By domain">
          <ul className="space-y-1.5 text-[12px]">{(data?.byDomain ?? []).map((d: any) => <li key={d.domain} className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-start hover:text-primary" onClick={() => go('cases', `domain=${d.domain}`)}>{DOMAIN_LABEL[d.domain]}</button><span className="font-mono">{d.open} open</span><span className="font-mono text-warn">{d.waiting} waiting</span><span className="font-mono text-muted-foreground">{d.closed60} closed</span></li>)}</ul>
        </Panel>
        <Panel title="Waiting on whom">
          <ul className="space-y-1.5 text-[12px]">{(data?.waiting ?? []).map((w: any) => <li key={w.approver_persona} className="flex items-center gap-2"><span className="flex-1">{PERSONA_SHORT[w.approver_persona]}</span><span className="font-mono">{w.n}</span></li>)}{!data?.waiting?.length ? <li className="text-muted-foreground">Nothing waits on anyone.</li> : null}</ul>
        </Panel>
        <Panel title="Overrides: people who disagreed with the agent" action={<button type="button" className="text-[12px] text-primary" onClick={() => go('trail', 'overrides=1')}>all</button>}>
          <ul className="space-y-1.5 text-[12px]">{(data?.overrides ?? []).map((o: any, i: number) => <li key={i}><button type="button" className="font-mono text-primary" onClick={() => open(`case:${o.case_ref}`)}>{o.case_ref}</button> <span className="text-muted-foreground">{o.actor_name}</span><span className="block truncate">{o.summary}</span></li>)}{!data?.overrides?.length ? <li className="text-muted-foreground">No overrides yet.</li> : null}</ul>
        </Panel>
      </div>
      <Panel title="Activity, right now">
        <ul className="space-y-1 text-[12px]">{(data?.activity ?? []).map((a: any) => <li key={a.id} className="flex flex-wrap items-center gap-2"><span className="font-mono text-muted-foreground">{rel(a.at, session?.clock.now)}</span>{a.agent ? <AgentTag id={a.agent} showChip={false} size={16} /> : <span className="font-medium">Person</span>}<span>{a.action}</span><span className="text-muted-foreground">→ {a.result}</span>{a.case_ref ? <button type="button" className="font-mono text-primary" onClick={() => open(`case:${a.case_ref}`)}>{a.case_ref}</button> : null}{a.scenario_key ? <Chip>{a.scenario_key}</Chip> : null}</li>)}</ul>
        <p className="mt-2 text-[11px] text-muted-foreground">{title('')}</p>
      </Panel>
    </Screen>
  );
}
