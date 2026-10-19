/** Subscribers: the CRM as the agents see it (read through the connector), with a detail drawer per subscriber. */
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { date, dateTime, money, pct } from '../lib/format';
import { useApp } from '../app/state';
import { Messages } from '../app/case';
import { Chip, Empty, Hero, Kv, Ref, Screen, Select, Source, Stat, StatusChip, Table } from '../app/ui';

export function SubscribersScreen() {
  const { route, go, openCase, director } = useApp();
  const [q, setQ] = useState(''); const [seg, setSeg] = useState(''); const [edge, setEdge] = useState(false);
  const [sel, setSel] = useState<string | null>(route.param);
  useEffect(() => { setSel(route.param); }, [route.param]);
  const { data, error } = useApi<any>(`/subscribers?q=${encodeURIComponent(q)}${seg ? `&segment=${seg}` : ''}${edge ? '&edge=1' : ''}`);
  if (error) return <Empty>{error}</Empty>;
  const st = data?.stats;
  return (
    <Screen hero={<Hero eyebrow="Subscribers" title={<>{st ? st.total.toLocaleString() : '…'} subscribers in the CRM, read through the connector</>} lede="The agents read these records with the minimum necessary fields; they never write to the CRM. Consent is checked here before any marketing contact." />}>
      {st ? <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"><Stat label="Prepaid" value={st.prepaid.toLocaleString()} /><Stat label="Postpaid" value={st.postpaid.toLocaleString()} /><Stat label="Enterprise lines" value={st.enterprise.toLocaleString()} /><Stat label="Marketing consent" value={pct((100 * st.consented) / st.total)} sub="on record" /><Stat label="Roaming enabled" value={st.roaming.toLocaleString()} /></div> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input h-9 flex-1 text-[13px]" placeholder="Search by id, name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={seg} onChange={setSeg} className="h-9 w-48 text-[13px]"><option value="">Every segment</option><option value="PREPAID">Prepaid</option><option value="POSTPAID">Postpaid</option><option value="ENTERPRISE">Enterprise</option></Select>
        <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={edge} onChange={(e) => setEdge(e.target.checked)} /> planted fixtures only</label>
      </div>
      <Table>
        <thead><tr><th>Subscriber</th><th>Segment · plan</th><th>Tenure</th><th>ARPU</th><th>Consent</th><th>Churn risk</th><th>Cases</th></tr></thead>
        <tbody>{(data?.rows ?? []).map((s: any) => (
          <tr key={s.id} className="clickable" onClick={() => go('subscribers', s.id)}>
            <td><span className="block text-sm font-medium">{s.name}</span><Ref>{s.id}</Ref>{s.edge_key ? <Chip className="ms-1">{s.edge_key}</Chip> : null}</td>
            <td className="text-[12px]"><StatusChip status={s.status} /><span className="block">{String(s.segment).toLowerCase()} · {s.plan}</span></td>
            <td className="font-mono text-[12px]">{s.tenure_months} mo</td><td className="font-mono text-[12px]">{money(s.arpu)}</td>
            <td>{s.consent_marketing ? <Chip tone="success">marketing</Chip> : <Chip tone="danger">no marketing</Chip>}</td>
            <td className="font-mono text-[12px]">{pct(Number(s.churn_risk) * 100)}</td><td className="font-mono text-[12px]">{s.cases}</td>
          </tr>))}</tbody>
      </Table>
      <Source system="CRM · GET /crm/v2/subscribers" />
      <Sheet open={!!sel} onOpenChange={(o) => !o && go('subscribers')} modal={!director}>
        <SheetContent side="right" className={`w-full overflow-y-auto sm:max-w-2xl ${director ? 'pb-52' : ''}`} onInteractOutside={(e) => { if (director) e.preventDefault(); }}>
          <SheetTitle className="sr-only">Subscriber {sel}</SheetTitle>
          {sel ? <SubscriberDetail id={sel} onCase={(ref) => { openCase(ref); }} /> : null}
        </SheetContent>
      </Sheet>
    </Screen>
  );
}

function SubscriberDetail({ id, onCase }: { id: string; onCase: (ref: string) => void }) {
  const { data: s, error } = useApi<any>(`/subscribers/${encodeURIComponent(id)}`);
  if (error) return <Empty>{error}</Empty>;
  if (!s) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-5">
      <header><p className="flex flex-wrap items-center gap-2 text-[12px]"><Ref>{s.id}</Ref><StatusChip status={s.status} /><Chip>{String(s.segment).toLowerCase()}</Chip>{s.edge_key ? <Chip>{s.edge_key}</Chip> : null}</p><h2 className="mt-1 text-lg font-semibold">{s.name}</h2><p className="text-[12px] text-muted-foreground">{s.msisdn} · {s.plan} · {s.language === 'ar' ? 'Arabic' : s.language === 'tr' ? 'Turkish' : 'English'}{s.account ? ` · ${s.account.name}` : ''}</p></header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Kv k="Tenure" v={`${s.tenure_months} months`} /><Kv k="ARPU" v={money(s.arpu)} /><Kv k="Marketing consent" v={s.consent_marketing ? 'On record' : 'Not on record'} /><Kv k="Churn risk" v={pct(Number(s.churn_risk) * 100)} /><Kv k="Roaming" v={s.roaming_enabled ? 'Enabled' : 'Restricted'} /><Kv k="Home cell" v={s.home_cell} mono /><Kv k="Device changed" v={s.device_changed_on ? date(s.device_changed_on) : '—'} /><Kv k="Last NPS" v={s.nps_last ?? '—'} /></dl>
      <Panel title="Cases"><ul className="space-y-1 text-[12px]">{s.cases.map((k: any) => <li key={k.ref} className="flex flex-wrap items-center gap-2"><button type="button" className="font-mono text-primary" onClick={() => onCase(k.ref)}>{k.ref}</button><Chip>{k.workflow_id}</Chip><span className="min-w-0 flex-1 truncate">{k.title}</span><StatusChip status={k.state} />{k.close_code ? <StatusChip status={k.close_code} /> : null}</li>)}{!s.cases.length ? <li className="text-muted-foreground">None.</li> : null}</ul></Panel>
      <Panel title="Invoices and charges (billing)"><Table><thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th>Charges</th></tr></thead><tbody>{s.invoices.map((i: any) => <tr key={i.id}><td className="font-mono text-[12px]">{i.id}</td><td className="text-[12px]">{i.period}</td><td className="font-mono text-[12px]">{money(i.amount)}</td><td><StatusChip status={i.status} /></td><td className="text-[12px]">{s.charges.filter((c: any) => c.invoice_id === i.id).map((c: any) => <span key={c.id} className="block">{c.description} · <span className="font-mono">{money(c.amount)}</span>{c.session_ref ? <span className="text-muted-foreground"> · {c.session_ref}</span> : null}</span>)}</td></tr>)}</tbody></Table>{!s.invoices.length ? <p className="text-[12px] text-muted-foreground">Prepaid line: no invoices.</p> : null}<Source system="Billing · GET /billing/v2/invoices" /></Panel>
      {s.credits.length ? <Panel title="Credits"><Table><thead><tr><th>Posted</th><th>Invoice</th><th>Amount</th><th>Reason</th><th>Approval</th><th>Reversed</th></tr></thead><tbody>{s.credits.map((c: any) => <tr key={c.id}><td className="text-[12px]">{dateTime(c.posted_at)}</td><td className="font-mono text-[12px]">{c.invoice_id}</td><td className="font-mono text-[12px]">{money(c.amount)}</td><td className="text-[12px]">{String(c.reason).replace(/_/g, ' ').toLowerCase()}</td><td className="font-mono text-[12px]">{c.approval_ref}</td><td className="text-[12px]">{c.reversed_at ? `${dateTime(c.reversed_at)} · ${c.reversal_reason}` : '—'}</td></tr>)}</tbody></Table></Panel> : null}
      {s.usage.length ? <Panel title="Usage (mediation) and partner TAP"><Table><thead><tr><th>Date</th><th>Type</th><th>Partner</th><th>Volume</th><th>Rated</th><th>Session</th><th>Cell</th><th>TAP received</th></tr></thead><tbody>{s.usage.slice(0, 30).map((u: any) => <tr key={u.id}><td className="text-[12px]">{u.on_date}</td><td className="text-[12px]">{u.type}</td><td className="font-mono text-[12px]">{u.partner_id ?? '—'}</td><td className="font-mono text-[12px]">{u.volume} {u.unit}</td><td className="font-mono text-[12px]">{money(u.rated_amount)}</td><td className="font-mono text-[12px]">{u.session_ref}</td><td className="font-mono text-[12px]">{u.cell_id}</td><td className="text-[12px]">{u.tap_received_on ?? <span className="text-warn">pending</span>}</td></tr>)}</tbody></Table></Panel> : null}
      {s.events.length ? <Panel title="Roaming flags"><ul className="space-y-1 text-[12px]">{s.events.map((e: any) => <li key={e.id} className="flex flex-wrap items-center gap-2"><span className="font-mono">{e.id}</span><span>{e.on_date}</span><Chip tone="danger">{e.pattern.replace(/_/g, ' ').toLowerCase()}</Chip><span className="font-mono">{Number(e.score).toFixed(2)}</span><StatusChip status={e.status} /><span className="text-muted-foreground">{e.detail}</span></li>)}</ul></Panel> : null}
      {s.restrictions.length ? <Panel title="Restrictions"><ul className="space-y-1 text-[12px]">{s.restrictions.map((r: any) => <li key={r.id}>{dateTime(r.applied_at)} · {r.kind.toLowerCase()} · {r.reason} · reversal: {r.reversal}{r.lifted_at ? ` · lifted ${dateTime(r.lifted_at)}` : ''}</li>)}</ul></Panel> : null}
      {s.complaints.length ? <Panel title="Complaints (case system)"><Table><thead><tr><th>Id</th><th>Raised</th><th>Channel</th><th>Category</th><th>Text</th><th>Status</th></tr></thead><tbody>{s.complaints.map((c: any) => <tr key={c.id}><td className="font-mono text-[12px]">{c.id}</td><td className="text-[12px]">{c.raised_on}</td><td className="text-[12px]">{c.channel}</td><td className="text-[12px]">{c.category}</td><td className="text-[12px]">{c.text}</td><td><StatusChip status={c.status} />{c.reopened ? <Chip tone="danger" className="ms-1">reopened</Chip> : null}</td></tr>)}</tbody></Table></Panel> : null}
      {s.registrations.length ? <Panel title="Responses registered (CVM)"><ul className="space-y-1 text-[12px]">{s.registrations.map((r: any) => <li key={r.id}>{dateTime(r.registered_at)} · {r.offer_name ?? r.fix}{r.fix && r.offer_name ? ` · ${r.fix}` : ''} · consent checked · {r.case_ref}</li>)}</ul></Panel> : null}
      <Panel title="Messages sent by Rafiq"><Messages rows={s.messages} /></Panel>
    </div>
  );
}
