import { describe, expect, it } from 'vitest';
import { toolDef, type Viewport } from '@/chart/drawings/tools';
import type { Drawing } from '@/chart/drawings/types';

const vp = {
  width: 800,
  height: 600,
  timeToX: (t: number) => t,
  priceToY: (p: number) => 600 - p,
  fromXY: (x: number, y: number) => ({ time: x, price: 600 - y }),
  fmtPrice: (p: number) => String(p),
  barsBetween: () => 0,
  tfSec: 60,
  bars: [],
  dark: false,
  cursor: null,
} as unknown as Viewport;

const rect = (): Drawing => ({
  id: 'r',
  type: 'rect',
  points: [
    { time: 100, price: 400 },
    { time: 300, price: 200 },
  ],
  style: { color: '#9c27b0', width: 1, dash: 0, fill: 'rgba(156,39,176,0.15)' },
  createdAt: 0,
});

describe('retângulo: pegas nos lados', () => {
  const def = toolDef('rect')!;

  it('tem 8 pegas: 4 cantos e o meio de cada lado', () => {
    const hs = def.handles(rect(), vp);
    expect(hs).toHaveLength(8);
    const at = (id: number) => hs.find((h) => h.id === id)!;
    // y = 600 - preço: o ponto 0 fica em (100, 200) e o ponto 1 em (300, 400); cada pega fica a meio do lado
    expect(at(4)).toMatchObject({ x: 100, y: 300 });
    expect(at(5)).toMatchObject({ x: 300, y: 300 });
    expect(at(6)).toMatchObject({ x: 200, y: 200 });
    expect(at(7)).toMatchObject({ x: 200, y: 400 });
  });

  it('arrastar um lado mexe só nesse lado, só num eixo', () => {
    const d = rect();
    const to = { time: 250, price: 333 };
    // esquerda: só o tempo do 1.º ponto
    expect(def.drag!(d, 4, to, vp).points).toEqual([{ time: 250, price: 400 }, d.points[1]]);
    // direita: só o tempo do 2.º ponto
    expect(def.drag!(d, 5, to, vp).points).toEqual([d.points[0], { time: 250, price: 200 }]);
    // cima: só o preço do 1.º ponto
    expect(def.drag!(d, 6, to, vp).points).toEqual([{ time: 100, price: 333 }, d.points[1]]);
    // baixo: só o preço do 2.º ponto
    expect(def.drag!(d, 7, to, vp).points).toEqual([d.points[0], { time: 300, price: 333 }]);
  });

  it('os cantos continuam a funcionar como antes', () => {
    const d = rect();
    const to = { time: 50, price: 450 };
    expect(def.drag!(d, 0, to, vp).points).toEqual([to, d.points[1]]);
    expect(def.drag!(d, 1, to, vp).points).toEqual([d.points[0], to]);
    expect(def.drag!(d, 2, to, vp).points).toEqual([{ time: 50, price: 400 }, { time: 300, price: 450 }]);
    expect(def.drag!(d, 3, to, vp).points).toEqual([{ time: 100, price: 450 }, { time: 50, price: 200 }]);
  });
});
