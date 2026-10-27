import { describe, expect, it } from 'vitest';
import { volumeProfile } from '@/core/volumeProfile';
import type { Bar } from '@/core/types';

const bar = (i: number, o: number, h: number, l: number, c: number, v?: number): Bar => ({ time: 1000 + i * 60, open: o, high: h, low: l, close: c, volume: v });

describe('perfil de volume', () => {
  it('reparte o volume pelas faixas que a vela atravessa e separa subida de descida', () => {
    // vela de subida de 100 a 104, volume 400: 100 por faixa (4 faixas)
    const r = volumeProfile([bar(0, 100, 104, 100, 104, 400)], 0, 0, { rows: 4, valueArea: 0.7 })!;
    expect(r.mode).toBe('volume');
    expect(r.levels.map((l) => l.total)).toEqual([100, 100, 100, 100]);
    expect(r.levels.every((l) => l.up === l.total && l.down === 0)).toBe(true);
    expect(r.totalVolume).toBe(400);
    const d = volumeProfile([bar(0, 104, 104, 100, 100, 400)], 0, 0, { rows: 4, valueArea: 0.7 })!;
    expect(d.levels.every((l) => l.down === l.total && l.up === 0)).toBe(true);
  });

  it('a linha de controlo é a faixa com mais volume; a área de valor junta-a ao seu redor', () => {
    const bars = [
      bar(0, 100, 110, 100, 110, 100), // espalhado por tudo
      bar(1, 104, 106, 104, 106, 1000), // muito volume em 104-106
      bar(2, 105, 106, 104, 105, 1000),
    ];
    const r = volumeProfile(bars, 0, 2, { rows: 10, valueArea: 0.7 })!;
    expect(r.poc).toBeGreaterThan(104);
    expect(r.poc).toBeLessThan(106);
    expect(r.vah).toBeGreaterThanOrEqual(106);
    expect(r.val).toBeLessThanOrEqual(104);
    const inVa = r.levels.filter((l) => l.inVa).reduce((s, l) => s + l.total, 0);
    expect(inVa).toBeGreaterThanOrEqual(r.totalVolume * 0.7 - 1e-9);
    expect(r.levels[r.pocIdx].inVa).toBe(true);
    expect(r.max).toBe(r.levels[r.pocIdx].total);
  });

  it('o volume total do perfil é o das velas (nada se perde nem se duplica)', () => {
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const bars = Array.from({ length: 200 }, (_, i) => {
      const o = 100 + rnd() * 10;
      const c = o + (rnd() - 0.5) * 3;
      return bar(i, o, Math.max(o, c) + rnd(), Math.min(o, c) - rnd(), c, 50 + rnd() * 100);
    });
    const r = volumeProfile(bars, 0, 199, { rows: 37, valueArea: 0.7 })!;
    const sum = r.levels.reduce((a, l) => a + l.total, 0);
    expect(sum).toBeCloseTo(bars.reduce((a, b) => a + (b.volume ?? 0), 0), 6);
    expect(r.levels).toHaveLength(37);
  });

  it('só conta as velas do intervalo pedido', () => {
    const bars = [bar(0, 100, 101, 99, 100, 1000), bar(1, 200, 201, 199, 200, 1), bar(2, 300, 301, 299, 300, 1)];
    const r = volumeProfile(bars, 1, 2, { rows: 5, valueArea: 0.7 })!;
    expect(r.lo).toBe(199);
    expect(r.hi).toBe(301);
    expect(r.totalVolume).toBe(2);
  });

  it('sem volume nos dados usa o tempo (cada vela vale 1) e diz-o', () => {
    const bars = [bar(0, 100, 102, 100, 102), bar(1, 101, 103, 101, 103), bar(2, 102, 103, 101, 102)];
    const r = volumeProfile(bars, 0, 2, { rows: 3, valueArea: 0.7 })!;
    expect(r.mode).toBe('tempo');
    expect(r.totalVolume).toBe(3);
    const forced = volumeProfile([bar(0, 100, 102, 100, 102, 5), bar(1, 100, 102, 100, 102, 5)], 0, 1, { rows: 2, valueArea: 0.7, mode: 'tempo' })!;
    expect(forced.mode).toBe('tempo');
    expect(forced.totalVolume).toBe(2);
  });

  it('casos limite: intervalo sem amplitude ou vazio dá nada; extremos são limitados às velas', () => {
    expect(volumeProfile([bar(0, 100, 100, 100, 100, 5)], 0, 0, { rows: 5, valueArea: 0.7 })).toBeNull();
    expect(volumeProfile([], 0, 10, { rows: 5, valueArea: 0.7 })).toBeNull();
    const r = volumeProfile([bar(0, 100, 101, 99, 100, 5), bar(1, 100, 102, 98, 101, 5)], -5, 50, { rows: 4, valueArea: 0.7 })!;
    expect(r.from).toBe(0);
    expect(r.to).toBe(1);
  });
});
