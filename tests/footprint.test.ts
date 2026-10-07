import { describe, expect, it } from 'vitest';
import { drawFootprint, scanFootprint, type FpSetup } from '@/core/indicators/footprint';
import { atrFilled } from '@/core/indicators/apocalypse';
import { defaultParams, getIndicator } from '@/core/indicators/registry';
import type { Bar } from '@/core/types';

const T0 = Date.UTC(2024, 0, 1) / 1000;

/** Trajeto em linhas retas entre pontos [vela, preço]. */
function path(points: [number, number][], scale = 1, flip = false): Bar[] {
  const out: Bar[] = [];
  let prev = 0;
  for (let a = 0; a < points.length - 1; a++) {
    const [i0, p0] = points[a];
    const [i1, p1] = points[a + 1];
    for (let i = i0 + (a === 0 ? 0 : 1); i <= i1; i++) {
      const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      const o = out.length ? prev : c;
      prev = c;
      const hi = Math.max(o, c) + 0.3;
      const lo = Math.min(o, c) - 0.3;
      out.push(
        flip
          ? { time: T0 + i * 900, open: -o * scale, high: -lo * scale, low: -hi * scale, close: -c * scale, volume: 1 }
          : { time: T0 + i * 900, open: o * scale, high: hi * scale, low: lo * scale, close: c * scale, volume: 1 },
      );
    }
  }
  return out;
}

/** Topo, fundo, topo mais baixo, descida mais inclinada com recuos, rompimento e reteste num fundo mais alto. */
const BUY: [number, number][] = [
  [0, 60], [20, 100], [40, 80], [52, 95], [56, 80], [58, 85], [64, 60], [66, 66], [72, 40], [80, 70], [90, 55], [100, 85],
];

/** %K e %D à mão: o fundo do reteste tem o Estocástico mais baixo (divergência) ou mais alto (sem divergência). */
function stoch(n: number, l2 = 72, l3 = 90, l3Low = 5, flip = false) {
  const k = Array(n).fill(60);
  const d = Array(n).fill(30);
  for (let i = l2 - 2; i <= l2 + 2; i++) k[i] = 15;
  for (let i = l3 - 2; i <= l3 + 2; i++) k[i] = l3Low;
  for (let i = l3 + 3; i < n; i++) k[i] = 60;
  for (let i = l2 + 3; i < l3 - 2; i++) k[i] = 60;
  return flip ? { k: k.map((v) => 100 - v), d: d.map((v) => 100 - v) } : { k, d };
}

const run = (bars: Bar[], k: number[], d: number[], sens = 1.5, ratio = 1.3): FpSetup[] => scanFootprint(bars, atrFilled(bars, 14), k, d, { sens, slopeRatio: ratio, sizeRatio: 1.3, minMove: 3 });
const signals = (s: FpSetup[]) => s.filter((x) => x.signal !== null);

describe('método footprint + layer line + divergência escondida', () => {
  const bars = path(BUY);
  const { k, d } = stoch(bars.length);

  it('compra: footprint de queda, layer line rompida, reteste mais alto e divergência dão a entrada', () => {
    const s = run(bars, k, d);
    const sig = signals(s);
    expect(sig).toHaveLength(1);
    const x = sig[0];
    expect(x.dir).toBe(1);
    expect(x.h2.price).toBeLessThan(x.h1.price); // topo mais baixo
    expect(x.l2.price).toBeLessThan(x.l1.price); // fundo mais baixo
    expect(x.brk).not.toBeNull();
    expect(x.brk!).toBeGreaterThan(x.l2.idx);
    expect(x.l3!.price).toBeGreaterThan(x.l2.price); // fundo mais alto no reteste
    expect(x.signal!).toBeGreaterThan(x.l3!.idx); // a entrada vem depois do fundo do reteste
    expect(x.stop!).toBeLessThan(x.l3!.price);
  });

  it('a layer line sai do topo mais baixo, não corta nenhuma vela da perna e toca num topo de recuo', () => {
    const x = signals(run(bars, k, d))[0];
    expect(x.layerAt(x.h2.idx)).toBeCloseTo(x.h2.price, 6);
    // nenhum topo de recuo (máximo local) fica acima da linha
    for (let i = x.h2.idx + 2; i <= x.l2.idx; i++) if (bars[i].high > bars[i - 1].high && bars[i].high >= bars[i + 1].high) expect(bars[i].high).toBeLessThanOrEqual(x.layerAt(i) + 1e-9);
    expect(bars[x.touch].high).toBeCloseTo(x.layerAt(x.touch), 6);
    // a mais inclinada: só toca nos topos dos recuos, não no fundo da perna
    expect(x.touch).toBeLessThan(x.l2.idx);
  });

  it('sem divergência não há entrada (o estocástico do reteste faz fundo mais alto)', () => {
    const s = stoch(bars.length, 72, 90, 25);
    expect(signals(run(bars, s.k, s.d))).toHaveLength(0);
  });

  it('sem cruzamento do %K sobre o %D não há entrada', () => {
    const s = stoch(bars.length);
    const k2 = s.k.map((v, i) => (i > 90 ? 5 : v)); // fica abaixo do %D
    expect(signals(run(bars, k2, s.d))).toHaveLength(0);
  });

  it('venda: o espelho (footprint de alta) dá a venda', () => {
    const flip = path(BUY, 1, true);
    const s = stoch(flip.length, 72, 90, 5, true);
    const sig = signals(run(flip, s.k, s.d));
    expect(sig).toHaveLength(1);
    expect(sig[0].dir).toBe(-1);
    expect(sig[0].h2.price).toBeGreaterThan(sig[0].h1.price); // fundo mais alto => espelho do topo mais baixo
    expect(sig[0].stop!).toBeGreaterThan(sig[0].l3!.price);
    expect(sig[0].signal).toBe(signals(run(bars, k, d))[0].signal);
  });

  it('se o segundo movimento não é mais inclinado, não é footprint', () => {
    // a segunda descida é tão lenta como a primeira
    const slow = path([[0, 60], [20, 100], [40, 80], [52, 95], [92, 45], [100, 70], [110, 55], [120, 85]]);
    const s = stoch(slow.length, 92, 110);
    expect(signals(run(slow, s.k, s.d))).toHaveLength(0);
  });

  it('se o preço volta acima do topo mais baixo antes do rompimento, a ideia morre', () => {
    const up = path([[0, 60], [20, 100], [40, 80], [52, 95], [64, 60], [72, 40], [80, 120]]);
    const s = stoch(up.length, 72, 90);
    expect(signals(run(up, s.k, s.d))).toHaveLength(0);
  });

  it('não repinta: com menos velas as entradas que já existiam são as mesmas', () => {
    const full = signals(run(bars, k, d)).map((x) => x.signal);
    for (let cut = 94; cut <= bars.length; cut += 3) {
      const part = signals(run(bars.slice(0, cut), k.slice(0, cut), d.slice(0, cut))).map((x) => x.signal);
      for (const sg of part) expect(full).toContain(sg);
    }
    // antes do cruzamento ainda não havia entrada
    expect(signals(run(bars.slice(0, 92), k.slice(0, 92), d.slice(0, 92)))).toHaveLength(0);
  });

  it('não depende da escala do preço', () => {
    const big = path(BUY, 1000);
    expect(signals(run(big, k, d)).map((x) => x.signal)).toEqual(signals(run(bars, k, d)).map((x) => x.signal));
  });

  it('desenha footprint, layer line, reteste, marcador e stop; o cartão diz o estado', () => {
    const r = drawFootprint(bars, run(bars, k, d));
    expect(r.markers.filter((m) => m.text === 'COMPRA')).toHaveLength(1);
    expect(r.draw.lines.length).toBeGreaterThanOrEqual(4);
    expect(r.draw.texts.some((t) => t.text === 'layer line rompida')).toBe(true);
    expect(r.draw.texts.some((t) => t.text === 'stop')).toBe(true);
    expect(r.draw.panel!.lines[0].text).toMatch(/Compra|Venda/);
  });

  it('com velas ruidosas apanha a estrutura grande (espelho: venda) e não a perde por ensaios pequenos', () => {
    // forma do exemplo do utilizador: fundo, topo, fundo mais alto e subida inclinada com recuos até um topo, onde rompe a layer line
    const P: [number, number][] = [[0, 780], [20, 720], [60, 790], [75, 740], [85, 800], [90, 780], [100, 840], [105, 815], [115, 880], [120, 850], [135, 930], [140, 905], [150, 975], [160, 940], [175, 900], [185, 810], [200, 830]];
    for (const seed0 of [7, 23, 31]) {
      let seed = seed0;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const noisy: Bar[] = [];
      let prev = 780;
      for (let a = 0; a < P.length - 1; a++) {
        const [i0, p0] = P[a];
        const [i1, p1] = P[a + 1];
        for (let i = i0 + (a ? 1 : 0); i <= i1; i++) {
          const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0) + (rnd() - 0.5) * 10;
          const o = prev;
          prev = c;
          noisy.push({ time: T0 + i * 3600, open: o, high: Math.max(o, c) + rnd() * 5, low: Math.min(o, c) - rnd() * 5, close: c, volume: 1 });
        }
      }
      const kd = noisy.map(() => 50);
      const big = run(noisy, kd, kd).find((x) => x.dir === -1 && x.brk !== null && x.h2.idx >= 70 && x.h2.idx <= 80 && x.l2.idx >= 140);
      expect(big, `seed ${seed0}`).toBeDefined();
      expect(big!.brk!).toBeGreaterThan(150);
      expect(big!.brk!).toBeLessThan(185);
    }
  });

  it('exemplo do utilizador (compra, V150 15m): a 2.ª perna é maior mas não mais íngreme, e ainda assim é footprint', () => {
    const PX: [number, number][] = [[0, 700], [85, 372], [190, 1050], [273, 418], [293, 800], [315, 575], [345, 960], [375, 985], [405, 1275], [420, 1050], [445, 1560], [475, 1580], [505, 1270], [525, 1350], [545, 940], [570, 1385], [600, 1000], [630, 640], [690, 900], [720, 760], [790, 300]];
    const P = PX.map(([x, y]) => [Math.round(x / 3), 37 - (y - 297) / 196] as [number, number]);
    for (const seed0 of [7, 11, 23]) {
      let seed = seed0;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const bars2: Bar[] = [];
      let prev = P[0][1];
      for (let a = 0; a < P.length - 1; a++) {
        const [i0, p0] = P[a];
        const [i1, p1] = P[a + 1];
        for (let i = i0 + (a ? 1 : 0); i <= i1; i++) {
          const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0) + (rnd() - 0.5) * 0.24;
          const o = prev;
          prev = c;
          bars2.push({ time: T0 + i * 900, open: o, high: Math.max(o, c) + rnd() * 0.12, low: Math.min(o, c) - rnd() * 0.12, close: c, volume: 1 });
        }
      }
      const kd = bars2.map(() => 50);
      const found = scanFootprint(bars2, atrFilled(bars2, 14), kd, kd, { sens: 1.5, slopeRatio: 0.8, sizeRatio: 1.3, minMove: 3 }).find((x) => x.dir === 1 && x.brk !== null && x.h2.idx >= 80 && x.h2.idx <= 100 && x.l2.idx >= 140);
      expect(found, `seed ${seed0}`).toBeDefined();
      // a layer line passa pelo primeiro topo de recuo, como no desenho do utilizador
      expect(found!.touch).toBeLessThan(found!.h2.idx + 20);
    }
  });

  it('poucos dados ou ruído não dão nada nem estoiram', () => {
    expect(run([], [], [])).toEqual([]);
    const noise: Bar[] = Array.from({ length: 400 }, (_, i) => {
      const c = 100 + Math.sin(i / 3) * 2 + ((i * 7919) % 13) / 10;
      return { time: T0 + i * 900, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1 };
    });
    const t0 = performance.now();
    run(noise, noise.map((_, i) => 50 + Math.sin(i) * 40), noise.map(() => 50));
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('está no catálogo e calcula sem erros', () => {
    const def = getIndicator('footprint')!;
    expect(def.layer).toBe(true);
    const r = def.compute(bars, defaultParams(def));
    expect(r.draw).toBeDefined();
  });
});
