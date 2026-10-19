/**
 * The API client. Every call carries the active persona; the SERVER decides
 * what that persona may see and do. Nothing here is a permission check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

let persona = (() => { try { return localStorage.getItem('dhow-persona') ?? 'coo'; } catch { return 'coo'; } })();
export const getPersona = () => persona;
export const setPersonaKey = (k: string) => { persona = k; try { localStorage.setItem('dhow-persona', k); } catch { /* */ } bump(); };

// A global refresh signal: any write bumps it, every live view refetches.
let version = 0;
const listeners = new Set<() => void>();
export const bump = () => { version++; listeners.forEach((l) => l()); };
export function useVersion() {
  const [v, setV] = useState(version);
  useEffect(() => { const l = () => setV(version); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return v;
}

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? 'POST' : 'GET'),
    headers: { 'x-persona': persona, ...(init?.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(data?.error ?? `${res.status} ${res.statusText}`);
  return data as T;
}
export const post = <T = any>(path: string, json: unknown = {}) => api<T>(path, { json });

/** Fetch, refetch on any write, optionally poll. */
export function useApi<T = any>(path: string | null, opts: { poll?: number } = {}) {
  const v = useVersion();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const live = useRef(true);
  const seq = useRef(0); // only the latest request may set the data: a slower, older response must not overwrite a newer one
  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setLoading(true);
    try { const d = await api<T>(path); if (live.current && mine === seq.current) { setData(d); setError(null); } }
    catch (e: any) { if (live.current && mine === seq.current) setError(e.message); }
    finally { if (live.current && mine === seq.current) setLoading(false); }
  }, [path]);
  useEffect(() => { live.current = true; load(); return () => { live.current = false; }; }, [load, v]);
  useEffect(() => { if (!opts.poll) return; const t = setInterval(load, opts.poll); return () => clearInterval(t); }, [load, opts.poll]);
  return { data, error, loading, reload: load, setData };
}
