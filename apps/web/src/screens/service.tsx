/** Complaints: the case system's queue and what the service workflow did with each. Measured on first-time resolution and repeat contact, never deflection. */
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { pct } from '../lib/format';
import { useApp } from '../app/state';
import { Chip, Empty, Hero, Screen, Source, Stat, StatusChip, Table } from '../app/ui';

export function ServiceScreen() {
  const { data, error } = useApi<any>('/complaints', { poll: 15000 });
  const { openCase, open } = useApp();
  if (error) return <Empty>{error}</Empty>;
  const rows = data?.rows ?? []; const st = data?.stats;
  const withCase = rows.filter((r: any) => r.case_ref);
  const ftr = withCase.filter((r: any) => r.close_code === 'RESOLVED_FIRST_TIME').length; const closed = withCase.filter((r: any) => r.close_code).length;
  return (
    <Screen hero={<Hero eyebrow="Service & customer experience" title={<>{st?.open ?? 0} open complaints; {closed ? pct((100 * ftr) / closed) : '—'} resolved first time</>} lede="The agent resolves what it is allowed to (an explanation, a permitted fix under the small-credit limit) and hands everything else to a person with every previous contact attached. A deflected call that comes back is two calls; the measure is first-time resolution." />}>
      <div className="grid gap-3 sm:grid-cols-4"><Stat label="Open" value={st?.open ?? 0} /><Stat label="Reopened in ninety days" value={st?.reopened ?? 0} tone="danger" /><Stat label="Handed to a person" value={withCase.filter((r: any) => r.case_state === 'HANDED_OFF' || r.case_state === 'AWAITING_APPROVAL').length} /><Stat label="To the regulator" value={st?.regulator ?? 0} /></div>
      <Panel title="Complaints"><Table><thead><tr><th>Id</th><th>Raised</th><th>Subscriber</th><th>Channel</th><th>Category</th><th>Contacts</th><th>Status</th><th>Case</th><th>Outcome</th></tr></thead><tbody>{rows.map((c: any) => <tr key={c.id}><td className="font-mono text-[12px]">{c.id}</td><td className="text-[12px]">{c.raised_on}</td><td className="text-[12px]"><button type="button" className="text-primary" onClick={() => open(`subscriber:${c.subscriber_id}`)}>{c.subscriber_name}</button></td><td className="text-[12px]">{c.channel.toLowerCase()}</td><td className="text-[12px]">{c.category.toLowerCase()}</td><td className="font-mono text-[12px]">{c.contacts}</td><td><StatusChip status={c.status} />{c.reopened ? <Chip tone="danger" className="ms-1">reopened</Chip> : null}</td><td>{c.case_ref ? <button type="button" className="font-mono text-[12px] text-primary" onClick={() => openCase(c.case_ref)}>{c.case_ref}</button> : <span className="text-[12px] text-muted-foreground">—</span>}</td><td>{c.case_state ? <StatusChip status={c.close_code ?? c.case_state} /> : null}</td></tr>)}</tbody></Table><Source system="Case system · GET /cases/v1/complaints" /></Panel>
    </Screen>
  );
}
