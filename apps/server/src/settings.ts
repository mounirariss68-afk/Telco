/** Settings live in layer.meta under 'settings': the market edition and the small things the demo lets you change. */
import type { Q } from './db.js';
import { meta, setMeta } from './db.js';

export type Settings = { market: 'uae' | 'ksa' | 'tr' | 'eu'; autoVerifyDays: number };
export const DEFAULT_SETTINGS: Settings = { market: 'uae', autoVerifyDays: 14 };
let cache: Settings | null = null;
export async function settings(c: Q): Promise<Settings> { if (cache) return cache; cache = { ...DEFAULT_SETTINGS, ...((await meta<Partial<Settings>>(c, 'settings')) ?? {}) }; return cache; }
export async function setting<K extends keyof Settings>(c: Q, key: K, fallback: Settings[K]): Promise<Settings[K]> { const s = await settings(c); return (s[key] ?? fallback) as Settings[K]; }
export async function updateSettings(c: Q, patch: Partial<Settings>) { const s = { ...(await settings(c)), ...patch }; await setMeta(c, 'settings', s); cache = s; return s; }
export const resetSettingsCache = () => { cache = null; };
