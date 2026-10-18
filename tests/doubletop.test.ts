import { describe, expect, it } from 'vitest';
import { drawDoubleTops, scanDoubleTops, signalR, DT_DEFAULTS } from '@/core/indicators/doubletop';
import { atrFilled } from '@/core/indicators/apocalypse';
import { defaultParams, getIndicator } from '@/core/indicators/registry';
import type { Bar } from '@/core/types';

const T0 = Date.UTC(2024, 0, 1) / 1000;

/** Velas em linha reta entre pontos [vela, preço], com pavios pequenos. */
function path(points: [number, number][]): Bar[] {
  const out: Bar[] = [];
  let prev = points[0][1];
  for (let a = 0; a < points.length - 1; a++) {
    const [i0, p0] = points[a];
    const [i1, p1] = points[a + 1];
    for (let i = i0 + (a === 0 ? 0 : 1); i <= i1; i++) {
      const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      const o = prev;
      prev = c;
      out.push({ time: T0 + i * 300, open: o, high: Math.max(o, c) + 0.3, low: Math.min(o, c) - 0.3, close: c, volume: 1 });
    }
  }
  return out;
}

const flip = (bars: Bar[]): Bar[] => bars.map((b) => ({ ...b, open: 200 - b.open, high: 200 - b.low, low: 200 - b.high, close: 200 - b.close }));
const run = (bars: Bar[]) => scanDoubleTops(bars, atrFilled(bars, 14), DT_DEFAULTS);

/** Vela de expansão para baixo (venda) na vela i, a abrir onde a anterior fechou. */
function expansionDown(bars: Bar[], i: number, size = 3) {
  const o = bars[i - 1].close;
  bars[i] = { ...bars[i], open: o, high: o + 0.2, low: o - size - 0.2, close: o - size };
}

/** Topo duplo com vale fundo (correção a sério): a saída é o vale. */
function deepValley() {
  const b = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [80, 95]]);
  expansionDown(b, 49);
  return b;
}

describe('topo e fundo duplo', () => {
  it('topo duplo com vale fundo: venda na vela de expansão, stop acima da caixa, saída no vale, e acerta o alvo', () => {
    const bars = deepValley();
    const { signals } = run(bars);
    const s = signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    const x = s[0];
    expect(x.idx).toBe(49);
    expect(x.trigger).toBe('expansão');
    expect(x.first.idx).toBe(20);
    expect(x.entry).toBeCloseTo(bars[49].close, 6);
    expect(x.stop).toBeGreaterThan(x.boxHi);
    expect(x.boxHi).toBeGreaterThanOrEqual(Math.max(x.first.price, x.second.price));
    expect(x.boxLo).toBeLessThan(x.boxHi);
    expect(x.targetKind).toBe('vale');
    expect(x.targetFrom.idx).toBeGreaterThan(20);
    expect(x.targetFrom.idx).toBeLessThan(49);
    expect(x.target).toBeCloseTo(104.7, 5);
    expect(x.exit?.result).toBe('alvo');
    expect(signalR(x)!).toBeGreaterThan(1);
  });

  it('topos no fim de uma tendência sem correção (vale raso): a saída é a origem da pernada', () => {
    const bars = path([[0, 100], [20, 120], [26, 116], [32, 119.9], [33, 119.7], [70, 95]]);
    expansionDown(bars, 33);
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].targetKind).toBe('origem');
    expect(s[0].target).toBeCloseTo(99.7, 5);
    expect(s[0].exit?.result).toBe('alvo');
  });

  it('vela de rejeição (pavio grande na zona), mesmo sendo verde, também confirma', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [47, 118.6], [48, 118.4], [80, 95]]);
    bars[48] = { ...bars[48], open: 118.5, close: 119.0, high: 120.6, low: 118.3 };
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].idx).toBe(48);
    expect(s[0].trigger).toBe('rejeição');
    expect(s[0].boxHi).toBeCloseTo(120.6, 6);
    expect(s[0].stop).toBeGreaterThan(120.6);
  });

  it('sem vela de confirmação (só velas normais) não há entrada', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [80, 95]]);
    expect(run(bars).signals.filter((x) => x.dir === -1)).toHaveLength(0);
  });

  it('se o preço rompe bem acima do primeiro topo, não é topo duplo', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [50, 126], [51, 125.5], [80, 110]]);
    expansionDown(bars, 51);
    expect(run(bars).signals.filter((x) => x.dir === -1)).toHaveLength(0);
  });

  it('se o segundo topo fica longe do primeiro, não conta', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [48, 115], [49, 114.8], [80, 95]]);
    expansionDown(bars, 49);
    expect(run(bars).signals.filter((x) => x.dir === -1)).toHaveLength(0);
  });

  it('o resultado pode ser o stop', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [60, 125], [80, 130]]);
    expansionDown(bars, 49);
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].exit?.result).toBe('stop');
    expect(signalR(s[0])).toBe(-1);
  });

  it('fundo duplo (o espelho): compra, stop abaixo da caixa, saída no pico entre os fundos', () => {
    const bars = flip(deepValley());
    const s = run(bars).signals.filter((x) => x.dir === 1);
    expect(s).toHaveLength(1);
    const x = s[0];
    expect(x.idx).toBe(49);
    expect(x.stop).toBeLessThan(x.boxLo);
    expect(x.target).toBeGreaterThan(x.entry);
    expect(x.targetKind).toBe('vale');
    expect(x.exit?.result).toBe('alvo');
  });

  it('não repinta: com menos velas, os sinais que já existiam são os mesmos e só aparecem depois da confirmação', () => {
    const bars = deepValley();
    const full = run(bars).signals.map((s) => `${s.dir}:${s.idx}:${s.entry.toFixed(4)}:${s.stop.toFixed(4)}:${s.target.toFixed(4)}`);
    for (let cut = 30; cut <= bars.length; cut += 3) {
      const part = run(bars.slice(0, cut)).signals.map((s) => `${s.dir}:${s.idx}:${s.entry.toFixed(4)}:${s.stop.toFixed(4)}:${s.target.toFixed(4)}`);
      for (const p of part) expect(full).toContain(p);
    }
    expect(run(bars.slice(0, 49)).signals).toHaveLength(0);
    expect(run(bars.slice(0, 50)).signals.filter((s) => s.dir === -1)).toHaveLength(1);
  });

  it('a tocar na zona sem confirmar, mostra a zona à espera de confirmação', () => {
    const bars = path([[0, 100], [20, 120], [35, 105], [48, 119.8]]);
    const r = run(bars);
    expect(r.signals).toHaveLength(0);
    expect(r.pending.some((p) => p.dir === -1 && p.first.idx === 20)).toBe(true);
    const d = drawDoubleTops(bars, r);
    expect(d.draw.rects?.some((x) => x.dash)).toBe(true);
    expect(d.draw.texts.some((t) => /à espera de confirmação/.test(t.text))).toBe(true);
  });

  it('desenha caixa, Stop, Entrada, Saída, a seta e o resultado; o cartão faz o placar', () => {
    const bars = deepValley();
    const d = drawDoubleTops(bars, run(bars));
    expect(d.draw.rects?.length).toBeGreaterThanOrEqual(1);
    for (const lbl of ['Stop', 'Entrada', 'Saída']) expect(d.draw.texts.some((t) => t.text === lbl)).toBe(true);
    expect(d.markers.some((m) => m.text?.startsWith('VENDA'))).toBe(true);
    expect(d.draw.texts.some((t) => t.text.startsWith('✓ alvo'))).toBe(true);
    expect(d.draw.panel!.lines[1].text).toMatch(/1 alvos · 0 stops/);
    // soma de todos os R dos sinais fechados
    const r = run(bars);
    const total = r.signals.map(signalR).filter((v): v is number => v !== null).reduce((a, b) => a + b, 0);
    expect(d.draw.panel!.lines[2].text).toBe(`soma +${total.toFixed(2)}R · média +${total.toFixed(2)}R por sinal`);
  });

  it('ruído e poucos dados não estoiram e são rápidos', () => {
    expect(run([]).signals).toEqual([]);
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let p = 100;
    const bars: Bar[] = Array.from({ length: 3000 }, (_, i) => {
      const o = p;
      p += (rnd() - 0.5) * 2;
      return { time: T0 + i * 300, open: o, high: Math.max(o, p) + rnd(), low: Math.min(o, p) - rnd(), close: p };
    });
    const t0 = performance.now();
    const r = run(bars);
    expect(performance.now() - t0).toBeLessThan(1000);
    for (const s of r.signals) {
      if (s.dir === -1) expect(s.stop > s.entry && s.target < s.entry).toBe(true);
      else expect(s.stop < s.entry && s.target > s.entry).toBe(true);
    }
  });

  it('está no catálogo e calcula sem erros', () => {
    const def = getIndicator('doubletop')!;
    expect(def.layer).toBe(true);
    const r = def.compute(deepValley(), defaultParams(def));
    expect(r.draw).toBeDefined();
  });
});
