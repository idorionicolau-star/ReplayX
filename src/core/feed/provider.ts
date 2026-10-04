import type { Bar, ProviderId, SymbolInfo } from '../types';
import type { Timeframe } from '../timeframes';

export interface FetchArgs {
  /** Início (inclusive). Se omisso, devolve as `limit` barras mais recentes antes de `to`. */
  from?: number;
  /** Fim (exclusivo). */
  to: number;
  limit: number;
}

export interface Quote {
  price: number;
  /** Variação percentual do dia (ou 24h). */
  changePct?: number;
  time: number;
}

export interface Provider {
  id: ProviderId;
  /** Máximo de barras por pedido. */
  maxPerRequest: number;
  /** Granularidades nativas suportadas (do menor ao maior). */
  nativeTfs(symbol: SymbolInfo): Timeframe[];
  /** Barras ordenadas com time em [from, to). */
  fetch(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]>;
  /** Primeiro instante disponível (ex.: Yahoo 1m só tem 30 dias). */
  earliest?(symbol: SymbolInfo, tf: Timeframe): number | undefined;
  /** Atualizações em tempo real da barra corrente no timeframe nativo. */
  subscribe?(symbol: SymbolInfo, tf: Timeframe, onBar: (bar: Bar) => void, seed?: Bar): () => void;
  /** Cotação ao vivo para a watchlist. */
  subscribeQuote?(symbol: SymbolInfo, onQuote: (q: Quote) => void): () => void;
  search?(query: string): Promise<SymbolInfo[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderId,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignorar */
      }
      throw new Error(`HTTP ${res.status} ${detail}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** Conta casas decimais significativas numa lista de preços (para afinar a precisão). */
export function inferPrecision(values: number[], fallback = 2): number {
  let best = 0;
  let seen = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    seen++;
    const s = v.toString();
    if (s.includes('e')) {
      const m = /e-(\d+)/.exec(s);
      if (m) best = Math.max(best, parseInt(m[1], 10) + 2);
      continue;
    }
    const dot = s.indexOf('.');
    if (dot >= 0) best = Math.max(best, s.length - dot - 1);
  }
  if (!seen) return fallback;
  return Math.min(Math.max(best, 0), 10);
}

/** Reconexão com recuo exponencial para WebSockets. */
export function backoffDelay(attempt: number): number {
  const base = Math.min(30000, 1000 * Math.pow(2, attempt));
  return base / 2 + Math.random() * (base / 2);
}
