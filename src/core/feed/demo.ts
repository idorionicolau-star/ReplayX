import type { Bar, SymbolInfo } from '../types';
import { alignTime, nextBarTime, parseTf, tfSeconds, type Timeframe } from '../timeframes';
import { nowSec, type FetchArgs, type Provider, type Quote } from './provider';

/**
 * Dados simulados determinísticos e coerentes entre timeframes.
 * O preço é um ruído fractal (movimento browniano aproximado) definido em cada minuto;
 * qualquer vela (1m, 1h, 1D…) é a agregação exata desses minutos, por isso a vela de 1h
 * é sempre igual à junção das de 15m — essencial para o Bar Replay com troca de timeframe.
 */

const YEAR = 365 * 86400;
const OCTAVES = 22;
export const DEMO_START = Date.UTC(2015, 0, 1) / 1000;

interface DemoSpec {
  base: number;
  vol: number;
  seed: number;
  volume: number;
}

const SPECS: Record<string, DemoSpec> = {
  SIMFX: { base: 1.1, vol: 0.09, seed: 11, volume: 900 },
  SIMVOL: { base: 520, vol: 0.75, seed: 29, volume: 300 },
  SIMBTC: { base: 42000, vol: 0.62, seed: 47, volume: 120 },
  SIMIDX: { base: 4600, vol: 0.18, seed: 83, volume: 5000 },
};

function specFor(ticker: string): DemoSpec {
  if (SPECS[ticker]) return SPECS[ticker];
  let h = 7;
  for (let i = 0; i < ticker.length; i++) h = (Math.imul(h, 31) + ticker.charCodeAt(i)) | 0;
  return { base: 100, vol: 0.3, seed: Math.abs(h) % 997, volume: 1000 };
}

/** Hash inteiro → [-1, 1]. */
function hash(n: number, seed: number): number {
  let h = (n | 0) ^ Math.imul(seed + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x7fffffff - 1;
}

const AMP = (vol: number, o: number) => vol * Math.sqrt((60 * Math.pow(2, o)) / YEAR) * 1.6;
const PHASE = (o: number) => o * 1000.125;

/** Log-preço (sem a base) nas fronteiras de minuto m0..m0+n (n+1 valores). */
function minuteLogs(s: DemoSpec, m0: number, n: number): Float64Array {
  const out = new Float64Array(n + 1);
  for (let o = 0; o < OCTAVES; o++) {
    const cell = Math.pow(2, o);
    const amp = AMP(s.vol, o);
    const sd = s.seed * 131 + o;
    const ph = PHASE(o);
    let lastI = NaN;
    let a = 0;
    let b = 0;
    for (let k = 0; k <= n; k++) {
      const x = (m0 + k) / cell + ph;
      const i = Math.floor(x);
      if (i !== lastI) {
        a = hash(i, sd);
        b = hash(i + 1, sd);
        lastI = i;
      }
      const f = x - i;
      const u = f * f * (3 - 2 * f);
      out[k] += amp * (a + (b - a) * u);
    }
  }
  return out;
}

/** Preço num instante qualquer (para cotações ao vivo dentro do minuto). */
export function demoPrice(ticker: string, t: number): number {
  const s = specFor(ticker);
  let logp = 0;
  const m = t / 60;
  for (let o = 0; o < OCTAVES; o++) {
    const x = m / Math.pow(2, o) + PHASE(o);
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash(i, s.seed * 131 + o);
    const b = hash(i + 1, s.seed * 131 + o);
    logp += AMP(s.vol, o) * (a + (b - a) * u);
  }
  return s.base * Math.exp(logp);
}

function round(v: number, decimals: number) {
  const k = Math.pow(10, decimals);
  return Math.round(v * k) / k;
}

interface MinuteBlock {
  m0: number;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  vol: Float64Array;
}

/** Velas de 1 minuto (arredondadas à precisão do símbolo) para [m0, m0+n). */
function minuteBars(info: Pick<SymbolInfo, 'ticker' | 'precision'>, m0: number, n: number): MinuteBlock {
  const s = specFor(info.ticker);
  const logs = minuteLogs(s, m0, n);
  const fine = s.vol * Math.sqrt(60 / YEAR) * 0.9;
  const sigma = s.vol * Math.sqrt(60 / YEAR);
  const d = info.precision;
  const open = new Float64Array(n);
  const high = new Float64Array(n);
  const low = new Float64Array(n);
  const close = new Float64Array(n);
  const vol = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const m = m0 + k;
    const po = s.base * Math.exp(logs[k]);
    const pc = s.base * Math.exp(logs[k + 1]);
    const o = round(po, d);
    const c = round(pc, d);
    const hi = round(Math.max(po, pc) * (1 + Math.abs(hash(m, s.seed + 5)) * fine), d);
    const lo = round(Math.min(po, pc) * (1 - Math.abs(hash(m, s.seed + 9)) * fine), d);
    open[k] = o;
    close[k] = c;
    high[k] = Math.max(hi, o, c);
    low[k] = Math.min(lo, o, c);
    const ret = Math.abs(logs[k + 1] - logs[k]) / sigma;
    vol[k] = Math.round(s.volume * (0.5 + Math.abs(hash(m, s.seed + 13))) * (0.6 + 0.4 * Math.min(4, ret)));
  }
  return { m0, open, high, low, close, vol };
}

/** Agrega os minutos de um bloco nas velas do timeframe pedido. */
function aggregateBlock(b: MinuteBlock, tf: Timeframe, from: number, to: number, nowMin: number): Bar[] {
  const out: Bar[] = [];
  let t = alignTime(from, tf);
  while (t < to) {
    const end = nextBarTime(t, tf);
    const a = Math.max(Math.floor(t / 60), b.m0) - b.m0;
    const z = Math.min(Math.floor(end / 60), nowMin, b.m0 + b.open.length) - b.m0;
    if (t >= from && z > a) {
      let hi = -Infinity;
      let lo = Infinity;
      let v = 0;
      for (let k = a; k < z; k++) {
        if (b.high[k] > hi) hi = b.high[k];
        if (b.low[k] < lo) lo = b.low[k];
        v += b.vol[k];
      }
      out.push({ time: t, open: b.open[a], high: hi, low: lo, close: b.close[z - 1], volume: v });
    }
    t = end;
  }
  return out;
}

/** Vela corrente (incompleta) até agora, incluindo o minuto atual parcial. */
export function demoLiveBar(info: Pick<SymbolInfo, 'ticker' | 'precision'>, tf: Timeframe, now: number): Bar | null {
  const t = alignTime(now, tf);
  const m0 = Math.floor(t / 60);
  const mNow = Math.floor(now / 60);
  const full = mNow - m0;
  const p = round(demoPrice(info.ticker, now), info.precision);
  if (full <= 0) return { time: t, open: p, high: p, low: p, close: p, volume: 0 };
  const b = minuteBars(info, m0, full);
  const agg = aggregateBlock(b, tf, t, t + 1, mNow)[0];
  if (!agg) return null;
  return { ...agg, high: Math.max(agg.high, p), low: Math.min(agg.low, p), close: p };
}

const NATIVE: Timeframe[] = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m', '1h', '2h', '3h', '4h', '6h', '8h', '12h', '1D'].map(parseTf);
const MAX_MINUTES = 2_000_000;

export const demoProvider: Provider = {
  id: 'demo',
  maxPerRequest: 1500,

  nativeTfs() {
    return NATIVE;
  },

  earliest() {
    return DEMO_START;
  },

  async fetch(symbol: SymbolInfo, tf: Timeframe, args: FetchArgs): Promise<Bar[]> {
    const nowMin = Math.floor(nowSec() / 60);
    const to = Math.min(args.to, (nowMin + 1) * 60);
    let from: number;
    if (args.from !== undefined) {
      const f = Math.max(args.from, DEMO_START);
      from = alignTime(f, tf) < f ? nextBarTime(alignTime(f, tf), tf) : f;
    } else {
      let t = alignTime(to - 1, tf);
      for (let i = 1; i < args.limit && t > DEMO_START; i++) t = alignTime(t - 1, tf);
      from = Math.max(alignTime(t, tf), alignTime(DEMO_START, tf));
    }
    if (to <= from) return [];
    const out: Bar[] = [];
    // blocos de no máximo ~2M minutos (memória e fluidez)
    const perBar = Math.max(1, Math.round(tfSeconds(tf) / 60));
    const chunkBars = Math.max(1, Math.floor(MAX_MINUTES / perBar));
    let s = from;
    while (s < to) {
      let e = s;
      for (let i = 0; i < chunkBars && e < to; i++) e = nextBarTime(alignTime(e, tf), tf);
      const m0 = Math.floor(s / 60);
      const m1 = Math.min(Math.floor(e / 60), nowMin);
      if (m1 > m0) out.push(...aggregateBlock(minuteBars(symbol, m0, m1 - m0), tf, s, Math.min(e, to), nowMin));
      s = e;
      if (s < to) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 20));
    return args.from === undefined ? out.slice(-args.limit) : out;
  },

  subscribe(symbol, tf, onBar) {
    const emit = () => {
      const b = demoLiveBar(symbol, tf, nowSec());
      if (b) onBar(b);
    };
    emit();
    const timer = setInterval(emit, 1000);
    return () => clearInterval(timer);
  },

  subscribeQuote(symbol, onQuote: (q: Quote) => void) {
    const emit = () => {
      const now = nowSec();
      const price = demoPrice(symbol.ticker, now);
      const open = demoPrice(symbol.ticker, alignTime(now, '1D'));
      onQuote({ price: round(price, symbol.precision), changePct: ((price - open) / open) * 100, time: now });
    };
    emit();
    const timer = setInterval(emit, 1000);
    return () => clearInterval(timer);
  },
};

export { minuteBars as _minuteBars };
