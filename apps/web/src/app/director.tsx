/**
 * The Demo Director bar, docked at the bottom of the display: the step's
 * narration, the trigger, what the server did, and what changed, with
 * Play / Pause / Step / Back. The Activity console drawer streams the
 * engine's events on every screen.
 */
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@cognirise/atelier/components/ui/sheet';
import { cn } from '@cognirise/atelier/lib/utils';
import { Activity, ChevronLeft, ChevronRight, Loader2, Pause, Play, Square, Zap } from 'lucide-react';
import { useApi } from '../lib/api';
import { dateTime, title } from '../lib/format';
import { useApp } from './state';
import { AgentTag, Btn, Chip, PERSONA_SHORT, StatusChip } from './ui';

export function DirectorBar() {
  const { director, stepScenario, stopScenario, setAuto, open, go, session, switchPersona } = useApp();
  if (!director) return null;
  const st = director.steps[Math.max(0, director.index)];
  const ch = director.changes;
  const changed = ch ? [
    ...ch.cases.map((c) => ({ key: `c${c.ref}`, label: `${c.ref} → ${title(c.state)}${c.close_code ? ` (${title(c.close_code)})` : ''}`, go: () => open(`case:${c.ref}`) })),
    ...ch.tasks.map((t) => ({ key: `t${t.id}`, label: `handoff for the ${PERSONA_SHORT[t.assignee_persona] ?? t.assignee_persona}: ${t.title}`, go: () => go('inbox') })),
    ...ch.messages.map((m) => ({ key: `m${m.id}`, label: `message to the customer · ${m.template.replace(/_/g, ' ').toLowerCase()} · ${m.lang === 'ar' ? 'Arabic' : 'English'}`, go: () => (m.subscriber_id ? open(`subscriber:${m.subscriber_id}`) : undefined) })),
    ...(ch.trail ? [{ key: 'tr', label: `trail +${ch.trail}`, go: () => go('trail') }] : []),
  ] : [];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-[1400px] rounded-2xl border border-accent/40 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-1.5">
            <Btn small onClick={() => stepScenario(-1)} disabled={director.busy || director.index <= 0} title="Back"><ChevronLeft className="h-3.5 w-3.5" /></Btn>
            <Btn small kind="primary" onClick={() => stepScenario(1)} disabled={director.busy || director.status === 'done'} title="Next step">{director.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />} Step</Btn>
            <Btn small onClick={() => setAuto(!director.auto)} disabled={director.status === 'done'} title={director.auto ? 'Pause auto-play' : 'Auto-play (10 s per step)'}>{director.auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Btn>
            <Btn small onClick={stopScenario} title="Stop the scenario"><Square className="h-3.5 w-3.5" /></Btn>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono uppercase tracking-wider text-accent">{director.key} · {director.name}</span>
              <span>step {director.index + 1} of {director.steps.length}</span>
              {st?.persona ? <button type="button" className="mono-chip is-primary" onClick={() => switchPersona(st.persona!)}>as {PERSONA_SHORT[st.persona] ?? st.persona}</button> : null}
              {director.clock ? <span className="font-mono">{director.clock.today}</span> : session?.clock.today ? <span className="font-mono">{session.clock.today}</span> : null}
              {director.restored?.length ? <Chip tone="warn" title={director.restored.join(', ')}>seeded state restored for {director.restored.length} record{director.restored.length > 1 ? 's' : ''}</Chip> : null}
              {director.status === 'done' ? <Chip tone="success">Scenario complete</Chip> : null}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{st?.title}</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/90">{st?.narration}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]"><Zap className="h-3 w-3 text-accent" />{director.result ? <><span className="text-muted-foreground">Engine:</span> <span className="font-mono">{director.result}</span></> : null}{director.error ? <span className="text-danger">Error: {director.error}</span> : null}</p>
          </div>
          <div className="w-full lg:w-[380px]">
            <p className="eyebrow">What changed</p>
            {changed.length ? (
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-auto scroll-thin text-[12px]">{changed.slice(0, 14).map((c) => <li key={c.key}><button type="button" onClick={c.go} className="text-start hover:text-primary">• {c.label}</button></li>)}{changed.length > 14 ? <li className="text-muted-foreground">… and {changed.length - 14} more</li> : null}</ul>
            ) : <p className="mt-1 text-[12px] text-muted-foreground">{director.busy ? 'Running the step through the engine…' : st?.action.kind === 'show' ? 'Nothing executed: this step shows what is already there.' : 'Nothing changed.'}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Activity console: what the agents are doing right now, trigger → agent → action → result. */
export function ActivityDrawer() {
  const { activityOpen, setActivityOpen, open, director } = useApp();
  const { data } = useApi<any[]>(activityOpen ? '/activity' : null, { poll: 4000 });
  const [filter, setFilter] = useState('');
  useEffect(() => { if (!activityOpen) setFilter(''); }, [activityOpen]);
  const rows = (data ?? []).filter((a) => !filter || a.agent === filter);
  return (
    <Sheet open={activityOpen} onOpenChange={setActivityOpen} modal={!director}>
      <SheetContent side="right" className={`w-full overflow-y-auto sm:max-w-xl ${director ? 'pb-48 shadow-2xl' : ''}`} onInteractOutside={(e) => { if (director) e.preventDefault(); }}>
        <SheetTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Activity console</SheetTitle>
        <p className="mt-1 text-[12px] text-muted-foreground">Every trigger, the agent it woke, what it did and the result, as it happens. Independent of the Director.</p>
        <div className="mt-3 flex flex-wrap gap-1">{['', 'raqib', 'fahis', 'mushir', 'hami', 'munaffidh', 'rafiq', 'muraqib'].map((a) => <button key={a} type="button" onClick={() => setFilter(a)} className={cn('mono-chip', filter === a && 'is-primary')}>{a || 'all'}</button>)}</div>
        <ol className="mt-3 space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-lg border border-border/60 bg-card/50 p-2.5 text-[12px]">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">{dateTime(a.at)}</span><span className="font-mono uppercase tracking-wider">{a.trigger}</span>{a.autonomy ? <Chip>{a.autonomy}</Chip> : null}</div>
              <div className="mt-1 flex items-start gap-2">{a.agent ? <AgentTag id={a.agent} showChip={false} size={18} /> : <span className="text-sm font-medium">{a.trigger.startsWith('Director') ? 'Director' : 'System'}</span>}<span className="min-w-0 flex-1">{a.action}</span></div>
              <p className="mt-0.5 text-muted-foreground">→ {a.result}</p>
              <p className="mt-0.5 flex flex-wrap gap-2">{a.case_ref ? <button type="button" className="font-mono text-primary" onClick={() => open(`case:${a.case_ref}`)}>{a.case_ref}</button> : null}{a.scenario_key ? <StatusChip status={a.scenario_key} /> : null}</p>
            </li>
          ))}
          {!rows.length ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
