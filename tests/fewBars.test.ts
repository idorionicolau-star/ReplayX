import { describe, expect, it } from 'vitest';
import { fewBarsMessage } from '@/components/strategy/run';

const base = { name: 'XAUUSD', tf: 'D', n: 35 };

describe('mensagem de poucos dados no testador', () => {
  it('no replay explica que só conta o que vem antes do cursor', () => {
    const m = fewBarsMessage({ ...base, replay: true, startReached: false, first: null });
    expect(m).toContain('35 barras');
    expect(m).toContain('antes do cursor');
  });
  it('quando a fonte acabou diz desde quando há dados e sugere um intervalo mais curto', () => {
    const m = fewBarsMessage({ ...base, replay: false, startReached: true, first: Date.UTC(2026, 7, 20) / 1000 });
    expect(m).toContain('A fonte só tem dados desde');
    expect(m).toContain('H4');
  });
  it('quando não conseguiu carregar mais, diz para tentar outra vez', () => {
    const m = fewBarsMessage({ ...base, replay: false, startReached: false, first: null });
    expect(m).toContain('Não consegui carregar mais histórico');
  });
});
