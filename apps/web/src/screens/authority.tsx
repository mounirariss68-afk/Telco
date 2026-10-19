/** Authority: the promotion gate. What each workflow may do without a person, its ceiling, its accuracy against the gate, the history of changes, and the limits per persona. */
import { Panel } from '@cognirise/atelier/layout';
import { useApi } from '../lib/api';
import { dateTime, money, pct } from '../lib/format';
import { useApp } from '../app/state';
import { Bar, Chip, Empty, Hero, Note, Screen, StatusChip, Table, PERSONA_SHORT } from '../app/ui';

export function AuthorityScreen() {
  const { data, error } = useApi<any>('/authority', { poll: 10000 });
  const { openCase, session } = useApp();
  if (error) return <Empty>{error}</Empty>;
  const L = data?.limits ?? session?.limits ?? {};
  return (
    <Screen hero={<Hero eyebrow="Authority" title="Exposure sets the ceiling. Evidence moves the rung within it, both ways." lede="Each workflow has one action it may perform without a person while it holds the rung. The ceiling is set by exposure and never moves. The rung moves on evidence: reduced automatically when accuracy over the window falls below the gate, raised only by the owner once it is back above. What an agent must prove to keep its rung is written down here, not left to a slide." />} banner={false}>
      <div className="grid gap-3 lg:grid-cols-2">
        {(data?.authority ?? []).map((a: any) => {
          const w = (data?.built ?? []).find((x: any) => x.id === a.workflow_id);
          const ok = Number(a.accuracy) >= Number(a.gate);
          return (
            <Panel key={a.workflow_id} title={<span className="flex flex-wrap items-center gap-2"><Chip tone="primary">{a.workflow_id}</Chip>{w?.name}</span>}>
              <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] text-muted-foreground">holds</span><StatusChip status={a.rung} /><span className="text-[12px] text-muted-foreground">ceiling</span><StatusChip status={a.ceiling} /></div>
              <p className="mt-2 text-[13px]"><strong>Delegated action:</strong> {a.delegated_action}{a.delegated_limit ? ` (limit ${money(a.delegated_limit)})` : ''}</p>
              <div className="mt-2 flex items-center gap-3"><span className="w-28 text-[12px] text-muted-foreground">accuracy {pct(Number(a.accuracy) * 100)}</span><Bar value={Number(a.accuracy) * 100} tone={ok ? 'success' : 'danger'} className="flex-1" /><span className="w-24 text-end text-[12px] text-muted-foreground">gate {pct(Number(a.gate) * 100)}</span></div>
              <p className="mt-1 text-[11px] text-muted-foreground">over the last {a.window_size} verified decisions · last changed {dateTime(a.changed_at)} by {PERSONA_SHORT[a.changed_by] ?? a.changed_by}</p>
              {a.note ? <p className="mt-2 text-[12px]">{a.note}</p> : null}
              {w ? <p className="mt-2 text-[11px] text-muted-foreground"><strong>Boundary:</strong> {w.boundary}</p> : null}
            </Panel>
          );
        })}
      </div>
      <Panel title="Who may approve what">
        <Table><thead><tr><th>Action</th><th>Approver</th><th>Limit</th></tr></thead><tbody>
          <tr><td>Credit</td><td>Billing officer</td><td className="font-mono">up to {money(L.officerCredit)}</td></tr>
          <tr><td>Credit</td><td>Billing manager</td><td className="font-mono">up to {money(L.managerCredit)}</td></tr>
          <tr><td>Credit</td><td>Finance controller</td><td className="font-mono">up to {money(L.financeCredit)}; above that, nobody in this demo</td></tr>
          <tr><td>Credit without a person</td><td>WF-01 while it holds A3</td><td className="font-mono">under {money(L.smallCredit)}</td></tr>
          <tr><td>Reverse a credit</td><td>Finance controller</td><td>any amount</td></tr>
          <tr><td>Roaming restriction, settlement query</td><td>Roaming fraud analyst</td><td>reversal recorded</td></tr>
          <tr><td>Retention response</td><td>CVM manager</td><td>approved offer set only</td></tr>
          <tr><td>Complaint beyond the agent’s authority</td><td>Service agent</td><td>—</td></tr>
          <tr><td>Enterprise quote</td><td>Enterprise sales manager</td><td>within the price book</td></tr>
          <tr><td>Provisioning, any network action</td><td>NOC liaison / delivery team</td><td>never an agent</td></tr>
          <tr><td>Raise a workflow’s authority</td><td>Billing manager (owner)</td><td>after {50} decisions above the gate</td></tr>
        </tbody></Table>
        <Note>Authority attaches to the action and its amount, not to a job title in general; the same person who may approve a credit may not restrict roaming. The agent that can call the credit interface is not thereby allowed to post a credit.</Note>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Changes of authority"><Table><thead><tr><th>When</th><th>Workflow</th><th>From</th><th>To</th><th>Accuracy</th><th>By</th><th>Reason</th></tr></thead><tbody>{(data?.history ?? []).map((h: any) => <tr key={h.id}><td className="text-[12px]">{dateTime(h.at)}</td><td className="font-mono text-[12px]">{h.workflow_id}</td><td><StatusChip status={h.from_rung} /></td><td><StatusChip status={h.to_rung} /></td><td className="font-mono text-[12px]">{pct(Number(h.accuracy) * 100)}</td><td className="text-[12px]">{PERSONA_SHORT[h.by] ?? h.by}</td><td className="text-[12px]">{h.reason}</td></tr>)}</tbody></Table>{!data?.history?.length ? <Empty>No changes since the seeded grant on 12 September 2026 (WF-01 and WF-04 earned A3).</Empty> : null}</Panel>
        <Panel title="Verified outcomes in the window"><Table><thead><tr><th>When</th><th>Workflow</th><th>Case</th><th>Delegated</th><th>Correct</th><th>Note</th></tr></thead><tbody>{(data?.outcomes ?? []).map((o: any) => <tr key={o.id}><td className="text-[12px]">{dateTime(o.at)}</td><td className="font-mono text-[12px]">{o.workflow_id}</td><td>{o.case_ref ? <button type="button" className="font-mono text-[12px] text-primary" onClick={() => openCase(o.case_ref)}>{o.case_ref}</button> : <span className="text-[12px] text-muted-foreground">—</span>}</td><td>{o.delegated ? <Chip tone="warn">A3</Chip> : <Chip>person</Chip>}</td><td>{o.correct ? <Chip tone="success">correct</Chip> : <Chip tone="danger">wrong</Chip>}</td><td className="text-[12px]">{o.note}</td></tr>)}</tbody></Table>{!data?.outcomes?.length ? <Empty>No verified outcomes since the seed; the window starts from the seeded 96% over 50 decisions.</Empty> : null}</Panel>
      </div>
    </Screen>
  );
}
