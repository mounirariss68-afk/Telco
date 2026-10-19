/**
 * Dhow — the shell. Atelier frame: backdrop, Dalil in the chat rail, pinned
 * title bar, the menu as chrome beside the display area, every screen inside
 * <MainPanel>, the Demo Director docked at the bottom when a scenario runs.
 */
import { useMemo, type ReactNode } from 'react';
import { AppShell, ContextNav, MainPanel, TitleBar, UserBadge, Wordmark, useAppChrome, useChatRail, type ContextNavItem } from '@cognirise/atelier/layout';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@cognirise/atelier/components/ui/dropdown-menu';
import { Activity, Bot, Briefcase, Building2, CalendarClock, Gauge, GitBranch, Inbox, LayoutGrid, MessageSquareWarning, Play, Radio, ScrollText, Settings as SettingsIcon, ShieldCheck, Target, Users } from 'lucide-react';
import { useApp } from './app/state';
import { AssistantRail } from './app/assistant';
import { CaseDrawer } from './app/case';
import { ActivityDrawer, DirectorBar } from './app/director';
import { Chip } from './app/ui';
import { Overview } from './screens/overview';
import { InboxScreen } from './screens/inbox';
import { CasesScreen } from './screens/cases';
import { SubscribersScreen } from './screens/subscribers';
import { RoamingScreen } from './screens/roaming';
import { CvmScreen } from './screens/cvm';
import { ServiceScreen } from './screens/service';
import { EnterpriseScreen } from './screens/enterprise';
import { AgentsScreen, WorkflowsScreen, ScenariosScreen } from './screens/agents';
import { AuthorityScreen } from './screens/authority';
import { MeasuresScreen } from './screens/measures';
import { TrailScreen } from './screens/trail';
import { SettingsScreen } from './screens/settings';

try { if (!localStorage.getItem('atelier-nav-orientation')) localStorage.setItem('atelier-nav-orientation', 'vertical'); } catch { /* */ }

const I = (n: ReactNode) => n;
const ITEMS: ContextNavItem[] = [
  { id: 'overview', label: 'Overview', icon: I(<LayoutGrid size={14} />) },
  { id: 'inbox', label: 'Inbox', icon: I(<Inbox size={14} />) },
  { id: 'cases', label: 'Cases', icon: I(<Briefcase size={14} />) },
  { id: 'subscribers', label: 'Subscribers', icon: I(<Users size={14} />) },
  { id: 'roaming', label: 'Roaming & partners', icon: I(<Radio size={14} />) },
  { id: 'cvm', label: 'Growth & CVM', icon: I(<Target size={14} />) },
  { id: 'service', label: 'Complaints', icon: I(<MessageSquareWarning size={14} />) },
  { id: 'enterprise', label: 'Enterprise orders', icon: I(<Building2 size={14} />) },
  { id: 'agents', label: 'Agents', icon: I(<Bot size={14} />) },
  { id: 'workflows', label: 'Workflows', icon: I(<GitBranch size={14} />) },
  { id: 'authority', label: 'Authority', icon: I(<ShieldCheck size={14} />) },
  { id: 'scenarios', label: 'Scenarios', icon: I(<Play size={14} />) },
  { id: 'measures', label: 'Measures', icon: I(<Gauge size={14} />) },
  { id: 'trail', label: 'Trail', icon: I(<ScrollText size={14} />) },
  { id: 'settings', label: 'Settings', icon: I(<SettingsIcon size={14} />) },
];
const SCREENS: Record<string, () => ReactNode> = {
  overview: () => <Overview />, inbox: () => <InboxScreen />, cases: () => <CasesScreen />, subscribers: () => <SubscribersScreen />, roaming: () => <RoamingScreen />, cvm: () => <CvmScreen />, service: () => <ServiceScreen />, enterprise: () => <EnterpriseScreen />,
  agents: () => <AgentsScreen />, workflows: () => <WorkflowsScreen />, authority: () => <AuthorityScreen />, scenarios: () => <ScenariosScreen />, measures: () => <MeasuresScreen />, trail: () => <TrailScreen />, settings: () => <SettingsScreen />,
};

function PersonaMenu() {
  const { persona, session, switchPersona, go } = useApp();
  if (!persona || !session) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><span><UserBadge name={persona.name} role={persona.role} initials={persona.initials} /></span></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <DropdownMenuLabel>Act as (switching changes the inbox, what is approvable, and what Dalil will do)</DropdownMenuLabel>
        {session.personas.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => switchPersona(p.key)} className="items-start gap-3 py-2">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${p.key === persona.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{p.initials}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.role}</span><span className="block truncate text-xs text-muted-foreground">{p.name} · sees {p.sees.toLowerCase()}</span></span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go('settings')}><SettingsIcon className="me-2 h-4 w-4" />Settings · personas, limits and market</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClockChip() {
  const { session, go } = useApp();
  if (!session) return null;
  return <button type="button" onClick={() => go('settings')} title="Virtual clock: advance it from Settings" className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/50 px-3 py-1.5 text-[12px] hover:bg-card"><CalendarClock className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-mono">{session.clock.today}</span>{session.clock.virtual ? <Chip tone="warn">virtual</Chip> : null}<Chip>{session.market.label}</Chip></button>;
}

export default function App() {
  const rail = useChatRail(true);
  const chrome = useAppChrome();
  const { persona, route, go, session, setActivityOpen, director } = useApp();
  const items = useMemo(() => ITEMS.map((i) => ({ id: i.id, label: i.label, icon: i.icon, onSelect: () => go(i.id), badge: i.id === 'inbox' && session?.inbox ? String(session.inbox) : undefined })), [go, session?.inbox]);
  const screen = SCREENS[route.screen];
  return (
    <>
      <AppShell rail={rail} chrome={chrome} chatRail={<AssistantRail rail={rail} />}
        titleBar={<TitleBar
          brand={<button type="button" onClick={() => go(persona?.home ?? 'overview')} className="flex items-center gap-2"><img src="/brand/mark.png" alt="" className="h-7 w-7 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-7 w-7 dark:block" /><Wordmark className="text-lg">dhow</Wordmark><span className="hidden text-[11px] text-muted-foreground sm:inline">Agentic layer · Dhow Telecom (fictional, demo)</span></button>}
          search={<ClockChip />}
          utilities={<div className="flex items-center gap-3"><button type="button" onClick={() => setActivityOpen(true)} title="Activity console: what the agents are doing right now" className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Activity</span></button></div>}
          user={<PersonaMenu />} />}
        contextNav={<ContextNav items={items as any} value={route.screen} chrome={chrome} />}>
        <MainPanel><div className={director ? 'pb-60' : ''}>{persona && screen ? screen() : <div className="p-10 text-center text-sm text-muted-foreground">Loading the synthetic world (the first run builds it, about a minute)…</div>}</div></MainPanel>
      </AppShell>
      <CaseDrawer />
      <ActivityDrawer />
      <DirectorBar />
    </>
  );
}
