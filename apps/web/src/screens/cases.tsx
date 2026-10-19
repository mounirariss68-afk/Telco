/** Cases: every case in the persona's scope, by domain and state; click opens the reader. */
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../lib/api';
import { money, rel, title } from '../lib/format';
import { useApp, useFlash } from '../app/state';
import { Chip, DomainChip, Empty, Hero, Ref, Screen, Select, StatusChip, Table, PERSONA_SHORT, DOMAIN_LABEL } from '../app/ui';

export function CasesScreen() {
  const { route, openCase, session, caseRef } = useApp();
  const [domain, setDomain] = useState(''); const [state, setState] = useState('open'); const [q, setQ] = useState('');
  useEffect(() => { if (route.param?.startsWith('domain=')) setDomain(route.param.slice(7)); else if (route.param && route.param.startsWith('DEMO-C')) { /* opened by ref */ } }, [route.param]);
  useEffect(() => { if (route.param?.startsWith('DEMO-C') && route.param !== caseRef) openCase(route.param); }, [route.param, caseRef, openCase]);
  const path = useMemo(() => `/cases?state=${state}${domain ? `&domain=${domain}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, [state, domain, q]);
  const { data, error } = useApi<any[]>(path, { poll: 12000 });
  if (error) return <Empty>{error}</Empty>;
  return (
    <Screen hero={<Hero eyebrow="Cases" title="One case per event, one owner per decision" lede="A case is opened by Raqib from a queue the operator already runs, carries Fahis’s evidence and Mushir’s proposal, stops where a person is needed, and closes only with Muraqib’s verification." />}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={state} onChange={setState} className="h-9 w-40 text-[13px]"><option value="open">Open</option><option value="closed">Closed</option><option value="">All</option></Select>
        <Select value={domain} onChange={setDomain} className="h-9 w-56 text-[13px]"><option value="">Every domain</option>{Object.entries(DOMAIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <input className="input h-9 flex-1 text-[13px]" placeholder="Search by reference, title or subject" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-[12px] text-muted-foreground">{data?.length ?? 0} cases</span>
      </div>
      <Table>
        <thead><tr><th>Reference</th><th>Domain</th><th>Case</th><th>State</th><th>Proposed</th><th>Owner now</th><th>Updated</th></tr></thead>
        <tbody>{(data ?? []).map((k) => <Row key={k.ref} k={k} now={session?.clock.now} onOpen={() => openCase(k.ref)} />)}</tbody>
      </Table>
      {!data?.length ? <Empty>No cases match.</Empty> : null}
    </Screen>
  );
}
function Row({ k, now, onOpen }: { k: any; now?: string; onOpen: () => void }) {
  const flash = useFlash('cases', k.ref, true);
  return (
    <tr className={`clickable ${flash}`} onClick={onOpen}>
      <td><Ref>{k.ref}</Ref>{k.edge_key ? <span className="block text-[10px] text-muted-foreground">{k.edge_key}</span> : null}</td>
      <td><DomainChip d={k.domain} /></td>
      <td><span className="block text-sm">{k.title}</span><span className="block text-[12px] text-muted-foreground">{k.subscriber_name ?? k.subject_id}{k.scenario_key ? ` · ${k.scenario_key}` : ''}</span></td>
      <td><StatusChip status={k.state} />{k.close_code ? <span className="block"><StatusChip status={k.close_code} /></span> : null}</td>
      <td className="font-mono text-[12px]">{k.proposed_amount ? money(k.proposed_amount) : '—'}</td>
      <td className="text-[12px]">{k.owner_persona ? PERSONA_SHORT[k.owner_persona] : k.run_status === 'WAITING_EVENT' ? <Chip>Muraqib · verifying</Chip> : '—'}{k.current_step ? <span className="block text-muted-foreground">{title(k.current_step)}</span> : null}</td>
      <td className="whitespace-nowrap text-[12px] text-muted-foreground">{rel(k.updated_at, now)}</td>
    </tr>
  );
}
