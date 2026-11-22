import { describe, expect, it } from 'vitest';
import { nearestWick, nextPriceSnap, priceSnapReach } from '@/core/priceSnap';
import type { Bar } from '@/core/types';

const bar = (high: number, low: number): Bar => ({ time: 0, open: low + 1, high, low, close: high - 1, volume: 0 });
// 1 preço = 1 px, de cima para baixo (y = 200 - preço)
const toY = (p: number) => 200 - p;

describe('íman de preço (só pavios)', () => {
  const bars = [bar(120, 100), bar(150, 110), bar(130, 90)];
  it('prende ao máximo/mínimo mais próximo do cursor, venha de que vela vier', () => {
    expect(nearestWick(bars, 0, 2, toY(148), toY, 20)).toBe(150);
    expect(nearestWick(bars, 0, 2, toY(92), toY, 20)).toBe(90);
    expect(nearestWick(bars, 0, 2, toY(119), toY, 20)).toBe(120);
  });
  it('ignora aberturas e fechos', () => {
    // fecho da 2.ª vela é 149 e abertura 111: o cursor a 111 prende ao mínimo 110, não à abertura
    expect(nearestWick(bars, 0, 2, toY(111), toY, 20)).toBe(110);
  });
  it('não prende se estiver mais longe que o alcance', () => {
    expect(nearestWick(bars, 0, 2, toY(180), toY, 20)).toBeNull();
  });
  it('só olha para as velas visíveis', () => {
    expect(nearestWick(bars, 0, 0, toY(150), toY, 80)).toBe(120);
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
    const bars = [bar(150, 100)];
    expect(nearestWick(bars, 0, 0, toY(300), toY, priceSnapReach(3, false))).toBe(150);
    expect(nearestWick(bars, 0, 0, toY(300), toY, priceSnapReach(1, false))).toBeNull();
  });
});
