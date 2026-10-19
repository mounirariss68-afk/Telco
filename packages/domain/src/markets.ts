/** The four market editions the Cognirise site carries. Amounts are stored in AED and shown through the market's rate. */
import type { Market, MarketKey } from './types.js';

export const MARKETS: Record<MarketKey, Market> = {
  uae: { key: 'uae', label: 'UAE', kicker: 'UAE / Telecoms', currency: 'AED', symbol: 'AED', rate: 1, regulator: 'TDRA', dataRule: 'Personal data under the federal data protection law and TDRA policies; customer data stays in the UAE unless a transfer is permitted.', language: 'Arabic and English', city: 'Dubai' },
  ksa: { key: 'ksa', label: 'KSA', kicker: 'KSA / Telecoms', currency: 'SAR', symbol: 'SAR', rate: 1.02, regulator: 'CST (with SDAIA for personal data)', dataRule: 'The Personal Data Protection Law, with rules on cross-border transfer; in-Kingdom hosting is the default for operator data.', language: 'Arabic first', city: 'Riyadh' },
  tr: { key: 'tr', label: 'Türkiye', kicker: 'Türkiye / Telecoms', currency: 'TRY', symbol: '₺', rate: 9.3, regulator: 'BTK', dataRule: 'The KVKK personal data law; operators keep traffic and subscriber data in Türkiye.', language: 'Turkish, with English for partners', city: 'Istanbul' },
  eu: { key: 'eu', label: 'Europe', kicker: 'Europe / Telecoms', currency: 'EUR', symbol: '€', rate: 0.25, regulator: 'the national regulator under the European Electronic Communications Code', dataRule: 'The GDPR, and the EU AI Act timetable for high-risk uses.', language: 'The language of each market', city: 'Amsterdam' },
};
export const MARKET_KEYS: MarketKey[] = ['uae', 'ksa', 'tr', 'eu'];
export const market = (k: string | null | undefined): Market => MARKETS[(k as MarketKey) ?? 'uae'] ?? MARKETS.uae;

/** Format an AED-based amount in the market's currency. */
export function money(aed: number | null | undefined, m: Market, opts: { decimals?: number } = {}): string {
  if (aed === null || aed === undefined || Number.isNaN(aed)) return '—';
  const v = aed * m.rate;
  const decimals = opts.decimals ?? (Math.abs(v) >= 1000 ? 0 : 2);
  const s = v.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return m.symbol.length === 1 ? `${m.symbol}${s}` : `${m.symbol} ${s}`;
}
