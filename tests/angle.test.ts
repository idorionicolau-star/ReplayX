import { describe, expect, it } from 'vitest';
import { lineAngle, normDeg, setLineAngle, type Geo } from '@/chart/angle';
import type { Drawing } from '@/chart/drawings/types';

// 1 unidade de tempo = 1 px, 1 de preço = 1 px (eixo Y invertido)
const geo: Geo = {
  timeToX: (t) => t,
  priceToY: (p) => 500 - p,
  xToPoint: (x, y) => ({ time: x, price: 500 - y }),
};
const line = (b: { time: number; price: number }): Drawing => ({ id: 'a', type: 'trendline', points: [{ time: 100, price: 100 }, b], style: { color: '#fff', width: 1, dash: 0 } }) as Drawing;

describe('ângulo das linhas', () => {
  it('mede o ângulo no ecrã', () => {
    expect(lineAngle(line({ time: 200, price: 200 }), geo)).toBeCloseTo(45);
    expect(lineAngle(line({ time: 200, price: 100 }), geo)).toBeCloseTo(0);
  });
  it('horizontal e vertical mantêm o comprimento', () => {
    const d = line({ time: 200, price: 200 });
    const h = setLineAngle(d, 0, geo)!;
    expect(h[1].price).toBeCloseTo(100);
    expect(h[1].time).toBeCloseTo(100 + Math.hypot(100, 100));
    const v = setLineAngle(d, 90, geo)!;
    expect(v[1].time).toBeCloseTo(100);
    expect(v[1].price).toBeCloseTo(100 + Math.hypot(100, 100));
  });
  it('normaliza graus', () => {
    expect(normDeg(190)).toBe(-170);
    expect(normDeg(-190)).toBe(170);
    expect(normDeg(180)).toBe(180);
  });
});
