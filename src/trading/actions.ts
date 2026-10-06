'use client';
import { allCharts } from '@/chart/registry';
import { cloneAccount, closePosition, placeOrder, processBar, type Fill, type OrderType, type Side } from '@/core/trading/engine';
import { useTrading, specFor } from '@/store/trading';
import { replay, useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { dataFeed } from '@/core/feed/datafeed';
import { nowSec } from '@/core/feed/provider';
import { toast } from '@/components/ui/Toast';
import { fmtMoney, fmtPrice } from '@/lib/format';
import { playSound } from '@/lib/sound';
import type { TradeAction } from '@/chart/interaction';
import { fmtLotWith, snapLot } from '@/core/trading/lots';
import { ruleFor } from './lotRule';

/** Ações de trading que funcionam tanto no replay como em tempo real (conta demo). */

export function tradingMode(): 'replay' | 'live' {
  const r = useReplay.getState();
  return r.active && !r.selecting && r.cursor !== null ? 'replay' : 'live';
}

const livePrices: Record<string, number> = {};

export function setLivePrice(symbolId: string, price: number) {
  livePrices[symbolId] = price;
}

export function currentPrice(symbolId: string): number | undefined {
  const p = tradingMode() === 'replay' ? useReplay.getState().prices[symbolId] : livePrices[symbolId];
  if (p !== undefined) return p;
  // ainda sem cotação: o último fecho de um gráfico aberto com o símbolo
  for (const [, c] of allCharts()) if (c.symbol?.id === symbolId && c.bars.length) return c.bars[c.bars.length - 1].close;
  return undefined;
}

export function currentTime(): number {
  return tradingMode() === 'replay' ? (useReplay.getState().cursor ?? nowSec()) : nowSec();
}

export function notifyFills(fills: Fill[]) {
  for (const f of fills) {
    const sym = resolveSymbol(f.symbolId);
    if (f.kind === 'entry') {
      toast(`${f.side === 'long' ? 'Compra' : 'Venda'} executada · ${sym.name}`, { kind: 'success', body: `${+f.qty.toFixed(4)} @ ${fmtPrice(f.price, sym.precision)}` });
    } else {
      const why = f.reason === 'tp' ? 'Take profit' : f.reason === 'sl' ? 'Stop loss' : f.reason === 'trail' ? 'Trailing stop' : 'Posição fechada';
      toast(`${why} · ${sym.name}`, { kind: (f.pnl ?? 0) >= 0 ? 'success' : 'error', body: `${fmtPrice(f.price, sym.precision)} · ${fmtMoney(f.pnl)}` });
    }
  }
  if (fills.length) playSound(fills.some((f) => f.kind === 'exit' && (f.pnl ?? 0) < 0) ? 'loss' : 'fill');
}

export function submitOrder(order: { symbolId: string; side: Side; type: OrderType; qty: number; price?: number; sl?: number; tp?: number; trail?: number }): boolean {
  const mode = tradingMode();
  if (!(order.qty > 0)) {
    toast('Quantidade inválida', { kind: 'error' });
    return false;
  }
  // o lote tem de respeitar o mínimo, o passo e o máximo do tipo de mercado
  const rule = ruleFor(order.symbolId);
  const qty = snapLot(order.qty, rule);
  const o = { ...order, qty };
  if (qty !== order.qty) toast(`Lote ajustado para ${fmtLotWith(qty, rule)}`, { kind: 'info', body: `Mínimo ${fmtLotWith(rule.min, rule)}, passo ${fmtLotWith(rule.step, rule)}, máximo ${fmtLotWith(rule.max, rule)} neste mercado.` });
  if (mode === 'replay') {
    const r = replay.placeOrder(o);
    if (!r.ok) toast(r.message ?? 'Não foi possível enviar a ordem', { kind: 'error' });
    else if (o.type !== 'market') toast('Ordem pendente colocada', { kind: 'info' });
    return r.ok;
  }
  const price = livePrices[o.symbolId];
  if (price === undefined) {
    toast('Ainda sem preço em tempo real para este símbolo', { kind: 'error' });
    return false;
  }
  const tr = useTrading.getState();
  const acc = cloneAccount(tr.live);
  const res = placeOrder(acc, o, price, nowSec(), specFor(resolveSymbol(o.symbolId)));
  tr.setAccount('live', acc);
  if (res.fill) {
    tr.addExecs('live', [res.fill]);
    notifyFills([res.fill]);
  } else if (res.order) toast('Ordem pendente colocada', { kind: 'info' });
  ensureLiveWatch();
  return true;
}

export function applyTradeAction(a: TradeAction) {
  const mode = tradingMode();
  const tr = useTrading.getState();
  const acc = cloneAccount(tr[mode]);
  if (a.type === 'close-position') {
    const p = acc.positions.find((x) => x.id === a.id);
    if (!p) return;
    const price = currentPrice(p.symbolId);
    if (price === undefined) {
      toast('Sem preço atual para fechar', { kind: 'error' });
      return;
    }
    const spec = specFor(resolveSymbol(p.symbolId));
    const exit = p.side === 'long' ? price - spec.spread / 2 : price + spec.spread / 2;
    const f = closePosition(acc, p.id, exit, currentTime(), 'manual', spec);
    tr.setAccount(mode, acc);
    if (f) {
      tr.addExecs(mode, [f]);
      notifyFills([f]);
    }
    return;
  }
  if (a.type === 'cancel-order') {
    acc.orders = acc.orders.filter((o) => o.id !== a.id);
    tr.setAccount(mode, acc);
    return;
  }
  if (a.type === 'modify-order') {
    const o = acc.orders.find((x) => x.id === a.id);
    if (!o) return;
    const long = o.side === 'long';
    const price = a.price ?? o.price;
    // o stop fica do lado da perda e o alvo do lado do ganho, em relação à entrada da ordem
    if (a.sl !== undefined && a.sl !== null && (long ? a.sl >= price : a.sl <= price)) {
      toast('O stop tem de ficar do lado da perda', { kind: 'error' });
      return;
    }
    if (a.tp !== undefined && a.tp !== null && (long ? a.tp <= price : a.tp >= price)) {
      toast('O alvo tem de ficar do lado do ganho', { kind: 'error' });
      return;
    }
    acc.orders = acc.orders.map((x) =>
      x.id === a.id
        ? { ...x, price, sl: a.sl === undefined ? x.sl : a.sl === null ? undefined : a.sl, tp: a.tp === undefined ? x.tp : a.tp === null ? undefined : a.tp }
        : x,
    );
    tr.setAccount(mode, acc);
    return;
  }
  if (a.type === 'modify-position') {
    const p = acc.positions.find((x) => x.id === a.id);
    if (!p) return;
    const price = currentPrice(p.symbolId) ?? p.entryPrice;
    const long = p.side === 'long';
    if (a.sl !== undefined) {
      if (a.sl === null) p.sl = undefined;
      else if (long ? a.sl >= price : a.sl <= price) {
        toast('O stop tem de ficar do outro lado do preço atual', { kind: 'warning' });
        return;
      } else p.sl = a.sl;
      if (p.initialSl === undefined && p.sl !== undefined) p.initialSl = p.sl;
    }
    if (a.tp !== undefined) {
      if (a.tp === null) p.tp = undefined;
      else if (long ? a.tp <= price : a.tp >= price) {
        toast('O alvo tem de ficar do lado do lucro', { kind: 'warning' });
        return;
      } else p.tp = a.tp;
    }
    tr.setAccount(mode, acc);
  }
}

export function closeAll(symbolId?: string) {
  const mode = tradingMode();
  const tr = useTrading.getState();
  for (const p of tr[mode].positions) if (!symbolId || p.symbolId === symbolId) applyTradeAction({ type: 'close-position', id: p.id });
}

export function moveToBreakEven(id: string) {
  const mode = tradingMode();
  const p = useTrading.getState()[mode].positions.find((x) => x.id === id);
  if (p) applyTradeAction({ type: 'modify-position', id, sl: p.entryPrice });
}

// ---------------- execução em tempo real (conta demo) ----------------

const liveSubs = new Map<string, () => void>();
let watching = false;
let syncing = false;

function processLive(symbolId: string, price: number, time: number) {
  const prev = livePrices[symbolId];
  livePrices[symbolId] = price;
  if (prev === undefined || tradingMode() !== 'live') return;
  const tr = useTrading.getState();
  const acc = tr.live;
  if (!acc.positions.some((p) => p.symbolId === symbolId) && !acc.orders.some((o) => o.symbolId === symbolId)) return;
  const next = cloneAccount(acc);
  const fills = processBar(next, symbolId, { time, open: prev, high: Math.max(prev, price), low: Math.min(prev, price), close: price }, specFor(resolveSymbol(symbolId)));
  if (fills.length || next.positions.length) tr.setAccount('live', next, fills.length > 0);
  if (fills.length) {
    tr.addExecs('live', fills);
    notifyFills(fills);
  }
}

/** Acompanha em tempo real os símbolos com posições/ordens na conta demo. */
export function ensureLiveWatch() {
  if (syncing) return;
  syncing = true;
  try {
    syncLiveWatch();
  } finally {
    syncing = false;
  }
}

function syncLiveWatch() {
  const acc = useTrading.getState().live;
  const wanted = new Set([...acc.positions.map((p) => p.symbolId), ...acc.orders.map((o) => o.symbolId)]);
  for (const [id, unsub] of liveSubs) {
    if (!wanted.has(id)) {
      unsub();
      liveSubs.delete(id);
    }
  }
  for (const id of wanted) {
    if (liveSubs.has(id)) continue;
    // marca antes de subscrever: a primeira cotação pode chegar de imediato
    let unsub: () => void = () => undefined;
    liveSubs.set(id, () => unsub());
    unsub = dataFeed().subscribeQuote(resolveSymbol(id), (q) => processLive(id, q.price, q.time));
  }
  if (!watching) {
    watching = true;
    useTrading.subscribe(() => {
      const a = useTrading.getState().live;
      const ids = new Set([...a.positions.map((p) => p.symbolId), ...a.orders.map((o) => o.symbolId)]);
      if (ids.size !== liveSubs.size || [...ids].some((i) => !liveSubs.has(i))) ensureLiveWatch();
    });
  }
}
