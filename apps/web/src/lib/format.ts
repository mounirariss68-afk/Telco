/** Formatting. Figures in Western digits; dates in Gulf time; money through the market edition. */
let MARKET = { currency: 'AED', symbol: 'AED', rate: 1 };
export const setMarketFormat = (m: { currency: string; symbol: string; rate: number }) => { MARKET = m; };
export const money = (aed: number | null | undefined, decimals?: number) => {
  if (aed === null || aed === undefined || Number.isNaN(Number(aed))) return '—';
  const v = Number(aed) * MARKET.rate; const d = decimals ?? (Math.abs(v) >= 1000 ? 0 : 2);
  const s = v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  return MARKET.symbol.length === 1 ? `${MARKET.symbol}${s}` : `${MARKET.symbol} ${s}`;
};
export const moneyShort = (aed: number | null | undefined) => { if (aed === null || aed === undefined) return '—'; const v = Number(aed) * MARKET.rate; const a = Math.abs(v); const s = a >= 1e6 ? `${(v / 1e6).toFixed(2)}m` : a >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.round(v).toLocaleString('en-GB'); return MARKET.symbol.length === 1 ? `${MARKET.symbol}${s}` : `${MARKET.symbol} ${s}`; };
export const num = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(d)}%`);
const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', ...o });
const asDate = (s: string | Date) => new Date(typeof s === 'string' && s.length === 10 ? `${s}T08:00:00Z` : s);
export const date = (s: string | Date | null | undefined) => (s ? dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(asDate(s)) : '—');
export const dateShort = (s: string | Date | null | undefined) => (s ? dtf({ day: 'numeric', month: 'short' }).format(asDate(s)) : '—');
export const dateTime = (s: string | Date | null | undefined) => (s ? dtf({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s)) : '—');
export function rel(s: string | Date | null | undefined, now: string | Date = new Date()) {
  if (!s) return '—';
  const d = (new Date(now).getTime() - new Date(s).getTime()) / 1000; const a = Math.abs(d); const past = d >= 0;
  const f = (n: number, u: string) => (past ? `${n}${u} ago` : `in ${n}${u}`);
  if (a < 60) return past ? 'just now' : 'now'; if (a < 3600) return f(Math.round(a / 60), 'm'); if (a < 86400) return f(Math.round(a / 3600), 'h'); return f(Math.round(a / 86400), 'd');
}
export const initials = (name: string) => (name ?? '').split(/\s+/).filter((w) => !/^(al|bin|el)$/i.test(w)).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
export const title = (s: string | null | undefined) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
