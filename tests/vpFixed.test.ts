import { describe, expect, it } from 'vitest';
import { toolDef, TOOL_GROUPS, type Viewport } from '@/chart/drawings/tools';
import type { Drawing } from '@/chart/drawings/types';
import type { Bar } from '@/core/types';

const bars: Bar[] = Array.from({ length: 100 }, (_, i) => {
  const base = 100 + Math.sin(i / 8) * 5;
  return { time: 1000 + i * 60, open: base, high: base + 1.5, low: base - 1.5, close: base + (i % 2 ? 0.5 : -0.5), volume: 100 + (i % 7) * 20 };
});

const vp = {
  width: 1000,
  height: 600,
  timeToX: (t: number) => (t - 1000) / 6,
  priceToY: (p: number) => 600 - (p - 90) * 20,
  fromXY: (x: number, y: number) => ({ time: 1000 + x * 6, price: 90 + (600 - y) / 20 }),
  fmtPrice: (p: number) => p.toFixed(2),
  barsBetween: () => 0,
  tfSec: 60,
  bars,
  dark: true,
  cursor: null,
} as unknown as Viewport;

const draw = (): Drawing => ({
  id: 'vp1',
  type: 'vpfixed',
  points: [
    { time: 1000 + 20 * 60, price: 100 },
    { time: 1000 + 70 * 60, price: 100 },
  ],
  style: { color: '#f23645', width: 1, dash: 1, fill: 'rgba(120,123,134,0.06)' },
  createdAt: 0,
});

function fakeCtx() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (k === 'measureText') return () => ({ width: 40 });
        return (...args: unknown[]) => void calls.push({ fn: k, args });
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('perfil de volume de intervalo fixo (ferramenta)', () => {
  const def = toolDef('vpfixed')!;

  it('está no grupo de medição e no catálogo de ferramentas', () => {
    expect(def).toBeDefined();
    expect(def.points).toBe(2);
    expect(TOOL_GROUPS.find((g) => g.id === 'measure')!.tools).toContain('vpfixed');
  });

  it('desenha as barras do perfil dentro do intervalo escolhido (nunca fora dele)', () => {
    const { ctx, calls } = fakeCtx();
    def.render(ctx, draw(), vp, false);
    const rects = calls.filter((c) => c.fn === 'fillRect').map((c) => c.args as number[]);
    expect(rects.length).toBeGreaterThan(10);
    const xa = vp.timeToX(1000 + 20 * 60)!;
    const xb = vp.timeToX(1000 + 70 * 60)!;
    for (const [x, , w] of rects.slice(1)) {
      expect(x).toBeGreaterThanOrEqual(xa - 1e-6);
      expect(x + w).toBeLessThanOrEqual(xb + 1e-6);
    }
  });

  it('mexer só nas pontas esquerda/direita muda o tempo e deixa o preço', () => {
    const d = draw();
    const to = { time: 5000, price: 123 };
    expect(def.drag!(d, 0, to, vp).points).toEqual([{ time: 5000, price: 100 }, d.points[1]]);
    expect(def.drag!(d, 1, to, vp).points).toEqual([d.points[0], { time: 5000, price: 100 }]);
    const hs = def.handles(d, vp);
    expect(hs).toHaveLength(2);
    expect(hs[0].x).toBeCloseTo(vp.timeToX(d.points[0].time)!, 6);
  });

  it('acerta-se dentro do quadro e não fora', () => {
    const d = draw();
    const xa = vp.timeToX(d.points[0].time)!;
    const xb = vp.timeToX(d.points[1].time)!;
    const mid = vp.priceToY(100)!;
    expect(def.hit(d, vp, { x: (xa + xb) / 2, y: mid })).toBe(true);
    expect(def.hit(d, vp, { x: xb + 80, y: mid })).toBe(false);
  });
});
