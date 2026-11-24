import type { Bar } from '../types';
import { findPivots, type Pivot } from './apocalypse';
import type { DrawData, DrawLine, DrawText } from '../../chart/layer';
import type { IndicatorMarker } from './registry';
import { tr } from '@/i18n';

/**
 * Padrões gráficos: ombro-cabeça-ombro (normal e invertido) e triângulos (ascendente, descendente, simétrico).
 *
 * Tudo é decidido só com velas já fechadas e oscilações já confirmadas (como o topo duplo): um padrão só aparece depois de a
 * última oscilação estar confirmada, e só vira sinal quando uma vela fecha para lá da linha (pescoço ou linha do triângulo).
 * O alvo é o tamanho do padrão medido a partir do rompimento; o stop fica do outro lado.
 */

export type PatternKind = 'hs-top' | 'hs-bottom' | 'tri-asc' | 'tri-desc' | 'tri-sym';

export const PATTERN_NAMES: Record<PatternKind, string> = {
  'hs-top': tr('Ombro-cabeça-ombro'),
  'hs-bottom': tr('Ombro-cabeça-ombro invertido'),
  'tri-asc': tr('Triângulo ascendente'),
  'tri-desc': tr('Triângulo descendente'),
  'tri-sym': tr('Triângulo simétrico'),
};

export interface PatOptions {
  /** Oscilação mínima (ATR) das oscilações do ombro-cabeça-ombro. */
  sensHs: number;
  /** Oscilação mínima (ATR) das oscilações dos triângulos (menor, porque as oscilações encolhem). */
  sensTri: number;
  /** Diferença máxima entre os dois ombros, em fração da altura do padrão. */
  shoulderTol: number;
  /** Altura mínima do ombro-cabeça-ombro (ATR). */
  minHeightHs: number;
  /** Altura mínima do triângulo no seu ponto mais largo (ATR). */
  minHeightTri: number;
  /** Número máximo de velas que o padrão pode ocupar. */
  maxBars: number;
  /** Menos R do que isto não entra. 0 = sem limite. */
  minR: number;
  /** Folga do stop (ATR). */
  stopBuf: number;
  /** Quantas oscilações o triângulo tem de ter (4 ou 5, a alternar topo e fundo). */
  triPoints: 4 | 5;
  hs: boolean;
  tri: boolean;
}

export const PAT_DEFAULTS: PatOptions = { sensHs: 2, sensTri: 1.2, shoulderTol: 0.4, minHeightHs: 2.5, minHeightTri: 2, maxBars: 120, minR: 1, stopBuf: 0.1, triPoints: 5, hs: true, tri: true };

export interface PatPoint {
  idx: number;
  price: number;
  label?: string;
}

/** Segmento (de uma vela a outra) que o desenho prolonga até ao rompimento. */
export interface PatLine {
  from: PatPoint;
  to: PatPoint;
  role: 'pescoço' | 'cima' | 'baixo' | 'forma';
}

export interface PatSignal {
  kind: PatternKind;
  /** 1 = compra, -1 = venda. */
  dir: 1 | -1;
  /** Pontos do padrão (ombros, cabeça, vales; ou os toques do triângulo). */
  points: PatPoint[];
  lines: PatLine[];
  /** Vela do rompimento (entrada no fecho). */
  idx: number;
  entry: number;
  stop: number;
  target: number;
  /** Altura do padrão que deu o alvo. */
  height: number;
  /** O rompimento foi para o lado que o padrão costuma dar (só nos triângulos assimétricos). */
  expected: boolean | null;
  exit: { idx: number; result: 'alvo' | 'stop' } | null;
}

export interface PatPending {
  kind: PatternKind;
  points: PatPoint[];
  lines: PatLine[];
}

export interface PatResult {
  signals: PatSignal[];
  pending: PatPending[];
}

/** R ganho ou perdido num sinal fechado. */
export function patSignalR(s: PatSignal): number | null {
  if (!s.exit) return null;
  const risk = Math.abs(s.stop - s.entry);
  if (!(risk > 0)) return null;
  return s.exit.result === 'stop' ? -1 : Math.abs(s.target - s.entry) / risk;
}

const lineAt = (a: PatPoint, b: PatPoint, x: number) => (b.idx === a.idx ? a.price : a.price + ((b.price - a.price) / (b.idx - a.idx)) * (x - a.idx));

/** Fecha as operações abertas no stop ou no alvo (na mesma vela conta primeiro o stop). */
function closeOpen(open: PatSignal[], bar: Bar, t: number): PatSignal[] {
  const still: PatSignal[] = [];
  for (const s of open) {
    if (t <= s.idx) {
      still.push(s);
      continue;
    }
    const stopHit = s.dir === -1 ? bar.high >= s.stop : bar.low <= s.stop;
    const targetHit = s.dir === -1 ? bar.low <= s.target : bar.high >= s.target;
    if (stopHit) s.exit = { idx: t, result: 'stop' };
    else if (targetHit) s.exit = { idx: t, result: 'alvo' };
    else still.push(s);
  }
  return still;
}

// ---------------------------------------------------------------------------------------------- ombro-cabeça-ombro

interface HsCandidate {
  h1: Pivot;
  l1: Pivot;
  h2: Pivot;
  l2: Pivot;
  h3: Pivot;
  height: number;
  neck: (x: number) => number;
}

/** Os cinco últimos pontos (topo, fundo, topo, fundo, topo) formam um ombro-cabeça-ombro? */
function hsCandidate(p: readonly Pivot[], atr: number, o: PatOptions): HsCandidate | null {
  if (p.length < 5) return null;
  const [h1, l1, h2, l2, h3] = p.slice(-5);
  if (!(h1.type === 'H' && l1.type === 'L' && h2.type === 'H' && l2.type === 'L' && h3.type === 'H')) return null;
  if (h3.idx - h1.idx > o.maxBars) return null;
  const a = { idx: l1.idx, price: l1.price };
  const b = { idx: l2.idx, price: l2.price };
  const neck = (x: number) => lineAt(a, b, x);
  const height = h2.price - neck(h2.idx);
  if (!(height >= o.minHeightHs * atr)) return null;
  const s1 = h1.price - neck(h1.idx);
  const s3 = h3.price - neck(h3.idx);
  // a cabeça é o ponto mais alto, com folga a sério acima dos dois ombros
  if (!(s1 > 0.25 * height && s3 > 0.25 * height)) return null;
  if (!(height - Math.max(s1, s3) >= 0.2 * height)) return null;
  // ombros parecidos
  if (Math.abs(s1 - s3) > o.shoulderTol * height) return null;
  // o pescoço não pode ser muito inclinado
  if (Math.abs(l1.price - l2.price) > 0.6 * height) return null;
  // tempos parecidos: nenhum dos lados mais do que ~2,5 vezes o outro
  const d1 = h2.idx - h1.idx;
  const d2 = h3.idx - h2.idx;
  if (!(d1 > 0 && d2 > 0) || d2 / d1 < 0.4 || d2 / d1 > 2.5) return null;
  return { h1, l1, h2, l2, h3, height, neck };
}

/** Procura ombro-cabeça-ombro de topo (vendas); o invertido é o mesmo com os preços espelhados. */
function scanHsTop(bars: readonly Bar[], atr: readonly number[], o: PatOptions): PatResult {
  const n = bars.length;
  const pivots = findPivots(bars, atr, o.sensHs);
  const confirmed: Pivot[] = [];
  let cursor = 0;
  let pend = null as HsCandidate | null;
  let usedIdx = -1;
  let open: PatSignal[] = [];
  const signals: PatSignal[] = [];
  for (let t = 1; t < n; t++) {
    const b = bars[t];
    open = closeOpen(open, b, t);
    while (cursor < pivots.length && pivots[cursor].confirmedAt <= t) {
      const p = pivots[cursor++];
      confirmed.push(p);
      if (p.type !== 'H' || p.idx <= usedIdx) continue;
      const c = hsCandidate(confirmed, atr[t], o);
      if (c) pend = c;
    }
    if (!pend) continue;
    // anula: a cabeça foi ultrapassada, ou o rompimento demorou demais
    if (b.high > pend.h2.price || t - pend.h3.idx > Math.max(10, Math.round((pend.h3.idx - pend.h1.idx) * 0.6))) {
      pend = null;
      continue;
    }
    const neckNow = pend.neck(t);
    if (!(b.close < neckNow)) continue;
    const c = pend;
    pend = null;
    usedIdx = c.h3.idx;
    const entry = b.close;
    const stop = c.h3.price + o.stopBuf * atr[t];
    const target = neckNow - c.height;
    if (!(target < entry) || !(stop > entry)) continue;
    if (o.minR > 0 && (entry - target) / (stop - entry) < o.minR) continue;
    const pt = (p: Pivot, label?: string): PatPoint => ({ idx: p.idx, price: p.price, label });
    const sig: PatSignal = {
      kind: 'hs-top',
      dir: -1,
      points: [pt(c.h1, tr('Ombro E')), pt(c.l1), pt(c.h2, tr('Cabeça')), pt(c.l2), pt(c.h3, tr('Ombro D'))],
      lines: [
        { from: pt(c.h1), to: pt(c.l1), role: 'forma' },
        { from: pt(c.l1), to: pt(c.h2), role: 'forma' },
        { from: pt(c.h2), to: pt(c.l2), role: 'forma' },
        { from: pt(c.l2), to: pt(c.h3), role: 'forma' },
        { from: pt(c.l1), to: { idx: t, price: neckNow }, role: 'pescoço' },
      ],
      idx: t,
      entry,
      stop,
      target,
      height: c.height,
      expected: null,
      exit: null,
    };
    signals.push(sig);
    open.push(sig);
  }
  const pending: PatPending[] = [];
  if (pend) {
    const last = n - 1;
    const pt = (p: Pivot, label?: string): PatPoint => ({ idx: p.idx, price: p.price, label });
    pending.push({
      kind: 'hs-top',
      points: [pt(pend.h1, tr('Ombro E')), pt(pend.l1), pt(pend.h2, tr('Cabeça')), pt(pend.l2), pt(pend.h3, tr('Ombro D'))],
      lines: [{ from: pt(pend.l1), to: { idx: last, price: pend.neck(last) }, role: 'pescoço' }],
    });
  }
  return { signals, pending };
}

const mirror = (b: Bar): Bar => ({ ...b, open: -b.open, high: -b.low, low: -b.high, close: -b.close });
const negPt = (p: PatPoint): PatPoint => ({ ...p, price: -p.price });
const negLine = (l: PatLine): PatLine => ({ ...l, from: negPt(l.from), to: negPt(l.to) });

// ---------------------------------------------------------------------------------------------- triângulos

interface TriCandidate {
  kind: 'tri-asc' | 'tri-desc' | 'tri-sym';
  /** Primeiro e último toque de cada linha. */
  uA: Pivot;
  uB: Pivot;
  lA: Pivot;
  lB: Pivot;
  upper: (x: number) => number;
  lower: (x: number) => number;
  start: number;
  end: number;
  gap0: number;
  apex: number;
  lastIdx: number;
}

function triCandidate(p: readonly Pivot[], atr: number, o: PatOptions): TriCandidate | null {
  const m = o.triPoints;
  if (p.length < m) return null;
  const pts = p.slice(-m);
  const highs = pts.filter((x) => x.type === 'H');
  const lows = pts.filter((x) => x.type === 'L');
  if (highs.length < 2 || lows.length < 2) return null;
  const uA = highs[0];
  const uB = highs[highs.length - 1];
  const lA = lows[0];
  const lB = lows[lows.length - 1];
  const upper = (x: number) => lineAt({ idx: uA.idx, price: uA.price }, { idx: uB.idx, price: uB.price }, x);
  const lower = (x: number) => lineAt({ idx: lA.idx, price: lA.price }, { idx: lB.idx, price: lB.price }, x);
  // os toques do meio têm de estar em cima da linha
  const tol = 0.5 * atr;
  for (const h of highs.slice(1, -1)) if (Math.abs(h.price - upper(h.idx)) > tol) return null;
  for (const l of lows.slice(1, -1)) if (Math.abs(l.price - lower(l.idx)) > tol) return null;
  const start = Math.min(uA.idx, lA.idx);
  const end = Math.max(uB.idx, lB.idx);
  const width = end - start;
  if (width < 8 || width > o.maxBars) return null;
  const gap0 = upper(start) - lower(start);
  const gapE = upper(end) - lower(end);
  if (!(gap0 >= o.minHeightTri * atr) || !(gapE > 0) || gapE > 0.75 * gap0) return null;
  const du = (upper(end) - upper(start)) / gap0;
  const dl = (lower(end) - lower(start)) / gap0;
  let kind: TriCandidate['kind'] | null = null;
  if (Math.abs(du) <= 0.12 && dl >= 0.2) kind = 'tri-asc';
  else if (Math.abs(dl) <= 0.12 && du <= -0.2) kind = 'tri-desc';
  else if (du <= -0.15 && dl >= 0.15) kind = 'tri-sym';
  if (!kind) return null;
  const apex = start + (gap0 / (gap0 - gapE)) * (end - start);
  return { kind, uA, uB, lA, lB, upper, lower, start, end, gap0, apex, lastIdx: end };
}

const TRI_UP_EXPECTED: Record<TriCandidate['kind'], boolean | null> = { 'tri-asc': true, 'tri-desc': false, 'tri-sym': null };

function scanTriangles(bars: readonly Bar[], atr: readonly number[], o: PatOptions): PatResult {
  const n = bars.length;
  const pivots = findPivots(bars, atr, o.sensTri);
  const confirmed: Pivot[] = [];
  let cursor = 0;
  let pend = null as TriCandidate | null;
  let usedEnd = -1;
  let open: PatSignal[] = [];
  const signals: PatSignal[] = [];
  const pt = (p: Pivot): PatPoint => ({ idx: p.idx, price: p.price });
  for (let t = 1; t < n; t++) {
    const b = bars[t];
    open = closeOpen(open, b, t);
    while (cursor < pivots.length && pivots[cursor].confirmedAt <= t) {
      confirmed.push(pivots[cursor++]);
      const c = triCandidate(confirmed, atr[t], o);
      if (c && c.end > usedEnd) pend = c;
    }
    if (!pend) continue;
    const width = pend.end - pend.start;
    if (t > pend.apex || t - pend.end > width) {
      pend = null;
      continue;
    }
    const up = b.close > pend.upper(t);
    const down = b.close < pend.lower(t);
    if (!up && !down) continue;
    const c = pend;
    pend = null;
    usedEnd = c.end;
    const dir: 1 | -1 = up ? 1 : -1;
    const entry = b.close;
    const stop = up ? c.lower(t) - o.stopBuf * atr[t] : c.upper(t) + o.stopBuf * atr[t];
    const target = up ? entry + c.gap0 : entry - c.gap0;
    if (dir === 1 ? !(stop < entry) : !(stop > entry)) continue;
    if (o.minR > 0 && c.gap0 / Math.abs(entry - stop) < o.minR) continue;
    const exp = TRI_UP_EXPECTED[c.kind];
    const sig: PatSignal = {
      kind: c.kind,
      dir,
      points: [pt(c.uA), pt(c.uB), pt(c.lA), pt(c.lB)],
      lines: [
        { from: pt(c.uA), to: { idx: t, price: c.upper(t) }, role: 'cima' },
        { from: pt(c.lA), to: { idx: t, price: c.lower(t) }, role: 'baixo' },
      ],
      idx: t,
      entry,
      stop,
      target,
      height: c.gap0,
      expected: exp === null ? null : exp === (dir === 1),
      exit: null,
    };
    signals.push(sig);
    open.push(sig);
  }
  const pending: PatPending[] = [];
  if (pend) {
    const last = n - 1;
    const end = Math.min(last, Math.round(pend.apex));
    pending.push({
      kind: pend.kind,
      points: [pt(pend.uA), pt(pend.uB), pt(pend.lA), pt(pend.lB)],
      lines: [
        { from: pt(pend.uA), to: { idx: end, price: pend.upper(end) }, role: 'cima' },
        { from: pt(pend.lA), to: { idx: end, price: pend.lower(end) }, role: 'baixo' },
      ],
    });
  }
  return { signals, pending };
}

// ---------------------------------------------------------------------------------------------- tudo junto

export function scanPatterns(bars: readonly Bar[], atr: readonly number[], o: PatOptions = PAT_DEFAULTS): PatResult {
  const signals: PatSignal[] = [];
  const pending: PatPending[] = [];
  if (o.hs) {
    const top = scanHsTop(bars, atr, o);
    const m = scanHsTop(bars.map(mirror), atr, o);
    signals.push(...top.signals);
    pending.push(...top.pending);
    for (const s of m.signals) {
      signals.push({ ...s, kind: 'hs-bottom', dir: 1, points: s.points.map(negPt), lines: s.lines.map(negLine), entry: -s.entry, stop: -s.stop, target: -s.target });
    }
    for (const p of m.pending) pending.push({ kind: 'hs-bottom', points: p.points.map(negPt), lines: p.lines.map(negLine) });
  }
  if (o.tri) {
    const tri = scanTriangles(bars, atr, o);
    signals.push(...tri.signals);
    pending.push(...tri.pending);
  }
  signals.sort((a, b) => a.idx - b.idx);
  return { signals, pending };
}

// ---------------------------------------------------------------------------------------------- desenho

const NECK = '#ff9800';
const FORM = 'rgba(156,163,175,0.9)';
const UPPER = '#f23645';
const LOWER = '#089981';
const STOP = '#ef5350';
const ENTRY = '#b2b5be';
const TARGET = '#26a69a';
const BUY = '#2962ff';
const SELL = '#f23645';

export interface PatOutput {
  draw: DrawData;
  markers: IndicatorMarker[];
}

export function drawPatterns(bars: readonly Bar[], r: PatResult, goal?: { target: number; historyDone: boolean }): PatOutput {
  const last = bars.length - 1;
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const markers: IndicatorMarker[] = [];
  const mid = (a: number, b: number) => Math.round((a + b) / 2);

  for (const s of r.signals) {
    const buy = s.dir === 1;
    const end = Math.min(last, s.exit?.idx ?? last);
    for (const l of s.lines) {
      const color = l.role === 'pescoço' ? NECK : l.role === 'cima' ? UPPER : l.role === 'baixo' ? LOWER : FORM;
      lines.push({ i1: l.from.idx, p1: l.from.price, i2: l.to.idx, p2: l.to.price, color, width: l.role === 'forma' ? 1 : 2 });
    }
    for (const p of s.points) if (p.label) texts.push({ i: p.idx, p: p.price, text: p.label, color: FORM, size: 10, pos: s.kind === 'hs-bottom' ? 'below' : 'above' });
    lines.push({ i1: s.idx, p1: s.stop, i2: end, p2: s.stop, color: STOP, width: 1 });
    texts.push({ i: mid(s.idx, end), p: s.stop, text: 'Stop', color: STOP, size: 10, pos: buy ? 'below' : 'above', bold: false });
    lines.push({ i1: s.idx, p1: s.entry, i2: end, p2: s.entry, color: ENTRY, width: 1 });
    lines.push({ i1: s.idx, p1: s.target, i2: end, p2: s.target, color: TARGET, width: 1, dash: true });
    texts.push({ i: mid(s.idx, end), p: s.target, text: tr('Alvo'), color: TARGET, size: 10, pos: buy ? 'above' : 'below', bold: false });
    const side = s.expected === null ? '' : s.expected ? tr(' · a favor') : tr(' · contra');
    markers.push({ index: s.idx, position: buy ? 'below' : 'above', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? BUY : SELL, text: `${buy ? tr('COMPRA') : tr('VENDA')} (${PATTERN_NAMES[s.kind]}${side})` });
    if (s.exit) {
      const rr = patSignalR(s);
      const ok = s.exit.result === 'alvo';
      texts.push({ i: s.exit.idx, p: ok ? s.target : s.stop, text: ok ? tr('✓ alvo +{0}R', (rr ?? 0).toFixed(1)) : '✗ stop -1R', color: ok ? TARGET : STOP, size: 10, pos: ok === buy ? 'above' : 'below' });
    }
  }

  for (const p of r.pending) {
    for (const l of p.lines) {
      const color = l.role === 'pescoço' ? NECK : l.role === 'cima' ? UPPER : l.role === 'baixo' ? LOWER : FORM;
      lines.push({ i1: l.from.idx, p1: l.from.price, i2: l.to.idx, p2: l.to.price, color, width: 1, dash: true });
    }
    const top = p.points.reduce((a, b) => (b.price > a.price ? b : a));
    texts.push({ i: top.idx, p: top.price, text: tr('{0} a formar-se', PATTERN_NAMES[p.kind]), color: FORM, size: 10, pos: 'above' });
  }

  // placar honesto por tipo de padrão
  const panel: { text: string; color?: string }[] = [{ text: tr('Padrões gráficos: {0} sinais', r.signals.length), color: '#d1d4dc' }];
  const kinds = Object.keys(PATTERN_NAMES) as PatternKind[];
  for (const k of kinds) {
    const mine = r.signals.filter((s) => s.kind === k);
    if (!mine.length) continue;
    const closed = mine.filter((s) => s.exit);
    const wins = closed.filter((s) => s.exit!.result === 'alvo').length;
    const rs = closed.map(patSignalR).filter((v): v is number => v !== null);
    const sum = rs.reduce((a, b) => a + b, 0);
    panel.push({ text: tr('{0}: {1} · {2} alvos · {3} stops · soma {4}{5}R', PATTERN_NAMES[k], mine.length, wins, closed.length - wins, sum >= 0 ? '+' : '', sum.toFixed(1)), color: sum >= 0 ? TARGET : STOP });
  }
  if (goal && r.signals.length < goal.target) {
    panel.push({ text: goal.historyDone ? tr('o histórico acabou: {0} de {1} sinais', r.signals.length, goal.target) : tr('a carregar mais passado… {0}/{1} sinais', r.signals.length, goal.target), color: '#d1d4dc' });
  }
  if (r.pending.length) panel.push({ text: tr('{0} padrão(ões) a formar-se', r.pending.length), color: '#d1d4dc' });
  return { draw: { lines, texts, panel: { lines: panel, corner: 'bl' } }, markers };
}
