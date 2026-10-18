import type { Bar } from '../types';
import { findPivots } from './apocalypse';
import type { DrawData, DrawLine, DrawRect, DrawText } from '../../chart/layer';
import type { IndicatorMarker } from './registry';

/**
 * Topo duplo e fundo duplo, com caixa, stop, entrada e saída.
 *
 * Para vendas (topo duplo; o fundo duplo é o espelho):
 * 1. Primeiro topo: uma oscilação já confirmada (o preço afastou-se dele).
 * 2. O preço desce até um vale com profundidade suficiente e volta a subir à zona do primeiro topo.
 * 3. Confirmação, que é a entrada (no fecho da vela):
 *    - vela de rejeição: toca na zona e rejeita a maior parte do corpo (pavio grande), pode ser de qualquer cor;
 *    - ou vela de expansão: uma vela forte contra o topo logo depois de tocar na zona.
 * 4. Stop logo acima da caixa (os dois topos).
 * 5. Saída (alvo):
 *    - se o vale entre os topos foi uma correção a sério, a saída é o fundo desse vale;
 *    - se não (os topos estão no fim de uma tendência sem correção), a saída é a origem dessa pernada.
 *
 * Tudo é decidido só com as velas já fechadas: no replay o sinal aparece na vela em que se confirmou, nunca antes.
 */

export interface DtOptions {
  /** Oscilação mínima, em ATR, para o primeiro topo contar. */
  sens: number;
  /** Quanto o segundo topo pode ficar abaixo (ou passar acima) do primeiro, em ATR. */
  tol: number;
  /** Profundidade mínima do vale entre os topos, em ATR. */
  minDepth: number;
  /** Pavio mínimo da vela de rejeição, em fração do tamanho da vela. */
  wick: number;
  /** Corpo mínimo da vela de expansão, em ATR. */
  expansion: number;
  /** A partir de que fração da pernada o vale passa a ser a saída (abaixo disso, a saída é a origem da pernada). */
  tpRatio: number;
  /** Folga do stop acima da caixa, em ATR. */
  stopBuf: number;
}

export const DT_DEFAULTS: DtOptions = { sens: 2, tol: 0.75, minDepth: 2.5, wick: 0.5, expansion: 1, tpRatio: 0.6, stopBuf: 0.1 };

export interface DtPoint {
  idx: number;
  price: number;
}

export interface DtSignal {
  /** 1 = compra (fundo duplo), -1 = venda (topo duplo). */
  dir: 1 | -1;
  first: DtPoint;
  second: DtPoint;
  /** A caixa: de onde a onde vai, em preço. */
  boxHi: number;
  boxLo: number;
  /** Vela da confirmação (entrada no fecho). */
  idx: number;
  trigger: 'rejeição' | 'expansão';
  entry: number;
  stop: number;
  target: number;
  /** De onde vem a saída: o vale entre os topos ou a origem da pernada. */
  targetFrom: DtPoint;
  targetKind: 'vale' | 'origem';
  /** Resultado, quando já se sabe: vela em que saiu e se foi pelo alvo ou pelo stop. */
  exit: { idx: number; result: 'alvo' | 'stop' } | null;
}

/** Zona à espera do segundo topo e da confirmação. */
export interface DtPending {
  dir: 1 | -1;
  first: DtPoint;
  boxHi: number;
  boxLo: number;
  touched: number;
}

interface Zone {
  first: DtPoint;
  /** Corpo de cima da vela do primeiro topo. */
  firstBody: number;
  origin: DtPoint;
  valley: DtPoint;
  touchedAt: number | null;
  second: DtPoint | null;
  secondBody: number;
  dead: boolean;
}

const MAX_ZONES = 6;
/** Velas depois do último toque na zona em que ainda se aceita a confirmação. */
const WAIT = 6;
const MIN_GAP = 3;

interface Side {
  signals: DtSignal[];
  pending: DtPending[];
}

/** Procura topos duplos (vendas). Os fundos duplos são o mesmo com os preços espelhados. */
function scanTops(bars: readonly Bar[], atr: readonly number[], o: DtOptions): Side {
  const n = bars.length;
  const pivots = findPivots(bars, atr, o.sens);
  const signals: DtSignal[] = [];
  let zones: Zone[] = [];
  let cursor = 0;
  let lastL: DtPoint | null = null;

  let open: DtSignal | null = null;
  for (let t = 1; t < n; t++) {
    const b = bars[t];
    const a = atr[t];
    // a operação aberta fecha no stop ou no alvo (na mesma vela, conta primeiro o stop)
    if (open && t > open.idx) {
      if (b.high >= open.stop) open.exit = { idx: t, result: 'stop' };
      else if (b.low <= open.target) open.exit = { idx: t, result: 'alvo' };
      if (open.exit) open = null;
    }
    // oscilações confirmadas até esta vela: cada topo novo abre uma zona
    while (cursor < pivots.length && pivots[cursor].confirmedAt <= t) {
      const p = pivots[cursor++];
      if (p.type === 'L') {
        lastL = { idx: p.idx, price: p.price };
        continue;
      }
      if (!lastL) continue;
      let valley: DtPoint = { idx: p.idx, price: bars[p.idx].low };
      for (let j = p.idx + 1; j <= t; j++) if (bars[j].low < valley.price) valley = { idx: j, price: bars[j].low };
      zones.push({
        first: { idx: p.idx, price: p.price },
        firstBody: Math.max(bars[p.idx].open, bars[p.idx].close),
        origin: lastL,
        valley,
        touchedAt: null,
        second: null,
        secondBody: -Infinity,
        dead: false,
      });
      if (zones.length > MAX_ZONES) zones = zones.slice(-MAX_ZONES);
    }

    let fired = false;
    for (const z of zones) {
      if (z.dead) continue;
      const top = z.first.price;
      // rompimento: um fecho bem acima do primeiro topo acaba com a ideia
      if (b.close > top + o.tol * a) {
        z.dead = true;
        continue;
      }
      const deepEnough = top - z.valley.price >= o.minDepth * a;
      const reaches = b.high >= top - o.tol * a;
      if (z.touchedAt === null) {
        if (b.low < z.valley.price) z.valley = { idx: t, price: b.low };
        if (!(reaches && deepEnough && t - z.first.idx >= MIN_GAP)) continue;
        z.touchedAt = t;
      } else if (reaches) {
        z.touchedAt = t;
      } else if (t - z.touchedAt > WAIT) {
        // tocou e foi embora sem confirmar: volta a contar o vale para um novo teste
        z.touchedAt = null;
        z.second = null;
        z.secondBody = -Infinity;
        if (b.low < z.valley.price) z.valley = { idx: t, price: b.low };
        continue;
      }
      if (!z.second || b.high > z.second.price) z.second = { idx: t, price: b.high };
      z.secondBody = Math.max(z.secondBody, Math.max(b.open, b.close));

      const range = b.high - b.low;
      const upperWick = b.high - Math.max(b.open, b.close);
      const body = Math.abs(b.close - b.open);
      // rejeição: toca na zona, vela de tamanho a sério, pavio grande e fecha fora da zona do topo (rejeitou o nível)
      const rejection = reaches && range >= 0.8 * a && upperWick >= o.wick * range && b.close < top - 0.3 * a;
      const expansion = b.close < b.open && body >= o.expansion * a && t - z.touchedAt <= 2;
      if (fired || !(rejection || expansion)) continue;
      // já há uma venda aberta: esta confirmação faz parte da mesma ideia
      if (open) {
        z.dead = true;
        continue;
      }

      const boxHi = Math.max(top, z.second.price);
      // a caixa vai dos pavios dos topos até ao topo dos corpos (pelo menos um pouco abaixo do topo mais baixo)
      const lowerTop = Math.min(top, z.second.price);
      const boxLo = Math.min(lowerTop - 0.2 * a, Math.max(z.firstBody, z.secondBody, lowerTop - 0.6 * a));
      const entry = b.close;
      const stop = boxHi + o.stopBuf * a;
      const leg = top - z.origin.price;
      const useValley = leg <= 0 || top - z.valley.price >= o.tpRatio * leg;
      const targetFrom = useValley ? z.valley : z.origin;
      const target = targetFrom.price;
      z.dead = true;
      if (!(target < entry) || !(stop > entry)) continue;
      fired = true;
      open = {
        dir: -1,
        first: z.first,
        second: z.second,
        boxHi,
        boxLo,
        idx: t,
        trigger: rejection ? 'rejeição' : 'expansão',
        entry,
        stop,
        target,
        targetFrom,
        targetKind: useValley ? 'vale' : 'origem',
        exit: null,
      };
      signals.push(open);
    }
    zones = zones.filter((z) => !z.dead);
  }

  const last = n - 1;
  const pending: DtPending[] = zones
    .filter((z) => z.touchedAt !== null && z.second && last - z.touchedAt <= WAIT)
    .map((z) => ({ dir: -1 as const, first: z.first, boxHi: Math.max(z.first.price, z.second!.price), boxLo: Math.min(z.first.price, z.second!.price, z.firstBody), touched: z.touchedAt! }));
  return { signals, pending };
}

const mirror = (b: Bar): Bar => ({ ...b, open: -b.open, high: -b.low, low: -b.high, close: -b.close });

export interface DtResult {
  signals: DtSignal[];
  pending: DtPending[];
}

/** Topos duplos (vendas) e fundos duplos (compras), já em preços reais. */
export function scanDoubleTops(bars: readonly Bar[], atr: readonly number[], o: DtOptions = DT_DEFAULTS): DtResult {
  const tops = scanTops(bars, atr, o);
  const m = scanTops(bars.map(mirror), atr, o);
  const neg = (p: DtPoint): DtPoint => ({ idx: p.idx, price: -p.price });
  const bottoms = m.signals.map(
    (s): DtSignal => ({
      ...s,
      dir: 1,
      first: neg(s.first),
      second: neg(s.second),
      boxHi: -s.boxLo,
      boxLo: -s.boxHi,
      entry: -s.entry,
      stop: -s.stop,
      target: -s.target,
      targetFrom: neg(s.targetFrom),
    }),
  );
  const pendingBottoms = m.pending.map((p): DtPending => ({ ...p, dir: 1, first: neg(p.first), boxHi: -p.boxLo, boxLo: -p.boxHi }));
  return {
    signals: [...tops.signals, ...bottoms].sort((a, b) => a.idx - b.idx),
    pending: [...tops.pending, ...pendingBottoms],
  };
}

const BUY = '#2962ff';
const SELL = '#f23645';
const STOP = '#ef5350';
const ENTRY = '#b2b5be';
const TARGET = '#26a69a';

export interface DtOutput {
  draw: DrawData;
  markers: IndicatorMarker[];
}

/** R ganho ou perdido num sinal já fechado. */
export function signalR(s: DtSignal): number | null {
  if (!s.exit) return null;
  const risk = Math.abs(s.stop - s.entry);
  if (!(risk > 0)) return null;
  return s.exit.result === 'stop' ? -1 : Math.abs(s.target - s.entry) / risk;
}

export function drawDoubleTops(bars: readonly Bar[], r: DtResult, maxShown = 12): DtOutput {
  const last = bars.length - 1;
  const rects: DrawRect[] = [];
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const markers: IndicatorMarker[] = [];

  for (const s of r.signals.slice(-maxShown)) {
    const buy = s.dir === 1;
    const col = buy ? BUY : SELL;
    const end = Math.min(last, s.exit?.idx ?? last);
    const mid = (a: number, b: number) => Math.round((a + b) / 2);
    rects.push({ i1: s.first.idx, i2: Math.max(s.idx, s.second.idx + 1), p1: s.boxHi, p2: s.boxLo, fill: buy ? 'rgba(41,98,255,0.16)' : 'rgba(242,54,69,0.16)', stroke: col });
    lines.push({ i1: s.first.idx, p1: s.stop, i2: end, p2: s.stop, color: STOP, width: 1 });
    texts.push({ i: mid(s.first.idx, end), p: s.stop, text: 'Stop', color: STOP, size: 10, pos: buy ? 'below' : 'above', bold: false });
    lines.push({ i1: s.idx, p1: s.entry, i2: end, p2: s.entry, color: ENTRY, width: 1 });
    texts.push({ i: mid(s.idx, end), p: s.entry, text: 'Entrada', color: ENTRY, size: 10, pos: buy ? 'above' : 'below', bold: false });
    lines.push({ i1: s.targetFrom.idx, p1: s.target, i2: end, p2: s.target, color: TARGET, width: 1 });
    texts.push({ i: mid(s.targetFrom.idx, end), p: s.target, text: 'Saída', color: TARGET, size: 10, pos: buy ? 'above' : 'below', bold: false });
    markers.push({ index: s.idx, position: buy ? 'below' : 'above', shape: buy ? 'arrowUp' : 'arrowDown', color: col, text: `${buy ? 'COMPRA' : 'VENDA'} (${s.trigger})` });
    if (s.exit) {
      const rr = signalR(s);
      const ok = s.exit.result === 'alvo';
      texts.push({ i: s.exit.idx, p: ok ? s.target : s.stop, text: ok ? `✓ alvo ${rr !== null ? `+${rr.toFixed(1)}R` : ''}` : '✗ stop -1R', color: ok ? TARGET : STOP, size: 10, pos: ok === buy ? 'above' : 'below' });
    }
  }

  for (const p of r.pending) {
    const buy = p.dir === 1;
    rects.push({ i1: p.first.idx, i2: last, p1: p.boxHi, p2: p.boxLo, fill: buy ? 'rgba(41,98,255,0.08)' : 'rgba(242,54,69,0.08)', stroke: buy ? BUY : SELL, dash: true });
    texts.push({ i: last, p: buy ? p.boxLo : p.boxHi, text: `${buy ? 'fundo' : 'topo'} duplo? à espera de confirmação`, color: buy ? BUY : SELL, size: 10, pos: buy ? 'below' : 'above', edge: 'right', bold: false });
  }

  // placar honesto: todos os sinais fechados no histórico carregado
  const closed = r.signals.filter((s) => s.exit);
  const wins = closed.filter((s) => s.exit!.result === 'alvo').length;
  const rs = closed.map(signalR).filter((v): v is number => v !== null);
  const avgR = rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : 0;
  const lastSig = r.signals[r.signals.length - 1];
  const panel = [
    { text: `Topo/fundo duplo: ${r.signals.length} sinais`, color: '#d1d4dc' },
    closed.length
      ? { text: `${wins} alvos · ${closed.length - wins} stops (${Math.round((wins / closed.length) * 100)}%) · ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R por sinal`, color: avgR >= 0 ? TARGET : STOP }
      : { text: 'ainda sem sinais fechados', color: '#d1d4dc' },
  ];
  if (r.pending.length) panel.push({ text: 'há uma zona à espera de confirmação', color: '#d1d4dc' });
  else if (lastSig && !lastSig.exit) panel.push({ text: `${lastSig.dir === 1 ? 'compra' : 'venda'} em curso`, color: lastSig.dir === 1 ? BUY : SELL });

  return { draw: { rects, lines, texts, panel: { lines: panel, corner: 'bl' } }, markers };
}
