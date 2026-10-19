/** Deterministic RNG (mulberry32) so the synthetic world is the same on every machine. */
export const SEED = 20261010;
export function rng(seed = SEED) {
  let a = seed >>> 0;
  const next = () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
    round: (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d,
  };
}
export type Rng = ReturnType<typeof rng>;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(isoDate + 'T00:00:00Z') + n * 86_400_000));
