/** Agents (the team), Workflows (what is automated and exactly how), Scenarios (the demo's remote control). */
import { useState } from 'react';
import { AgentAutonomyChip, AgentAvatar, AgentCard, AgentDirectory, ScenarioCard, ScenarioRunner, WorkflowCard, WorkflowCatalog, WorkflowStep, WorkflowWalkthrough } from '@cognirise/atelier/archetypes';
import { Panel } from '@cognirise/atelier/layout';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { post, useApi } from '../lib/api';
import { pct } from '../lib/format';
import { useApp } from '../app/state';
import { AgentTag, AUTONOMY, Btn, Chip, DomainChip, Empty, Hero, Note, Screen, StatusChip, Table, PERSONA_SHORT } from '../app/ui';

export function AgentsScreen() {
  const { data, error } = useApi<any>('/agents');
  const [sel, setSel] = useState<any | null>(null);
  if (error) return <Empty>{error}</Empty>;
  return (
    <Screen hero={<Hero eyebrow="Agents" title="Eight colleagues, none above the rung where a person approves" lede="The rung shown is the one the agent runs at in this working example, not a roadmap. Only Munaffidh reaches A3, and only for small credits in the dispute workflow while that workflow holds the authority; Hami takes it away when the evidence fails." />}>
      <AgentDirectory>
        {(data?.agents ?? []).map((a: any) => (
          <AgentCard key={a.id} agent={{ id: a.id, name: a.name, role: a.title, purpose: a.purpose, initials: a.name.slice(0, 2), autonomy: AUTONOMY[a.autonomy] }} onOpen={() => setSel(a)}
            footer={<span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="ar">{a.name_ar}</span><span>· {a.trail} trail entries</span><span>· Claude: {a.claude}</span><span>· owner {PERSONA_SHORT[a.owner]}</span></span>} />
        ))}
      </AgentDirectory>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetTitle className="sr-only">{sel?.name}</SheetTitle>
          {sel ? (
            <div className="space-y-4">
              <header className="flex items-center gap-3"><AgentAvatar agent={{ id: sel.id, name: sel.name, role: sel.title, initials: sel.name.slice(0, 2) }} size={56} showActivity={false} /><div><h2 className="text-lg font-semibold">{sel.name} <span className="ar text-muted-foreground">{sel.name_ar}</span></h2><p className="text-[12px] text-muted-foreground">{sel.title} · <AgentAutonomyChip level={AUTONOMY[sel.autonomy]} /></p></div></header>
              <p className="text-sm leading-relaxed">{sel.purpose}</p>
              <Panel title="Functions"><ol className="list-decimal space-y-1 ps-5 text-[13px]">{sel.functions.map((f: string) => <li key={f}>{f}</li>)}</ol></Panel>
              <Panel title="Superpower"><p className="text-[13px]">{sel.superpower}</p></Panel>
              <Panel title="Business impact"><p className="text-[13px]">{sel.impact}</p></Panel>
              <Panel title="Reads · writes · decides"><dl className="grid gap-2 text-[13px]"><div><dt className="text-xs text-muted-foreground">Reads</dt><dd>{sel.reads.join(', ')}</dd></div><div><dt className="text-xs text-muted-foreground">Writes</dt><dd>{sel.writes.join(', ')}</dd></div><div><dt className="text-xs text-muted-foreground">Decides</dt><dd>{sel.decides}</dd></div></dl></Panel>
              <Panel title="Stats"><p className="text-[13px]">{sel.trail} trail entries · {sel.activity} activity events · accountable owner: {PERSONA_SHORT[sel.owner]}</p></Panel>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Screen>
  );
}

export function WorkflowsScreen() {
  const { data, error } = useApi<any>('/workflows');
  const { route } = useApp();
  const [sel, setSel] = useState<string | null>(route.param);
  if (error) return <Empty>{error}</Empty>;
  const w = (data?.workflows ?? []).find((x: any) => x.id === sel);
  const auth = (id: string) => (data?.authority ?? []).find((a: any) => a.workflow_id === id);
  return (
    <Screen hero={<Hero eyebrow="Workflows" title="Five built, one designed; the same loop every time" lede="Detect, investigate, propose, approve, verify. What changes is the trigger, the boundary of what may be done without a person, and the measure. A workflow listed as designed is in the catalogue so nobody mistakes the demo for more than it is." />}>
      <WorkflowCatalog>
        {(data?.workflows ?? []).map((wf: any) => {
          const a = auth(wf.id);
          return <WorkflowCard key={wf.id} name={<span className="flex flex-wrap items-center gap-2">{wf.name}<Chip>{wf.id}</Chip><DomainChip d={wf.domain} /></span>} purpose={wf.answers} trigger={wf.trigger} outcome={<span className="text-[12px]">{wf.boundary}</span>} coverage={wf.status === 'BUILT' ? 'implemented' : 'designed'} autonomy={a ? <AgentAutonomyChip level={AUTONOMY[a.rung]} /> : <Chip>ceiling {wf.ceiling}</Chip>} agents={<span className="flex -space-x-1">{[...new Set(wf.steps.filter((s: any) => s.actor_type !== 'HUMAN').map((s: any) => s.actor))].map((id: any) => <AgentAvatar key={id} agent={{ id, name: id, role: '', initials: String(id).slice(0, 2) }} size={22} showActivity={false} />)}</span>} stepCount={wf.steps.length} onOpen={() => setSel(wf.id)} />;
        })}
      </WorkflowCatalog>
      <Sheet open={!!w} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetTitle className="sr-only">{w?.name}</SheetTitle>
          {w ? (
            <div className="space-y-4">
              <header><p className="flex flex-wrap items-center gap-2 text-[12px]"><Chip tone="primary">{w.id}</Chip><DomainChip d={w.domain} /><StatusChip status={w.status === 'BUILT' ? 'ACTIVE' : 'PENDING'} />{auth(w.id) ? <StatusChip status={auth(w.id).rung} /> : null}<Chip>ceiling {w.ceiling}</Chip></p><h2 className="mt-1 text-lg font-semibold">{w.name}</h2><p className="text-[12px] text-muted-foreground">Owner: {w.owner} · {w.total} cases, {w.open} open</p></header>
              <Note><strong>Answers:</strong> {w.answers}</Note>
              <dl className="grid gap-2 text-[13px]"><div><dt className="text-xs text-muted-foreground">Trigger</dt><dd>{w.trigger}</dd></div><div><dt className="text-xs text-muted-foreground">Boundary: what never happens without a person</dt><dd>{w.boundary}</dd></div><div><dt className="text-xs text-muted-foreground">Measures</dt><dd>{w.measureIds.join(', ')}</dd></div></dl>
              <WorkflowWalkthrough>
                {w.steps.map((s: any, i: number) => <WorkflowStep key={s.key} index={i + 1} title={s.label} actor={s.actor_type === 'HUMAN' ? <Chip tone="warn">{PERSONA_SHORT[s.actor] ?? (s.actor.startsWith('approver:') ? 'the limit holder for the amount' : s.actor)}</Chip> : <AgentTag id={s.actor} showChip={false} size={18} />} detail={s.what} decision={s.actor_type === 'HUMAN' ? 'A person decides; a decision against the recommendation needs a reason.' : s.actor === 'hami' ? 'Hami routes or refuses; it never approves.' : undefined} coverage={w.status === 'BUILT' ? 'implemented' : 'designed'} />)}
              </WorkflowWalkthrough>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </Screen>
  );
}

export function ScenariosScreen() {
  const { data, error } = useApi<any>('/scenarios');
  const { startScenario, director } = useApp();
  const [busy, setBusy] = useState('');
  if (error) return <Empty>{error}</Empty>;
  return (
    <Screen hero={<Hero eyebrow="Scenarios" title="Eight scenarios, each a different shape" lede="A prototype at rest demos badly. Each scenario runs a real case through the engine, switches you to the persona who decides, and shows what changed. Fixtures are restored when a scenario starts, so every one can be run again." />} banner={false}>
      {director ? <Note tone="warn">A scenario is running: use the bar at the bottom. Stop it before starting another.</Note> : null}
      <ScenarioRunner onReset={async () => { if (!confirm('Rebuild the whole synthetic world? This takes about a minute.')) return; setBusy('reset'); try { await post('/reset'); location.reload(); } finally { setBusy(''); } }}>
        {(data?.scenarios ?? []).map((s: any) => <ScenarioCard key={s.key} name={<span className="flex flex-wrap items-center gap-2"><Chip tone="primary">{s.key}</Chip>{s.name}<Chip>{s.shape}</Chip><Chip>{s.workflowId}</Chip></span>} premise={s.summary} demonstrates={<span>{s.steps.length} steps</span>} state={director && director.key === s.key ? (director.status === 'done' ? 'complete' : 'running') : 'idle'} onRun={director || busy ? undefined : async () => { setBusy(s.key); try { await startScenario(s.key); } finally { setBusy(''); } }} />)}
      </ScenarioRunner>
      <Panel title="What the scenarios prove">
        <Table><thead><tr><th>Scenario</th><th>Shape</th><th>The claim it tests</th></tr></thead><tbody>
          {[['S1', 'happy path', 'The loop end to end: evidence, proposal, a person’s approval within her limit, execution through the billing interface, the customer told, verification.'], ['S2', 'escalation', 'Exposure decides who approves: above the officer’s limit the case goes to the manager, not to the agent.'], ['S3', 'handoff', 'An agent never acts on the network: steering becomes a NOC task; the restriction needs the analyst.'], ['S4', 'refusal', 'No consent, no case: Hami closes before any evidence is gathered or any person sees it.'], ['S5', 'exception', 'Within authority the agent resolves; beyond it a person decides with the full context; the measure is first-time resolution.'], ['S6', 'reversal', 'A wrong proposal is reversed on new evidence by the only persona allowed to, and the trail keeps both decisions.'], ['S7', 'demotion', 'Authority moves on evidence, both ways: three wrong small credits drop the workflow from A3 to A2 automatically.'], ['S8', 'happy path', 'Quote to activation in one case; provisioning stays with the delivery team.']].map(([k, sh, c]) => <tr key={k}><td className="font-mono text-[12px]">{k}</td><td className="text-[12px]">{sh}</td><td className="text-[13px]">{c}</td></tr>)}
        </tbody></Table>
        <p className="mt-2 text-[11px] text-muted-foreground">{data ? `${pct(100)} of the scenarios run against the live engine; nothing in them is scripted in the interface.` : ''}</p>
      </Panel>
      {busy === 'reset' ? <Btn disabled>Rebuilding…</Btn> : null}
    </Screen>
  );
}
