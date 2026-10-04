import type { AssetClass, Bar, SymbolInfo } from '../types';
import { DAY, parseTf, tfSeconds, type Timeframe } from '../timeframes';
import { fetchJson, nowSec, ProviderError, type FetchArgs, type Provider, type Quote } from './provider';
import { registerSymbol } from '../symbols';

/** Ações, índices, futuros e ETFs através do Yahoo Finance (via rota /api/market/yahoo do próprio site). */

const NATIVE: Timeframe[] = ['1m', '2m', '5m', '15m', '30m', '1h', '1D', '1W', '1M'].map(parseTf);

export function yahooInterval(tf: Timeframe): string {
  if (tf.unit === 'h') return `${tf.n * 60}m`;
  if (tf.unit === 'D') return '1d';
  if (tf.unit === 'W') return '1wk';
  if (tf.unit === 'M') return '1mo';
  return `${tf.n}m`;
}

function earliestFor(tf: Timeframe): number | undefined {
  const now = nowSec();
  const s = tfSeconds(tf);
  if (s <= 60) return now - 29 * DAY;
  if (s < 3600) return now - 59 * DAY;
  if (s < DAY) return now - 729 * DAY;
  return undefined;
}

/** Fator para converter "N barras" em tempo, tendo em conta horas de mercado fechado. */
function sessionFactor(tf: Timeframe): number {
  return tfSeconds(tf) < DAY ? 5 : 1.6;
}

interface ChartResponse {
  bars: Bar[];
  error?: string;
}

const quoteListeners = new Map<string, Set<(q: Quote) => void>>();
let quoteTimer: ReturnType<typeof setInterval> | null = null;

async function pollQuotes() {
  const symbols = Array.from(quoteListeners.keys());
  if (!symbols.length) return;
  for (let i = 0; i < symbols.length; i += 15) {
    const batch = symbols.slice(i, i + 15);
    try {
      const res = await fetchJson<Record<string, Quote>>(`/api/market/yahoo-quote?symbols=${encodeURIComponent(batch.join(','))}`);
      for (const [sym, q] of Object.entries(res)) quoteListeners.get(sym)?.forEach((cb) => cb(q));
    } catch {
      /* tenta na próxima volta */
    }
  }
}

export const yahooProvider: Provider = {
  id: 'yahoo',
  maxPerRequest: 5000,

  nativeTfs() {
    return NATIVE;
  },

  earliest(_symbol, tf) {
    return earliestFor(tf);
  },

  async fetch(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]> {
    const earliest = earliestFor(tf);
    if (earliest !== undefined && args.to <= earliest) return [];
    let from = args.from ?? Math.floor(args.to - args.limit * tfSeconds(tf) * sessionFactor(tf));
    if (earliest !== undefined && from < earliest) from = earliest;
    // o Yahoo só aceita 7 dias de 1m por pedido
    if (tfSeconds(tf) <= 60 && args.to - from > 7 * DAY) from = args.to - 7 * DAY;
    const params = new URLSearchParams({
      symbol: symbol.ticker,
      interval: yahooInterval(tf),
      period1: String(Math.max(0, from)),
      period2: String(args.to),
    });
    const res = await fetchJson<ChartResponse>(`/api/market/yahoo?${params}`, 25000).catch((e) => {
      throw new ProviderError(`Yahoo Finance indisponível: ${(e as Error).message}`, 'yahoo');
    });
    if (res.error) throw new ProviderError(res.error, 'yahoo', false);
    const bars = res.bars.filter((b) => b.time < args.to && b.time >= from);
    return args.from === undefined ? bars.slice(-args.limit) : bars;
  },

  subscribe(symbol, tf, onBar) {
    let alive = true;
    const tick = async () => {
      try {
        const bars = await yahooProvider.fetch(symbol, tf, { to: nowSec() + tfSeconds(tf), limit: 2 });
        if (alive) bars.forEach(onBar);
      } catch {
        /* ignora */
      }
    };
    const timer = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  },

  subscribeQuote(symbol, onQuote) {
    let set = quoteListeners.get(symbol.ticker);
    if (!set) {
      set = new Set();
      quoteListeners.set(symbol.ticker, set);
    }
    set.add(onQuote);
    if (!quoteTimer) {
      quoteTimer = setInterval(pollQuotes, 30000);
    }
    setTimeout(pollQuotes, 300);
    return () => {
      const s = quoteListeners.get(symbol.ticker);
      s?.delete(onQuote);
      if (s && !s.size) quoteListeners.delete(symbol.ticker);
      if (!quoteListeners.size && quoteTimer) {
        clearInterval(quoteTimer);
        quoteTimer = null;
      }
    };
  },

  async search(query: string): Promise<SymbolInfo[]> {
    const q = query.trim();
    if (q.length < 1) return [];
    const res = await fetchJson<{ quotes: { symbol: string; name: string; exchange: string; type: string }[] }>(
      `/api/market/yahoo-search?q=${encodeURIComponent(q)}`,
    );
    return res.quotes.map((r) => {
      const assetClass: AssetClass =
        r.type === 'INDEX' ? 'indices' : r.type === 'FUTURE' ? 'futures' : r.type === 'CURRENCY' ? 'forex' : r.type === 'CRYPTOCURRENCY' ? 'crypto' : 'stocks';
      return registerSymbol({
        id: `YAHOO:${r.symbol}`,
        provider: 'yahoo',
        ticker: r.symbol,
        name: r.symbol.replace(/=X$|=F$/, '').replace(/^\^/, ''),
        description: r.name || r.symbol,
        assetClass,
        category: r.exchange,
        precision: assetClass === 'forex' ? 5 : 2,
        contractSize: 1,
        session: 'exchange',
        hasVolume: assetClass !== 'indices' && assetClass !== 'forex',
        exchange: r.exchange || 'Yahoo',
      });
    });
  },
};
