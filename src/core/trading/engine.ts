import type { Bar } from '../types';

/**
 * Corretora simulada: ordens a mercado/limite/stop, SL/TP, trailing stop,
 * execução dentro da barra com o caminho open → extremo mais próximo → outro extremo → close
 * (a mesma heurística do emulador do TradingView).
 */

export type Side = 'long' | 'short';
export type OrderType = 'market' | 'limit' | 'stop';
export type ExitReason = 'sl' | 'tp' | 'manual' | 'signal' | 'reverse' | 'trail' | 'time' | 'end';

export interface ContractSpec {
  /** Unidades por lote. */
  contractSize: number;
  /** Converte lucro na moeda de cotação para a moeda da conta. */
  toAccount: (price: number) => number;
  /** Spread em unidades de preço (aplicado metade em cada lado). */
  spread: number;
  /** Deslizamento em unidades de preço contra o trader nas ordens a mercado/stop. */
  slippage: number;
  commission: { type: 'none' | 'percent' | 'perLot'; value: number };
}

export interface Order {
  id: string;
  symbolId: string;
  side: Side;
  type: Exclude<OrderType, 'market'>;
  qty: number;
  price: number;
  sl?: number;
  tp?: number;
  trail?: number;
  createdAt: number;
  label?: string;
}

export interface Position {
  id: string;
  symbolId: string;
  side: Side;
  qty: number;
  entryPrice: number;
  entryTime: number;
  sl?: number;
  tp?: number;
  initialSl?: number;
  /** Distância do trailing stop (unidades de preço). */
  trail?: number;
  /** Melhor preço desde a entrada (para trailing). */
  peak: number;
  commission: number;
  label?: string;
  mae: number;
  mfe: number;
}

export interface Trade {
  id: string;
  symbolId: string;
  side: Side;
  qty: number;
  entryPrice: number;
  entryTime: number;
  exitPrice: number;
  exitTime: number;
  grossPnl: number;
  commission: number;
  pnl: number;
  /** Lucro em múltiplos do risco inicial (se havia SL). */
  r?: number;
  exitReason: ExitReason;
  label?: string;
  mae: number;
  mfe: number;
  notes?: string;
  tags?: string[];
  screenshot?: string;
}

export interface Account {
  initial: number;
  balance: number;
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  equity: { time: number; value: number }[];
  seq: number;
}

export interface Fill {
  kind: 'entry' | 'exit';
  positionId: string;
  symbolId: string;
  side: Side;
  price: number;
  time: number;
  qty: number;
  reason?: ExitReason;
  pnl?: number;
}

export function newAccount(initial: number): Account {
  return { initial, balance: initial, positions: [], orders: [], trades: [], equity: [], seq: 1 };
}

export function cloneAccount(a: Account): Account {
  return {
    ...a,
    positions: a.positions.map((p) => ({ ...p })),
    orders: a.orders.map((o) => ({ ...o })),
    trades: a.trades.slice(),
    equity: a.equity.slice(),
  };
}

const dir = (s: Side) => (s === 'long' ? 1 : -1);

export function commissionFor(spec: ContractSpec, qty: number, price: number): number {
  const c = spec.commission;
  if (c.type === 'percent') return (Math.abs(qty) * spec.contractSize * price * spec.toAccount(price) * c.value) / 100;
  if (c.type === 'perLot') return Math.abs(qty) * c.value;
  return 0;
}

export function pnlFor(side: Side, qty: number, entry: number, exit: number, spec: ContractSpec): number {
  return (exit - entry) * dir(side) * qty * spec.contractSize * spec.toAccount(exit);
}

export function unrealized(p: Position, price: number, spec: ContractSpec): number {
  return pnlFor(p.side, p.qty, p.entryPrice, price, spec);
}

/** Preço de execução de uma ordem a mercado com spread e deslizamento. */
export function marketFillPrice(side: Side, mid: number, spec: ContractSpec): number {
  return mid + dir(side) * (spec.spread / 2 + spec.slippage);
}

/** Quantidade (lotes) para arriscar `riskAmount` com stop em `stop`. */
export function qtyForRisk(riskAmount: number, entry: number, stop: number, spec: ContractSpec): number {
  const perLot = Math.abs(entry - stop) * spec.contractSize * spec.toAccount(entry);
  if (!(perLot > 0)) return 0;
  return riskAmount / perLot;
}

function nextId(acc: Account, prefix: string) {
  return `${prefix}${acc.seq++}`;
}

export function openPosition(
  acc: Account,
  args: { symbolId: string; side: Side; qty: number; price: number; time: number; sl?: number; tp?: number; trail?: number; label?: string },
  spec: ContractSpec,
): Fill {
  const commission = commissionFor(spec, args.qty, args.price);
  acc.balance -= commission;
  const pos: Position = {
    id: nextId(acc, 'P'),
    symbolId: args.symbolId,
    side: args.side,
    qty: args.qty,
    entryPrice: args.price,
    entryTime: args.time,
    sl: args.sl,
    tp: args.tp,
    initialSl: args.sl,
    trail: args.trail,
    peak: args.price,
    commission,
    label: args.label,
    mae: 0,
    mfe: 0,
  };
  if (pos.trail && pos.sl === undefined) {
    pos.sl = pos.entryPrice - dir(pos.side) * pos.trail;
    pos.initialSl = pos.sl;
  }
  acc.positions.push(pos);
  return { kind: 'entry', positionId: pos.id, symbolId: pos.symbolId, side: pos.side, price: pos.entryPrice, time: args.time, qty: pos.qty };
}

export function closePosition(acc: Account, posId: string, price: number, time: number, reason: ExitReason, spec: ContractSpec, qty?: number): Fill | null {
  const idx = acc.positions.findIndex((p) => p.id === posId);
  if (idx < 0) return null;
  const p = acc.positions[idx];
  const closeQty = qty !== undefined ? Math.min(qty, p.qty) : p.qty;
  const gross = pnlFor(p.side, closeQty, p.entryPrice, price, spec);
  const exitComm = commissionFor(spec, closeQty, price);
  const entryCommShare = p.commission * (closeQty / p.qty);
  acc.balance += gross - exitComm;
  const risk = p.initialSl !== undefined ? Math.abs(p.entryPrice - p.initialSl) : 0;
  const trade: Trade = {
    id: nextId(acc, 'T'),
    symbolId: p.symbolId,
    side: p.side,
    qty: closeQty,
    entryPrice: p.entryPrice,
    entryTime: p.entryTime,
    exitPrice: price,
    exitTime: time,
    grossPnl: gross,
    commission: entryCommShare + exitComm,
    pnl: gross - exitComm - entryCommShare,
    r: risk > 0 ? ((price - p.entryPrice) * dir(p.side)) / risk : undefined,
    exitReason: reason,
    label: p.label,
    mae: p.mae,
    mfe: p.mfe,
  };
  acc.trades.push(trade);
  if (closeQty >= p.qty - 1e-12) acc.positions.splice(idx, 1);
  else {
    p.qty -= closeQty;
    p.commission -= entryCommShare;
  }
  return { kind: 'exit', positionId: p.id, symbolId: p.symbolId, side: p.side, price, time, qty: closeQty, reason, pnl: trade.pnl };
}

/** Coloca uma ordem. Ordens a mercado (ou limite/stop já atingidos) executam ao preço atual. */
export function placeOrder(
  acc: Account,
  o: { symbolId: string; side: Side; type: OrderType; qty: number; price?: number; sl?: number; tp?: number; trail?: number; label?: string },
  mid: number,
  time: number,
  spec: ContractSpec,
): { fill?: Fill; order?: Order } {
  if (!(o.qty > 0)) return {};
  const marketable =
    o.type === 'market' ||
    o.price === undefined ||
    (o.type === 'limit' && (o.side === 'long' ? mid <= o.price : mid >= o.price)) ||
    (o.type === 'stop' && (o.side === 'long' ? mid >= o.price : mid <= o.price));
  if (marketable) {
    const price = marketFillPrice(o.side, mid, spec);
    return { fill: openPosition(acc, { symbolId: o.symbolId, side: o.side, qty: o.qty, price, time, sl: o.sl, tp: o.tp, trail: o.trail, label: o.label }, spec) };
  }
  const order: Order = {
    id: nextId(acc, 'O'),
    symbolId: o.symbolId,
    side: o.side,
    type: o.type as 'limit' | 'stop',
    qty: o.qty,
    price: o.price!,
    sl: o.sl,
    tp: o.tp,
    trail: o.trail,
    createdAt: time,
    label: o.label,
  };
  acc.orders.push(order);
  return { order };
}

export function cancelOrder(acc: Account, orderId: string): boolean {
  const n = acc.orders.length;
  acc.orders = acc.orders.filter((o) => o.id !== orderId);
  return acc.orders.length !== n;
}

// ---------------- simulação de preço dentro da barra ----------------

type Trigger =
  | { kind: 'order'; id: string; level: number; down: boolean }
  | { kind: 'sl' | 'tp'; id: string; level: number; down: boolean };

/** Nível atingido no segmento p0→p1? Devolve a fração do caminho (0 = gap na abertura). */
function hitAt(p0: number, p1: number, level: number, down: boolean): number | null {
  if (down) {
    if (p0 <= level) return 0;
    if (p1 <= level) return (p0 - level) / (p0 - p1);
  } else {
    if (p0 >= level) return 0;
    if (p1 >= level) return (level - p0) / (p1 - p0);
  }
  return null;
}

function triggersFor(acc: Account, symbolId: string): Trigger[] {
  const out: Trigger[] = [];
  for (const o of acc.orders) {
    if (o.symbolId !== symbolId) continue;
    // compra limite e venda stop disparam a descer; compra stop e venda limite a subir
    const down = (o.side === 'long' && o.type === 'limit') || (o.side === 'short' && o.type === 'stop');
    out.push({ kind: 'order', id: o.id, level: o.price, down });
  }
  for (const p of acc.positions) {
    if (p.symbolId !== symbolId) continue;
    if (p.sl !== undefined) out.push({ kind: 'sl', id: p.id, level: p.sl, down: p.side === 'long' });
    if (p.tp !== undefined) out.push({ kind: 'tp', id: p.id, level: p.tp, down: p.side === 'short' });
  }
  return out;
}

/** Caminho do preço dentro da barra. */
export function barPath(bar: Bar): number[] {
  const highFirst = Math.abs(bar.open - bar.high) < Math.abs(bar.open - bar.low);
  return highFirst ? [bar.open, bar.high, bar.low, bar.close] : [bar.open, bar.low, bar.high, bar.close];
}

function updateExcursions(acc: Account, symbolId: string, price: number) {
  for (const p of acc.positions) {
    if (p.symbolId !== symbolId) continue;
    const fav = (price - p.entryPrice) * dir(p.side);
    if (fav > p.mfe) p.mfe = fav;
    if (-fav > p.mae) p.mae = -fav;
    if (p.trail) {
      if ((price - p.peak) * dir(p.side) > 0) p.peak = price;
      const trailStop = p.peak - dir(p.side) * p.trail;
      if (p.sl === undefined || (trailStop - p.sl) * dir(p.side) > 0) p.sl = trailStop;
    }
  }
}

/**
 * Processa uma barra (de preferência fina, ex. 1m) para um símbolo:
 * dispara ordens pendentes, stops e alvos pela ordem em que acontecem.
 */
export function processBar(acc: Account, symbolId: string, bar: Bar, spec: ContractSpec): Fill[] {
  const fills: Fill[] = [];
  if (!acc.orders.some((o) => o.symbolId === symbolId) && !acc.positions.some((p) => p.symbolId === symbolId)) return fills;
  const path = barPath(bar);
  const time = bar.time;
  for (let s = 0; s < path.length - 1; s++) {
    let p0 = path[s];
    const p1 = path[s + 1];
    let guard = 0;
    while (guard++ < 50) {
      let best: { t: Trigger; frac: number } | null = null;
      for (const t of triggersFor(acc, symbolId)) {
        const frac = hitAt(p0, p1, t.level, t.down);
        if (frac === null) continue;
        // num gap as saídas têm prioridade sobre novas entradas
        const key = frac + (t.kind === 'order' ? 1e-9 : 0);
        if (!best || key < best.frac) best = { t, frac: key };
      }
      if (!best) break;
      const t = best.t;
      const gap = best.frac < 1e-6 && (t.down ? p0 < t.level : p0 > t.level);
      const fillAt = gap ? p0 : t.level;
      const fillTime = time;
      if (t.kind === 'order') {
        const o = acc.orders.find((x) => x.id === t.id)!;
        acc.orders = acc.orders.filter((x) => x.id !== t.id);
        const slip = o.type === 'stop' ? spec.slippage : 0;
        const price = fillAt + dir(o.side) * (spec.spread / 2 + slip);
        fills.push(openPosition(acc, { symbolId, side: o.side, qty: o.qty, price, time: fillTime, sl: o.sl, tp: o.tp, trail: o.trail, label: o.label }, spec));
      } else {
        const p = acc.positions.find((x) => x.id === t.id)!;
        const slip = t.kind === 'sl' ? spec.slippage : 0;
        const price = fillAt - dir(p.side) * (spec.spread / 2 + slip);
        const reason: ExitReason = t.kind === 'tp' ? 'tp' : p.trail && p.sl !== p.initialSl ? 'trail' : 'sl';
        const f = closePosition(acc, p.id, price, fillTime, reason, spec);
        if (f) fills.push(f);
      }
      p0 = fillAt;
      updateExcursions(acc, symbolId, p0);
    }
    updateExcursions(acc, symbolId, p1);
  }
  return fills;
}

export function equityAt(acc: Account, prices: Record<string, number>, specs: (symbolId: string) => ContractSpec): number {
  let eq = acc.balance;
  for (const p of acc.positions) {
    const px = prices[p.symbolId];
    if (px !== undefined) eq += unrealized(p, px, specs(p.symbolId));
  }
  return eq;
}
