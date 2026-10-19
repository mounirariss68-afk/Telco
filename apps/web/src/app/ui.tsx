/** Shared pieces used across screens. Composed from Atelier; nothing here re-styles it. */
import type { ReactNode } from 'react';
import { DemoBanner, DemoReference, AgentAutonomyChip, AgentAvatar, type AgentAutonomy } from '@cognirise/atelier/archetypes';
import { PageContainer, PageHero } from '@cognirise/atelier/layout';
import { cn } from '@cognirise/atelier/lib/utils';
import { initials } from '../lib/format';
import { useApp } from './state';

export const AUTONOMY: Record<string, AgentAutonomy> = { A0: 'observe', A1: 'recommend', A2: 'assisted', A3: 'supervised', A4: 'autonomous' };
export const AGENT_NAMES: Record<string, [string, string]> = { raqib: ['Raqib', 'رقيب'], fahis: ['Fahis', 'فاحص'], mushir: ['Mushir', 'مشير'], hami: ['Hami', 'حامي'], munaffidh: ['Munaffidh', 'منفّذ'], rafiq: ['Rafiq', 'رفيق'], muraqib: ['Muraqib', 'مراقب'], dalil: ['Dalil', 'دليل'] };
export const PERSONA_SHORT: Record<string, string> = { billing_officer: 'Billing officer', billing_manager: 'Billing manager', finance: 'Finance controller', roaming_analyst: 'Roaming fraud analyst', noc: 'NOC liaison', cvm_manager: 'CVM manager', service_agent: 'Service agent', enterprise_manager: 'Enterprise sales manager', ra_lead: 'Revenue assurance lead', coo: 'COO' };
export const DOMAIN_LABEL: Record<string, string> = { BILLING: 'Billing & disputes', ROAMING: 'Roaming & wholesale', CVM: 'Growth: marketing & CVM', SERVICE: 'Service', ENTERPRISE: 'Enterprise', RA: 'Revenue integrity' };
export const DOMAIN_TONE: Record<string, 'primary' | 'success' | 'warn' | 'danger' | undefined> = { BILLING: 'primary', ROAMING: 'danger', CVM: 'warn', SERVICE: 'success', ENTERPRISE: undefined, RA: undefined };

const STATUS: Record<string, { tone: string; en: string }> = {
  WAITING: { tone: 'is-warn', en: 'On a person' }, WAITING_EVENT: { tone: 'is-primary', en: 'On an event' }, RUNNING: { tone: 'is-primary', en: 'Running' }, COMPLETED: { tone: 'is-success', en: 'Completed' },
  REJECTED: { tone: 'is-danger', en: 'Declined' }, ESCALATED: { tone: 'is-danger', en: 'Escalated' }, DONE: { tone: 'is-success', en: 'Done' }, PENDING: { tone: '', en: 'Pending' }, SKIPPED: { tone: '', en: 'Skipped' }, FAILED: { tone: 'is-danger', en: 'Failed' }, REFUSED: { tone: 'is-danger', en: 'Refused' },
  APPROVED: { tone: 'is-success', en: 'Approved' }, DECLINED: { tone: 'is-danger', en: 'Declined' }, OPEN: { tone: 'is-primary', en: 'Open' }, CLOSED: { tone: '', en: 'Closed' },
  DETECTED: { tone: '', en: 'Detected' }, INVESTIGATING: { tone: 'is-primary', en: 'Investigating' }, PROPOSED: { tone: 'is-warn', en: 'Proposed' }, AWAITING_APPROVAL: { tone: 'is-warn', en: 'Awaiting approval' }, EXECUTED: { tone: 'is-success', en: 'Executed' }, HANDED_OFF: { tone: 'is-warn', en: 'Handed to a person' }, VERIFIED: { tone: 'is-primary', en: 'Verifying' }, REVERSED: { tone: 'is-danger', en: 'Reversed' }, BLOCKED: { tone: 'is-danger', en: 'Closed by Hami' },
  RESOLVED: { tone: 'is-success', en: 'Resolved' }, RESOLVED_FIRST_TIME: { tone: 'is-success', en: 'Resolved first time' }, REPEAT_CONTACT: { tone: 'is-danger', en: 'Repeat contact' }, NOT_DUE: { tone: '', en: 'Not due' }, NO_CONSENT: { tone: 'is-danger', en: 'No consent' }, RETAINED: { tone: 'is-success', en: 'Retained' }, CHURNED: { tone: 'is-danger', en: 'Churned' }, CONFIRMED: { tone: 'is-danger', en: 'Fraud confirmed' }, DISMISSED: { tone: '', en: 'Dismissed' }, FALSE_POSITIVE: { tone: 'is-warn', en: 'False positive' }, ACTIVATED: { tone: 'is-success', en: 'Activated' }, REWORK: { tone: 'is-warn', en: 'Rework' }, MISMATCH: { tone: 'is-danger', en: 'Mismatch' },
  ACTIVE: { tone: 'is-success', en: 'Active' }, SUSPENDED: { tone: 'is-danger', en: 'Suspended' }, CHURNED_S: { tone: '', en: 'Churned' }, ISSUED: { tone: '', en: 'Issued' }, PAID: { tone: 'is-success', en: 'Paid' }, DISPUTED: { tone: 'is-warn', en: 'Disputed' }, CREDITED: { tone: 'is-primary', en: 'Credited' }, OVERDUE: { tone: 'is-danger', en: 'Overdue' },
  RESTRICTED: { tone: 'is-danger', en: 'Restricted' }, REOPENED: { tone: 'is-danger', en: 'Reopened' }, REQUESTED: { tone: '', en: 'Requested' }, FEASIBILITY: { tone: 'is-primary', en: 'Feasibility' }, QUOTED: { tone: 'is-warn', en: 'Quoted' }, PROVISIONING: { tone: 'is-primary', en: 'Provisioning' }, SENT: { tone: 'is-success', en: 'Sent' }, RAISED: { tone: 'is-warn', en: 'Raised' }, ACKNOWLEDGED: { tone: 'is-success', en: 'Acknowledged' },
  A0: { tone: '', en: 'A0 observe' }, A1: { tone: '', en: 'A1 recommend' }, A2: { tone: 'is-primary', en: 'A2 acts on approval' }, A3: { tone: 'is-warn', en: 'A3 acts and reports' }, A4: { tone: 'is-danger', en: 'A4 autonomous' },
  claude: { tone: 'is-success', en: 'Claude' }, offline: { tone: 'is-warn', en: 'Offline' },
};
export function StatusChip({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return null;
  const s = STATUS[status] ?? { tone: '', en: status.replace(/_/g, ' ').toLowerCase() };
  return <span className={cn('mono-chip whitespace-nowrap', s.tone, className)}>{s.en}</span>;
}
export function Chip({ children, tone, className, title }: { children: ReactNode; tone?: 'primary' | 'success' | 'warn' | 'danger'; className?: string; title?: string }) {
  return <span title={title} className={cn('mono-chip whitespace-nowrap', tone && `is-${tone}`, className)}>{children}</span>;
}
export const Ref = ({ children }: { children: ReactNode }) => <span className="whitespace-nowrap"><DemoReference>{children}</DemoReference></span>;
export function DomainChip({ d }: { d: string | null | undefined }) { return d ? <Chip tone={DOMAIN_TONE[d]}>{DOMAIN_LABEL[d] ?? d}</Chip> : null; }
export function Person({ name, sub, size = 28 }: { name: string; sub?: ReactNode; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-semibold text-primary" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</span>
      <span className="min-w-0 leading-tight"><span className="block truncate text-sm font-medium">{name}</span>{sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}</span>
    </span>
  );
}
export function AgentTag({ id, autonomy, showChip = true, size = 22 }: { id: string; autonomy?: string | null; showChip?: boolean; size?: number }) {
  const n = AGENT_NAMES[id];
  if (!n) return <span className="text-sm">{PERSONA_SHORT[id] ?? id}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <AgentAvatar agent={{ id, name: n[0], role: '', initials: n[0].slice(0, 2) }} size={size} showActivity={false} />
      <span className="text-sm font-medium">{n[0]}</span>
      {showChip && autonomy && AUTONOMY[autonomy] ? <AgentAutonomyChip level={AUTONOMY[autonomy]} /> : null}
    </span>
  );
}
export function Btn({ children, onClick, kind = 'ghost', disabled, type = 'button', className, small, title }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; className?: string; small?: boolean; title?: string }) {
  return <button type={type} title={title} onClick={onClick} disabled={disabled} className={cn('pill-btn', kind === 'primary' ? 'pill-btn-primary' : 'pill-btn-ghost', kind === 'danger' && 'border-danger/50 text-danger hover:bg-danger/10', small && 'px-3 py-1.5 text-xs', className)}>{children}</button>;
}
export function Bar({ value, max = 100, tone = 'primary', className }: { value: number; max?: number; tone?: 'primary' | 'success' | 'warn' | 'danger' | 'accent'; className?: string }) {
  const w = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}><div className={cn('h-full rounded-full', { primary: 'bg-primary', success: 'bg-success', warn: 'bg-warn', danger: 'bg-danger', accent: 'bg-accent' }[tone])} style={{ width: `${w}%` }} /></div>;
}
export function Empty({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>; }
export function Kv({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) { return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className={cn('mt-0.5 break-words text-sm leading-snug', mono && 'font-mono')}>{v}</dd></div>; }
export function Table({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn('overflow-x-auto scroll-thin', className)}><table className="table-clean">{children}</table></div>; }
export function Field({ label, children }: { label: ReactNode; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Screen({ hero, children, banner = true }: { hero: ReactNode; children: ReactNode; banner?: boolean }) {
  const { director } = useApp();
  return (
    <div className="space-y-4">
      {hero}
      {banner && !director ? <DemoBanner kind="synthetic" title="Dhow Telecom is fictional" className="py-2.5">Every subscriber, partner, invoice, flag, complaint and figure here is synthetic and generated for this working example; every identifier starts with DEMO-. The billing, CRM, usage, roaming, CVM and order systems are simulated behind a connector; a client’s version sits on the client’s own systems.</DemoBanner> : null}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
export function Hero(props: Parameters<typeof PageHero>[0]) {
  const { director } = useApp();
  if (!director) return <PageHero {...props} />;
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">{props.eyebrow ? <p className="eyebrow">{props.eyebrow}</p> : null}<h1 className="truncate text-xl font-semibold leading-tight">{props.title}</h1></div>
        {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
      </div>
      {props.children ? <div className="mt-2">{props.children}</div> : null}
    </div>
  );
}
export { PageContainer };
export function Source({ system }: { system: string }) { return <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Source: {system} (simulated)</span>; }
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode; n?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-card/40 p-1">
      {tabs.map((t) => <button key={t.id} type="button" onClick={() => onChange(t.id)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition', value === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{t.label}{t.n !== undefined ? <span className="ms-1.5 opacity-70">{t.n}</span> : null}</button>)}
    </div>
  );
}
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'success' }) {
  return <div className={cn('rounded-xl border px-3 py-2 text-[13px] leading-relaxed', tone === 'warn' ? 'border-warn/40 bg-warn/5' : tone === 'danger' ? 'border-danger/40 bg-danger/5' : tone === 'success' ? 'border-success/40 bg-success/5' : 'border-primary/30 bg-primary/5')}>{children}</div>;
}
export function Select({ value, onChange, children, className }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string }) {
  return <select className={cn('input', className)} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>;
}
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'primary' | 'success' | 'warn' | 'danger' }) {
  return <div className="rounded-xl border border-border/60 bg-card/50 p-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p><p className={cn('mt-1 text-2xl font-semibold leading-none', tone === 'danger' && 'text-danger', tone === 'success' && 'text-success', tone === 'warn' && 'text-warn', tone === 'primary' && 'text-primary')}>{value}</p>{sub ? <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p> : null}</div>;
}
