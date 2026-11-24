import type { Bar } from './types';
import { tr } from '@/i18n';

export interface Pivot {
  idx: number;
  price: number;
  /** true = topo (máximo), false = fundo (mínimo). */
  high: boolean;
  /** Ainda sem N velas à direita a confirmá-lo (só no fim dos dados considerados). */
  provisional?: boolean;
}

/** Sensibilidade dos pivôs: quantas velas à vista por cada vela de "janela" de cada lado (mais = janela menor = mais pivôs). */
export type PivotSensitivity = 'few' | 'normal' | 'more';
export const PIVOT_SENSITIVITY: Record<PivotSensitivity, { label: string; per: number }> = {
  few: { label: tr('Poucos (só os topos e fundos maiores)'), per: 8 },
  normal: { label: tr('Normal'), per: 12 },
  more: { label: tr('Mais (também os médios)'), per: 18 },
};

/** Velas de cada lado que o pivô tem de dominar: cresce com o número de velas à vista (o zoom). */
export function pivotWindow(visibleBars: number, sensitivity: PivotSensitivity = 'normal'): number {
  return Math.max(3, Math.min(40, Math.round(visibleBars / PIVOT_SENSITIVITY[sensitivity].per)));
}

/**
 * Pivôs à vista (velas `from`..`to`) para o íman de preço: o máximo mais alto (ou o mínimo mais baixo) de todas as velas
 * numa janela de N para cada lado, com N a crescer com o zoom. São as pontas dos movimentos que se veem no ecrã; os
 * topos e fundos do meio das pernas não dominam a janela e ficam de fora. Precisa de pelo menos 2 velas à direita; com
 * menos de N fica provisório. `upTo` (índice da vela) corta os dados aí: só o que já tinha acontecido até ao cursor.
 */
export function swingPivots(bars: readonly Bar[], from: number, to: number, sensitivity: PivotSensitivity = 'normal', upTo?: number): Pivot[] {
  const last = upTo === undefined ? bars.length - 1 : Math.min(bars.length - 1, Math.floor(upTo));
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(last, Math.ceil(to));
  if (b < a) return [];
  const n = pivotWindow(Math.ceil(to) - Math.floor(from) + 1, sensitivity);
  const out: Pivot[] = [];
  for (let i = a; i <= b; i++) {
    const right = Math.min(last, i + n);
    if (right - i < 2) continue;
    const provisional = right - i < n;
    let isHigh = true;
    let isLow = true;
    for (let j = Math.max(0, i - n); j <= right && (isHigh || isLow); j++) {
      if (j === i) continue;
      // empate: conta o primeiro (à esquerda é estrito, à direita não)
      if (j < i ? bars[j].high >= bars[i].high : bars[j].high > bars[i].high) isHigh = false;
      if (j < i ? bars[j].low <= bars[i].low : bars[j].low < bars[i].low) isLow = false;
    }
    if (isHigh) out.push({ idx: i, price: bars[i].high, high: true, ...(provisional ? { provisional } : {}) });
    if (isLow) out.push({ idx: i, price: bars[i].low, high: false, ...(provisional ? { provisional } : {}) });
  }
  return out;
}

/** O preço do pivô mais perto do cursor na vertical (ignora a distância horizontal), a menos de `maxPx`. */
export function nearestPivot(pivots: readonly Pivot[], cursorY: number, priceToY: (p: number) => number | null, maxPx: number): number | null {
  let best: number | null = null;
  let bestD = maxPx;
  for (const p of pivots) {
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

/** Alcance vertical do íman de preço em px: o rato e o dedo (que tem mais folga). */
export const PRICE_SNAP_REACH = { mouse: 40, touch: 60 };

export function priceSnapReach(touch: boolean): number {
  return touch ? PRICE_SNAP_REACH.touch : PRICE_SNAP_REACH.mouse;
}
