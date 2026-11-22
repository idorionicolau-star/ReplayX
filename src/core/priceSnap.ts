import type { Bar } from './types';

export interface Pivot {
  idx: number;
  price: number;
  /** true = topo (máximo), false = fundo (mínimo). */
  high: boolean;
}

/** Velas de cada lado que têm de ficar abaixo (topo) ou acima (fundo) do pivô. */
export const PIVOT_K = 3;
/** Quanto o pivô tem de se destacar das velas vizinhas, em fração da amplitude média das velas à vista. */
export const PIVOT_PROMINENCE = 0.3;

/**
 * Pivôs (topos e fundos isolados) das velas visíveis: o máximo que fica acima dos máximos das `k` velas de cada lado
 * (ou o mínimo abaixo dos mínimos), destacando-se pelo menos `prominence` da amplitude média. Os últimos `k` pavios do
 * gráfico ainda não têm velas à direita para os confirmar, por isso não contam.
 */
export function swingPivots(bars: readonly Bar[], from: number, to: number, k = PIVOT_K, prominence = PIVOT_PROMINENCE): Pivot[] {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(bars.length - 1, Math.ceil(to));
  if (b < a) return [];
  let range = 0;
  for (let i = a; i <= b; i++) range += bars[i].high - bars[i].low;
  const need = (range / (b - a + 1)) * prominence;
  const out: Pivot[] = [];
  for (let i = Math.max(a, k); i <= Math.min(b, bars.length - 1 - k); i++) {
    let maxNb = -Infinity;
    let minNb = Infinity;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      maxNb = Math.max(maxNb, bars[j].high);
      minNb = Math.min(minNb, bars[j].low);
    }
    if (bars[i].high - maxNb > 0 && bars[i].high - maxNb >= need) out.push({ idx: i, price: bars[i].high, high: true });
    if (minNb - bars[i].low > 0 && minNb - bars[i].low >= need) out.push({ idx: i, price: bars[i].low, high: false });
  }
  return out;
}

/**
 * Íman de preço: o preço do pivô (topo ou fundo isolado) mais perto do cursor na vertical, ignorando a distância horizontal.
 * `priceToY` converte preço em píxeis; só conta se ficar a menos de `maxPx` do cursor.
 */
export function nearestPivot(bars: readonly Bar[], from: number, to: number, cursorY: number, priceToY: (p: number) => number | null, maxPx: number): number | null {
  let best: number | null = null;
  let bestD = maxPx;
  for (const p of swingPivots(bars, from, to)) {
    const y = priceToY(p.price);
    if (y === null) continue;
    const d = Math.abs(y - cursorY);
    if (d <= bestD) {
      bestD = d;
      best = p.price;
    }
  }
  return best;
}

/** 0 = desligado; 1 = curto, 2 = médio, 3 = longo (prende sempre ao pivô mais próximo de todo o gráfico visível). */
export type PriceSnapLevel = 0 | 1 | 2 | 3;

export const PRICE_SNAP_LEVELS: { level: 1 | 2 | 3; label: string; mouse: number; touch: number }[] = [
  { level: 1, label: 'Íman de preço 1 · curto (só perto de um topo/fundo)', mouse: 15, touch: 25 },
  { level: 2, label: 'Íman de preço 2 · médio', mouse: 40, touch: 60 },
  { level: 3, label: 'Íman de preço 3 · longo (sempre ao topo/fundo mais próximo)', mouse: Infinity, touch: Infinity },
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
