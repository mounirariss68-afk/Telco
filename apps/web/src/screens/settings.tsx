/** Settings: personas and their authority, the market edition, the clock, the data, the AI connection. */
import { useState } from 'react';
import { PersonaCard } from '@cognirise/atelier/archetypes';
import { Panel } from '@cognirise/atelier/layout';
import { bump, post } from '../lib/api';
import { money } from '../lib/format';
import { useApp } from '../app/state';
import { Btn, Chip, Empty, Hero, Note, Screen, StatusChip } from '../app/ui';

export function SettingsScreen() {
  const { session, persona, switchPersona, reloadSession } = useApp();
  const [busy, setBusy] = useState('');
  if (!session || !persona) return <Empty>Loading…</Empty>;
  const L = session.limits;
  return (
    <Screen hero={<Hero eyebrow="Settings" title="Who am I, and what may I approve?" lede="Switching persona changes the inbox, what is approvable, and what Dalil will do. If it only changed a name there would be no authority model." />} banner={false}>
      <Panel title="Personas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {session.personas.map((p) => <PersonaCard key={p.key} persona={{ id: p.key, name: p.name, role: p.role, initials: p.initials, remit: p.sees, authority: p.owns.join(' · '), restrictions: p.key === 'coo' ? 'Approves nothing in this layer' : undefined }} selected={p.key === persona.key} onSelect={() => switchPersona(p.key)} />)}
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Market edition">
          <p className="text-[12px] text-muted-foreground">Changes the currency shown, the regulator named and the market context. Amounts are stored in AED and shown through the market’s rate; the limits move with it.</p>
          <div className="mt-2 flex flex-wrap gap-1">{session.markets.map((m: any) => <button key={m.key} type="button" disabled={!!busy} onClick={async () => { setBusy('market'); try { await post('/settings', { market: m.key }); bump(); await reloadSession(); } finally { setBusy(''); } }} className={`mono-chip ${session.market.key === m.key ? 'is-primary' : ''}`}>{m.label}</button>)}</div>
          <dl className="mt-3 space-y-1 text-[12px]"><div><dt className="text-muted-foreground">Regulator</dt><dd>{session.market.regulator}</dd></div><div><dt className="text-muted-foreground">Data</dt><dd>{session.market.dataRule}</dd></div><div><dt className="text-muted-foreground">Language</dt><dd>{session.market.language}</dd></div><div><dt className="text-muted-foreground">Limits</dt><dd className="font-mono">officer {money(L.officerCredit)} · manager {money(L.managerCredit)} · finance {money(L.financeCredit)} · small credit {money(L.smallCredit)}</dd></div></dl>
        </Panel>
        <Panel title="Clock and data">
          <p className="text-[12px]">Virtual clock: <span className="font-mono">{session.clock.today}</span> {session.clock.virtual ? <Chip tone="warn">virtual</Chip> : null}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Btn small disabled={!!busy} onClick={async () => { setBusy('clock'); try { await post('/clock/advance', { days: 1 }); bump(); } finally { setBusy(''); } }}>Advance one day</Btn><Btn small disabled={!!busy} onClick={async () => { setBusy('scan'); try { const r = await post('/scan'); alert(`Raqib opened ${r.opened.length} case(s)`); bump(); } finally { setBusy(''); } }}>Run Raqib now</Btn><Btn small kind="danger" disabled={!!busy} onClick={async () => { if (!confirm('Rebuild the whole synthetic world?')) return; setBusy('reset'); try { await post('/reset'); location.reload(); } finally { setBusy(''); } }}>Rebuild the world</Btn></div>
          <p className="mt-2 text-[11px] text-muted-foreground">Seed {session.seed?.version} · {session.seed?.subscribers?.toLocaleString()} subscribers · {session.seed?.cases} history cases · demo date {session.seed?.today}</p>
        </Panel>
        <Panel title="AI connection">
          <p className="flex items-center gap-2 text-[12px]"><StatusChip status={session.ai.mode} /><span>{session.ai.mode === 'claude' ? `Claude (${session.ai.model}) through ${session.ai.via ?? 'Replit AI Integrations'}` : 'Replit AI Integrations is not connected: Fahis and Mushir use the templates, Dalil answers from fixed matching.'}</span></p>
          <Note>Claude writes the words; the engine decides the facts. Every finding and proposal is computed from the records first; Claude only phrases it for the approver and the customer. No key of our own is stored anywhere.</Note>
        </Panel>
      </div>
    </Screen>
  );
}
