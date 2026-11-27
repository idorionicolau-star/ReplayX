import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/types';
import { AMORA_DEFAULTS, amoraR, drawAmora, scanAmora } from '@/core/indicators/amora';
import { INDICATORS } from '@/core/indicators/registry';

/** Velas a partir de uma lista de preços de fecho (corpo pequeno, pavio de ±0,2). */
function series(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const o = i ? closes[i - 1] : c;
    return { time: 1_700_000_000 + i * 60, open: o, high: Math.max(o, c) + 0.2, low: Math.min(o, c) - 0.2, close: c };
  });
}
const flatAtr = (n: number, v = 1) => Array.from({ length: n }, () => v);

/** Sobe a 110, desce a 100, sobe de novo e rompe o 110 (vela de fecho 111), e depois anda `after`. */
function breakoutUp(after: number[]): Bar[] {
  const up = [100, 102, 104, 106, 108, 110];
  const down = [108, 106, 104, 102, 100];
  const again = [102, 104, 106, 108, 109.5];
  return series([...up, ...down, ...again, 111, ...after]);
}

describe('Amora: breakouts com RR', () => {
  it('compra na primeira vela que fecha acima do último topo; stop no último fundo; alvo a 1:1,5', () => {
    const bars = breakoutUp([112, 113]);
    const r = scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long' });
    expect(r.signals).toHaveLength(1);
    const s = r.signals[0];
    expect(s.dir).toBe(1);
    expect(bars[s.idx].close).toBe(111);
    expect(s.entry).toBe(111);
    expect(s.level.type).toBe('H');
    expect(s.level.price).toBeCloseTo(110.2, 6); // máximo do topo (pavio)
    expect(s.structure.type).toBe('L');
    expect(s.stop).toBeCloseTo(99.8, 6); // mínimo do fundo anterior
    expect(s.target).toBeCloseTo(111 + 1.5 * (111 - 99.8), 6);
  });

  it('o RR é ajustável e o alvo acompanha', () => {
    const bars = breakoutUp([112]);
    const s = scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long', rr: 3 }).signals[0];
    expect((s.target - s.entry) / (s.entry - s.stop)).toBeCloseTo(3, 6);
  });

  it('só a PRIMEIRA vela que fecha fora conta: as seguintes acima do mesmo nível não repetem o sinal', () => {
    const bars = breakoutUp([111.5, 112, 111.8, 112.5]);
    expect(scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long', oneAtATime: false }).signals).toHaveLength(1);
  });

  it('um pavio acima do topo sem fecho acima não é breakout', () => {
    const bars = breakoutUp([]).slice(0, -1);
    bars.push({ time: bars[bars.length - 1].time + 60, open: 109.5, high: 112, low: 109.3, close: 109.9 });
    expect(scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long' }).signals).toHaveLength(0);
  });

  it('fecha no alvo ou no stop (na mesma vela conta o stop) e conta o R', () => {
    const win = breakoutUp([115, 120, 130]);
    const w = scanAmora(win, flatAtr(win.length), { ...AMORA_DEFAULTS, side: 'long' }).signals[0];
    expect(w.exit?.result).toBe('alvo');
    expect(amoraR(w)).toBeCloseTo(1.5, 6);
    const lose = breakoutUp([105, 100, 98]);
    const l = scanAmora(lose, flatAtr(lose.length), { ...AMORA_DEFAULTS, side: 'long' }).signals[0];
    expect(l.exit?.result).toBe('stop');
    expect(amoraR(l)).toBe(-1);
  });

  it('venda espelhada: fecho abaixo do último fundo, stop no último topo', () => {
    const bars = series([110, 108, 106, 104, 102, 100, 102, 104, 106, 108, 110, 108, 106, 104, 102, 100.5, 99, 98]);
    const s = scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'short' }).signals[0];
    expect(s.dir).toBe(-1);
    expect(s.entry).toBe(99);
    expect(s.stop).toBeCloseTo(110.2, 6);
    expect(s.target).toBeCloseTo(99 - 1.5 * (110.2 - 99), 6);
  });

  it('não repinta: acrescentar velas não muda os sinais já dados', () => {
    const a = breakoutUp([112, 113, 111, 109]);
    const b = breakoutUp([112, 113, 111, 109, 107, 105, 108, 112, 116]);
    const sa = scanAmora(a, flatAtr(a.length), AMORA_DEFAULTS).signals;
    const sb = scanAmora(b, flatAtr(b.length), AMORA_DEFAULTS).signals;
    for (const s of sa) {
      const same = sb.find((x) => x.idx === s.idx);
      expect(same).toBeTruthy();
      expect(same!.entry).toBe(s.entry);
      expect(same!.stop).toBe(s.stop);
    }
  });

  it('desenha a caixa de RR (alvo verde e stop vermelho) e o placar; está na lista de indicadores', () => {
    const bars = breakoutUp([115, 120, 130]);
    const r = scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long' });
    const out = drawAmora(bars, r, 1.5);
    expect(out.draw.rects).toHaveLength(2);
    expect(out.markers[0].text).toContain('1:1.5');
    expect(out.draw.panel?.lines[0].text).toContain('1 sinais');
    const def = INDICATORS.find((d) => d.id === 'amora')!;
    expect(def).toBeTruthy();
    const res = def.compute(bars, { rr: 2, sens: 2, side: 'long', minBreak: 0, stopBuf: 0, maxRisk: 0, oneAtATime: true, minSignals: 0 });
    expect(res.draw?.rects?.length).toBe(2);
  });
});
