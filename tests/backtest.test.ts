import { describe, expect, it } from 'vitest';
import { computeBacktest } from '@/core/backtest';
import type { Bar } from '@/core/types';
import type { Drawing } from '@/chart/drawings/types';

const bar = (time: number, low: number, high: number): Bar => ({ time, open: low, high, low, close: high, volume: 0 });
const box = (id: string, type: 'long' | 'short', t0: number, t1: number, entry: number, stop: number, target: number): Drawing =>
  ({ id, type, points: [{ time: t0, price: entry }, { time: t1, price: entry }], style: { color: '#fff', width: 1, dash: 0 }, data: { stop, target, riskPct: 1, account: 10000 }, createdAt: 0 }) as Drawing;

// longas com entrada 100, stop 95, alvo 110 (alvo = +2R)
describe('backtest pelas caixas de posição', () => {
  const bars = [
    bar(1, 99, 103), bar(2, 100, 112), // caixa A: entra e vai ao alvo → +2R
    bar(3, 99, 104), bar(4, 93, 101), // caixa B: entra e vai ao stop → −1R
    bar(5, 101, 105), bar(6, 102, 106), // caixa C: o preço nunca toca em 100 → à espera
    bar(7, 101, 104), bar(8, 104, 111), // caixa D: foi ao alvo sem tocar na entrada → sem entrada
    bar(9, 99, 103), bar(10, 100, 104), // caixa E: entrou e nada atingido → aberta
  ];
  const drawings = [
    box('A', 'long', 1, 2, 100, 95, 110),
    box('B', 'long', 3, 4, 100, 95, 110),
    box('C', 'long', 5, 6, 100, 95, 110),
    box('D', 'long', 7, 8, 100, 95, 110),
    box('E', 'long', 9, 10, 100, 95, 110),
  ];
  it('conta ganhos, perdas, taxa de acerto e R', () => {
    const s = computeBacktest(drawings, bars);
    expect(s.boxes).toBe(5);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.5);
    expect(s.totalR).toBeCloseTo(1); // +2 − 1
    expect(s.avgR).toBeCloseTo(0.5);
    expect(s.profitFactor).toBeCloseTo(2);
    expect(s.curve).toEqual([0, 2, 1]);
    expect(s.maxDrawdownR).toBeCloseTo(1);
    expect(s.maxLossStreak).toBe(1);
  });
  it('as caixas sem resultado ficam à parte e não entram na taxa de acerto', () => {
    const s = computeBacktest(drawings, bars);
    expect(s.pending).toBe(1);
    expect(s.missed).toBe(1);
    expect(s.open).toBe(1);
  });
  it('só conta as velas até à margem direita da caixa', () => {
    // a caixa A termina na vela 1: o alvo só chega na vela 2, por isso fica aberta
    const s = computeBacktest([box('A', 'long', 1, 1, 100, 95, 110)], bars);
    expect(s.trades).toHaveLength(0);
    expect(s.open).toBe(1);
  });
  it('curtas: R pelo alvo/risco e ignora caixas escondidas', () => {
    const shortBars = [bar(1, 97, 101), bar(2, 88, 99)]; // entra em 100, cai ao alvo 90
    const s = computeBacktest([box('S', 'short', 1, 2, 100, 105, 90), { ...box('H', 'short', 1, 2, 100, 105, 90), hidden: true }], shortBars);
    expect(s.wins).toBe(1);
    expect(s.totalR).toBeCloseTo(2);
    expect(s.boxes).toBe(1);
  });
  it('sem trades: sem taxa de acerto', () => {
    const s = computeBacktest([], bars);
    expect(s.hitRate).toBeNull();
    expect(s.profitFactor).toBeNull();
    expect(s.curve).toEqual([0]);
  });
  it('sequência de perdas e drawdown', () => {
    const lb = [bar(1, 94, 101), bar(2, 94, 101), bar(3, 94, 101), bar(4, 99, 112)];
    const ds = [box('1', 'long', 1, 1, 100, 95, 110), box('2', 'long', 2, 2, 100, 95, 110), box('3', 'long', 3, 3, 100, 95, 110), box('4', 'long', 4, 4, 100, 95, 110)];
    const s = computeBacktest(ds, lb);
    expect(s.maxLossStreak).toBe(3);
    expect(s.maxDrawdownR).toBeCloseTo(3);
    expect(s.totalR).toBeCloseTo(-1);
  });
});
