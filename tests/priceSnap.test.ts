import { describe, expect, it } from 'vitest';
import { nearestWick } from '@/core/priceSnap';
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
