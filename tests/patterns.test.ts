import { describe, expect, it } from 'vitest';
import { drawPatterns, scanPatterns, patSignalR, PAT_DEFAULTS, type PatOptions } from '@/core/indicators/patterns';
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
const run = (bars: Bar[], o: Partial<PatOptions> = {}) => scanPatterns(bars, atrFilled(bars, 14), { ...PAT_DEFAULTS, ...o });

/** Ombro-cabeça-ombro de topo: ombros em 120, cabeça em 130, pescoço em 108; depois rompe e cai até 80. */
const hsTop = () => path([[0, 100], [15, 120], [25, 108], [40, 130], [52, 108], [64, 120], [90, 80]]);

describe('padrões gráficos: ombro-cabeça-ombro', () => {
  it('ombro-cabeça-ombro: vende no rompimento do pescoço, com stop acima do ombro direito e alvo = altura da cabeça', () => {
    const bars = hsTop();
    const s = run(bars).signals.filter((x) => x.kind === 'hs-top');
    expect(s).toHaveLength(1);
    const x = s[0];
    expect(x.dir).toBe(-1);
    expect(bars[x.idx].close).toBeLessThan(108);
    expect(x.entry).toBeCloseTo(bars[x.idx].close, 9);
    expect(x.stop).toBeGreaterThan(120);
    // alvo: pescoço (~108) menos a altura (~22, da cabeça ao pescoço) = ~86
    expect(x.target).toBeGreaterThan(84);
    expect(x.target).toBeLessThan(87);
    expect(x.height).toBeGreaterThan(21);
    expect(x.height).toBeLessThan(23);
    expect(x.points.map((p) => p.label).filter(Boolean)).toEqual(['Ombro E', 'Cabeça', 'Ombro D']);
    expect(x.exit?.result).toBe('alvo');
    expect(patSignalR(x)!).toBeGreaterThan(1);
  });

  it('o invertido (o espelho) compra no rompimento do pescoço', () => {
    const bars = flip(hsTop());
    const s = run(bars).signals.filter((x) => x.kind === 'hs-bottom');
    expect(s).toHaveLength(1);
    expect(s[0].dir).toBe(1);
    expect(s[0].stop).toBeLessThan(80 + 10);
    expect(s[0].target).toBeGreaterThan(s[0].entry);
    expect(s[0].exit?.result).toBe('alvo');
    // e nada de topo no espelho
    expect(run(bars).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
  });

  it('só há sinal depois de a vela fechar abaixo do pescoço (não antes) e o padrão aparece a tracejado enquanto se forma', () => {
    const bars = hsTop();
    const all = run(bars).signals[0];
    expect(run(bars.slice(0, all.idx)).signals).toHaveLength(0);
    expect(run(bars.slice(0, all.idx + 1)).signals).toHaveLength(1);
    // ombro direito já confirmado, pescoço ainda por romper
    const forming = run(bars.slice(0, 70));
    expect(forming.signals).toHaveLength(0);
    expect(forming.pending.some((p) => p.kind === 'hs-top')).toBe(true);
    expect(drawPatterns(bars.slice(0, 70), forming).draw.texts.some((t) => /a formar-se/.test(t.text))).toBe(true);
  });

  it('ombros muito diferentes não são ombro-cabeça-ombro', () => {
    // ombro direito muito mais baixo (111 contra 120 no esquerdo; altura 22: diferença de 9 = 41%)
    const bars = path([[0, 100], [15, 120], [25, 108], [40, 130], [52, 108], [64, 112], [90, 80]]);
    expect(run(bars).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
  });

  it('cabeça que não passa os ombros não conta', () => {
    const bars = path([[0, 100], [15, 120], [25, 108], [40, 122], [52, 108], [64, 120], [90, 80]]);
    expect(run(bars).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
  });

  it('se o preço passa acima da cabeça, o padrão acaba (sem sinal)', () => {
    const bars = path([[0, 100], [15, 120], [25, 108], [40, 130], [52, 108], [64, 120], [72, 132], [100, 140]]);
    expect(run(bars).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
  });

  it('o stop pode ser o resultado: preço rompe o pescoço e depois sobe acima do ombro direito', () => {
    const bars = path([[0, 100], [15, 120], [25, 108], [40, 130], [52, 108], [64, 120], [72, 104], [90, 125]]);
    const s = run(bars).signals.filter((x) => x.kind === 'hs-top');
    expect(s).toHaveLength(1);
    expect(s[0].exit?.result).toBe('stop');
    expect(patSignalR(s[0])).toBe(-1);
  });

  it('desligado, não procura; R mínimo alto corta o sinal', () => {
    const bars = hsTop();
    expect(run(bars, { hs: false }).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
    expect(run(bars, { minR: 10 }).signals.filter((x) => x.kind === 'hs-top')).toHaveLength(0);
  });
});

/** Triângulo ascendente: topo plano em 120, fundos a subir; rompe para cima. */
const triAsc = () => path([[0, 95], [10, 120], [20, 100], [30, 120], [38, 108], [45, 120], [50, 114.5], [62, 135], [80, 150]]);
/** Triângulo descendente: fundo plano em 100, topos a descer; rompe para baixo. */
const triDesc = () => path([[0, 125], [10, 100], [20, 120], [30, 100], [38, 112], [45, 100], [50, 105.5], [62, 85], [80, 70]]);
/** Triângulo simétrico: topos a descer, fundos a subir; rompe para cima. */
const triSym = () => path([[0, 100], [10, 130], [20, 100], [30, 124], [38, 106], [46, 118], [52, 112], [58, 115.5], [66, 135], [80, 150]]);

describe('padrões gráficos: triângulos', () => {
  it('ascendente: topo plano e fundos a subir; rompe para cima, a favor do padrão', () => {
    const bars = triAsc();
    const s = run(bars).signals.filter((x) => x.kind === 'tri-asc');
    expect(s).toHaveLength(1);
    expect(s[0].dir).toBe(1);
    expect(s[0].expected).toBe(true);
    expect(bars[s[0].idx].close).toBeGreaterThan(120);
    expect(s[0].target).toBeGreaterThan(s[0].entry);
    expect(s[0].stop).toBeLessThan(s[0].entry);
    expect(s[0].exit?.result).toBe('alvo');
  });

  it('descendente (o espelho do ascendente): fundo plano e topos a descer; rompe para baixo', () => {
    const bars = triDesc();
    const s = run(bars).signals.filter((x) => x.kind === 'tri-desc');
    expect(s).toHaveLength(1);
    expect(s[0].dir).toBe(-1);
    expect(s[0].expected).toBe(true);
    expect(bars[s[0].idx].close).toBeLessThan(100);
    expect(s[0].exit?.result).toBe('alvo');
  });

  it('simétrico: as duas linhas convergem; o rompimento não tem lado esperado', () => {
    const bars = triSym();
    const s = run(bars).signals.filter((x) => x.kind === 'tri-sym');
    expect(s).toHaveLength(1);
    expect(s[0].expected).toBeNull();
    expect(s[0].lines.map((l) => l.role).sort()).toEqual(['baixo', 'cima']);
    expect(s[0].height).toBeGreaterThan(10);
  });

  it('um triângulo ascendente que rompe para baixo conta como "contra"', () => {
    const bars = path([[0, 95], [10, 120], [20, 100], [30, 120], [38, 108], [45, 120], [50, 112], [62, 90], [80, 70]]);
    const s = run(bars).signals.filter((x) => x.kind === 'tri-asc');
    expect(s).toHaveLength(1);
    expect(s[0].dir).toBe(-1);
    expect(s[0].expected).toBe(false);
  });

  it('não repinta: só há sinal quando a vela fecha para lá da linha, e com menos velas não aparece', () => {
    const bars = triAsc();
    const s = run(bars).signals.find((x) => x.kind === 'tri-asc')!;
    expect(run(bars.slice(0, s.idx)).signals.filter((x) => x.kind === 'tri-asc')).toHaveLength(0);
    expect(run(bars.slice(0, s.idx + 1)).signals.filter((x) => x.kind === 'tri-asc')).toHaveLength(1);
    expect(run(bars.slice(0, s.idx - 2)).pending.some((p) => p.kind === 'tri-asc')).toBe(true);
  });

  it('linhas paralelas (canal) ou a abrir não são triângulos', () => {
    // canal a subir: topos e fundos paralelos
    const chan = path([[0, 95], [10, 115], [20, 100], [30, 120], [40, 105], [50, 125], [60, 110], [70, 130], [90, 150]]);
    expect(run(chan).signals.filter((x) => x.kind.startsWith('tri'))).toHaveLength(0);
    // megafone: topos a subir e fundos a descer
    const mega = path([[0, 100], [10, 110], [20, 95], [30, 120], [40, 85], [50, 130], [60, 75], [80, 150]]);
    expect(run(mega).signals.filter((x) => x.kind.startsWith('tri'))).toHaveLength(0);
  });

  it('desligado, não procura', () => {
    expect(run(triAsc(), { tri: false }).signals).toHaveLength(0);
  });
});

describe('padrões gráficos: geral', () => {
  it('desenha linhas, marcas, resultado e o cartão com o placar por tipo', () => {
    const bars = hsTop();
    const d = drawPatterns(bars, run(bars));
    expect(d.draw.lines.length).toBeGreaterThan(5);
    expect(d.draw.texts.some((t) => t.text === 'Cabeça')).toBe(true);
    expect(d.draw.texts.some((t) => t.text.startsWith('✓ alvo'))).toBe(true);
    expect(d.markers.some((m) => m.text?.startsWith('VENDA (Ombro-cabeça-ombro'))).toBe(true);
    expect(d.draw.panel!.lines[0].text).toBe('Padrões gráficos: 1 sinais');
    expect(d.draw.panel!.lines.some((l) => /^Ombro-cabeça-ombro: 1 · 1 alvos · 0 stops · soma \+/.test(l.text))).toBe(true);
  });

  it('ruído, vazio e poucos dados não estoiram, são rápidos e dão sempre stop e alvo do lado certo', () => {
    expect(run([]).signals).toEqual([]);
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let p = 100;
    const bars: Bar[] = Array.from({ length: 4000 }, (_, i) => {
      const o = p;
      p += (rnd() - 0.5) * 2;
      return { time: T0 + i * 300, open: o, high: Math.max(o, p) + rnd(), low: Math.min(o, p) - rnd(), close: p };
    });
    const t0 = performance.now();
    const r = run(bars);
    expect(performance.now() - t0).toBeLessThan(1500);
    for (const s of r.signals) {
      if (s.dir === -1) expect(s.stop > s.entry && s.target < s.entry).toBe(true);
      else expect(s.stop < s.entry && s.target > s.entry).toBe(true);
    }
  });

  it('está no catálogo, calcula sem erros e pede mais passado até ao objetivo', () => {
    const def = getIndicator('patterns')!;
    expect(def.layer).toBe(true);
    const bars = hsTop();
    const p = defaultParams(def);
    expect(p.minSignals).toBe(100);
    const more = def.compute(bars, p, { historyDone: false });
    expect(more.markers!.length).toBeGreaterThan(0);
    expect(more.wantHistory).toBe(true);
    expect(def.compute(bars, p, { historyDone: true }).wantHistory).toBe(false);
    expect(def.compute(bars, { ...p, minSignals: 0 }, { historyDone: false }).wantHistory).toBe(false);
  });
});
