'use client';

export interface EconEvent {
  id: string;
  title: string;
  currency: string;
  time: number;
  impact: string;
}

let cache: Promise<EconEvent[]> | null = null;
let failedAt = 0;

/** Calendário económico desta semana e da próxima (uma vez por sessão; tenta de novo 10 min depois de falhar). */
export function loadEconEvents(): Promise<EconEvent[]> {
  if (cache) return cache;
  if (Date.now() - failedAt < 10 * 60_000) return Promise.resolve([]);
  const get = (week: string) =>
    fetch(`/api/calendar?week=${week}`)
      .then((r) => r.json() as Promise<{ events?: EconEvent[] }>)
      .then((j) => j.events ?? [])
      .catch(() => [] as EconEvent[]);
  cache = Promise.all([get('this'), get('next')]).then(([a, b]) => {
    const all = [...a, ...b].filter((e) => Number.isFinite(e.time));
    if (!all.length) {
      cache = null;
      failedAt = Date.now();
    }
    return all;
  });
  return cache;
}

const ALIAS: Record<string, string> = { USDT: 'USD', USDC: 'USD', FDUSD: 'USD' };

/** Moedas cujos eventos interessam a um símbolo (ex.: EURUSD → EUR e USD). */
export function currenciesOf(sym: { baseCurrency?: string; quoteCurrency?: string; assetClass: string }): string[] {
  if (sym.assetClass === 'synthetic' || sym.assetClass === 'demo') return [];
  const out = new Set<string>();
  for (const c of [sym.baseCurrency, sym.quoteCurrency]) {
    if (!c) continue;
    const k = ALIAS[c] ?? c;
    if (/^[A-Z]{3}$/.test(k) && !['XAU', 'XAG', 'XPT', 'XPD', 'BTC', 'ETH'].includes(k)) out.add(k);
  }
  return [...out];
}
