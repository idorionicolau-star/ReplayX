import { describe, expect, it } from 'vitest';
import { positionOutcome, type OutcomeBar } from '@/chart/drawings/positionOutcome';

const bar = (time: number, low: number, high: number, close = (low + high) / 2): OutcomeBar => ({ time, low, high, close });

describe('ferramenta de posição: só conta depois de tocar na entrada', () => {
  // longa: entrada 100, stop 95, alvo 110
  it('o preço ficou sempre acima da entrada: pendente, nada contado (o caso do print)', () => {
    const r = positionOutcome([bar(1, 101, 104), bar(2, 102, 106), bar(3, 101, 105)], true, 100, 95, 110);
    expect(r.status).toBe('pending');
    expect(r.fillTime).toBeNull();
    expect(r.endTime).toBeNull();
  });
  it('o preço foi ao alvo sem tocar na entrada: sem entrada', () => {
    expect(positionOutcome([bar(1, 101, 104), bar(2, 104, 111)], true, 100, 95, 110).status).toBe('missed');
  });
  it('toca na entrada e depois no alvo: ganho, contado a partir da vela de entrada', () => {
    const r = positionOutcome([bar(1, 101, 104), bar(2, 99, 103), bar(3, 102, 111)], true, 100, 95, 110);
    expect(r.status).toBe('tp');
    expect(r.fillTime).toBe(2);
    expect(r.endTime).toBe(3);
    expect(r.endPrice).toBe(110);
  });
  it('toca na entrada e depois no stop: perda', () => {
    expect(positionOutcome([bar(1, 99, 103), bar(2, 94, 100)], true, 100, 95, 110).status).toBe('sl');
  });
  it('a mesma vela toca no stop e no alvo: conta o stop (conservador)', () => {
    expect(positionOutcome([bar(1, 94, 111)], true, 100, 95, 110).status).toBe('sl');
  });
  it('entrada tocada e nada atingido: aberta, no fecho da última vela', () => {
    const r = positionOutcome([bar(1, 99, 103, 102), bar(2, 100, 104, 103)], true, 100, 95, 110);
    expect(r.status).toBe('open');
    expect(r.endPrice).toBe(103);
  });
  it('curta: entrada 100, stop 105, alvo 90 — preço sempre abaixo da entrada fica pendente', () => {
    expect(positionOutcome([bar(1, 94, 98), bar(2, 93, 97)], false, 100, 105, 90).status).toBe('pending');
  });
  it('curta: sobe à entrada e cai ao alvo', () => {
    expect(positionOutcome([bar(1, 94, 98), bar(2, 97, 101), bar(3, 88, 99)], false, 100, 105, 90).status).toBe('tp');
  });
});
