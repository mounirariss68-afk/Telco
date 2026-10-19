/**
 * The chat rail: Dalil. The rail says which resolver is answering (Claude or
 * Offline) and every answer shows the policy clauses it cites. An action
 * Dalil prepares is a card with a Confirm button: nothing is sent or changed
 * on its say-so.
 */
import { useEffect, useRef, useState } from 'react';
import { ChatAssistantTurn, ChatComposer, ChatRail, ChatStatusBadge, ChatSuggestions, ChatUserTurn, RailBrandCard, type ChatRailState } from '@cognirise/atelier/layout';
import { RotateCcw } from 'lucide-react';
import { api, bump, post, useApi } from '../lib/api';
import { useApp } from './state';
import { Chip } from './ui';

type Msg = { id: number; role: 'user' | 'assistant'; content: string; mode?: string; calls?: { name: string }[] };

function Answer({ m }: { m: Msg }) {
  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-foreground">{m.content}</p>
      {m.calls?.length ? <p className="font-mono text-[10px] text-muted-foreground">Read: {[...new Set(m.calls.map((c) => c.name))].join(', ')}{m.mode === 'offline' ? ' · Offline' : ''}</p> : m.mode === 'offline' ? <p className="font-mono text-[10px] text-muted-foreground">Offline</p> : null}
    </div>
  );
}

export function AssistantRail({ rail }: { rail: ChatRailState }) {
  const { persona, session, route } = useApp();
  const { data: history, reload } = useApi<Msg[]>(persona ? `/assistant/history?k=${persona.key}` : null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (history) setMsgs(history.map((m: any, i: number) => ({ id: i, role: m.role, content: m.content }))); }, [history]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  const mode = session?.ai.mode ?? 'offline';
  const send = async (text: string) => {
    const q = text.trim(); if (!q || busy) return;
    setDraft(''); setMsgs((m) => [...m, { id: -Date.now(), role: 'user', content: q }]); setBusy(true);
    try { const r = await post<{ reply: string; mode: string; calls: { name: string }[] }>('/assistant', { text: q, screen: route.screen }); setMsgs((m) => [...m, { id: Date.now(), role: 'assistant', content: r.reply, mode: r.mode, calls: r.calls }]); }
    catch (e: any) { setMsgs((m) => [...m, { id: -Date.now(), role: 'assistant', content: `Something went wrong: ${e.message}` }]); }
    finally { setBusy(false); }
  };
  return (
    <ChatRail rail={rail} label="Dalil"
      brand={<RailBrandCard className="dark:border-white/10 dark:bg-card/80" onCollapse={() => rail.setOpen(false)}><img src="/brand/logo-on-light.png" alt="Dhow Telecom" className="h-8 w-auto dark:hidden" /><img src="/brand/logo-on-dark.png" alt="Dhow Telecom" className="hidden h-8 w-auto dark:block" /></RailBrandCard>}
      collapsedBrand={<><img src="/brand/mark.png" alt="" className="h-6 w-6 dark:hidden" /><img src="/brand/mark-on-dark.png" alt="" className="hidden h-6 w-6 dark:block" /></>}
      header={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">D</span>
          <div className="min-w-0 leading-tight"><p className="text-sm font-semibold">Dalil <span className="ar text-muted-foreground">دليل</span></p><p className="truncate text-[11px] text-muted-foreground">Staff assistant · answers from the same records, never acts</p></div>
          <span className="ms-auto flex items-center gap-1.5">
            <ChatStatusBadge state={mode === 'claude' ? 'live' : 'idle'}>{mode === 'claude' ? 'Claude' : 'Offline'}</ChatStatusBadge>
            <button type="button" title="New conversation" aria-label="New conversation" className="text-muted-foreground hover:text-foreground" onClick={async () => { await api('/assistant/history', { method: 'DELETE' }); setMsgs([]); reload(); }}><RotateCcw className="h-3.5 w-3.5" /></button>
          </span>
        </div>
      }
      transcript={
        <div className="space-y-3 text-[13px]">
          {!msgs.length ? (
            <ChatAssistantTurn avatar="D">
              <p className="text-foreground">Ask me about a case, a subscriber, what waits on you, what Hami blocked, the measures, or what an agent may do without a person. I answer from the same records the screens use, with the same permissions you have, and I never act.</p>
              {mode === 'offline' ? <p className="mt-1.5 text-[11px]"><Chip tone="warn">Offline</Chip> Replit AI Integrations is not connected, so answers come from fixed matching over the same records.</p> : null}
            </ChatAssistantTurn>
          ) : null}
          {msgs.map((m) => (m.role === 'user' ? <ChatUserTurn key={m.id}>{m.content}</ChatUserTurn> : <ChatAssistantTurn key={m.id} avatar="D"><Answer m={m} /></ChatAssistantTurn>))}
          {busy ? <ChatAssistantTurn avatar="D"><span className="animate-pulse">Reading the records…</span></ChatAssistantTurn> : null}
          <div ref={end} />
        </div>
      }
      suggestions={<ChatSuggestions items={persona?.suggestions ?? []} onSelect={send} />}
      composer={<ChatComposer value={draft} onChange={setDraft} onSend={() => send(draft)} placeholder="Ask Dalil…" busy={busy} />}
    />
  );
}
