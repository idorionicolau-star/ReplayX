import { describe, expect, it } from 'vitest';
import { FINE_AHEAD_BARS, FINE_FIRST_BARS, fineAheadPlan } from '@/replay/fineAhead';

const NOW = 2_000_000_000;

describe('dados finos à frente do cursor (replay com ordem aberta)', () => {
  it('sem nada carregado pede a folga completa à frente', () => {
    const plan = fineAheadPlan({ cursor: 1_000_000, barSec: 60, now: NOW, covered: () => false });
    expect(plan).toEqual({ from: 1_000_000, to: 1_000_000 + 60 * FINE_AHEAD_BARS });
  });

  it('não pede nada enquanto a primeira metade da folga já está carregada', () => {
    const cursor = 1_000_000;
    const half = cursor + (60 * FINE_AHEAD_BARS) / 2;
    const covered = (a: number, b: number) => a >= cursor && b <= half;
    expect(fineAheadPlan({ cursor, barSec: 60, now: NOW, covered })).toBeNull();
    // passo a passo o cursor avança e, quando a folga fica abaixo de metade, repõe
    const later = fineAheadPlan({ cursor: cursor + 60 * 100, barSec: 60, now: NOW, covered });
    expect(later).not.toBeNull();
    expect(later!.from).toBe(cursor + 60 * 100);
  });

  it('o primeiro carregamento ao abrir a ordem é pequeno (um só pedido)', () => {
    const plan = fineAheadPlan({ cursor: 1_000_000, barSec: 60, now: NOW, covered: () => false, ahead: FINE_FIRST_BARS });
    expect(plan!.to - plan!.from).toBe(60 * FINE_FIRST_BARS);
    expect(FINE_FIRST_BARS).toBeLessThanOrEqual(1000); // limite da Binance por pedido
  });

  it('perto do tempo real não pede além de agora', () => {
    const cursor = NOW - 600;
    const plan = fineAheadPlan({ cursor, barSec: 60, now: NOW, covered: () => false });
    expect(plan!.to).toBe(NOW + 60);
  });

  it('depois do tempo real não há nada a pedir', () => {
    expect(fineAheadPlan({ cursor: NOW + 120, barSec: 60, now: NOW, covered: () => false })).toBeNull();
  });
});
