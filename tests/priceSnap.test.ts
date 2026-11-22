import { describe, expect, it } from 'vitest';
import { nearestPivot, nextPriceSnap, pivotWindow, priceSnapReach, swingPivots } from '@/core/priceSnap';
import type { Bar } from '@/core/types';

// 1 preço = 1 px, de cima para baixo (y = 200 - preço)
const toY = (p: number) => 200 - p;

/** Velas que seguem um caminho de pontos (5 velas por perna), com amplitude de 1 e um pequeno recuo de 2 a meio de cada perna. */
function legs(points: number[], wiggle = 2): Bar[] {
  const out: Bar[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = points[k];
    const b = points[k + 1];
    for (let s = 0; s < 6; s++) {
      if (k > 0 && s === 0) continue;
      let v = a + ((b - a) * s) / 5;
      if (s === 3) v -= Math.sign(b - a) * wiggle; // barulho: recua um pouco a meio da perna
      out.push({ time: out.length, open: v, high: v + 0.5, low: v - 0.5, close: v, volume: 0 });
    }
  }
  return out;
}

describe('íman de preço: pivôs (o mais alto/baixo em N velas de cada lado)', () => {
  // pernas de 5 velas: 100 → 130 → 110 → 140 → 120 → 125 → 115 → 150 → 105, com barulho a meio de cada perna
  const bars = legs([100, 130, 110, 140, 120, 125, 115, 150, 105]);
  const all = bars.length - 1;
  const tag = (pv: { high: boolean; price: number }[]) => pv.map((p) => `${p.high ? 'T' : 'F'}${p.price}`);

  it('apanha as pontas dos movimentos e não o barulho do meio das pernas', () => {
    const pv = tag(swingPivots(bars, 0, all));
    for (const t of ['T130.5', 'F109.5', 'T140.5', 'F119.5', 'T150.5']) expect(pv).toContain(t);
    // cada pivô domina a sua janela
    const n = pivotWindow(all + 1);
    for (const p of swingPivots(bars, 0, all)) {
      for (let j = Math.max(0, p.idx - n); j <= Math.min(all, p.idx + n); j++) {
        if (p.high) expect(bars[j].high).toBeLessThanOrEqual(p.price);
        else expect(bars[j].low).toBeGreaterThanOrEqual(p.price);
      }
    }
  });
  it('com o zoom mais afastado (mais velas à vista) e "poucos", o topo pequeno (125) desaparece e os grandes ficam', () => {
    const pv = tag(swingPivots(bars, 0, 80, 'few'));
    expect(pv).not.toContain('T125.5');
    expect(pv).toContain('T140.5');
    expect(pv).toContain('T150.5');
  });
  it('a janela cresce com o zoom; "poucos" tem janela maior que "normal", que é maior que "mais"', () => {
    expect(pivotWindow(240)).toBeGreaterThan(pivotWindow(60));
    expect(pivotWindow(120, 'few')).toBeGreaterThan(pivotWindow(120, 'normal'));
    expect(pivotWindow(120, 'normal')).toBeGreaterThan(pivotWindow(120, 'more'));
    expect(pivotWindow(10)).toBe(3);
  });
  it('as 2 últimas velas não são pivôs (sem velas à direita); com menos de N à direita fica provisório', () => {
    const pv = swingPivots(bars, 0, all);
    expect(pv.every((p) => p.idx <= all - 2)).toBe(true);
    const cut = swingPivots(bars, 0, all, 'normal', 21); // a meio do recuo depois do topo 140 (vela 15)
    expect(cut.every((p) => p.idx <= 19)).toBe(true);
  });
  it('sem ver o futuro: cortado na vela do cursor, o topo 150 (mais à frente) não existe', () => {
    const pv = tag(swingPivots(bars, 0, all, 'normal', 30));
    expect(pv).not.toContain('T150.5');
    expect(pv).toContain('T140.5');
  });
  it('só devolve os pivôs à vista', () => {
    const pv = swingPivots(bars, 8, 20);
    expect(pv.every((p) => p.idx >= 8 && p.idx <= 20)).toBe(true);
  });
  it('prende ao pivô mais próximo na vertical e não prende fora do alcance', () => {
    const pv = swingPivots(bars, 0, all);
    expect(nearestPivot(pv, toY(132), toY, 30)).toBe(130.5);
    expect(nearestPivot(pv, toY(200), toY, 10)).toBeNull();
    expect(nearestPivot(pv, toY(200), toY, Infinity)).toBe(150.5);
  });
});

describe('3 níveis do íman de preço', () => {
  it('o botão roda: desligado → 1 → 2 → 3 → desligado', () => {
    expect([0, 1, 2, 3].map((l) => nextPriceSnap(l as 0 | 1 | 2 | 3))).toEqual([1, 2, 3, 0]);
  });
  it('cada nível alcança mais que o anterior; o dedo tem mais folga; o 3 não tem limite', () => {
    expect(priceSnapReach(1, false)).toBeLessThan(priceSnapReach(2, false));
    expect(priceSnapReach(2, false)).toBeLessThan(priceSnapReach(3, false));
    expect(priceSnapReach(2, true)).toBeGreaterThan(priceSnapReach(2, false));
    expect(priceSnapReach(3, false)).toBe(Infinity);
    expect(priceSnapReach(2, false)).toBe(40);
  });
  it('o nível 3 prende mesmo muito longe; o 1 não', () => {
    const pv = swingPivots(legs([100, 120, 105]), 0, 10);
    expect(nearestPivot(pv, toY(300), toY, priceSnapReach(3, false))).toBe(120.5);
    expect(nearestPivot(pv, toY(300), toY, priceSnapReach(1, false))).toBeNull();
  });
});
