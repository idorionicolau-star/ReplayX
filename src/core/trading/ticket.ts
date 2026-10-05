import type { OrderType, Side } from './engine';

/** Escada de lotes: 0,01 · 0,02 · 0,05 · 0,1 · 0,2 · 0,5 · 1 · 2 · 5 · 10 … (cada toque em + / − passa ao degrau seguinte). */
export const LOT_LADDER: number[] = (() => {
  const out: number[] = [];
  for (let k = -2; k <= 3; k++) for (const m of [1, 2, 5]) out.push(Number((m * Math.pow(10, k)).toPrecision(12)));
  out.push(10000);
  return out;
})();

/** Próximo (dir=1) ou anterior (dir=-1) degrau da escada de lotes. */
export function stepLot(q: number, dir: 1 | -1): number {
  const v = Number.isFinite(q) && q > 0 ? q : LOT_LADDER[0];
  if (dir === 1) return LOT_LADDER.find((x) => x > v * (1 + 1e-9)) ?? LOT_LADDER[LOT_LADDER.length - 1];
  for (let i = LOT_LADDER.length - 1; i >= 0; i--) if (LOT_LADDER[i] < v * (1 - 1e-9)) return LOT_LADDER[i];
  return LOT_LADDER[0];
}

export function fmtLot(q: number): string {
  if (!Number.isFinite(q)) return '—';
  return q >= 100 ? q.toFixed(0) : String(+q.toFixed(4));
}

/** Tipo de ordem que um preço de entrada implica: limite (espera um preço melhor), stop (espera rompimento) ou mercado. */
export function orderKind(side: Side, price: number, current: number, tick: number): OrderType {
  if (Math.abs(price - current) < tick) return 'market';
  const below = price < current;
  return side === 'long' ? (below ? 'limit' : 'stop') : below ? 'stop' : 'limit';
}

/** SL e TP iniciais: `slPips` de risco e alvo a `rr` vezes o risco. */
export function defaultLevels(side: Side, entry: number, pip: number, slPips = 20, rr = 2): { sl: number; tp: number } {
  const d = side === 'long' ? 1 : -1;
  const risk = slPips * pip;
  return { sl: entry - d * risk, tp: entry + d * risk * rr };
}

/** Mantém o SL do lado da perda e o TP do lado do ganho, a pelo menos `gap` da entrada. */
export function clampLevels(side: Side, entry: number, sl: number, tp: number, gap: number): { sl: number; tp: number } {
  if (side === 'long') return { sl: Math.min(sl, entry - gap), tp: Math.max(tp, entry + gap) };
  return { sl: Math.max(sl, entry + gap), tp: Math.min(tp, entry - gap) };
}

/** Reflete um preço à volta da entrada (ao trocar compra ↔ venda). */
export function mirror(entry: number, price: number): number {
  return 2 * entry - price;
}
