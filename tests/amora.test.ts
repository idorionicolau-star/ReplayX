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

  it('custos: cada operação paga custo ÷ risco em R e o placar mostra o líquido', () => {
    const bars = breakoutUp([115, 120, 130]);
    const r = scanAmora(bars, flatAtr(bars.length), { ...AMORA_DEFAULTS, side: 'long' });
    const s = r.signals[0];
    const risk = s.entry - s.stop;
    expect(amoraR(s, 0.56)).toBeCloseTo(1.5 - 0.56 / risk, 6);
    const out = drawAmora(bars, r, 1.5, undefined, 0.56);
    const texts = out.draw.panel!.lines.map((l) => l.text);
    expect(texts.some((t) => t.startsWith('líquido (com custos): soma +1.5R'))).toBe(true);
    expect(texts.some((t) => t.startsWith('custo médio: 0.05R'))).toBe(true);
    // sem custos não aparece a linha do líquido
    expect(drawAmora(bars, r, 1.5).draw.panel!.lines.some((l) => l.text.startsWith('líquido'))).toBe(false);
    // pelo indicador: o custo entra em pips, com o pip do símbolo
    const def = INDICATORS.find((d) => d.id === 'amora')!;
    const res = def.compute(bars, { rr: 1.5, sens: 2, side: 'long', minBreak: 0, stopBuf: 0, maxRisk: 0, oneAtATime: true, costPips: 5.6, minSignals: 0 }, { historyDone: true, pip: 0.1 });
    expect(res.draw?.panel?.lines.some((l) => l.text.startsWith('custo médio: 0.05R'))).toBe(true);
  });

  it('filtro de tendência: só compra com o fecho acima da média e só vende abaixo; sem valor da média não entra', () => {
    const bars = breakoutUp([112, 113]);
    const N = bars.length;
    const below = Array.from({ length: N }, () => 120); // média acima do preço: tendência de baixa
    const above = Array.from({ length: N }, () => 90); // média abaixo: tendência de alta
    expect(scanAmora(bars, flatAtr(N), { ...AMORA_DEFAULTS, side: 'long', trend: below }).signals).toHaveLength(0);
    expect(scanAmora(bars, flatAtr(N), { ...AMORA_DEFAULTS, side: 'long', trend: above }).signals).toHaveLength(1);
    expect(scanAmora(bars, flatAtr(N), { ...AMORA_DEFAULTS, side: 'long', trend: Array.from({ length: N }, () => NaN) }).signals).toHaveLength(0);
    // vendas ao contrário
    const sell = series([110, 108, 106, 104, 102, 100, 102, 104, 106, 108, 110, 108, 106, 104, 102, 100.5, 99, 98]);
    const M = sell.length;
    expect(scanAmora(sell, flatAtr(M), { ...AMORA_DEFAULTS, side: 'short', trend: Array.from({ length: M }, () => 90) }).signals).toHaveLength(0);
    expect(scanAmora(sell, flatAtr(M), { ...AMORA_DEFAULTS, side: 'short', trend: Array.from({ length: M }, () => 120) }).signals).toHaveLength(1);
  });

  it('no indicador a EMA 200 vem ligada, aparece no gráfico e no cartão; 0 desliga', () => {
    const def = INDICATORS.find((d) => d.id === 'amora')!;
    expect(def.inputs.find((i) => i.key === 'trendEma')?.default).toBe(200);
    const bars = Array.from({ length: 400 }, (_, i) => {
      const c = 100 + i * 0.05 + 3 * Math.sin(i / 6);
      return { time: 1_700_000_000 + i * 60, open: c - 0.1, high: c + 0.5, low: c - 0.5, close: c };
    });
    const on = def.compute(bars, { rr: 1.5, trendEma: 200, sens: 2, side: 'both', minBreak: 0, stopBuf: 0, maxRisk: 0, oneAtATime: true, costPips: 0, minSignals: 0 });
    expect(Number.isFinite(on.values.ema[399])).toBe(true);
    expect(on.draw?.panel?.lines.some((l) => l.text.includes('EMA 200'))).toBe(true);
    const off = def.compute(bars, { rr: 1.5, trendEma: 0, sens: 2, side: 'both', minBreak: 0, stopBuf: 0, maxRisk: 0, oneAtATime: true, costPips: 0, minSignals: 0 });
    expect(off.values.ema.every((v) => Number.isNaN(v))).toBe(true);
    expect(off.draw?.panel?.lines.some((l) => l.text.includes('EMA'))).toBe(false);
  });
});
