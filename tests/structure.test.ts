import { describe, expect, it } from 'vitest';
import { analyzeStructure, chartSeconds, topDown } from '@/core/indicators/structure';
import { atrFilled } from '@/core/indicators/apocalypse';
import { defaultParams, getIndicator } from '@/core/indicators/registry';
import type { Bar } from '@/core/types';

const T0 = Date.UTC(2024, 0, 1) / 1000; // múltiplo de 4h

/** Trajeto em linhas retas entre alvos: [preço, nº de velas]. Cada vela tem um pavio pequeno. */
function path(start: number, legs: [number, number][], stepSec = 900): Bar[] {
  const out: Bar[] = [];
  let p = start;
  let t = 0;
  for (const [target, n] of legs) {
    for (let k = 1; k <= n; k++) {
      const c = p + ((target - p) * k) / n;
      const o = out.length ? out[out.length - 1].close : start;
      out.push({ time: T0 + t++ * stepSec, open: o, high: Math.max(o, c) + 0.3, low: Math.min(o, c) - 0.3, close: c, volume: 100 });
    }
    p = target;
  }
  return out;
}

/** Sobe com topos e fundos mais altos, depois parte o último fundo (mudança de carácter) e desce. */
const LEGS: [number, number][] = [
  [100, 1],
  [110, 11], // topo 1
  [104, 8], // fundo 2 (mais alto que o fundo 1)
  [116, 14], // topo 2 (mais alto): fecha acima do topo 1
  [109, 10], // fundo 3 (mais alto)
  [122, 12], // topo 3 (mais alto): fecha acima do topo 2
  [98, 26], // fecha abaixo do fundo 3 e faz um fundo mais baixo
  [108, 12], // recuo
  [96, 14], // outra descida: fecha abaixo do fundo anterior
  [100, 8],
];

const analyse = (bars: Bar[], sens = 1.5) => analyzeStructure(bars, atrFilled(bars, 14), sens);

describe('estrutura de mercado: topos, fundos, BOS e CHoCH', () => {
  const bars = path(100, LEGS);
  const st = analyse(bars);

  it('encontra os topos e fundos reais e rotula-os HH/HL/LH/LL pelo anterior do mesmo tipo', () => {
    expect(st.swings.map((s) => `${s.type}:${s.label ?? '-'}`)).toEqual(['L:-', 'H:-', 'L:HL', 'H:HH', 'L:HL', 'H:HH', 'L:LL', 'H:LH', 'L:LL']);
    // cada oscilação fica no preço certo (±1)
    const prices = st.swings.map((s) => Math.round(s.price));
    expect(prices).toEqual([100, 110, 104, 116, 109, 122, 98, 108, 96]);
  });

  it('BOS quando fecha além do topo/fundo a favor da tendência e CHoCH quando parte o último fundo contra ela', () => {
    expect(st.events.map((e) => `${e.kind}${e.dir > 0 ? '↑' : '↓'}`)).toEqual(['BOS↑', 'BOS↑', 'CHoCH↓', 'BOS↓']);
    const choch = st.events[2];
    // o CHoCH parte o último fundo mais alto (109), que é o nível da oscilação rotulada HL
    expect(Math.round(choch.level)).toBe(109);
    expect(st.swings.find((s) => s.idx === choch.levelIdx)?.label).toBe('HL');
    // o fecho que quebrou está depois da oscilação que formou o nível
    for (const e of st.events) expect(e.idx).toBeGreaterThan(e.levelIdx);
  });

  it('as pernadas a favor da tendência são expansão e as contra são correção', () => {
    expect(st.legs.map((l) => `${l.dir > 0 ? '↑' : '↓'}${l.kind === 'expansion' ? 'e' : 'c'}`)).toEqual(['↑e', '↓c', '↑e', '↓c', '↑e', '↓e', '↑c', '↓e']);
  });

  it('diz a tendência de agora, a fase e os níveis que confirmam ou invertem', () => {
    expect(st.trend).toBe(-1);
    expect(st.phase).toBe('correction'); // o último fundo já foi feito e o preço recupera
    expect(Math.round(st.bosLevel!)).toBe(96); // continua a descer se fechar abaixo do último fundo
    expect(Math.round(st.chochLevel!)).toBe(108); // vira a alta se fechar acima do último topo
  });

  it('a meio de uma subida há dois níveis: o topo que confirma e o último fundo que, se partir, inverte', () => {
    const mid = analyse(bars.slice(0, 62)); // depois do 3.º topo, a começar a recuar
    expect(mid.trend).toBe(1);
    expect(mid.bosSwing).toMatchObject({ type: 'H', label: 'HH' });
    expect(Math.round(mid.bosLevel!)).toBe(122);
    expect(mid.chochSwing).toMatchObject({ type: 'L', label: 'HL' });
    expect(Math.round(mid.chochLevel!)).toBe(109);
  });

  it('ruído pequeno dentro de uma pernada não cria topos nem fundos', () => {
    const clean = analyse(path(100, [[100, 1], [110, 12], [104, 8], [116, 14]]));
    const wiggle = analyse(path(100, [[100, 1], [104, 5], [103.4, 2], [110, 6], [104, 8], [111, 6], [110.4, 2], [116, 6]]));
    expect(wiggle.swings.length).toBe(clean.swings.length);
  });

  it('sem repintura: cortar o gráfico mais cedo dá a mesma estrutura já confirmada', () => {
    const cut = 75;
    const short = analyse(bars.slice(0, cut));
    expect(short.swings.length).toBeGreaterThan(4);
    for (const s of short.swings) {
      const same = st.swings.find((x) => x.idx === s.idx);
      expect(same, `oscilação em ${s.idx}`).toBeDefined();
      expect(same).toMatchObject({ price: s.price, type: s.type, label: s.label, confirmedAt: s.confirmedAt });
    }
    expect(short.events.map((e) => [e.kind, e.dir, e.idx])).toEqual(st.events.filter((e) => e.idx < cut).map((e) => [e.kind, e.dir, e.idx]));
  });

  it('a escala adapta-se ao ativo: o mesmo desenho a 1000x o preço dá a mesma estrutura', () => {
    const big = path(100000, LEGS.map(([p, n]) => [p * 1000, n] as [number, number]));
    const scaled = analyzeStructure(big, atrFilled(big, 14), 1.5);
    expect(scaled.swings.map((s) => `${s.type}:${s.label}`)).toEqual(st.swings.map((s) => `${s.type}:${s.label}`));
  });
});

/** Estrutura grande (a escala do H4) em velas de 15m: pernadas de 12h a 30h. */
const BIG: [number, number][] = [
  [100, 1],
  [130, 96],
  [112, 60],
  [150, 96],
  [118, 72],
  [170, 96],
  [110, 120],
  [135, 72],
  [105, 96],
];

/** O mesmo, mas a última pernada (uma correção do H4) tem subidas e descidas pequenas lá dentro. */
const BIG_WIGGLY: [number, number][] = [...BIG.slice(0, -1), [122, 24], [127, 8], [114, 24], [119, 8], [100, 30], [104, 8], [92, 16]];

describe('top-down: intervalo de análise e de entradas', () => {
  const chart = path(100, BIG);
  const wiggly = path(100, BIG_WIGGLY);

  it('descobre o intervalo do gráfico', () => {
    expect(chartSeconds(chart)).toBe(900);
  });

  it('marca a estrutura do intervalo de análise (com a etiqueta do intervalo) e resume no cartão', () => {
    const r = topDown(chart, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: true });
    expect(r.htf).not.toBeNull();
    expect(r.htf!.swings.length).toBeGreaterThanOrEqual(4);
    expect(r.draw.lines.length).toBeGreaterThan(r.htf!.swings.length);
    expect(r.draw.texts.some((t) => /^4h (HH|HL|LH|LL)$/.test(t.text))).toBe(true);
    expect(r.draw.texts.some((t) => /^4h (BOS|CHoCH)$/.test(t.text))).toBe(true);
    const lines = r.draw.panel!.lines.map((l) => l.text);
    expect(lines[0]).toMatch(/^4h: (tendência de ALTA|tendência de BAIXA|sem estrutura clara)$/);
    expect(lines.some((l) => l.startsWith('fase:'))).toBe(true);
  });

  it('cada oscilação do H4 fica na vela de 15m onde o extremo aconteceu, com o preço certo', () => {
    const r = topDown(chart, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: false });
    const labelled = r.draw.texts.filter((t) => /^4h (HH|HL|LH|LL)$/.test(t.text));
    expect(labelled.length).toBeGreaterThan(2);
    for (const t of labelled) {
      const bar = chart[t.i];
      expect(bar).toBeDefined();
      // o ponto está no máximo (topo) ou no mínimo (fundo) dessa vela
      expect(Math.abs(t.p - bar.high) < 1e-9 || Math.abs(t.p - bar.low) < 1e-9).toBe(true);
    }
  });

  it('mostra a estrutura de entradas só dentro da pernada atual e marca se vai a favor (✓) ou contra (✗) a análise', () => {
    const r = topDown(wiggly, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: true });
    expect(r.ltf).not.toBeNull();
    expect(r.draw.texts.some((t) => /^(BOS|CHoCH) [✓✗]$/.test(t.text))).toBe(true);
    // nada da estrutura de entradas fica antes da última oscilação do intervalo de análise
    const lastH = r.draw.texts.filter((t) => /^4h (HH|HL|LH|LL)$/.test(t.text)).map((t) => t.i);
    const firstSmall = Math.min(...r.draw.texts.filter((t) => /^(HH|HL|LH|LL)$/.test(t.text)).map((t) => t.i));
    expect(firstSmall).toBeGreaterThanOrEqual(Math.min(Math.max(...lastH), wiggly.length - 80));
    expect(r.draw.panel!.lines.some((l) => /^15m: (BOS|CHoCH) de (alta|baixa)( ✓ a favor| ✗ contra)?$/.test(l.text))).toBe(true);
    const off = topDown(wiggly, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: false });
    expect(off.ltf).toBeNull();
    expect(off.draw.texts.some((t) => /^(BOS|CHoCH) [✓✗]$/.test(t.text))).toBe(false);
  });

  it('desenha até ao fim do gráfico os dois níveis que contam: o que confirma (BOS) e o que inverte (CHoCH)', () => {
    const r = topDown(chart, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: false });
    const end = chart.length + 3;
    const rays = r.draw.lines.filter((l) => l.i2 === end);
    // se o preço acabou de partir um nível e ainda não há outro, só fica o que inverte
    expect(rays.length).toBeGreaterThanOrEqual(1);
    expect(rays.length).toBeLessThanOrEqual(2);
    expect(rays.every((l) => l.p1 === l.p2 && l.i1 < chart.length - 1)).toBe(true);
    // cada linha tem a sua etiqueta, e o nível que inverte existe sempre que há tendência
    expect(r.draw.texts.filter((t) => /^4h (confirma|inverte) \d/.test(t.text))).toHaveLength(rays.length);
    expect(r.draw.texts.some((t) => /^4h inverte \d/.test(t.text))).toBe(true);
    // os preços dos raios são os do cartão
    const panel = r.draw.panel!.lines.map((l) => l.text).join(' ');
    for (const l of rays) expect(panel).toContain(String(Number(l.p1.toPrecision(6))));
  });

  it('só usa velas de análise já fechadas: a vela de 4h ainda em formação não muda nada', () => {
    const cut = 16 * 70; // fronteira exata de uma vela de 4h
    const a = topDown(chart.slice(0, cut), { analysis: '4h', entry: '15m', sens: 1.5, showEntry: false });
    const b = topDown(chart.slice(0, cut + 6), { analysis: '4h', entry: '15m', sens: 1.5, showEntry: false });
    expect(b.htf!.swings.map((s) => [s.type, s.label, s.price])).toEqual(a.htf!.swings.map((s) => [s.type, s.label, s.price]));
    expect(b.htf!.events.length).toBe(a.htf!.events.length);
  });

  it('o intervalo de entradas nunca é mais fino do que o gráfico, e avisa', () => {
    const r = topDown(chart, { analysis: '4h', entry: '1m', sens: 1.5, showEntry: true });
    expect(r.used.entry).toBe('15m');
    expect(r.draw.panel!.lines.some((l) => l.text.includes('entradas em 15m'))).toBe(true);
  });

  it('com o mesmo intervalo nos dois só há uma estrutura', () => {
    const r = topDown(chart, { analysis: '1h', entry: '1h', sens: 1.5, showEntry: true });
    expect(r.ltf).toBeNull();
  });

  it('com poucos dados não rebenta e avisa', () => {
    const r = topDown(chart.slice(0, 20), { analysis: '4h', entry: '15m', sens: 1.5, showEntry: true });
    expect(r.draw.panel!.lines[0].text).toContain('poucos dados');
  });

  it('é rápido: 3000 velas em menos de 1 segundo', () => {
    const big = path(100, [[100, 1], ...Array.from({ length: 30 }, (_, i) => [(i % 2 ? 100 : 160) + (i % 5), 100] as [number, number])]);
    const t0 = performance.now();
    topDown(big, { analysis: '4h', entry: '15m', sens: 1.5, showEntry: true });
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('indicador no registo', () => {
  const def = getIndicator('structure')!;

  it('desenha por cima do gráfico, sem séries, com os dois intervalos escolhíveis', () => {
    expect(def.layer).toBe(true);
    expect(def.outputs).toHaveLength(0);
    const p = defaultParams(def);
    expect(p.analysis).toBe('4h');
    expect(p.entry).toBe('15m');
    const r = def.compute(path(100, BIG), p);
    expect(r.values).toEqual({});
    expect(r.draw!.lines.length).toBeGreaterThan(5);
    expect(r.draw!.panel!.lines.length).toBeGreaterThan(1);
  });
});
