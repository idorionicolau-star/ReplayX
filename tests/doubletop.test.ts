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
/** Sem os limites de R e de alvo (os trajetos dos testes têm alvos longos); os limites têm os seus próprios testes. */
const NO_MAX = { ...DT_DEFAULTS, minRR: 0, maxTarget: 0, tpNear: false };
const run = (bars: Bar[], o = NO_MAX) => scanDoubleTops(bars, atrFilled(bars, 14), o);

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

  it('pede mais passado enquanto tiver menos sinais que o objetivo; quando o histórico acaba, diz quantos encontrou', () => {
    const def = getIndicator('doubletop')!;
    const bars = deepValley();
    const p: ReturnType<typeof defaultParams> = { ...defaultParams(def), minR: 0, maxTargetAtr: 0 };
    expect(p.minSignals).toBe(200);
    const more = def.compute(bars, p, { historyDone: false });
    expect(more.wantHistory).toBe(true);
    expect(more.draw!.panel!.lines.some((l) => /a carregar mais passado… 1\/200 sinais/.test(l.text))).toBe(true);
    const done = def.compute(bars, p, { historyDone: true });
    expect(done.wantHistory).toBe(false);
    expect(done.draw!.panel!.lines.some((l) => /o histórico acabou: 1 de 200 sinais/.test(l.text))).toBe(true);
    // objetivo cumprido ou desligado: não pede nada
    expect(def.compute(bars, { ...p, minSignals: 1 }, { historyDone: false }).wantHistory).toBe(false);
    expect(def.compute(bars, { ...p, minSignals: 0 }, { historyDone: false }).wantHistory).toBe(false);
  });

  it('entrada longe demais (menos R do que o mínimo) não entra; com um mínimo mais baixo, entra', () => {
    const bars = deepValley();
    const free = run(bars).signals.filter((x) => x.dir === -1);
    expect(free).toHaveLength(1);
    const rr = (free[0].entry - free[0].target) / (free[0].stop - free[0].entry);
    expect(run(bars, { ...NO_MAX, minRR: rr + 0.1 }).signals.filter((x) => x.dir === -1)).toHaveLength(0);
    expect(run(bars, { ...NO_MAX, minRR: rr - 0.1 }).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    expect(DT_DEFAULTS.minRR).toBe(1);
  });

  it('alvo longe demais da entrada (em ATR) não entra; sem limite, entra', () => {
    const bars = deepValley();
    const x = run(bars).signals.filter((s) => s.dir === -1)[0];
    const dist = (x.entry - x.target) / atrFilled(bars, 14)[x.idx];
    expect(run(bars, { ...NO_MAX, maxTarget: dist - 0.1 }).signals.filter((s) => s.dir === -1)).toHaveLength(0);
    expect(run(bars, { ...NO_MAX, maxTarget: dist + 0.1 }).signals.filter((s) => s.dir === -1)).toHaveLength(1);
  });

  it('os topos têm de estar quase no mesmo nível: um segundo topo meio ATR abaixo já não conta', () => {
    const near = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [80, 95]]);
    expansionDown(near, 49);
    expect(run(near).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    const far = path([[0, 100], [20, 120], [35, 105], [48, 118.9], [49, 118.7], [80, 95]]);
    expansionDown(far, 49);
    expect(run(far).signals.filter((x) => x.dir === -1)).toHaveLength(0);
  });

  it('a caixa é pequena: não passa muito abaixo do topo mais baixo', () => {
    const bars = deepValley();
    const x = run(bars).signals.filter((s) => s.dir === -1)[0];
    const a = atrFilled(bars, 14)[x.idx];
    const lowerTop = Math.min(x.first.price, x.second.price);
    expect(x.boxLo).toBeGreaterThanOrEqual(lowerTop - 0.35 * a - 1e-9);
    expect(x.boxHi - x.boxLo).toBeLessThan(1.5 * a);
  });

  /** Topo em 120.3 (pavio da vela 20); a vela 48 é verde e chega toda ao topo, a 49 é vermelha forte e devolve-a. */
  function comboTop(touchHigh = 120.3) {
    const b = path([[0, 100], [20, 120], [35, 105], [47, 119], [48, 120], [49, 118.7], [80, 95]]);
    b[48] = { ...b[48], open: 119, close: 120, high: touchHigh, low: 118.9 };
    b[49] = { ...b[49], open: 120, close: 118.7, high: 120.1, low: 118.5 };
    return b;
  }

  it('combinação de velas: a vela que tocou na zona e a seguinte, juntas, fazem a rejeição; entra no fecho da segunda', () => {
    const bars = comboTop();
    const a = atrFilled(bars, 14)[49];
    // nenhuma das duas sozinha confirma: a vermelha não tem pavio em cima nem corpo de expansão
    expect(bars[49].open - bars[49].close).toBeLessThan(a);
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].idx).toBe(49);
    expect(s[0].trigger).toBe('combinação');
    expect(s[0].entry).toBeCloseTo(118.7, 6);
    expect(s[0].stop).toBeGreaterThan(120.3);
    const d = drawDoubleTops(bars, run(bars));
    expect(d.markers.some((m) => m.text === 'VENDA (combinação)')).toBe(true);
  });

  it('combinação no fundo duplo (o espelho): vermelha que chega toda ao fundo e verde que rejeita = compra cedo', () => {
    const bars = flip(comboTop());
    const s = run(bars).signals.filter((x) => x.dir === 1);
    expect(s).toHaveLength(1);
    expect(s[0].trigger).toBe('combinação');
    expect(s[0].idx).toBe(49);
    expect(s[0].entry).toBeCloseTo(200 - 118.7, 6);
  });

  it('combinação só com a vela que tocou na zona: se a primeira não chega ao nível, não há entrada', () => {
    const bars = comboTop(119.4);
    bars[49] = { ...bars[49], high: 119.3 };
    expect(run(bars).signals.filter((x) => x.dir === -1 && x.idx === 49)).toHaveLength(0);
  });

  it('combinação também quando é a segunda vela que chega ao nível (a verde ficou um pouco abaixo)', () => {
    const bars = comboTop();
    bars[48] = { ...bars[48], open: 119, close: 119.2, high: 119.3, low: 118.9 };
    bars[49] = { ...bars[49], open: 119.2, close: 117.9, high: 120.4, low: 117.8 };
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].idx).toBe(49);
    expect(s[0].trigger).toBe('combinação');
  });

  it('combinação em que a vermelha devolve só três quartos da verde ainda conta (como no V50)', () => {
    const bars = comboTop();
    bars[48] = { ...bars[48], open: 118, close: 120, high: 120.3, low: 117.9 };
    bars[49] = { ...bars[49], open: 120, close: 118.52, high: 120.1, low: 118.4 };
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].idx).toBe(49);
    expect(s[0].trigger).toBe('combinação');
  });

  it('a saída é o pivô do meio do W mais recente, não um ponto antigo e distante', () => {
    // topo em 20, vale fundo em 35, toque sem confirmar em 50 (desce devagar), pivô do meio em 64, segundo toque em 76-77
    const bars = path([[0, 100], [20, 120], [35, 90], [50, 119.8], [58, 116], [64, 100], [76, 119.8], [77, 119.6], [115, 80]]);
    expansionDown(bars, 77);
    const s = run(bars).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    expect(s[0].idx).toBe(77);
    expect(s[0].targetKind).toBe('vale');
    expect(s[0].targetFrom.idx).toBe(64);
    expect(s[0].target).toBeCloseTo(99.7, 5);
  });

  it('uma operação de cada vez: enquanto uma está aberta, não entra outra (nem do outro lado)', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let p = 100;
    const bars: Bar[] = Array.from({ length: 6000 }, (_, i) => {
      const o = p;
      p += (rnd() - 0.5) * 2;
      return { time: T0 + i * 300, open: o, high: Math.max(o, p) + rnd(), low: Math.min(o, p) - rnd(), close: p };
    });
    const sig = run(bars).signals;
    expect(sig.length).toBeGreaterThan(5);
    expect(new Set(sig.map((s) => s.dir)).size).toBe(2);
    for (let i = 1; i < sig.length; i++) {
      const before = sig[i - 1];
      expect(before.exit).not.toBeNull();
      expect(sig[i].idx).toBeGreaterThanOrEqual(before.exit!.idx);
    }
  });

  it('topo antigo demais não conta: no máximo 50 velas (ajustável) entre o 1.º topo e a entrada', () => {
    const bars = path([[0, 100], [20, 120], [35, 90], [90, 119.8], [91, 119.6], [130, 80]]);
    expansionDown(bars, 91);
    expect(run(bars, { ...NO_MAX, maxBars: 50 }).signals.filter((x) => x.dir === -1)).toHaveLength(0);
    expect(run(bars, { ...NO_MAX, maxBars: 80 }).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    expect(run(bars, { ...NO_MAX, maxBars: 0 }).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    expect(DT_DEFAULTS.maxBars).toBe(50);
  });

  it('breakeven: anda 1:1 a favor, o stop vai para a entrada e, se o preço voltar, sai a zero (não a -1R)', () => {
    // venda em 49 (entrada ~116,6); desce até 1:1, volta acima da entrada, depois sobe até ao stop original
    const bars = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [60, 112], [70, 118], [80, 126]]);
    expansionDown(bars, 49);
    const s = run(bars).signals.filter((x) => x.dir === -1)[0];
    const risk = s.stop - s.entry;
    expect(Math.min(...bars.slice(50, 61).map((b) => b.low))).toBeLessThan(s.entry - risk);
    expect(s.beIdx).not.toBeNull();
    expect(s.exit?.result).toBe('be');
    // o BE fica um pouco além da entrada (cobre spread e comissões): sai com um pequeno ganho, nunca perde
    expect(s.beStop!).toBeLessThan(s.entry);
    expect(signalR(s)!).toBeGreaterThan(0);
    expect(signalR(s)!).toBeLessThan(0.3);
    const pips = run(bars, { ...NO_MAX, bePrice: 0.5 }).signals.filter((x) => x.dir === -1)[0];
    expect(pips.entry - pips.beStop!).toBeCloseTo(0.5, 6);
    // no fundo duplo (espelho) o BE fica acima da entrada
    const buy = run(flip(bars)).signals.filter((x) => x.dir === 1)[0];
    expect(buy.beStop!).toBeGreaterThan(buy.entry);
    expect(buy.exit?.result).toBe('be');
    expect(signalR(buy)!).toBeGreaterThan(0);
    const d = drawDoubleTops(bars, run(bars));
    expect(d.draw.texts.some((t) => t.text === 'BE')).toBe(true);
    expect(d.draw.texts.some((t) => /saiu no BE/.test(t.text))).toBe(true);
    // desligado, o mesmo trajeto acaba no stop
    const off = run(bars, { ...NO_MAX, be: 0 }).signals.filter((x) => x.dir === -1)[0];
    expect(off.exit?.result).toBe('stop');
    expect(signalR(off)).toBe(-1);
  });

  it('saída no fundo mais próximo: um pivô abaixo da entrada antes do vale fundo é o alvo; fundo (ou topo) mais perto que o R mínimo é saltado', () => {
    // fundos: 90 (vela 30, fundo da correção), 108 (vela 46, pivô mais perto)
    const bars = path([[0, 100], [20, 120], [30, 90], [38, 112], [46, 108], [56, 119.8], [57, 119.6], [100, 80]]);
    expansionDown(bars, 57);
    const old = run(bars).signals.filter((x) => x.dir === -1)[0];
    const near = run(bars, { ...NO_MAX, tpNear: true }).signals.filter((x) => x.dir === -1)[0];
    expect(near.target).toBeGreaterThan(old.target);
    expect(near.target).toBeLessThan(near.entry);
    expect(near.targetKind).not.toBe('origem');
    // com R mínimo grande, salta o fundo perto demais e vai ao seguinte
    const far = run(bars, { ...NO_MAX, tpNear: true, minRR: 3 }).signals.filter((x) => x.dir === -1)[0];
    expect(far.target).toBeLessThan(near.target);
    expect(DT_DEFAULTS.tpNear).toBe(true);
    // fundo duplo: o espelho, alvo no topo mais próximo
    const buy = run(flip(bars), { ...NO_MAX, tpNear: true }).signals.filter((x) => x.dir === 1)[0];
    expect(buy.target).toBeGreaterThan(buy.entry);
    expect(buy.target).toBeLessThan(200 - old.target);
  });

  it('a saída não é um fundo que o preço já rompeu: o fundo antigo à esquerda, já quebrado, não conta', () => {
    // fundo antigo em 100 (vela 5); o preço rompe-o até 95 (vela 30); depois sobe e faz o segundo topo
    const bars = path([[0, 110], [5, 100], [20, 120], [30, 95], [42, 119.8], [43, 119.6], [80, 85]]);
    expansionDown(bars, 43);
    const s = run(bars, { ...NO_MAX, tpNear: true }).signals.filter((x) => x.dir === -1);
    expect(s).toHaveLength(1);
    const x = s[0];
    // não vai ao 100 (já quebrado): vai ao fundo que está de pé, o do meio do M
    expect(x.target).toBeLessThan(99);
    expect(x.target).toBeCloseTo(94.7, 5);
    expect(x.targetFrom.idx).toBe(30);
    expect(Math.min(...bars.slice(x.targetFrom.idx + 1, x.idx + 1).map((b) => b.low))).toBeGreaterThanOrEqual(x.target);
  });

  it('mesmo nível em preço (pips): tolerância apertada recusa topos um pouco diferentes; mais larga aceita', () => {
    // segundo topo 0,2 abaixo do primeiro
    const near = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [80, 95]]);
    expansionDown(near, 49);
    expect(run(near, { ...NO_MAX, tolPrice: 0.1 }).signals.filter((x) => x.dir === -1)).toHaveLength(0);
    expect(run(near, { ...NO_MAX, tolPrice: 0.3 }).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    // segundo topo 1,1 abaixo: só com uma tolerância grande
    const far = path([[0, 100], [20, 120], [35, 105], [48, 118.9], [49, 118.7], [80, 95]]);
    expansionDown(far, 49);
    expect(run(far, { ...NO_MAX, tolPrice: 1.2 }).signals.filter((x) => x.dir === -1)).toHaveLength(1);
  });

  it('o pavio pode furar um pouco o nível, mas se passa muito dele já é outro nível', () => {
    const base = () => path([[0, 100], [20, 120], [35, 105], [47, 118.6], [48, 118.4], [80, 95]]);
    const small = base();
    small[48] = { ...small[48], open: 118.5, close: 119.0, high: 120.6, low: 118.3 };
    expect(run(small).signals.filter((x) => x.dir === -1)).toHaveLength(1);
    const big = base();
    // 3,2 acima do topo: mais do que 3x a tolerância (aqui 5% da altura do padrão, ~0,8)
    big[48] = { ...big[48], open: 118.5, close: 119.0, high: 123.5, low: 118.3 };
    expect(run(big).signals.filter((x) => x.dir === -1)).toHaveLength(0);
  });

  it('tolerância em pips no catálogo: usa o pip do símbolo e mostra no cartão quanto vale', () => {
    const def = getIndicator('doubletop')!;
    const near = path([[0, 100], [20, 120], [35, 105], [48, 119.8], [49, 119.6], [80, 95]]);
    expansionDown(near, 49);
    const p: ReturnType<typeof defaultParams> = { ...defaultParams(def), minR: 0, maxTargetAtr: 0, minSignals: 0 };
    expect(p.tolPips).toBe(0);
    const auto = def.compute(near, p, { historyDone: true, pip: 0.01 });
    expect(auto.markers!.some((m) => m.text?.startsWith('VENDA'))).toBe(true);
    expect(auto.draw!.panel!.lines.some((l) => /^mesmo nível: ±\d+ pips ou 5% do padrão \(automático\)$/.test(l.text))).toBe(true);
    const tight = def.compute(near, { ...p, tolPips: 5 }, { historyDone: true, pip: 0.01 });
    expect(tight.markers!.some((m) => m.text?.startsWith('VENDA'))).toBe(false);
    expect(tight.draw!.panel!.lines.some((l) => l.text === 'mesmo nível: ±5,0 pips')).toBe(true);
    // sem pip conhecido, fica no automático
    expect(def.compute(near, { ...p, tolPips: 5 }, { historyDone: true }).markers!.some((m) => m.text?.startsWith('VENDA'))).toBe(true);
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
