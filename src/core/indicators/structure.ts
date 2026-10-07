import type { Bar } from '../types';
import { aggregate, lowerBound } from '../bars';
import { nextBarTime, parseTf, tfSeconds, tfShort } from '../timeframes';
import { atrFilled, findPivots } from './apocalypse';
import type { DrawData, DrawLine, DrawText } from '../../chart/layer';

/**
 * Estrutura de mercado (topos e fundos reais, BOS e CHoCH) sem contar velas.
 *
 * 1. Oscilações: ziguezague em que cada viragem tem de valer `sens` × ATR do próprio intervalo
 *    (a escala adapta-se ao ativo e ao intervalo; não há "N velas").
 * 2. Cada oscilação é rotulada pela anterior do mesmo tipo: HH/LH (topos) e HL/LL (fundos).
 * 3. Quebra de estrutura: um FECHO para lá da última oscilação ainda por quebrar.
 *    - na direção da tendência é BOS (continuação);
 *    - contra a tendência é CHoCH (mudança de carácter: a tendência vira).
 * 4. Cada pernada é expansão (a favor da tendência) ou correção (contra).
 * Só se usa o que já se sabia em cada vela: não repinta e funciona no replay.
 */

export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL';

export interface Swing {
  idx: number;
  price: number;
  type: 'H' | 'L';
  label: SwingLabel | null;
  confirmedAt: number;
}

export interface StructEvent {
  kind: 'BOS' | 'CHoCH';
  dir: 1 | -1;
  /** Nível quebrado e vela da oscilação que o formou. */
  level: number;
  levelIdx: number;
  /** Vela cujo fecho quebrou o nível. */
  idx: number;
}

export interface StructLeg {
  from: Swing;
  to: Swing;
  dir: 1 | -1;
  kind: 'expansion' | 'correction';
}

export interface StructureResult {
  swings: Swing[];
  events: StructEvent[];
  legs: StructLeg[];
  trend: 0 | 1 | -1;
  /** A pernada em curso é expansão ou correção (null sem tendência). */
  phase: 'expansion' | 'correction' | null;
  /** Nível que confirma a continuação (BOS) e nível que, se quebrado, vira a tendência (CHoCH). */
  bosLevel: number | null;
  chochLevel: number | null;
  /** As oscilações que formaram esses dois níveis (para os desenhar desde a origem). */
  bosSwing: Swing | null;
  chochSwing: Swing | null;
}

export const EMPTY_STRUCTURE: StructureResult = { swings: [], events: [], legs: [], trend: 0, phase: null, bosLevel: null, chochLevel: null, bosSwing: null, chochSwing: null };

export function analyzeStructure(bars: readonly Bar[], atr: readonly number[], sens: number): StructureResult {
  const n = bars.length;
  if (n < 5) return EMPTY_STRUCTURE;
  const pivots = findPivots(bars, atr, sens);
  const swings: Swing[] = [];
  const events: StructEvent[] = [];
  const trendAt = new Map<Swing, 0 | 1 | -1>();
  let trend: 0 | 1 | -1 = 0;
  let pk = 0;
  let lastH: Swing | null = null;
  let lastL: Swing | null = null;
  let hBroken = false;
  let lBroken = false;
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    // 1) quebras de estrutura: fecho para lá da última oscilação por quebrar
    const up = !!lastH && !hBroken && c > lastH.price;
    const down = !!lastL && !lBroken && c < lastL.price;
    if (up && !(down && trend === -1)) {
      events.push({ kind: trend === -1 ? 'CHoCH' : 'BOS', dir: 1, level: lastH!.price, levelIdx: lastH!.idx, idx: i });
      trend = 1;
      hBroken = true;
    } else if (down) {
      events.push({ kind: trend === 1 ? 'CHoCH' : 'BOS', dir: -1, level: lastL!.price, levelIdx: lastL!.idx, idx: i });
      trend = -1;
      lBroken = true;
    }
    // 2) oscilações que ficaram confirmadas nesta vela
    while (pk < pivots.length && pivots[pk].confirmedAt <= i) {
      const p = pivots[pk++];
      let label: SwingLabel | null = null;
      if (p.type === 'H') label = lastH ? (p.price > lastH.price ? 'HH' : 'LH') : null;
      else label = lastL ? (p.price > lastL.price ? 'HL' : 'LL') : null;
      const sw: Swing = { idx: p.idx, price: p.price, type: p.type, label, confirmedAt: p.confirmedAt };
      swings.push(sw);
      trendAt.set(sw, trend);
      if (p.type === 'H') {
        lastH = sw;
        hBroken = false;
      } else {
        lastL = sw;
        lBroken = false;
      }
    }
  }
  const legs: StructLeg[] = [];
  for (let j = 0; j + 1 < swings.length; j++) {
    const from = swings[j];
    const to = swings[j + 1];
    const dir: 1 | -1 = to.price > from.price ? 1 : -1;
    // sem tendência ainda, o primeiro movimento define a direção: o recuo seguinte é correção
    const t = trendAt.get(to) || (swings[1].price > swings[0].price ? 1 : -1);
    legs.push({ from, to, dir, kind: dir === t ? 'expansion' : 'correction' });
  }
  const last = swings[swings.length - 1];
  let phase: StructureResult['phase'] = null;
  if (last && trend !== 0) phase = (last.type === 'L' ? 1 : -1) === trend ? 'expansion' : 'correction';
  const swH = lastH && !hBroken ? lastH : null;
  const swL = lastL && !lBroken ? lastL : null;
  const bos = trend === 1 ? swH : trend === -1 ? swL : null;
  const choch = trend === 1 ? swL : trend === -1 ? swH : null;
  return { swings, events, legs, trend, phase, bosLevel: bos ? bos.price : null, chochLevel: choch ? choch.price : null, bosSwing: bos, chochSwing: choch };
}

export interface TopDownOptions {
  /** Intervalo de análise (ex.: '4h') e de entradas (ex.: '15m'). */
  analysis: string;
  entry: string;
  sens: number;
  showEntry: boolean;
}

export interface TopDownResult {
  draw: DrawData;
  htf: StructureResult | null;
  ltf: StructureResult | null;
  /** Intervalos realmente usados (o de entradas nunca é mais fino do que o gráfico). */
  used: { analysis: string; entry: string; chart: number };
}

const GREEN = '#26a69a';
const RED = '#ef5350';
const EXP_HTF = '#4c8dff';
const COR_HTF = '#ffa726';
const EXP_LTF = '#90caf9';
const COR_LTF = '#ffcc80';
const GREY = '#9aa0ad';

const fmtPrice = (p: number) => String(Number(p.toPrecision(6)));

/** Duração típica de uma vela do gráfico (mediana das diferenças entre velas seguidas). */
export function chartSeconds(bars: readonly Bar[]): number {
  const d: number[] = [];
  for (let i = Math.max(1, bars.length - 200); i < bars.length; i++) {
    const x = bars[i].time - bars[i - 1].time;
    if (x > 0) d.push(x);
  }
  if (!d.length) return 60;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

interface TfData {
  tf: string;
  sec: number;
  bars: Bar[];
  /** posição, no gráfico, de cada vela deste intervalo: primeira e última vela do gráfico que a compõem */
  first: number[];
  last: number[];
}

/** Velas já fechadas do intervalo `tf` a partir das velas do gráfico (a vela em formação fica de fora). */
function tfData(chart: readonly Bar[], chartSec: number, tf: string): TfData {
  const sec = tfSeconds(tf);
  const t = parseTf(tf);
  const lastEnd = chart[chart.length - 1].time + chartSec;
  let bars: Bar[];
  if (sec <= chartSec) bars = chart.slice();
  else {
    bars = aggregate(chart, t);
    while (bars.length && nextBarTime(bars[bars.length - 1].time, t) > lastEnd) bars.pop();
  }
  const first: number[] = [];
  const last: number[] = [];
  if (sec <= chartSec) {
    for (let i = 0; i < bars.length; i++) {
      first.push(i);
      last.push(i);
    }
  } else {
    for (const b of bars) {
      const i0 = lowerBound(chart, b.time);
      const i1 = lowerBound(chart, nextBarTime(b.time, t)) - 1;
      first.push(i0);
      last.push(Math.max(i0, i1));
    }
  }
  return { tf, sec, bars, first, last };
}

/** Vela do gráfico onde o extremo de uma oscilação aconteceu de facto (dentro da vela do intervalo maior). */
function chartIndexOf(sw: Swing, d: TfData, chart: readonly Bar[]): number {
  const a = d.first[sw.idx];
  const b = d.last[sw.idx];
  if (a === undefined) return 0;
  let best = a;
  for (let i = a; i <= b && i < chart.length; i++) {
    if (sw.type === 'H' ? chart[i].high >= chart[best].high : chart[i].low <= chart[best].low) best = i;
  }
  return best;
}

export function topDown(chart: readonly Bar[], o: TopDownOptions): TopDownResult {
  const empty: DrawData = { lines: [], texts: [] };
  const chartSec = chartSeconds(chart);
  const used = { analysis: o.analysis, entry: o.entry, chart: chartSec };
  if (chart.length < 40) return { draw: { ...empty, panel: { lines: [{ text: 'Estrutura: poucos dados', color: GREY }] } }, htf: null, ltf: null, used };
  // o intervalo de entradas nunca é mais fino do que o gráfico, e a análise nunca mais fina do que as entradas
  let entry = o.entry;
  if (tfSeconds(entry) < chartSec) entry = chart.length ? closestTf(chartSec) : o.entry;
  let analysis = o.analysis;
  if (tfSeconds(analysis) < tfSeconds(entry)) analysis = entry;
  used.analysis = analysis;
  used.entry = entry;
  const sameTf = tfSeconds(analysis) === tfSeconds(entry);

  const H = tfData(chart, chartSec, analysis);
  const hAtr = atrFilled(H.bars, 14);
  const htf = H.bars.length >= 20 ? analyzeStructure(H.bars, hAtr, o.sens) : null;
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const hTag = tfShort(analysis);
  const eTag = tfShort(entry);

  const hIdx = new Map<Swing, number>();
  if (htf) {
    for (const sw of htf.swings) hIdx.set(sw, chartIndexOf(sw, H, chart));
    for (const lg of htf.legs) {
      lines.push({ i1: hIdx.get(lg.from)!, p1: lg.from.price, i2: hIdx.get(lg.to)!, p2: lg.to.price, color: lg.kind === 'expansion' ? EXP_HTF : COR_HTF, width: 2.5, dash: lg.kind === 'correction' });
    }
    for (const sw of htf.swings) {
      if (!sw.label) continue;
      texts.push({ i: hIdx.get(sw)!, p: sw.price, text: `${hTag} ${sw.label}`, color: sw.label === 'HH' || sw.label === 'HL' ? GREEN : RED, size: 12, pos: sw.type === 'H' ? 'above' : 'below' });
    }
    for (const ev of htf.events.slice(-12)) {
      const sw = htf.swings.find((s) => s.idx === ev.levelIdx && s.price === ev.level);
      const i1 = sw ? hIdx.get(sw)! : 0;
      const i2 = H.last[ev.idx] ?? chart.length - 1;
      lines.push({ i1, p1: ev.level, i2, p2: ev.level, color: ev.dir === 1 ? GREEN : RED, width: 1.5, dash: true });
      texts.push({ i: Math.round((i1 + i2) / 2), p: ev.level, text: `${hTag} ${ev.kind}`, color: ev.dir === 1 ? GREEN : RED, size: 11, pos: ev.dir === 1 ? 'above' : 'below' });
    }
  }

  // os dois níveis que contam agora, até ao fim do gráfico: o que confirma a continuação (BOS) e o que vira a tendência (CHoCH)
  if (htf && htf.trend !== 0) {
    const endIdx = chart.length + 3;
    const up = htf.trend === 1;
    const rays: [Swing | null, number | null, string, string][] = [
      [htf.bosSwing, htf.bosLevel, up ? GREEN : RED, 'confirma'],
      [htf.chochSwing, htf.chochLevel, up ? RED : GREEN, 'inverte'],
    ];
    for (const [sw, price, color, word] of rays) {
      if (!sw || price === null) continue;
      const i1 = hIdx.get(sw) ?? 0;
      lines.push({ i1, p1: price, i2: endIdx, p2: price, color, width: 1.5 });
      // a etiqueta encosta à margem direita do gráfico (nunca é cortada pelo eixo do preço)
      texts.push({ i: chart.length - 1, edge: 'right', p: price, text: `${hTag} ${word} ${fmtPrice(price)}`, color, size: 10, pos: word === 'confirma' === up ? 'above' : 'below' });
    }
  }

  let ltf: StructureResult | null = null;
  let lastLtfEvent: { text: string; aligned: boolean | null } | null = null;
  if (!sameTf && o.showEntry) {
    const L = tfData(chart, chartSec, entry);
    const lAtr = atrFilled(L.bars, 14);
    ltf = L.bars.length >= 20 ? analyzeStructure(L.bars, lAtr, o.sens) : null;
    if (ltf) {
      // só se mostra a estrutura de entradas dentro da pernada atual do intervalo de análise (pelo menos as últimas 80 velas)
      const hs = htf?.swings ?? [];
      const lastH = hs.length ? hIdx.get(hs[hs.length - 1])! : chart.length - 300;
      const from = Math.max(0, Math.min(lastH, chart.length - 80));
      const lIdx = new Map<Swing, number>();
      for (const sw of ltf.swings) lIdx.set(sw, chartIndexOf(sw, L, chart));
      for (const lg of ltf.legs) {
        const a = lIdx.get(lg.from)!;
        const b = lIdx.get(lg.to)!;
        if (b < from) continue;
        lines.push({ i1: a, p1: lg.from.price, i2: b, p2: lg.to.price, color: lg.kind === 'expansion' ? EXP_LTF : COR_LTF, width: 1.2, dash: lg.kind === 'correction' });
      }
      for (const sw of ltf.swings) {
        const i = lIdx.get(sw)!;
        if (!sw.label || i < from) continue;
        texts.push({ i, p: sw.price, text: sw.label, color: sw.label === 'HH' || sw.label === 'HL' ? GREEN : RED, size: 10, bold: false, pos: sw.type === 'H' ? 'above' : 'below' });
      }
      for (const ev of ltf.events) {
        const sw = ltf.swings.find((s) => s.idx === ev.levelIdx && s.price === ev.level);
        const i1 = sw ? lIdx.get(sw)! : 0;
        const i2 = L.last[ev.idx] ?? chart.length - 1;
        if (i2 < from) continue;
        const aligned = htf && htf.trend !== 0 ? ev.dir === htf.trend : null;
        const mark = aligned === null ? '' : aligned ? ' ✓' : ' ✗';
        lines.push({ i1, p1: ev.level, i2, p2: ev.level, color: ev.dir === 1 ? GREEN : RED, width: 1, dash: true });
        texts.push({ i: Math.round((i1 + i2) / 2), p: ev.level, text: `${ev.kind}${mark}`, color: ev.dir === 1 ? GREEN : RED, size: 10, pos: ev.dir === 1 ? 'above' : 'below' });
        lastLtfEvent = { text: `${ev.kind} de ${ev.dir === 1 ? 'alta' : 'baixa'}`, aligned };
      }
    }
  }

  // cartão com a leitura de agora
  const panel: { text: string; color?: string }[] = [];
  if (!htf) panel.push({ text: `${hTag}: poucos dados (aumente o histórico)`, color: GREY });
  else {
    const t = htf.trend;
    panel.push({ text: `${hTag}: ${t === 1 ? 'tendência de ALTA' : t === -1 ? 'tendência de BAIXA' : 'sem estrutura clara'}`, color: t === 1 ? GREEN : t === -1 ? RED : GREY });
    if (htf.phase) panel.push({ text: `fase: ${htf.phase === 'expansion' ? 'expansão' : 'correção'}`, color: htf.phase === 'expansion' ? EXP_HTF : COR_HTF });
    if (htf.bosLevel !== null) panel.push({ text: `confirma (BOS): ${fmtPrice(htf.bosLevel)}`, color: t === 1 ? GREEN : RED });
    if (htf.chochLevel !== null) panel.push({ text: `inverte (CHoCH): ${fmtPrice(htf.chochLevel)}`, color: t === 1 ? RED : GREEN });
  }
  if (lastLtfEvent) {
    const e = lastLtfEvent as { text: string; aligned: boolean | null };
    panel.push({ text: `${eTag}: ${e.text}${e.aligned === null ? '' : e.aligned ? ' ✓ a favor' : ' ✗ contra'}`, color: e.aligned === null ? GREY : e.aligned ? GREEN : RED });
  }
  if (entry !== o.entry) panel.push({ text: `gráfico em ${tfShort(closestTf(chartSec))}: entradas em ${eTag}`, color: GREY });
  return { draw: { lines, texts, panel: { lines: panel, corner: 'bl' } }, htf, ltf, used };
}

/** O intervalo normal mais próximo (por baixo) de uma duração em segundos. */
function closestTf(sec: number): string {
  const options = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1D', '1W'];
  let best = options[0];
  for (const t of options) if (tfSeconds(t) <= sec) best = t;
  return best;
}
