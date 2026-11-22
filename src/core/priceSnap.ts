import type { Bar } from './types';

/**
 * Íman de preço: o máximo ou mínimo (só pavios) das velas visíveis cujo preço fica mais perto do cursor na vertical,
 * ignorando a distância horizontal. `priceToY` converte preço em píxeis; só conta se ficar a menos de `maxPx` do cursor.
 */
export function nearestWick(bars: readonly Bar[], from: number, to: number, cursorY: number, priceToY: (p: number) => number | null, maxPx: number): number | null {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(bars.length - 1, Math.ceil(to));
  let best: number | null = null;
  let bestD = maxPx;
  for (let i = a; i <= b; i++) {
    const bar = bars[i];
    for (const p of [bar.high, bar.low]) {
      const y = priceToY(p);
      if (y === null) continue;
      const d = Math.abs(y - cursorY);
      if (d <= bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}
