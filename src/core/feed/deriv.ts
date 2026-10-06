import type { AssetClass, Bar, SymbolInfo } from '../types';
import { alignTime, parseTf, tfSeconds, type Timeframe } from '../timeframes';
import { backoffDelay, nowSec, ProviderError, type FetchArgs, type Provider, type Quote } from './provider';
import { allSymbols, registerSymbol } from '../symbols';

/**
 * Cliente WebSocket da Deriv (índices sintéticos, forex, metais, índices de bolsa).
 * Usa primeiro o endpoint público novo (sem app_id) e recorre ao antigo se falhar.
 * O `app_id` é o público de testes (1089) até registares o teu em api.deriv.com e o pores em NEXT_PUBLIC_DERIV_APP_ID.
 */
export const DERIV_APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';

export const DERIV_ENDPOINTS = [
  'wss://api.derivws.com/trading/v1/options/ws/public',
  `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`,
  `wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`,
];

const GRANULARITIES = [60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400];
const NATIVE: Timeframe[] = ['1s', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '8h', '1D'].map(parseTf);

type DerivMsg = Record<string, unknown> & {
  req_id?: number;
  msg_type?: string;
  error?: { code?: string; message?: string };
  subscription?: { id?: string };
};

interface Pending {
  resolve: (m: DerivMsg) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface StreamEntry {
  req: Record<string, unknown>;
  onMessage: (m: DerivMsg) => void;
  onError?: (e: Error) => void;
  subId?: string;
  active: boolean;
}

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'error';

/** Erros que indicam que este endpoint não serve pedidos públicos (tenta o seguinte). */
const SWITCH_CODES = new Set(['InvalidAppID', 'AppIdRequired', 'UnrecognisedRequest', 'AuthorizationRequired', 'InvalidToken', 'Forbidden', 'NotFound']);

export class DerivError extends ProviderError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message, 'deriv', code !== 'InvalidSymbol' && code !== 'InputValidationFailed');
  }
}

function openSocket(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* nada */
      }
      reject(new Error('timeout'));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('erro de ligação'));
    };
    // fechada antes de abrir (handshake recusado)
    ws.onclose = () => {
      clearTimeout(timer);
      reject(new Error('ligação recusada'));
    };
  });
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private endpointIdx = 0;
  private reqId = 1;
  private pending = new Map<number, Pending>();
  private streams = new Map<number, StreamEntry>();
  private connecting: Promise<WebSocket> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusListeners = new Set<(s: ConnStatus) => void>();
  /** Recebeu alguma resposta válida neste socket (senão, ao fechar, tenta o endpoint seguinte). */
  private healthy = false;
  status: ConnStatus = 'idle';

  constructor(private readonly endpoints: string[] = DERIV_ENDPOINTS) {}

  onStatus(cb: (s: ConnStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  get endpoint(): string {
    return this.endpoints[this.endpointIdx];
  }

  connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
    if (this.connecting) return this.connecting;
    this.setStatus('connecting');
    this.connecting = (async () => {
      let lastErr: unknown;
      for (let i = 0; i < this.endpoints.length; i++) {
        const idx = (this.endpointIdx + i) % this.endpoints.length;
        try {
          const ws = await openSocket(this.endpoints[idx], 9000);
          this.endpointIdx = idx;
          this.attach(ws);
          this.setStatus('open');
          return ws;
        } catch (e) {
          lastErr = e;
        }
      }
      this.setStatus('error');
      throw new ProviderError(`Não foi possível ligar à Deriv (${(lastErr as Error)?.message ?? 'rede'})`, 'deriv');
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private attach(ws: WebSocket) {
    this.ws = ws;
    this.healthy = false;
    this.reconnectAttempt = 0;
    ws.onmessage = (ev) => {
      let msg: DerivMsg;
      try {
        msg = JSON.parse(ev.data as string) as DerivMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.healthy) this.endpointIdx = (this.endpointIdx + 1) % this.endpoints.length;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new ProviderError('Ligação à Deriv perdida', 'deriv'));
        this.pending.delete(id);
      }
      for (const s of this.streams.values()) s.subId = undefined;
      this.setStatus('connecting');
      if (this.streams.size) this.scheduleReconnect();
      else this.setStatus('idle');
    };
    ws.onerror = () => {
      /* onclose trata da reconexão */
    };
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.send({ ping: 1 }, 10000).catch(() => undefined);
    }, 30000);
    // volta a subscrever streams depois de uma reconexão
    for (const [id, entry] of this.streams) this.sendStream(id, entry);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.scheduleReconnect());
    }, backoffDelay(this.reconnectAttempt++));
  }

  private handle(msg: DerivMsg) {
    if (!msg.error) this.healthy = true;
    const id = typeof msg.req_id === 'number' ? msg.req_id : undefined;
    if (id !== undefined) {
      const p = this.pending.get(id);
      if (p) {
        this.pending.delete(id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new DerivError(msg.error.code ?? 'Error', msg.error.message ?? 'Erro Deriv'));
        else p.resolve(msg);
        return;
      }
      const s = this.streams.get(id);
      if (s) {
        if (msg.error) {
          s.onError?.(new DerivError(msg.error.code ?? 'Error', msg.error.message ?? 'Erro Deriv'));
          return;
        }
        if (msg.subscription?.id) s.subId = msg.subscription.id;
        s.onMessage(msg);
        return;
      }
    }
    // mensagens de streams sem req_id (endpoint novo): encaminhar pelo id da subscrição
    const subId = msg.subscription?.id;
    if (subId) {
      for (const s of this.streams.values()) {
        if (s.subId === subId) {
          s.onMessage(msg);
          return;
        }
      }
    }
  }

  /** Força a mudança para o endpoint seguinte (ex.: o atual recusa pedidos públicos). */
  private switchEndpoint() {
    const old = this.ws;
    this.endpointIdx = (this.endpointIdx + 1) % this.endpoints.length;
    this.ws = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new ProviderError('Ligação à Deriv reiniciada noutro servidor', 'deriv'));
      this.pending.delete(id);
    }
    if (old) {
      old.onclose = null;
      old.onmessage = null;
      try {
        old.close();
      } catch {
        /* nada */
      }
    }
  }

  async send(req: Record<string, unknown>, timeoutMs = 20000): Promise<DerivMsg> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      try {
        return await this.sendOnce(req, timeoutMs);
      } catch (e) {
        lastErr = e;
        const code = e instanceof DerivError ? e.code : '';
        if (!SWITCH_CODES.has(code)) throw e;
        this.switchEndpoint();
        // as streams voltam a ser pedidas no novo endpoint
        for (const s of this.streams.values()) s.subId = undefined;
        for (const [sid, entry] of this.streams) this.sendStream(sid, entry);
      }
    }
    throw lastErr;
  }

  private async sendOnce(req: Record<string, unknown>, timeoutMs: number): Promise<DerivMsg> {
    const ws = await this.connect();
    const id = this.reqId++;
    return new Promise<DerivMsg>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProviderError('Tempo esgotado à espera da Deriv', 'deriv'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ ...req, req_id: id }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  subscribe(req: Record<string, unknown>, onMessage: (m: DerivMsg) => void, onError?: (e: Error) => void): () => void {
    const id = this.reqId++;
    const entry: StreamEntry = { req, onMessage, onError, active: true };
    this.streams.set(id, entry);
    this.sendStream(id, entry);
    return () => {
      entry.active = false;
      this.streams.delete(id);
      if (entry.subId && this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ forget: entry.subId }));
        } catch {
          /* nada */
        }
      }
    };
  }

  private sendStream(id: number, entry: StreamEntry) {
    this.connect()
      .then((ws) => {
        if (!entry.active || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ ...entry.req, subscribe: 1, req_id: id }));
      })
      .catch(() => {
        if (entry.active) this.scheduleReconnect();
      });
  }
}

let client: DerivClient | null = null;
export function derivClient(): DerivClient {
  if (!client) client = new DerivClient();
  return client;
}

// ---------- multiplexador de ticks (a Deriv recusa subscrições duplicadas) ----------

interface TickHubEntry {
  listeners: Set<(price: number, epoch: number) => void>;
  unsub: () => void;
}
const tickHub = new Map<string, TickHubEntry>();

export function subscribeTicks(ticker: string, cb: (price: number, epoch: number) => void): () => void {
  let entry = tickHub.get(ticker);
  if (!entry) {
    const listeners = new Set<(price: number, epoch: number) => void>();
    const unsub = derivClient().subscribe({ ticks: ticker }, (msg) => {
      const t = msg.tick as { quote?: number; epoch?: number } | undefined;
      if (!t || typeof t.quote !== 'number' || typeof t.epoch !== 'number') return;
      listeners.forEach((l) => l(t.quote as number, t.epoch as number));
    });
    entry = { listeners, unsub };
    tickHub.set(ticker, entry);
  }
  entry.listeners.add(cb);
  return () => {
    const e = tickHub.get(ticker);
    if (!e) return;
    e.listeners.delete(cb);
    if (!e.listeners.size) {
      e.unsub();
      tickHub.delete(ticker);
    }
  };
}

// ---------- símbolos ativos ----------

const SUBMARKET_LABEL: Record<string, string> = {
  random_index: 'Volatilidade',
  random_daily: 'Reset diário',
  random_nightly: 'Reset noturno',
  crash_index: 'Boom & Crash',
  crash_boom: 'Boom & Crash',
  step_index: 'Step',
  jump_index: 'Jump',
  range_break: 'Range Break',
  dex: 'DEX',
  dxi: 'DEX',
  drift_switch: 'Drift Switch',
  forex_basket: 'Cestas',
  commodity_basket: 'Cestas',
  major_pairs: 'Principais',
  minor_pairs: 'Cruzados e exóticos',
  exotic_pairs: 'Cruzados e exóticos',
  smart_fx: 'Cestas',
  metals: 'Metais',
  energy: 'Energia',
  americas_OTC: 'Américas',
  europe_OTC: 'Europa',
  asia_oceania_OTC: 'Ásia/Pacífico',
  non_stable_coin: 'Deriv',
};

function mapMarket(market: string): AssetClass {
  if (market.includes('synthetic') || market === 'basket_index' || market === 'derived') return 'synthetic';
  if (market === 'forex') return 'forex';
  if (market === 'indices') return 'indices';
  if (market === 'commodities') return 'commodities';
  if (market.includes('crypto')) return 'crypto';
  return 'synthetic';
}

function precisionFromPip(pip: unknown): number | undefined {
  if (typeof pip !== 'number' || !Number.isFinite(pip) || pip <= 0) return undefined;
  if (pip >= 1 && Number.isInteger(pip)) return Math.min(pip, 10);
  return Math.max(0, Math.round(-Math.log10(pip)));
}

let activeSymbolsLoaded: Promise<SymbolInfo[]> | null = null;

export function loadDerivSymbols(): Promise<SymbolInfo[]> {
  if (activeSymbolsLoaded) return activeSymbolsLoaded;
  activeSymbolsLoaded = derivClient()
    .send({ active_symbols: 'brief' })
    .then((msg) => {
      const list = (msg.active_symbols as Record<string, unknown>[]) ?? [];
      const out: SymbolInfo[] = [];
      for (const row of list) {
        const ticker = (row.underlying_symbol ?? row.symbol) as string | undefined;
        if (!ticker) continue;
        const display = (row.underlying_symbol_name ?? row.display_name ?? ticker) as string;
        const market = String(row.market ?? '');
        const submarket = String(row.submarket ?? '');
        const assetClass = mapMarket(market);
        const precision = precisionFromPip(row.pip_size ?? row.pip);
        const id = `DERIV:${ticker}`;
        const known = allSymbols().find((s) => s.id === id);
        const info: SymbolInfo = known
          ? { ...known, description: display || known.description, ...(precision !== undefined ? { precision } : {}) }
          : {
              id,
              provider: 'deriv',
              ticker,
              name: ticker.startsWith('frx') ? ticker.slice(3) : ticker.startsWith('cry') ? ticker.slice(3) : display.replace(/ Index$/, ''),
              description: display,
              assetClass,
              category: SUBMARKET_LABEL[submarket] ?? (row.submarket_display_name as string) ?? submarket,
              precision: precision ?? 2,
              contractSize: assetClass === 'forex' ? 100000 : 1,
              session: assetClass === 'synthetic' || assetClass === 'crypto' ? '24x7' : assetClass === 'forex' ? '24x5' : 'exchange',
              hasVolume: false,
              exchange: 'Deriv',
              ...(assetClass === 'forex' && ticker.length === 9
                ? { baseCurrency: ticker.slice(3, 6), quoteCurrency: ticker.slice(6, 9) }
                : {}),
            };
        out.push(registerSymbol(info, true));
      }
      return out;
    })
    .catch((e) => {
      activeSymbolsLoaded = null;
      throw e;
    });
  return activeSymbolsLoaded;
}

// ---------- fornecedor ----------

type Candle = { epoch: number; open: number | string; high: number | string; low: number | string; close: number | string };

function granularity(tf: Timeframe): number {
  const s = tfSeconds(tf);
  if (!GRANULARITIES.includes(s)) throw new ProviderError(`Granularidade não suportada: ${s}s`, 'deriv', false);
  return s;
}

async function fetchCandles(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]> {
  const gran = granularity(tf);
  const now = nowSec();
  const end = args.to > now ? 'latest' : args.to;
  const req: Record<string, unknown> = {
    ticks_history: symbol.ticker,
    style: 'candles',
    granularity: gran,
    end,
    count: Math.max(1, Math.min(5000, args.limit + 1)),
  };
  if (args.from !== undefined) req.start = args.from;
  else req.adjust_start_time = 1;
  let msg: DerivMsg;
  try {
    msg = await derivClient().send(req, 30000);
  } catch (e) {
    if (e instanceof DerivError && e.code === 'InputValidationFailed' && (req.count as number) > 1000) {
      req.count = 1000;
      msg = await derivClient().send(req, 30000);
    } else throw e;
  }
  const candles = (msg.candles as Candle[] | undefined) ?? [];
  const bars: Bar[] = [];
  for (const c of candles) {
    const time = Number(c.epoch);
    if (time >= args.to || (args.from !== undefined && time < args.from)) continue;
    bars.push({ time, open: +c.open, high: +c.high, low: +c.low, close: +c.close });
  }
  bars.sort((a, b) => a.time - b.time);
  return args.from === undefined ? bars.slice(-args.limit) : bars;
}

/** A Deriv só tem velas a partir de 1 minuto: os segundos montam-se a partir dos ticks. */
async function fetchTickBars(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]> {
  const now = nowSec();
  const req: Record<string, unknown> = {
    ticks_history: symbol.ticker,
    style: 'ticks',
    end: args.to > now ? 'latest' : args.to,
    count: Math.max(1, Math.min(5000, args.limit + 1)),
  };
  if (args.from !== undefined) req.start = args.from;
  else req.adjust_start_time = 1;
  const msg = await derivClient().send(req, 30000);
  const h = msg.history as { times?: (number | string)[]; prices?: (number | string)[] } | undefined;
  return ticksToBars(h?.times ?? [], h?.prices ?? [], tf, args);
}

/** Junta ticks em velas de `tf` (sem volume). Segundos sem ticks ficam sem vela. */
export function ticksToBars(times: (number | string)[], prices: (number | string)[], tf: Timeframe, args: FetchArgs): Bar[] {
  const bars: Bar[] = [];
  let cur: Bar | null = null;
  const n = Math.min(times.length, prices.length);
  for (let i = 0; i < n; i++) {
    const t = Number(times[i]);
    const p = Number(prices[i]);
    if (!Number.isFinite(t) || !Number.isFinite(p)) continue;
    const open = alignTime(t, tf);
    if (open >= args.to || (args.from !== undefined && open < args.from)) continue;
    if (!cur || open !== cur.time) {
      cur = { time: open, open: p, high: p, low: p, close: p };
      bars.push(cur);
    } else {
      cur.high = Math.max(cur.high, p);
      cur.low = Math.min(cur.low, p);
      cur.close = p;
    }
  }
  bars.sort((a, b) => a.time - b.time);
  return args.from === undefined ? bars.slice(-args.limit) : bars;
}

export const derivProvider: Provider = {
  id: 'deriv',
  maxPerRequest: 4000,

  nativeTfs() {
    return NATIVE;
  },

  fetch: (symbol, tf, args) => (tf.unit === 's' ? fetchTickBars(symbol, tf, args) : fetchCandles(symbol, tf, args)),

  subscribe(symbol, tf, onBar, seed) {
    let cur: Bar | null = seed ? { ...seed } : null;
    return subscribeTicks(symbol.ticker, (price, epoch) => {
      const open = alignTime(epoch, tf);
      if (!cur || open > cur.time) {
        cur = { time: open, open: price, high: price, low: price, close: price };
      } else if (open === cur.time) {
        cur.high = Math.max(cur.high, price);
        cur.low = Math.min(cur.low, price);
        cur.close = price;
      } else return; // tick antigo
      onBar({ ...cur });
    });
  },

  subscribeQuote(symbol, onQuote: (q: Quote) => void) {
    let dayOpen: number | undefined;
    let dayStart = 0;
    let alive = true;
    const loadOpen = () => {
      fetchCandles(symbol, parseTf('1D'), { to: nowSec() + 86400, limit: 1 })
        .then((b) => {
          if (alive && b.length) {
            dayOpen = b[b.length - 1].open;
            dayStart = b[b.length - 1].time;
          }
        })
        .catch(() => undefined);
    };
    loadOpen();
    const unsub = subscribeTicks(symbol.ticker, (price, epoch) => {
      if (dayStart && epoch >= dayStart + 86400) {
        dayOpen = price;
        dayStart = alignTime(epoch, '1D');
      }
      onQuote({ price, time: epoch, changePct: dayOpen ? ((price - dayOpen) / dayOpen) * 100 : undefined });
    });
    return () => {
      alive = false;
      unsub();
    };
  },

  async search(query: string) {
    const list = await loadDerivSymbols().catch(() => allSymbols().filter((s) => s.provider === 'deriv'));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => `${s.ticker} ${s.name} ${s.description}`.toLowerCase().includes(q));
  },
};
