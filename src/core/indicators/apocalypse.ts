import type { Bar } from '../types';
import * as ta from './ta';

/**
 * Apocalypse: estatística das pernadas longas do próprio ativo.
 *
 * 1. Divide o gráfico em pernadas (subidas e descidas) com oscilações que só contam quando o movimento
 *    é grande para aquele ativo (um múltiplo do ATR).
 * 2. Marca as pernadas longas (as mais compridas em tamanho ou em duração), comparando cada pernada
 *    só com as que vieram antes: não há repintura nem olhar para o futuro.
 * 3. Junta os pontos onde pernadas longas nasceram em zonas (suporte/procura e resistência/oferta).
 * 4. Conta, no histórico, quantas vezes uma situação parecida com a de agora foi seguida de uma pernada
 *    longa. É a frequência do passado, não uma garantia.
 */

export interface ApocalypseOptions {
  /** Movimento mínimo de uma oscilação, em múltiplos do ATR. */
  sensitivity: number;
  /** Percentagem das pernadas que contam como longas (as de cima). */
  topPct: number;
  /** Quantas velas à frente se procura o início de uma pernada longa. */
  horizon: number;
  atrLen: number;
}

export const APOCALYPSE_DEFAULTS: ApocalypseOptions = { sensitivity: 2.5, topPct: 25, horizon: 6, atrLen: 14 };

/** Pernadas passadas necessárias antes de classificar uma como longa. */
export const MIN_LEGS = 8;
/** Velas de histórico com situação parecida necessárias para mostrar uma percentagem. */
export const MIN_CASES = 30;

export interface Pivot {
  idx: number;
  price: number;
  type: 'H' | 'L';
  /** Vela em que a oscilação ficou confirmada (a viragem só se conhece depois). */
  confirmedAt: number;
}

export interface Leg {
  from: Pivot;
  to: Pivot;
  dir: 1 | -1;
  /** Tamanho em ATR (o ATR no início). */
  size: number;
  /** Duração em velas. */
  dur: number;
  /** Pernada longa em relação às anteriores; null enquanto há poucas para comparar. */
  long: boolean | null;
}

export interface Zone {
  kind: 'demand' | 'supply';
  lo: number;
  hi: number;
  /** Quantas pernadas longas nasceram aqui. */
  count: number;
  /** Primeira vela (início da primeira pernada) e última. */
  firstIdx: number;
  lastIdx: number;
}

export interface Situation {
  /** Velas paradas antes: o intervalo das últimas 10 velas é pequeno. */
  compression: boolean;
  /** O preço está junto a uma oscilação anterior (um nível). */
  atLevel: boolean;
  /** O preço recuou entre 38% e 62% da última pernada. */
  pullback: boolean;
}

export interface Reading {
  situation: Situation;
  /** Velas do histórico com esta mesma situação (e com resultado já conhecido). */
  cases: number;
  /** Chance de uma pernada longa de subida/descida começar nas próximas velas, nesta situação. */
  pUp: number | null;
  pDown: number | null;
  /** O mesmo para qualquer situação (a média do ativo). */
  baseUp: number | null;
  baseDown: number | null;
  enough: boolean;
}

export interface ApocalypseResult {
  pivots: Pivot[];
  legs: Leg[];
  zones: Zone[];
  reading: Reading;
  /** Tamanho e duração da pernada longa típica (mediana das longas). */
  typical: { size: number; dur: number } | null;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function insertSorted(arr: number[], v: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, v);
}

/** ATR sem falhas (nas primeiras velas usa a amplitude da vela). */
function atrFilled(bars: readonly Bar[], len: number): number[] {
  const a = ta.atr(bars, len);
  return a.map((v, i) => (Number.isFinite(v) && v > 0 ? v : Math.max(bars[i].high - bars[i].low, 1e-9)));
}

/** Oscilações confirmadas (zigue-zague em que cada viragem tem de valer `sensitivity` × ATR). Só usa o passado de cada vela. */
export function findPivots(bars: readonly Bar[], atr: readonly number[], sensitivity: number): Pivot[] {
  const pivots: Pivot[] = [];
  if (bars.length < 2) return pivots;
  let dir: 0 | 1 | -1 = 0;
  let hi = { idx: 0, price: bars[0].high };
  let lo = { idx: 0, price: bars[0].low };
  let cand = { idx: 0, price: 0 };
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const t = sensitivity * atr[i];
    if (dir === 0) {
      if (b.high > hi.price) hi = { idx: i, price: b.high };
      if (b.low < lo.price) lo = { idx: i, price: b.low };
      if (hi.price - b.low >= t && hi.idx !== i) {
        pivots.push({ idx: hi.idx, price: hi.price, type: 'H', confirmedAt: i });
        dir = -1;
        cand = lowestFrom(bars, hi.idx + 1, i);
      } else if (b.high - lo.price >= t && lo.idx !== i) {
        pivots.push({ idx: lo.idx, price: lo.price, type: 'L', confirmedAt: i });
        dir = 1;
        cand = highestFrom(bars, lo.idx + 1, i);
      }
      continue;
    }
    if (dir === 1) {
      if (b.high > cand.price) cand = { idx: i, price: b.high };
      else if (cand.price - b.low >= t) {
        pivots.push({ idx: cand.idx, price: cand.price, type: 'H', confirmedAt: i });
        dir = -1;
        cand = lowestFrom(bars, cand.idx + 1, i);
      }
    } else {
      if (b.low < cand.price) cand = { idx: i, price: b.low };
      else if (b.high - cand.price >= t) {
        pivots.push({ idx: cand.idx, price: cand.price, type: 'L', confirmedAt: i });
        dir = 1;
        cand = highestFrom(bars, cand.idx + 1, i);
      }
    }
  }
  return pivots;
}

function lowestFrom(bars: readonly Bar[], from: number, to: number) {
  let best = { idx: to, price: bars[to].low };
  for (let j = from; j <= to; j++) if (bars[j].low <= best.price) best = { idx: j, price: bars[j].low };
  return best;
}

function highestFrom(bars: readonly Bar[], from: number, to: number) {
  let best = { idx: to, price: bars[to].high };
  for (let j = from; j <= to; j++) if (bars[j].high >= best.price) best = { idx: j, price: bars[j].high };
  return best;
}

/** Pernadas entre oscilações; cada uma é longa ou não comparada só com as anteriores. */
export function buildLegs(pivots: readonly Pivot[], atr: readonly number[], topPct: number): Leg[] {
  const legs: Leg[] = [];
  const sizes: number[] = [];
  const durs: number[] = [];
  const q = 1 - Math.min(0.9, Math.max(0.05, topPct / 100));
  for (let k = 0; k + 1 < pivots.length; k++) {
    const a = pivots[k];
    const b = pivots[k + 1];
    const size = Math.abs(b.price - a.price) / atr[a.idx];
    const dur = b.idx - a.idx;
    let long: boolean | null = null;
    if (legs.length >= MIN_LEGS) long = size >= quantile(sizes, q) || dur >= quantile(durs, q);
    legs.push({ from: a, to: b, dir: a.type === 'L' ? 1 : -1, size, dur, long });
    insertSorted(sizes, size);
    insertSorted(durs, dur);
  }
  return legs;
}

/** Agrupa os inícios de pernadas longas por preço em zonas. */
export function buildZones(legs: readonly Leg[], atr: readonly number[]): Zone[] {
  const zones: Zone[] = [];
  for (const kind of ['demand', 'supply'] as const) {
    const pts = legs
      .filter((l) => l.long && (kind === 'demand' ? l.dir === 1 : l.dir === -1))
      .map((l) => ({ price: l.from.price, idx: l.from.idx, a: atr[l.from.idx] }))
      .sort((x, y) => x.price - y.price);
    let group: typeof pts = [];
    const flush = () => {
      if (!group.length) return;
      const a = group.reduce((s, p) => s + p.a, 0) / group.length;
      let lo = Math.min(...group.map((p) => p.price)) - 0.15 * a;
      let hi = Math.max(...group.map((p) => p.price)) + 0.15 * a;
      if (hi - lo < 0.5 * a) {
        const mid = (hi + lo) / 2;
        lo = mid - 0.25 * a;
        hi = mid + 0.25 * a;
      }
      zones.push({ kind, lo, hi, count: group.length, firstIdx: Math.min(...group.map((p) => p.idx)), lastIdx: Math.max(...group.map((p) => p.idx)) });
      group = [];
    };
    for (const p of pts) {
      if (group.length && p.price - group[group.length - 1].price > 0.75 * Math.max(p.a, group[group.length - 1].a)) flush();
      group.push(p);
    }
    flush();
  }
  return zones;
}

/** A situação de cada vela, só com o que já se sabia nela. */
export function situationAt(bars: readonly Bar[], atr: readonly number[], pivots: readonly Pivot[], i: number): Situation {
  let compression = false;
  if (i >= 10) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - 9; j <= i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
    }
    compression = hi - lo <= 3 * atr[i];
  }
  const close = bars[i].close;
  // oscilações já confirmadas nesta vela
  let known = 0;
  while (known < pivots.length && pivots[known].confirmedAt <= i) known++;
  let atLevel = false;
  for (let k = 0; k < known; k++) {
    if (Math.abs(close - pivots[k].price) <= 0.5 * atr[i]) {
      atLevel = true;
      break;
    }
  }
  let pullback = false;
  if (known >= 2) {
    const a = pivots[known - 2].price;
    const b = pivots[known - 1].price;
    const leg = Math.abs(b - a);
    if (leg > 0) {
      const back = Math.abs(close - b) / leg;
      // o recuo tem de ser contra a pernada anterior
      const against = b > a ? close < b : close > b;
      pullback = against && back >= 0.382 && back <= 0.618;
    }
  }
  return { compression, atLevel, pullback };
}

const keyOf = (s: Situation) => (s.compression ? 1 : 0) | (s.atLevel ? 2 : 0) | (s.pullback ? 4 : 0);

export function apocalypse(bars: readonly Bar[], options: Partial<ApocalypseOptions> = {}): ApocalypseResult {
  const o = { ...APOCALYPSE_DEFAULTS, ...options };
  const n = bars.length;
  const empty: Reading = { situation: { compression: false, atLevel: false, pullback: false }, cases: 0, pUp: null, pDown: null, baseUp: null, baseDown: null, enough: false };
  if (n < 30) return { pivots: [], legs: [], zones: [], reading: empty, typical: null };
  const atr = atrFilled(bars, o.atrLen);
  const pivots = findPivots(bars, atr, o.sensitivity);
  const legs = buildLegs(pivots, atr, o.topPct);
  const zones = buildZones(legs, atr);

  // marcar, vela a vela, se uma pernada longa começou nas H velas seguintes
  const upStart = new Uint8Array(n);
  const downStart = new Uint8Array(n);
  for (const l of legs) if (l.long) (l.dir === 1 ? upStart : downStart)[l.from.idx] = 1;
  const lastPivot = pivots.length ? pivots[pivots.length - 1].idx : -1;
  const labelable = lastPivot - o.horizon - 1; // última vela com resultado conhecido

  const total = { n: 0, up: 0, down: 0 };
  const bySit = new Map<number, { n: number; up: number; down: number }>();
  const win = (arr: Uint8Array, i: number) => {
    for (let j = i + 1; j <= i + o.horizon; j++) if (arr[j]) return 1;
    return 0;
  };
  for (let i = 20; i <= labelable; i++) {
    const k = keyOf(situationAt(bars, atr, pivots, i));
    const up = win(upStart, i);
    const down = win(downStart, i);
    const s = bySit.get(k) ?? { n: 0, up: 0, down: 0 };
    s.n++;
    s.up += up;
    s.down += down;
    bySit.set(k, s);
    total.n++;
    total.up += up;
    total.down += down;
  }
  const now = situationAt(bars, atr, pivots, n - 1);
  const stat = bySit.get(keyOf(now));
  const enough = !!stat && stat.n >= MIN_CASES;
  const reading: Reading = {
    situation: now,
    cases: stat?.n ?? 0,
    pUp: enough ? stat!.up / stat!.n : null,
    pDown: enough ? stat!.down / stat!.n : null,
    baseUp: total.n >= MIN_CASES ? total.up / total.n : null,
    baseDown: total.n >= MIN_CASES ? total.down / total.n : null,
    enough,
  };

  const longs = legs.filter((l) => l.long);
  let typical: ApocalypseResult['typical'] = null;
  if (longs.length >= 3) {
    const s = longs.map((l) => l.size).sort((a, b) => a - b);
    const d = longs.map((l) => l.dur).sort((a, b) => a - b);
    typical = { size: quantile(s, 0.5), dur: quantile(d, 0.5) };
  }
  return { pivots, legs, zones, reading, typical };
}

/** Linhas curtas da leitura atual, para empilhar na última vela (cada uma cabe na margem à direita do gráfico). */
export function readingLines(r: Reading, typical: ApocalypseResult['typical']): string[] {
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const flags = [r.situation.compression && 'compressão', r.situation.atLevel && 'num nível', r.situation.pullback && 'recuo'].filter(Boolean).join(' + ');
  const lines = [r.enough ? `↑${pct(r.pUp)} ↓${pct(r.pDown)} (média ${pct(r.baseUp)}·${pct(r.baseDown)}) n=${r.cases}` : `poucos casos (${r.cases})`];
  if (flags) lines.push(flags);
  if (typical) lines.push(`longa típica ${typical.size.toFixed(1)} ATR · ${Math.round(typical.dur)} velas`);
  return lines;
}

/** Texto único (para testes e descrições). */
export function readingText(r: Reading, typical: ApocalypseResult['typical']): string {
  return readingLines(r, typical).join(' · ');
}
