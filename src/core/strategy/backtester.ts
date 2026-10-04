import { lowerBound } from '../bars';
import {
  closePosition,
  marketFillPrice,
  newAccount,
  openPosition,
  placeOrder,
  processBar,
  qtyForRisk,
  unrealized,
  type Fill,
  type Side,
} from '../trading/engine';
import { computeStats, type EquityPoint } from '../trading/stats';
import { toSpec, type BacktestInput, type BacktestResult, type EntryOptions, type PositionInfo, type StrategyApi, type StrategyProgram } from './types';

type Action =
  | { kind: 'entry'; id: string; side: Side; opts: EntryOptions }
  | { kind: 'close'; id?: string; comment?: string };

const dirOf = (s: Side) => (s === 'long' ? 1 : -1);

/** Executa uma estratégia barra a barra (ordens geradas numa barra executam na abertura da seguinte). */
export function runBacktest(program: StrategyProgram, input: BacktestInput): BacktestResult {
  const { bars, symbolId, settings } = input;
  const spec = toSpec(input.spec);
  const acc = newAccount(settings.initialCapital);
  const fills: Fill[] = [];
  const equity: EquityPoint[] = [];
  const entryBarOf = new Map<string, number>();
  let actions: Action[] = [];
  let i = 0;

  const startIdx = settings.startTime ? lowerBound(bars, settings.startTime) : 0;
  const endIdx = settings.endTime ? lowerBound(bars, settings.endTime) : bars.length;
  const step = Math.max(1, Math.ceil((endIdx - startIdx) / 3000));

  const equityNow = (price: number) => acc.balance + acc.positions.reduce((a, p) => a + unrealized(p, price, spec), 0);

  const qtyFor = (price: number, sl: number | undefined, opts: EntryOptions): number => {
    if (opts.qty && opts.qty > 0) return opts.qty;
    const eq = Math.max(0, equityNow(price));
    const notionalPerLot = price * spec.contractSize * spec.toAccount(price);
    const rule = settings.sizing;
    if (rule.mode === 'fixed') return rule.value;
    if (rule.mode === 'riskPct' && sl !== undefined && Math.abs(price - sl) > 0) {
      return qtyForRisk((eq * rule.value) / 100, price, sl, spec);
    }
    const pct = rule.mode === 'equityPct' ? rule.value : 100;
    return notionalPerLot > 0 ? (eq * pct) / 100 / notionalPerLot : 0;
  };

  const positionInfo = (): PositionInfo => {
    let size = 0;
    let notional = 0;
    let qty = 0;
    let first = Infinity;
    for (const p of acc.positions) {
      size += dirOf(p.side) * p.qty;
      notional += p.entryPrice * p.qty;
      qty += p.qty;
      first = Math.min(first, entryBarOf.get(p.id) ?? i);
    }
    return {
      size,
      side: size > 0 ? 'long' : size < 0 ? 'short' : null,
      avgPrice: qty ? notional / qty : 0,
      openTrades: acc.positions.length,
      barsInTrade: acc.positions.length ? i - first : 0,
    };
  };

  const api: StrategyApi = {
    entry(id, side, opts = {}) {
      actions.push({ kind: 'entry', id, side, opts });
    },
    exit(id, opts) {
      for (const p of acc.positions) {
        if (p.label !== id) continue;
        if (opts.sl !== undefined) p.sl = opts.sl;
        if (opts.tp !== undefined) p.tp = opts.tp;
        if (opts.trail !== undefined) p.trail = opts.trail;
      }
    },
    close(id, comment) {
      actions.push({ kind: 'close', id, comment });
    },
    closeAll(comment) {
      actions.push({ kind: 'close', comment });
    },
    cancel(id) {
      acc.orders = acc.orders.filter((o) => o.label !== id);
    },
    get position() {
      return positionInfo();
    },
    get equity() {
      return equityNow(bars[i]?.close ?? 0);
    },
    get balance() {
      return acc.balance;
    },
  };

  const executeAt = (price: number, time: number) => {
    const todo = actions;
    actions = [];
    // primeiro as saídas
    for (const a of todo) {
      if (a.kind !== 'close') continue;
      for (const p of acc.positions.slice()) {
        if (a.id && p.label !== a.id) continue;
        const f = closePosition(acc, p.id, marketFillPrice(p.side === 'long' ? 'short' : 'long', price, spec), time, 'signal', spec);
        if (f) fills.push(f);
      }
      if (!a.id) acc.orders = [];
    }
    for (const a of todo) {
      if (a.kind !== 'entry') continue;
      // inverter: fecha posições do lado oposto
      for (const p of acc.positions.slice()) {
        if (p.side !== a.side) {
          const f = closePosition(acc, p.id, marketFillPrice(p.side === 'long' ? 'short' : 'long', price, spec), time, 'reverse', spec);
          if (f) fills.push(f);
        }
      }
      const same = acc.positions.filter((p) => p.side === a.side);
      if (same.some((p) => p.label === a.id) || same.length >= settings.pyramiding) continue;
      const fill = marketFillPrice(a.side, price, spec);
      const d = dirOf(a.side);
      const sl = a.opts.slDist !== undefined ? fill - d * a.opts.slDist : a.opts.sl;
      const tp = a.opts.tpDist !== undefined ? fill + d * a.opts.tpDist : a.opts.tp;
      const qty = qtyFor(fill, sl, a.opts);
      if (!(qty > 0)) continue;
      const f = openPosition(acc, { symbolId, side: a.side, qty, price: fill, time, sl, tp, trail: a.opts.trail, label: a.id }, spec);
      entryBarOf.set(f.positionId, i);
      fills.push(f);
    }
  };

  /** Ordens limite/stop pedidas no onBar ficam pendentes a partir da barra seguinte. */
  const placePending = (mid: number, time: number) => {
    const keep: Action[] = [];
    for (const a of actions) {
      if (a.kind === 'entry' && (a.opts.limit !== undefined || a.opts.stop !== undefined)) {
        const price = (a.opts.limit ?? a.opts.stop) as number;
        const type = a.opts.limit !== undefined ? 'limit' : 'stop';
        const same = acc.positions.filter((p) => p.side === a.side);
        if (same.length >= settings.pyramiding) continue;
        acc.orders = acc.orders.filter((o) => o.label !== a.id);
        const d = dirOf(a.side);
        const sl = a.opts.slDist !== undefined ? price - d * a.opts.slDist : a.opts.sl;
        const tp = a.opts.tpDist !== undefined ? price + d * a.opts.tpDist : a.opts.tp;
        const qty = qtyFor(price, sl, a.opts);
        const marketable = type === 'limit' ? (a.side === 'long' ? mid <= price : mid >= price) : a.side === 'long' ? mid >= price : mid <= price;
        if (marketable) {
          keep.push({ kind: 'entry', id: a.id, side: a.side, opts: { ...a.opts, limit: undefined, stop: undefined, qty } });
          continue;
        }
        placeOrder(acc, { symbolId, side: a.side, type, qty, price, sl, tp, trail: a.opts.trail, label: a.id }, mid, time, spec);
      } else keep.push(a);
    }
    actions = keep;
  };

  for (i = 0; i < endIdx; i++) {
    const bar = bars[i];
    if (i > 0 && actions.length) executeAt(bar.open, bar.time);
    const before = acc.positions.map((p) => p.id);
    const fs = processBar(acc, symbolId, bar, spec);
    for (const f of fs) {
      fills.push(f);
      if (f.kind === 'entry' && !before.includes(f.positionId)) entryBarOf.set(f.positionId, i);
    }
    if (i >= startIdx) {
      if ((i - startIdx) % step === 0 || i === endIdx - 1) equity.push({ time: bar.time, value: equityNow(bar.close) });
      program.onBar(i, api);
      placePending(bar.close, bar.time);
    }
  }

  const last = bars[Math.max(0, endIdx - 1)];
  if (settings.closeAtEnd && last) {
    for (const p of acc.positions.slice()) {
      const f = closePosition(acc, p.id, last.close, last.time, 'end', spec);
      if (f) fills.push(f);
    }
    acc.orders = [];
    if (equity.length) equity[equity.length - 1] = { time: last.time, value: acc.balance };
  }

  const first = bars[startIdx];
  const stats = computeStats(acc.trades, settings.initialCapital, equity);
  return {
    trades: acc.trades,
    fills,
    equity,
    stats,
    buyHoldPct: first && last ? ((last.close - first.open) / first.open) * 100 : 0,
    bars: Math.max(0, endIdx - startIdx),
    from: first?.time ?? 0,
    to: last?.time ?? 0,
    openPositions: acc.positions.length,
  };
}
