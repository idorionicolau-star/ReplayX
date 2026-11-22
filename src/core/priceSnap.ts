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

/** 0 = desligado; 1 = curto, 2 = médio, 3 = longo (prende sempre ao pavio mais próximo de todo o gráfico visível). */
export type PriceSnapLevel = 0 | 1 | 2 | 3;

export const PRICE_SNAP_LEVELS: { level: 1 | 2 | 3; label: string; mouse: number; touch: number }[] = [
  { level: 1, label: 'Íman de preço 1 · curto (só perto do pavio)', mouse: 15, touch: 25 },
  { level: 2, label: 'Íman de preço 2 · médio', mouse: 40, touch: 60 },
  { level: 3, label: 'Íman de preço 3 · longo (sempre ao pavio mais próximo)', mouse: Infinity, touch: Infinity },
];

/** Alcance vertical em px do nível (o dedo tem mais folga). */
export function priceSnapReach(level: PriceSnapLevel, touch: boolean): number {
  const l = PRICE_SNAP_LEVELS.find((x) => x.level === level) ?? PRICE_SNAP_LEVELS[1];
  return touch ? l.touch : l.mouse;
}

/** O botão roda: desligado → 1 → 2 → 3 → desligado. */
export function nextPriceSnap(level: PriceSnapLevel): PriceSnapLevel {
  return ((level + 1) % 4) as PriceSnapLevel;
}

export function priceSnapTitle(level: PriceSnapLevel): string {
  return level === 0 ? 'Íman de preço: desligado (segura Alt ao desenhar para o usar)' : (PRICE_SNAP_LEVELS.find((l) => l.level === level)?.label ?? '');
}
