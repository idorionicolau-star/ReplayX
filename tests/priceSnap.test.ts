import { describe, expect, it } from 'vitest';
import { nearestPivot, nextPriceSnap, priceSnapReach, swingPivots } from '@/core/priceSnap';
import type { Bar } from '@/core/types';

const bar = (high: number, low: number): Bar => ({ time: 0, open: low + 1, high, low, close: high - 1, volume: 0 });
// 1 preço = 1 px, de cima para baixo (y = 200 - preço)
const toY = (p: number) => 200 - p;

describe('íman de preço (só topos e fundos isolados)', () => {
  // 15 velas "calmas" (100–98) com um topo isolado em 110 (vela 5) e um fundo isolado em 88 (vela 10)
  const calm = () => Array.from({ length: 15 }, () => bar(100, 98));
  const bars = calm();
  bars[5] = bar(110, 98);
  bars[10] = bar(100, 88);

  it('encontra o topo e o fundo isolados e ignora os pavios normais', () => {
    const pv = swingPivots(bars, 0, 14);
    expect(pv.filter((p) => p.high).map((p) => [p.idx, p.price])).toEqual([[5, 110]]);
    expect(pv.filter((p) => !p.high).map((p) => [p.idx, p.price])).toEqual([[10, 88]]);
  });
  it('um pavio pequeno ao lado das velas vizinhas não é pivô (relevância mínima)', () => {
    const b = calm();
    b[7] = bar(100.4, 98); // 0,4 acima das vizinhas, a amplitude média é 2
    expect(swingPivots(b, 0, 14).filter((p) => p.idx === 7)).toHaveLength(0);
  });
  it('os últimos pavios, sem velas à direita para os confirmar, não contam', () => {
    const b = calm();
    b[14] = bar(120, 98);
    b[13] = bar(105, 98);
    expect(swingPivots(b, 0, 14).filter((p) => p.idx >= 12)).toHaveLength(0);
  });
  it('máximos iguais não são topo isolado', () => {
    const b = calm();
    b[5] = bar(110, 98);
    b[6] = bar(110, 98);
    expect(swingPivots(b, 0, 14).filter((p) => p.high)).toHaveLength(0);
  });
  it('prende ao pivô mais próximo do cursor na vertical, esteja onde estiver na horizontal', () => {
    expect(nearestPivot(bars, 0, 14, toY(108), toY, 30)).toBe(110);
    expect(nearestPivot(bars, 0, 14, toY(90), toY, 30)).toBe(88);
    // a meio caminho escolhe o mais perto
    expect(nearestPivot(bars, 0, 14, toY(101), toY, 30)).toBe(110); // 9 do topo, 13 do fundo… o 110 está mais perto
  });
  it('não prende a pavios que não são pivôs, mesmo estando mais perto', () => {
    // 99 e 100 são pavios normais de todas as velas; o cursor em 99 só prende se o pivô estiver ao alcance
    expect(nearestPivot(bars, 0, 14, toY(99), toY, 5)).toBeNull();
  });
  it('só olha para os pivôs visíveis', () => {
    expect(nearestPivot(bars, 0, 8, toY(108), toY, 30)).toBe(110);
    expect(nearestPivot(bars, 6, 14, toY(108), toY, 15)).toBeNull(); // o topo da vela 5 fica fora da vista; o fundo em 88 está a 20 px
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
    const b = Array.from({ length: 15 }, () => bar(100, 98));
    b[5] = bar(110, 98);
    expect(nearestPivot(b, 0, 14, toY(300), toY, priceSnapReach(3, false))).toBe(110);
    expect(nearestPivot(b, 0, 14, toY(300), toY, priceSnapReach(1, false))).toBeNull();
  });
});
