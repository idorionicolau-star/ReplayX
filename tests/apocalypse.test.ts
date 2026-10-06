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
    expect(onLast.length).toBeLessThanOrEqual(4);
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

describe('Apocalypse: sinais de entrada', () => {
  const { bars } = build(70, 20, 0.03);
  const r = apocalypse(bars);

  it('há sinais e cada um tem stop, entrada e alvo coerentes com a direção', () => {
    expect(r.signals.length).toBeGreaterThan(5);
    for (const s of r.signals) {
      if (s.dir === 1) {
        expect(s.stop).toBeLessThan(s.entry);
        expect(s.target).toBeGreaterThan(s.entry);
      } else {
        expect(s.stop).toBeGreaterThan(s.entry);
        expect(s.target).toBeLessThan(s.entry);
      }
      expect(s.rr).toBeGreaterThanOrEqual(1);
      expect(s.exitIdx).toBeGreaterThanOrEqual(s.idx);
      expect(s.entry).toBe(bars[s.idx].close);
    }
  });

  it('só dá sinal com chance acima da exigência, com casos suficientes e sem operações sobrepostas', () => {
    let lastExit = -1;
    for (const s of r.signals) {
      expect(s.cases).toBeGreaterThanOrEqual(MIN_CASES);
      expect(s.chance).toBeGreaterThanOrEqual(1.5 * s.base);
      expect(s.idx).toBeGreaterThan(lastExit);
      lastExit = s.exitIdx;
    }
  });

  it('o resultado de cada operação corresponde ao que o preço fez', () => {
    for (const s of r.signals) {
      if (s.outcome === 'open' || s.outcome === 'timeout') continue;
      const b = bars[s.exitIdx];
      if (s.outcome === 'tp') expect(s.dir === 1 ? b.high >= s.target : b.low <= s.target).toBe(true);
      if (s.outcome === 'sl') expect(s.dir === 1 ? b.low <= s.stop : b.high >= s.stop).toBe(true);
      // antes da saída nem o stop nem o alvo foram tocados
      for (let j = s.idx + 1; j < s.exitIdx; j++) {
        if (s.dir === 1) {
          expect(bars[j].low).toBeGreaterThan(s.stop);
          expect(bars[j].high).toBeLessThan(s.target);
        } else {
          expect(bars[j].high).toBeLessThan(s.stop);
          expect(bars[j].low).toBeGreaterThan(s.target);
        }
      }
    }
  });

  it('as compras da série construída acertam o alvo na maioria dos casos', () => {
    const longs = r.signals.filter((s) => s.dir === 1 && (s.outcome === 'tp' || s.outcome === 'sl'));
    expect(longs.length).toBeGreaterThan(5);
    expect(longs.filter((s) => s.outcome === 'tp').length / longs.length).toBeGreaterThan(0.7);
  });

  it('sem olhar para o futuro: cortar o gráfico mais cedo dá os mesmos sinais já fechados', () => {
    const cut = 1400;
    const short = apocalypse(bars.slice(0, cut));
    const closed = short.signals.filter((s) => (s.outcome === 'tp' || s.outcome === 'sl') && s.exitIdx < cut - 1);
    expect(closed.length).toBeGreaterThan(3);
    for (const s of closed) {
      const same = r.signals.find((x) => x.idx === s.idx);
      expect(same, `sinal em ${s.idx}`).toBeDefined();
      expect(same).toMatchObject({ dir: s.dir, entry: s.entry, stop: s.stop, target: s.target, exitIdx: s.exitIdx, outcome: s.outcome });
    }
  });

  it('exigir mais da chance dá menos sinais, e desligar os sinais não dá nenhum', () => {
    expect(apocalypse(bars, { ratio: 5 }).signals.length).toBeLessThan(r.signals.length);
    expect(apocalypse(bars, { signals: false }).signals).toHaveLength(0);
  });

  it('no gráfico: entrada, stop e alvo só existem durante a operação, com marcas COMPRA/VENDA e as bandas', () => {
    const def = getIndicator('apocalypse')!;
    const res = def.compute(bars, defaultParams(def));
    const s0 = r.signals[0];
    expect(Number.isNaN(res.values.entry[s0.idx - 1])).toBe(true);
    expect(res.values.entry[s0.idx]).toBe(s0.entry);
    expect(res.values.sl[s0.exitIdx]).toBe(s0.stop);
    expect(res.values.tp[s0.exitIdx]).toBe(s0.target);
    expect(Number.isNaN(res.values.tp[s0.exitIdx + 1]) || r.signals.some((x) => x.idx === s0.exitIdx + 1)).toBe(true);
    const texts = res.markers!.map((m) => m.text ?? '');
    expect(texts.some((t) => /^COMPRA 1:\d+\.\d$/.test(t))).toBe(true);
    expect(texts.some((t) => /^VENDA 1:\d+\.\d$/.test(t))).toBe(true);
    expect(texts).toContain('alvo');
    expect(def.fills!.map((f) => `${f.a}/${f.b}`)).toEqual(expect.arrayContaining(['tp/entry', 'entry/sl']));
    // desligados, não desenha nada
    const off = def.compute(bars, { ...defaultParams(def), signals: false });
    expect(off.values.entry.every((v) => Number.isNaN(v))).toBe(true);
    expect(off.markers!.some((m) => /COMPRA|VENDA/.test(m.text ?? ''))).toBe(false);
  });
});

describe('Apocalypse: resumo dos sinais na etiqueta', () => {
  it('conta os alvos e os stops das operações já fechadas', () => {
    const { bars } = build(70, 20, 0.03);
    const r = apocalypse(bars);
    const won = r.signals.filter((x) => x.outcome === 'tp').length;
    const lost = r.signals.filter((x) => x.outcome === 'sl').length;
    expect(won + lost).toBeGreaterThan(0);
    expect(readingLines(r.reading, r.typical, r.signals)).toContain(`sinais: ${won} alvo · ${lost} stop`);
    // sem sinais fechados não há essa linha
    expect(readingLines(r.reading, r.typical, []).some((l) => l.startsWith('sinais:'))).toBe(false);
  });
});
