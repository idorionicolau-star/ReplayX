import { describe, expect, it } from 'vitest';
import { clampLevels, defaultLevels, fmtLot, LOT_LADDER, mirror, orderKind, stepLot } from '@/core/trading/ticket';

describe('bilhete de ordem', () => {
  it('escada de lotes sobe e desce degrau a degrau', () => {
    expect(LOT_LADDER.slice(0, 7)).toEqual([0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]);
    expect(stepLot(0.01, 1)).toBe(0.02);
    expect(stepLot(0.05, 1)).toBe(0.1);
    expect(stepLot(1, 1)).toBe(2);
    expect(stepLot(1, -1)).toBe(0.5);
    expect(stepLot(0.01, -1)).toBe(0.01);
    // valores fora da escada vão ao degrau seguinte/anterior
    expect(stepLot(0.3, 1)).toBe(0.5);
    expect(stepLot(0.3, -1)).toBe(0.2);
    expect(stepLot(0, 1)).toBe(0.02);
  });
  it('formata lotes', () => {
    expect(fmtLot(0.1)).toBe('0.1');
    expect(fmtLot(250)).toBe('250');
  });
  it('tipo de ordem pelo preço de entrada', () => {
    expect(orderKind('long', 1.08, 1.09, 0.0001)).toBe('limit');
    expect(orderKind('long', 1.1, 1.09, 0.0001)).toBe('stop');
    expect(orderKind('short', 1.1, 1.09, 0.0001)).toBe('limit');
    expect(orderKind('short', 1.08, 1.09, 0.0001)).toBe('stop');
    expect(orderKind('long', 1.09, 1.09, 0.0001)).toBe('market');
  });
  it('níveis por defeito e limites', () => {
    const l = defaultLevels('long', 1, 0.0001, 20, 2);
    expect(l.sl).toBeCloseTo(0.998);
    expect(l.tp).toBeCloseTo(1.004);
    const s = defaultLevels('short', 1, 0.0001, 20, 2);
    expect(s.sl).toBeCloseTo(1.002);
    expect(s.tp).toBeCloseTo(0.996);
    expect(clampLevels('long', 1, 1.01, 0.99, 0.001)).toEqual({ sl: 0.999, tp: 1.001 });
    expect(clampLevels('short', 1, 0.99, 1.01, 0.001)).toEqual({ sl: 1.001, tp: 0.999 });
    expect(mirror(1, 0.998)).toBeCloseTo(1.002);
  });
});
