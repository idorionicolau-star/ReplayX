import { describe, expect, it } from 'vitest';
import { equityCurve } from '@/core/indicators/equity';
import type { DtSignal } from '@/core/indicators/doubletop';
import { defaultParams, getIndicator } from '@/core/indicators/registry';
import type { Bar } from '@/core/types';

const T0 = Date.UTC(2024, 0, 1) / 1000;
/** Velas de 1 h (24 por dia). */
const bars = (n: number): Bar[] => Array.from({ length: n }, (_, i) => ({ time: T0 + i * 3600, open: 1, high: 1, low: 1, close: 1 }));

/** Sinal sem preços reais: só interessa o R, que sai de entrada, stop e alvo. */
function sig(exitIdx: number, result: 'alvo' | 'stop' | 'be', r = 2): DtSignal {
  return {
    dir: -1,
    first: { idx: 0, price: 0 },
    second: { idx: 0, price: 0 },
    boxHi: 0,
    boxLo: 0,
    idx: exitIdx - 1,
    trigger: 'rejeição',
    entry: 100,
    stop: 101,
    target: 100 - r,
    targetFrom: { idx: 0, price: 0 },
    targetKind: 'fundo',
    exit: { idx: exitIdx, result },
    beIdx: null,
    beStop: result === 'be' ? 99.9 : null,
  };
}

describe('curva de capital com retiradas', () => {
  it('sem retiradas, compõe: 1% de risco, +2R e depois -1R', () => {
    const e = equityCurve(bars(48), [sig(5, 'alvo', 2), sig(10, 'stop')], { capital: 1000, riskPct: 1, everyDays: 0 });
    expect(e.account[4]).toBe(1000);
    expect(e.account[5]).toBeCloseTo(1020, 6);
    expect(e.account[10]).toBeCloseTo(1020 * 0.99, 6);
    expect(e.withdrawn[47]).toBe(0);
    expect(e.total[47]).toBeCloseTo(e.account[47], 6);
    expect(e.withdrawals).toBe(0);
  });

  it('retira o lucro acima do capital inicial no fim do dia: a conta volta a 1000', () => {
    const e = equityCurve(bars(72), [sig(5, 'alvo', 2), sig(30, 'alvo', 3)], { capital: 1000, riskPct: 1, everyDays: 1 });
    // dia 1 (velas 0-23): +20 retirado à passagem para o dia 2
    expect(e.account[23]).toBe(1000);
    expect(e.withdrawn[23]).toBeCloseTo(20, 6);
    expect(e.account[30]).toBeCloseTo(1030, 6);
    expect(e.account[47]).toBe(1000);
    expect(e.withdrawn[47]).toBeCloseTo(50, 6);
    expect(e.total[71]).toBeCloseTo(1050, 6);
    expect(e.withdrawals).toBe(2);
  });

  it('se a conta está abaixo do capital inicial, não retira nem repõe', () => {
    const e = equityCurve(bars(48), [sig(5, 'stop')], { capital: 1000, riskPct: 1, everyDays: 1 });
    expect(e.account[47]).toBeCloseTo(990, 6);
    expect(e.withdrawn[47]).toBe(0);
  });

  it('retira a cada 2 dias: só no fim do segundo dia', () => {
    const e = equityCurve(bars(96), [sig(5, 'alvo', 2)], { capital: 1000, riskPct: 1, everyDays: 2 });
    expect(e.withdrawn[23]).toBe(0);
    expect(e.account[47]).toBe(1000);
    expect(e.withdrawn[47]).toBeCloseTo(20, 6);
  });

  it('o BE conta o seu pequeno ganho; sinais sem saída não contam', () => {
    const be = sig(5, 'be');
    const open: DtSignal = { ...sig(7, 'alvo'), exit: null };
    const e = equityCurve(bars(24), [be, open], { capital: 1000, riskPct: 1, everyDays: 0 });
    expect(e.account[23]).toBeGreaterThan(1000);
    expect(e.account[23]).toBeCloseTo(1001, 6);
  });

  it('está no catálogo como painel extra (não é por cima do gráfico) e calcula sem erros', () => {
    const def = getIndicator('doubletop-equity')!;
    expect(def.overlay).toBe(false);
    expect(def.outputs.map((o) => o.key)).toEqual(['account', 'withdrawn', 'total']);
    const r = def.compute(bars(100), defaultParams(def), { historyDone: true });
    expect(r.values.account).toHaveLength(100);
    expect(r.values.account[99]).toBe(1000);
    expect(def.compute(bars(10), defaultParams(def)).wantHistory).toBe(false);
  });
});
