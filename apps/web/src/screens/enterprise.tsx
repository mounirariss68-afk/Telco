/** Enterprise orders: quote to activation in one case; provisioning stays with the delivery team. */
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { money, num } from '../lib/format';
import { useApp } from '../app/state';
import { Chip, Empty, Hero, Screen, Source, Stat, StatusChip, Table } from '../app/ui';

export function EnterpriseScreen() {
  const { data, error } = useApi<any>('/orders', { poll: 15000 });
  const { openCase } = useApp();
  if (error) return <Empty>{error}</Empty>;
  const rows = data?.rows ?? [];
  const active = rows.filter((o: any) => o.stage === 'ACTIVE' && o.activated_on);
  const days = active.length ? active.reduce((s: number, o: any) => s + (Date.parse(o.activated_on) - Date.parse(o.requested_on)) / 86_400_000, 0) / active.length : null;
  return (
    <Screen hero={<Hero eyebrow="Enterprise services" title={<>{rows.filter((o: any) => !['ACTIVE'].includes(o.stage)).length} orders in flight; {days ? `${num(days, 0)} days` : '—'} quote to activation</>} lede="Requirement, feasibility, quote and commercial approval in one case. Provisioning and any network change stay with the delivery team and the NOC; the agent prepares, tracks and confirms, and never provisions." />}>
      <div className="grid gap-3 sm:grid-cols-4"><Stat label="Requested" value={rows.filter((o: any) => o.stage === 'REQUESTED').length} /><Stat label="Quoted, awaiting approval" value={rows.filter((o: any) => o.stage === 'QUOTED').length} /><Stat label="With the delivery team" value={rows.filter((o: any) => o.stage === 'PROVISIONING').length} /><Stat label="Reworked after approval" value={rows.filter((o: any) => o.stage === 'REWORK').length} tone="warn" /></div>
      <Panel title="Orders"><Table><thead><tr><th>Order</th><th>Account</th><th>Service</th><th>Sites</th><th>Monthly</th><th>Term</th><th>Requested</th><th>Stage</th><th>Case</th></tr></thead><tbody>{rows.map((o: any) => <tr key={o.id}><td className="font-mono text-[12px]">{o.id}</td><td className="text-[12px]"><span className="block font-medium">{o.account_name}</span><span className="text-muted-foreground">{o.sector}</span></td><td className="text-[12px]">{o.service.replace(/_/g, ' ')}<span className="block text-muted-foreground">{o.detail}</span></td><td className="font-mono text-[12px]">{o.sites}</td><td className="font-mono text-[12px]">{money(o.monthly_value)}</td><td className="font-mono text-[12px]">{o.term_months} mo</td><td className="text-[12px]">{o.requested_on}{o.activated_on ? <span className="block text-muted-foreground">active {o.activated_on}</span> : null}</td><td><StatusChip status={o.stage} /></td><td>{o.case_ref ? <button type="button" className="font-mono text-[12px] text-primary" onClick={() => openCase(o.case_ref)}>{o.case_ref}</button> : <span className="text-[12px] text-muted-foreground">—</span>}</td></tr>)}</tbody></Table><Source system="Order management · GET /orders/v1" /></Panel>
      <Panel title="Accounts"><Table><thead><tr><th>Account</th><th>Sector</th><th>Lines</th><th>Contract value</th><th>Owner</th><th>Orders</th></tr></thead><tbody>{(data?.accounts ?? []).map((a: any) => <tr key={a.id}><td className="text-sm font-medium">{a.name} <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>{a.edge_key ? <Chip className="ms-1">{a.edge_key}</Chip> : null}</td><td className="text-[12px]">{a.sector}</td><td className="font-mono text-[12px]">{a.lines}</td><td className="font-mono text-[12px]">{money(a.contract_value)}</td><td className="text-[12px]">{a.owner}</td><td className="font-mono text-[12px]">{a.orders}</td></tr>)}</tbody></Table></Panel>
    </Screen>
  );
}
