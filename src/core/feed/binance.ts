import type { Bar, SymbolInfo } from '../types';
import { parseTf, tfToString, type Timeframe } from '../timeframes';
import { backoffDelay, fetchJson, ProviderError, type FetchArgs, type Provider, type Quote } from './provider';
import { registerSymbol } from '../symbols';

const REST_BASES = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const WS_BASES = ['wss://data-stream.binance.vision', 'wss://stream.binance.com:9443'];

const NATIVE = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1D', '1W', '1M'].map(parseTf);

let restIndex = 0;
let wsIndex = 0;

function interval(tf: Timeframe): string {
  if (tf.unit === 'D') return `${tf.n}d`;
  if (tf.unit === 'W') return `${tf.n}w`;
  if (tf.unit === 'M') return `${tf.n}M`;
  return tfToString(tf);
}

async function rest<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < REST_BASES.length; attempt++) {
    const idx = (restIndex + attempt) % REST_BASES.length;
    try {
      const out = await fetchJson<T>(`${REST_BASES[idx]}${path}`);
      restIndex = idx;
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new ProviderError(`Binance indisponível: ${(lastErr as Error)?.message ?? lastErr}`, 'binance');
}

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

function toBar(k: Kline): Bar {
  return {
    time: Math.floor(k[0] / 1000),
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
    volume: +k[5],
  };
}

const QUOTES = ['USDT', 'FDUSD', 'USDC', 'TUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'BRL', 'TRY', 'TRY', 'JPY', 'GBP', 'AUD', 'DAI'];

function splitPair(sym: string): [string, string] {
  for (const q of QUOTES) {
    if (sym.endsWith(q) && sym.length > q.length) return [sym.slice(0, -q.length), q];
  }
  return [sym, ''];
}

let allTickers: Promise<string[]> | null = null;

class Stream {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly streamName: string,
    private readonly onMessage: (data: unknown) => void,
  ) {
    this.open();
  }

  private open() {
    if (this.closed) return;
    const url = `${WS_BASES[wsIndex % WS_BASES.length]}/ws/${this.streamName}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data as string));
      } catch {
        /* mensagem inválida */
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.closed) {
        wsIndex++;
        this.retry();
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* nada */
      }
    };
  }

  private retry() {
    if (this.closed) return;
    this.timer = setTimeout(() => this.open(), backoffDelay(this.attempt++));
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      this.ws?.close();
    } catch {
      /* nada */
    }
  }
}

export const binanceProvider: Provider = {
  id: 'binance',
  maxPerRequest: 1000,

  nativeTfs() {
    return NATIVE;
  },

  async fetch(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]> {
    const limit = Math.max(1, Math.min(1000, args.limit));
    const params = new URLSearchParams({ symbol: symbol.ticker.toUpperCase(), interval: interval(tf), limit: String(limit) });
    if (args.from !== undefined) params.set('startTime', String(args.from * 1000));
    params.set('endTime', String(args.to * 1000 - 1));
    const raw = await rest<Kline[] | { code: number; msg: string }>(`/api/v3/klines?${params}`);
    if (!Array.isArray(raw)) throw new ProviderError(raw.msg || 'Erro Binance', 'binance', false);
    const bars = raw.map(toBar).filter((b) => b.time < args.to && (args.from === undefined || b.time >= args.from));
    return bars;
  },

  subscribe(symbol, tf, onBar) {
    const s = new Stream(`${symbol.ticker.toLowerCase()}@kline_${interval(tf)}`, (msg) => {
      const k = (msg as { k?: { t: number; o: string; h: string; l: string; c: string; v: string } }).k;
      if (!k) return;
      onBar({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
    });
    return () => s.close();
  },

  subscribeQuote(symbol, onQuote: (q: Quote) => void) {
    const s = new Stream(`${symbol.ticker.toLowerCase()}@miniTicker`, (msg) => {
      const m = msg as { c?: string; o?: string; E?: number };
      if (!m.c) return;
      const price = +m.c;
      const open = m.o ? +m.o : NaN;
      onQuote({ price, changePct: open > 0 ? ((price - open) / open) * 100 : undefined, time: Math.floor((m.E ?? Date.now()) / 1000) });
    });
    return () => s.close();
  },

  async search(query: string): Promise<SymbolInfo[]> {
    if (!allTickers) {
      allTickers = rest<{ symbol: string }[]>('/api/v3/ticker/price')
        .then((rows) => rows.map((r) => r.symbol))
        .catch((e) => {
          allTickers = null;
          throw e;
        });
    }
    const list = await allTickers;
    const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!q) return [];
    const scored = list
      .filter((s) => s.includes(q))
      .map((s) => {
        const [base, quote] = splitPair(s);
        let score = 0;
        if (s === q) score += 100;
        if (base === q) score += 60;
        if (s.startsWith(q)) score += 30;
        if (quote === 'USDT') score += 20;
        return { s, base, quote, score };
      })
      .sort((a, b) => b.score - a.score || a.s.localeCompare(b.s))
      .slice(0, 40);
    return scored.map(({ s, base, quote }) => {
      const info: SymbolInfo = {
        id: `BINANCE:${s}`,
        provider: 'binance',
        ticker: s,
        name: s,
        description: quote ? `${base} / ${quote}` : s,
        assetClass: 'crypto',
        category: quote || 'Spot',
        precision: 4,
        contractSize: 1,
        baseCurrency: base,
        quoteCurrency: quote || undefined,
        session: '24x7',
        hasVolume: true,
        exchange: 'Binance',
      };
      return registerSymbol(info);
    });
  },
};
