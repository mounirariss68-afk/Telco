/**
 * The engine's virtual clock. The demo sits on a virtual "today" persisted in
 * layer.meta (as_of). The seed REPLAYS sixty days of history through the real
 * engine with the clock set into the past; the Director advances it by days
 * so time-based triggers (reminders, verification windows, settlement cycles) fall
 * out in a minute instead of a month.
 */
import { meta, pool, setMeta } from './db.js';

let virtual: Date | null = null;
export const now = () => (virtual ? new Date(virtual) : new Date());
export const setClock = (d: Date | null) => { virtual = d ? new Date(d) : null; };
export const tick = (ms: number) => { if (virtual) virtual = new Date(virtual.getTime() + ms); };
/** The Dubai-local date (UTC+4) of the current clock. */
export const today = () => new Date(now().getTime() + 4 * 3600_000).toISOString().slice(0, 10);
export const isVirtual = () => virtual !== null;

/** Load the persisted clock on start; the real wall clock if none. */
export async function loadClock() {
  const v = await meta<{ at: string }>(pool, 'clock');
  virtual = v?.at ? new Date(v.at) : null;
}
export async function persistClock() { await setMeta(pool, 'clock', virtual ? { at: virtual.toISOString() } : {}); }

/** Dubai-local 09:15 on an ISO date, as an instant. */
export const localAt = (date: string, hm = '09:15') => new Date(Date.parse(`${date}T${hm}:00Z`) - 4 * 3600_000);
