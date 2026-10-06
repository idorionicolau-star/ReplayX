import { describe, expect, it } from 'vitest';
import { apocalypse, buildLegs, buildZones, findPivots, MIN_CASES, MIN_LEGS, readingLines, readingText, situationAt } from '@/core/indicators/apocalypse';
import { getIndicator, defaultParams } from '@/core/indicators/registry';
import * as ta from '@/core/indicators/ta';
import type { Bar } from '@/core/types';

const T0 = 1_700_000_000;

/**
 * Ciclos: parado junto a 100 (compressão) → sobe até uma altura variável → desce de volta a 100.
 * As subidas têm tamanhos diferentes, por isso umas pernadas são longas e outras não.
 */
function build(count: number, flat = 12, drift = 0): { bars: Bar[]; starts: number[] } {
  const out: Bar[] = [];
  const starts: number[] = [];
  let p = 100;
  let t = 0;
  const push = (o: number, c: number) => out.push({ time: T0 + t++ * 60, open: o, high: Math.max(o, c) + 0.15, low: Math.min(o, c) - 0.15, close: c, volume: 100 });
  for (let k = 0; k < count; k++) {
    starts.push(out.length);
    for (let i = 0; i < flat; i++) {
      // com `drift`, o fundo da fase parada fica na última vela (a pernada longa nasce ali)
      const c = 100 + (drift ? 0.3 : 0) - drift * i + (i % 2 ? 0.1 : -0.1);
      push(p, c);
      p = c;
    }
    const up = 14 + ((k * 7) % 22);
    for (let i = 0; i < up; i++) {
      push(p, p + 0.6);
      p += 0.6;
    }
    const down = Math.round((p - 100) / 0.6);
    for (let i = 0; i < down; i++) {
      push(p, p - 0.6);
      p -= 0.6;
    }
  }
  return { bars: out, starts };
}
const cycles = (count: number): Bar[] => build(count).bars;

const atrOf = (bars: Bar[]) => ta.atr(bars, 14).map((v, i) => (Number.isFinite(v) && v > 0 ? v : Math.max(bars[i].high - bars[i].low, 1e-9)));

describe('Apocalypse: oscilações e pernadas', () => {
  const bars = cycles(30);
  const atr = atrOf(bars);
  const pivots = findPivots(bars, atr, 2.5);

  it('as oscilações alternam entre máximos e mínimos e só se confirmam depois', () => {
    expect(pivots.length).toBeGreaterThan(20);
    pivots.forEach((p, i) => {
      expect(p.confirmedAt).toBeGreaterThanOrEqual(p.idx);
      if (i) {
        expect(p.type).not.toBe(pivots[i - 1].type);
        expect(p.idx).toBeGreaterThan(pivots[i - 1].idx);
        expect(p.confirmedAt).toBeGreaterThan(pivots[i - 1].confirmedAt);
      }
    });
  });

  it('as pernadas só se classificam depois de haver anteriores para comparar, e nem todas são longas', () => {
    const legs = buildLegs(pivots, atr, 25);
    expect(legs.slice(0, MIN_LEGS).every((l) => l.long === null)).toBe(true);
    const classified = legs.slice(MIN_LEGS);
    expect(classified.every((l) => typeof l.long === 'boolean')).toBe(true);
    expect(classified.some((l) => l.long)).toBe(true);
    expect(classified.some((l) => !l.long)).toBe(true);
    legs.forEach((l) => expect(l.dir).toBe(l.from.type === 'L' ? 1 : -1));
  });

  it('sem repintura: cortar o gráfico mais cedo dá exatamente as mesmas pernadas já fechadas', () => {
    const cut = 700;
    const short = bars.slice(0, cut);
    const aShort = atrOf(short);
    const pShort = findPivots(short, aShort, 2.5);
    const lShort = buildLegs(pShort, aShort, 25);
    const lFull = buildLegs(pivots, atr, 25);
    expect(lShort.length).toBeGreaterThan(10);
    lShort.forEach((l, i) => {
      expect(lFull[i].from.idx).toBe(l.from.idx);
      expect(lFull[i].to.idx).toBe(l.to.idx);
      expect(lFull[i].long).toBe(l.long);
    });
  });

  it('forma zonas de procura perto de 100 (onde as subidas longas nascem) e de oferta no topo', () => {
    const legs = buildLegs(pivots, atr, 25);
    const zones = buildZones(legs, atr);
    const demand = zones.filter((z) => z.kind === 'demand');
    const supply = zones.filter((z) => z.kind === 'supply');
    expect(demand.length).toBeGreaterThan(0);
    expect(supply.length).toBeGreaterThan(0);
    const best = demand.sort((a, b) => b.count - a.count)[0];
    expect(best.count).toBeGreaterThanOrEqual(3);
    expect(best.lo).toBeLessThan(100);
    expect(best.hi).toBeGreaterThan(99);
    expect(best.hi - best.lo).toBeGreaterThan(0);
    expect(best.firstIdx).toBeLessThanOrEqual(best.lastIdx);
  });
});

describe('Apocalypse: situação e leitura', () => {
  const bars = cycles(30);
  const atr = atrOf(bars);
  const pivots = findPivots(bars, atr, 2.5);

  it('mercado parado junto a um nível: compressão e num nível', () => {
    // fim da fase parada de um ciclo tardio (12 velas paradas)
    const cycleStart = bars.findIndex((b, i) => i > 400 && Math.abs(b.close - 100) < 0.2 && Math.abs(bars[i - 1].close - 100) < 0.2 && Math.abs(bars[i - 5].close - 100) < 0.2);
    expect(cycleStart).toBeGreaterThan(0);
    const s = situationAt(bars, atr, pivots, cycleStart + 6);
    expect(s.compression).toBe(true);
    expect(s.atLevel).toBe(true);
  });

  it('a meio de uma subida firme não há compressão', () => {
    const i = bars.findIndex((b, k) => k > 400 && b.close > 108 && bars[k - 3].close < b.close - 1.5);
    expect(situationAt(bars, atr, pivots, i).compression).toBe(false);
  });

  it('com poucos dados não dá percentagens', () => {
    const r = apocalypse(cycles(2));
    expect(r.reading.enough).toBe(false);
    expect(r.reading.pUp).toBeNull();
    expect(readingText(r.reading, r.typical)).toContain('poucos casos');
  });

  it('com histórico suficiente dá chances entre 0 e 1 e a média do ativo', () => {
    const r = apocalypse(cycles(40));
    expect(r.legs.length).toBeGreaterThan(40);
    expect(r.reading.baseUp).not.toBeNull();
    expect(r.reading.baseUp!).toBeGreaterThanOrEqual(0);
    expect(r.reading.baseUp!).toBeLessThanOrEqual(1);
    expect(r.reading.baseDown!).toBeGreaterThanOrEqual(0);
    if (r.reading.enough) {
      expect(r.reading.cases).toBeGreaterThanOrEqual(MIN_CASES);
      expect(r.reading.pUp!).toBeGreaterThanOrEqual(0);
      expect(r.reading.pUp!).toBeLessThanOrEqual(1);
    }
    expect(r.typical).not.toBeNull();
    expect(r.typical!.size).toBeGreaterThan(0);
  });

  it('uma situação que antecede as pernadas longas tem chance maior do que a média do ativo', () => {
    // 20 velas paradas a descer ligeiramente, com o fundo na última: a pernada longa nasce no fim da compressão
    const { bars: b, starts } = build(70, 20, 0.03);
    // vela 17 da fase parada de um ciclo tardio (compressão ligada, a pernada nasce 2 velas depois)
    const idx = starts[60] + 17;
    const r = apocalypse(b.slice(0, idx + 1));
    expect(r.reading.situation.compression).toBe(true);
    expect(r.reading.enough).toBe(true);
    expect(r.reading.baseUp).not.toBeNull();
    expect(r.reading.pUp!).toBeGreaterThan(r.reading.baseUp! * 3);
    expect(r.reading.pUp!).toBeLessThanOrEqual(1);
    expect(readingText(r.reading, r.typical)).toContain('compressão');
    expect(readingLines(r.reading, r.typical)[0]).toMatch(/^↑\d+% ↓\d+% \(média \d+%·\d+%\) n=\d+$/);
  });
});

describe('Apocalypse no gráfico', () => {
  const def = getIndicator('apocalypse')!;
  const bars = cycles(40);

  it('está registado, com descrição que avisa que é a frequência do passado', () => {
    expect(def).toBeDefined();
    expect(def.name).toBe('Apocalypse');
    expect(def.description).toContain('não uma garantia');
  });

  it('devolve zonas só a partir do início da primeira pernada, marcas das longas e a leitura na última vela', () => {
    const r = def.compute(bars, defaultParams(def));
    for (const o of def.outputs) expect(r.values[o.key]).toHaveLength(bars.length);
    // há pelo menos uma zona de procura e uma de oferta desenhadas
    const d = r.values.d1hi;
    const first = d.findIndex((v) => Number.isFinite(v));
    expect(first).toBeGreaterThan(0);
    expect(Number.isNaN(d[first - 1])).toBe(true);
    expect(Number.isFinite(d[bars.length - 1])).toBe(true);
    expect(r.values.d1hi[bars.length - 1]).toBeGreaterThan(r.values.d1lo[bars.length - 1]);
    expect(r.values.s1hi.some((v) => Number.isFinite(v))).toBe(true);
    // marcas das pernadas longas + etiqueta
    expect(r.markers!.length).toBeGreaterThan(5);
    const onLast = r.markers!.filter((m) => m.index === bars.length - 1 && m.text);
    expect(onLast.length).toBeGreaterThanOrEqual(1);
    expect(onLast.length).toBeLessThanOrEqual(3);
    // cada linha cabe na margem à direita do gráfico
    onLast.forEach((m) => expect(m.text!.length).toBeLessThanOrEqual(34));
    expect(r.markers!.some((m) => m.shape === 'arrowUp' && m.position === 'below')).toBe(true);
    expect(r.markers!.some((m) => m.shape === 'arrowDown' && m.position === 'above')).toBe(true);
  });

  it('com poucas velas não rebenta e dá só a etiqueta', () => {
    const r = def.compute(bars.slice(0, 20), defaultParams(def));
    expect(Object.values(r.values).every((s) => s.length === 20)).toBe(true);
  });

  it('é rápido: 3000 velas em menos de 1 segundo', () => {
    const big = cycles(120).slice(0, 3000);
    const t0 = performance.now();
    def.compute(big, defaultParams(def));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
