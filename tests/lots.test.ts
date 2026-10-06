import { describe, expect, it } from 'vitest';
import { DEFAULT_LOT_RULES, lotForRisk, lotLadder, lotRule, snapLot, stepLotRule } from '@/core/trading/lots';
import type { ContractSpec } from '@/core/trading/engine';

const fx: ContractSpec = { contractSize: 100000, toAccount: () => 1, spread: 0, slippage: 0, commission: { type: 'none', value: 0 } };
const units: ContractSpec = { contractSize: 1, toAccount: () => 1, spread: 0, slippage: 0, commission: { type: 'none', value: 0 } };

describe('regras de lote por ativo', () => {
  it('ajusta ao passo e aos limites', () => {
    const r = DEFAULT_LOT_RULES.forex;
    expect(snapLot(0.123, r)).toBe(0.12);
    expect(snapLot(0.123, r, 'down')).toBe(0.12);
    expect(snapLot(0.129, r, 'down')).toBe(0.12);
    expect(snapLot(0.001, r)).toBe(0.01);
    expect(snapLot(500, r)).toBe(100);
    expect(snapLot(2.4, DEFAULT_LOT_RULES.stocks)).toBe(2);
    expect(snapLot(0.0123, DEFAULT_LOT_RULES.crypto)).toBe(0.012);
  });
  it('escada começa no mínimo do ativo e respeita o máximo', () => {
    expect(lotLadder(DEFAULT_LOT_RULES.forex).slice(0, 8)).toEqual([0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2]);
    expect(lotLadder(DEFAULT_LOT_RULES.crypto).slice(0, 4)).toEqual([0.001, 0.002, 0.005, 0.01]);
    expect(lotLadder(DEFAULT_LOT_RULES.stocks).slice(0, 5)).toEqual([1, 2, 5, 10, 20]);
    const f = lotLadder(DEFAULT_LOT_RULES.forex);
    expect(f[f.length - 1]).toBe(100);
    expect(stepLotRule(1, 1, DEFAULT_LOT_RULES.stocks)).toBe(2);
    expect(stepLotRule(1, -1, DEFAULT_LOT_RULES.stocks)).toBe(1);
    expect(stepLotRule(0.01, 1, DEFAULT_LOT_RULES.forex)).toBe(0.02);
  });
  it('regras do utilizador sobrepõem as de omissão', () => {
    expect(lotRule('forex', { forex: { min: 0.1, step: 0.1, max: 50 } }).min).toBe(0.1);
    expect(lotRule('crypto', { forex: { min: 0.1, step: 0.1, max: 50 } }).min).toBe(0.001);
  });
  it('lote pelo risco: forex 1% de 10 000 com stop de 20 pips', () => {
    // 20 pips = 0,0020; por lote = 0,0020 × 100 000 = 200 → 100 / 200 = 0,5 lotes
    const r = lotForRisk('long', 100, 1.1, 1.098, fx, DEFAULT_LOT_RULES.forex);
    expect(r.qty).toBeCloseTo(0.5, 5);
    expect(r.risk).toBeCloseTo(100, 4);
    expect(r.minExceeds).toBe(false);
  });
  it('arredonda para baixo para nunca arriscar mais do que o pretendido', () => {
    // 100 / 150 por lote = 0,666… → 0,66
    const r = lotForRisk('long', 100, 1.1, 1.0985, fx, DEFAULT_LOT_RULES.forex);
    expect(r.qty).toBe(0.66);
    expect(r.risk).toBeLessThanOrEqual(100);
  });
  it('avisa quando o lote mínimo já excede o risco', () => {
    // stop de 1000 pontos num índice de 1 unidade: por unidade = 1000; risco pretendido 5 → 0,005 < mínimo 0,01
    const r = lotForRisk('short', 5, 1000, 2000, units, DEFAULT_LOT_RULES.synthetic);
    expect(r.qty).toBe(0.01);
    expect(r.minExceeds).toBe(true);
    expect(r.risk).toBeCloseTo(10, 5);
  });
});
