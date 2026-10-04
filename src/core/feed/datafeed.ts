import type { Bar, ProviderId, SymbolInfo } from '../types';
import { aggregate, combine, lowerBound } from '../bars';
import { alignTime, divides, nextBarTime, parseTf, tfSeconds, tfToString, type Timeframe } from '../timeframes';
import { BarStore } from './store';
import type { Provider, Quote } from './provider';
import { nowSec } from './provider';
import { binanceProvider } from './binance';
import { derivProvider } from './deriv';
import { yahooProvider } from './yahoo';
import { demoProvider } from './demo';

export interface HistoryResult {
  bars: Bar[];
  /** Não há mais dados para trás. */
  startReached: boolean;
}

type TfLike = Timeframe | string;
const asTf = (tf: TfLike): Timeframe => (typeof tf === 'string' ? parseTf(tf) : tf);

/** Fim da barra (meses têm duração variável; barras desalinhadas, ex. Yahoo 13:30, usam a duração). */
export function barEnd(time: number, tf: TfLike): number {
  const t = asTf(tf);
  return t.unit === 'M' || t.unit === 'W' ? nextBarTime(time, t) : time + tfSeconds(t);
}

export class DataFeed {
  private stores = new Map<string, BarStore>();
  private liveSubs = new Map<string, { listeners: Set<(bar: Bar) => void>; unsub: () => void }>();

  constructor(private readonly providers: Record<ProviderId, Provider>) {}

  provider(sym: SymbolInfo): Provider {
    return this.providers[sym.provider];
  }

  /** Maior timeframe nativo que divide `tf` (o próprio `tf`, se for nativo). */
  nativeTf(sym: SymbolInfo, tf: TfLike): Timeframe {
    const t = asTf(tf);
    const natives = this.provider(sym).nativeTfs(sym);
    let best: Timeframe | null = null;
    for (const n of natives) {
      if (n.unit === t.unit && n.n === t.n) return n;
      if (divides(n, t) && (!best || tfSeconds(n) > tfSeconds(best))) best = n;
    }
    return best ?? natives[0];
  }

  /** Timeframes nativos mais finos que `tf`, do maior para o menor. */
  finerNatives(sym: SymbolInfo, tf: TfLike): Timeframe[] {
    const t = asTf(tf);
    return this.provider(sym)
      .nativeTfs(sym)
      .filter((n) => tfSeconds(n) < tfSeconds(t) && divides(n, t))
      .sort((a, b) => tfSeconds(b) - tfSeconds(a));
  }

  store(sym: SymbolInfo, native: Timeframe): BarStore {
    const key = `${sym.id}|${tfToString(native)}`;
    let s = this.stores.get(key);
    if (!s) {
      s = new BarStore(this.provider(sym), sym, native);
      this.stores.set(key, s);
    }
    return s;
  }

  private ratio(native: Timeframe, tf: Timeframe): number {
    if (tf.unit === 'M') return Math.ceil((31 * tf.n * 86400) / tfSeconds(native));
    return Math.max(1, Math.round(tfSeconds(tf) / tfSeconds(native)));
  }

  private aggregated(native: Timeframe, tf: Timeframe, bars: Bar[]): Bar[] {
    if (native.unit === tf.unit && native.n === tf.n) return bars;
    return aggregate(bars, tf);
  }

  /** Até `count` barras de `tf` com time < to. */
  async history(sym: SymbolInfo, tfIn: TfLike, to: number, count: number): Promise<HistoryResult> {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    const store = this.store(sym, native);
    const ratio = this.ratio(native, tf);
    const nativeCount = Math.min(60000, count * ratio + ratio);
    await store.ensureBefore(to, nativeCount);
    const slice = store.lastBefore(to, nativeCount);
    let bars = this.aggregated(native, tf, slice);
    const startReached = store.startReached && slice.length > 0 && slice[0].time === store.bars[0]?.time;
    if (ratio > 1 && !startReached && bars.length > 1) bars = bars.slice(1); // 1º grupo pode estar incompleto
    return { bars: bars.slice(-count), startReached };
  }

  /** Barras de `tf` com abertura em [from, to). */
  async range(sym: SymbolInfo, tfIn: TfLike, from: number, to: number): Promise<Bar[]> {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    const store = this.store(sym, native);
    const start = alignTime(from, tf);
    await store.ensureRange(start, Math.min(to, nowSec() + tfSeconds(native)));
    return this.aggregated(native, tf, store.slice(start, to));
  }

  /** Versão síncrona: devolve null se ainda não estiver em cache. */
  peekRange(sym: SymbolInfo, tfIn: TfLike, from: number, to: number): Bar[] | null {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    const store = this.store(sym, native);
    const start = alignTime(from, tf);
    const capTo = Math.min(to, alignTime(nowSec(), native));
    if (!store.isCovered(start, capTo)) return null;
    return this.aggregated(native, tf, store.slice(start, to));
  }

  isCovered(sym: SymbolInfo, tfIn: TfLike, from: number, to: number): boolean {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    return this.store(sym, native).isCovered(alignTime(from, tf), Math.min(to, alignTime(nowSec(), native)));
  }

  /**
   * Decompõe [open, cursor) em segmentos de timeframes nativos cada vez mais finos
   * (ex.: semana até quarta 10:37 = dias seg–ter + 8h + 2h + 30m + 5m + 1m).
   */
  private decompose(sym: SymbolInfo, tf: Timeframe, open: number, cursor: number): { f: Timeframe; from: number; to: number; parent: Timeframe }[] | null {
    const segs: { f: Timeframe; from: number; to: number; parent: Timeframe }[] = [];
    let curTf = tf;
    let curOpen = open;
    let guard = 0;
    while (curOpen < cursor && guard++ < 20) {
      const f = this.finerNatives(sym, curTf)[0];
      if (!f) return segs.length ? segs : null;
      const mid = Math.max(curOpen, alignTime(cursor, f));
      if (mid > curOpen) segs.push({ f, from: curOpen, to: mid, parent: curTf });
      curOpen = mid;
      curTf = f;
    }
    return segs;
  }

  /**
   * Barra parcial de `tf` aberta em `open`, só com o que já aconteceu até `cursor`.
   * Síncrono: devolve null se os dados finos ainda não estiverem em cache.
   */
  peekPartial(sym: SymbolInfo, tfIn: TfLike, open: number, cursor: number): Bar | null {
    if (cursor <= open) return null;
    const segs = this.decompose(sym, asTf(tfIn), open, cursor);
    if (!segs || !segs.length) return null;
    const parts: Bar[] = [];
    for (const seg of segs) {
      const store = this.store(sym, seg.f);
      if (!store.isCovered(seg.from, Math.min(seg.to, alignTime(nowSec(), seg.f)))) return null;
      for (const b of store.slice(seg.from, seg.to)) if (barEnd(b.time, seg.f) <= cursor) parts.push(b);
    }
    return combine(parts, open);
  }

  /** Carrega (com folga para os passos seguintes) os dados finos para barras parciais. */
  async preparePartial(sym: SymbolInfo, tfIn: TfLike, open: number, cursor: number): Promise<void> {
    if (cursor <= open) return;
    const segs = this.decompose(sym, asTf(tfIn), open, cursor);
    if (!segs) return;
    const now = nowSec();
    for (const seg of segs) {
      const fs = tfSeconds(seg.f);
      const store = this.store(sym, seg.f);
      const span = Math.max(barEnd(seg.from, seg.parent) - seg.from, 400 * fs);
      const to = Math.min(seg.from + span, now + fs);
      try {
        await store.ensureRange(seg.from, Math.max(to, seg.to));
      } catch {
        /* sem dados finos: a barra parcial fica aproximada */
      }
    }
  }

  /** Barras mais finas em cache dentro de [from, to) (para executar ordens com precisão). */
  peekFinest(sym: SymbolInfo, from: number, to: number, maxTf?: TfLike): Bar[] | null {
    const natives = this.provider(sym)
      .nativeTfs(sym)
      .filter((n) => n.unit !== 'M' && n.unit !== 'W' && (!maxTf || tfSeconds(n) <= tfSeconds(asTf(maxTf))))
      .sort((a, b) => tfSeconds(a) - tfSeconds(b));
    for (const f of natives) {
      const store = this.store(sym, f);
      if (store.isCovered(alignTime(from, f), Math.min(to, alignTime(nowSec(), f)))) {
        return store.slice(from, to).filter((b) => barEnd(b.time, f) <= to);
      }
    }
    return null;
  }

  /** Atualizações em tempo real da última barra de `tf`. */
  subscribe(sym: SymbolInfo, tfIn: TfLike, cb: (bar: Bar) => void): () => void {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    const store = this.store(sym, native);
    const key = `${sym.id}|${tfToString(native)}`;
    const listener = (nb: Bar) => {
      const open = alignTime(nb.time, tf);
      if (native.unit === tf.unit && native.n === tf.n) {
        cb(nb);
        return;
      }
      const group = store.slice(open, barEnd(open, tf));
      const agg = combine(group, open);
      if (agg) cb(agg);
    };
    let entry = this.liveSubs.get(key);
    if (!entry) {
      const provider = this.provider(sym);
      const listeners = new Set<(bar: Bar) => void>();
      const unsub = provider.subscribe
        ? provider.subscribe(
            sym,
            native,
            (bar) => {
              store.upsert(bar);
              listeners.forEach((l) => l(bar));
            },
            store.bars[store.bars.length - 1],
          )
        : () => undefined;
      entry = { listeners, unsub };
      this.liveSubs.set(key, entry);
    }
    entry.listeners.add(listener);
    return () => {
      const e = this.liveSubs.get(key);
      if (!e) return;
      e.listeners.delete(listener);
      if (!e.listeners.size) {
        e.unsub();
        this.liveSubs.delete(key);
      }
    };
  }

  subscribeQuote(sym: SymbolInfo, cb: (q: Quote) => void): () => void {
    const p = this.provider(sym);
    return p.subscribeQuote ? p.subscribeQuote(sym, cb) : () => undefined;
  }

  /** Primeira barra disponível (para "primeira data" no replay). */
  async firstBarTime(sym: SymbolInfo, tfIn: TfLike): Promise<number | null> {
    const tf = asTf(tfIn);
    const native = this.nativeTf(sym, tf);
    const store = this.store(sym, native);
    if (store.startReached && store.bars.length) return store.bars[0].time;
    return null;
  }

  /** Remove caches (ex.: ao terminar sessão). */
  clear() {
    this.stores.clear();
  }

  /** Índice auxiliar exportado para testes. */
  static lowerBound = lowerBound;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  binance: binanceProvider,
  deriv: derivProvider,
  yahoo: yahooProvider,
  demo: demoProvider,
};

let feed: DataFeed | null = null;
export function dataFeed(): DataFeed {
  if (!feed) feed = new DataFeed(PROVIDERS);
  return feed;
}
