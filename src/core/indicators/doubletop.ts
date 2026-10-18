import type { Bar } from '../types';
import { findPivots, type Pivot } from './apocalypse';
import type { DrawData, DrawLine, DrawRect, DrawText } from '../../chart/layer';
import type { IndicatorMarker } from './registry';

/**
 * Topo duplo e fundo duplo, com caixa, stop, entrada e saída.
 *
 * Para vendas (topo duplo; o fundo duplo é o espelho):
 * 1. Primeiro topo: uma oscilação já confirmada (o preço afastou-se dele).
 * 2. O preço desce até um vale com profundidade suficiente e volta a subir à zona do primeiro topo.
 * 3. Os dois topos ficam praticamente no mesmo nível: o segundo chega ao primeiro com uma tolerância pequena
 *    (em pips; ou, sem pips, uma fração do ATR ou da altura do padrão); o pavio pode furar um pouco o nível, o fecho não.
 * 4. Confirmação, que é a entrada (no fecho da vela):
 *    - vela de rejeição: toca na zona e rejeita a maior parte do corpo (pavio grande), pode ser de qualquer cor;
 *    - ou combinação de duas velas: a vela que tocou na zona e a seguinte, juntas (duas de M5 são uma de M10),
 *      fazem uma rejeição — por exemplo, uma verde que chega ao topo e uma vermelha forte que a devolve;
 *    - ou vela de expansão: uma vela forte contra o topo logo depois de tocar na zona.
 * 5. Stop logo acima da caixa (os dois topos).
 * 6. Saída (alvo):
 *    - se o vale entre os topos foi uma correção a sério, a saída é o fundo desse vale;
 *    - se não (os topos estão no fim de uma tendência sem correção), a saída é a origem dessa pernada.
 * 7. Não entra quando a entrada ficou longe demais (pouco R até ao alvo) nem quando o alvo está longe demais.
 * 8. Uma operação de cada vez: enquanto uma está aberta, as outras confirmações passam.
 *
 * Tudo é decidido só com as velas já fechadas: no replay o sinal aparece na vela em que se confirmou, nunca antes.
 */

export interface DtOptions {
  /** Oscilação mínima, em ATR, para o primeiro topo contar. */
  sens: number;
  /** Mesmo nível: quanto o segundo topo pode ficar abaixo (ou fechar acima) do primeiro, em ATR. Só conta quando `tolPrice` é 0. */
  tol: number;
  /** Mesmo nível em fração da altura do padrão (do topo ao vale), quando dá mais do que `tol`. Só conta quando `tolPrice` é 0. */
  tolPct: number;
  /** Mesmo nível em preço (pips × tamanho do pip). 0 = automático, pelo `tol` em ATR. */
  tolPrice: number;
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
  /** Menos R do que isto (distância ao alvo / distância ao stop) não entra: a entrada ficou longe demais. 0 = sem limite. */
  minRR: number;
  /** Alvo mais longe da entrada do que isto, em ATR, não entra: demora, pode nem lá chegar. 0 = sem limite. */
  maxTarget: number;
}

export const DT_DEFAULTS: DtOptions = { sens: 2, tol: 0.2, tolPct: 0.05, tolPrice: 0, minDepth: 2.5, wick: 0.5, expansion: 1, tpRatio: 0.6, stopBuf: 0.1, minRR: 1, maxTarget: 20 };

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
  trigger: 'rejeição' | 'combinação' | 'expansão';
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
/** O pavio pode furar o nível até este múltiplo da tolerância; mais do que isso já é outro nível. */
const PIERCE = 3;

/** Procura topos duplos (vendas) vela a vela. Os fundos duplos são o mesmo com os preços espelhados. */
class TopScanner {
  readonly signals: DtSignal[] = [];
  /** Operação aberta deste lado (ainda sem stop nem alvo). */
  open: DtSignal | null = null;
  private readonly bars: readonly Bar[];
  private readonly atr: readonly number[];
  private readonly o: DtOptions;
  private readonly pivots: Pivot[];
  private zones: Zone[] = [];
  private cursor = 0;
  private lastL: DtPoint | null = null;

  constructor(bars: readonly Bar[], atr: readonly number[], o: DtOptions) {
    this.bars = bars;
    this.atr = atr;
    this.o = o;
    this.pivots = findPivots(bars, atr, o.sens);
  }

  /** A operação aberta fecha no stop ou no alvo (na mesma vela, conta primeiro o stop). */
  exits(t: number) {
    const open = this.open;
    if (!open || t <= open.idx) return;
    const b = this.bars[t];
    if (b.high >= open.stop) open.exit = { idx: t, result: 'stop' };
    else if (b.low <= open.target) open.exit = { idx: t, result: 'alvo' };
    if (open.exit) this.open = null;
  }

  /** Zonas desta vela. `busy`: já há uma operação aberta (de qualquer lado), e enquanto ela não acabar não se entra noutra. */
  step(t: number, busy: boolean) {
    const { bars, atr, o } = this;
    const b = bars[t];
    const prev = bars[t - 1];
    const a = atr[t];
    // oscilações confirmadas até esta vela: cada topo novo abre uma zona
    while (this.cursor < this.pivots.length && this.pivots[this.cursor].confirmedAt <= t) {
      const p = this.pivots[this.cursor++];
      if (p.type === 'L') {
        this.lastL = { idx: p.idx, price: p.price };
        continue;
      }
      if (!this.lastL) continue;
      let valley: DtPoint = { idx: p.idx, price: bars[p.idx].low };
      for (let j = p.idx + 1; j <= t; j++) if (bars[j].low < valley.price) valley = { idx: j, price: bars[j].low };
      this.zones.push({
        first: { idx: p.idx, price: p.price },
        firstBody: Math.max(bars[p.idx].open, bars[p.idx].close),
        origin: this.lastL,
        valley,
        touchedAt: null,
        second: null,
        secondBody: -Infinity,
        dead: false,
      });
      if (this.zones.length > MAX_ZONES) this.zones = this.zones.slice(-MAX_ZONES);
    }

    let fired = false;
    // a zona mais recente primeiro: o W é feito com o topo anterior mais próximo
    for (let zi = this.zones.length - 1; zi >= 0; zi--) {
      const z = this.zones[zi];
      if (z.dead) continue;
      const top = z.first.price;
      // mesmo nível: em pips, se escolhidos; se não, uma fração do ATR ou da altura do padrão (num W grande, uns pips a mais ainda é o mesmo nível)
      const tol = o.tolPrice > 0 ? o.tolPrice : Math.max(o.tol * a, o.tolPct * (top - z.valley.price));
      // rompimento: um fecho acima do nível, ou um pavio que passa muito dele, já é outro nível
      if (b.close > top + tol || b.high > top + PIERCE * tol) {
        z.dead = true;
        continue;
      }
      const deepEnough = top - z.valley.price >= o.minDepth * a;
      const reaches = b.high >= top - tol;
      const prevTouch = z.touchedAt;
      if (z.touchedAt === null) {
        if (b.low < z.valley.price) z.valley = { idx: t, price: b.low };
        if (!(reaches && deepEnough && t - z.first.idx >= MIN_GAP)) continue;
        z.touchedAt = t;
      } else if (reaches) {
        z.touchedAt = t;
      } else if (t - z.touchedAt > WAIT) {
        // tocou e foi embora sem confirmar: esse toque passa a ser o primeiro topo do próximo teste (no mesmo nível),
        // e o vale conta-se a partir dele — a saída é o pivô do meio do novo W, não um ponto antigo e distante
        if (z.second) {
          z.first = { idx: z.second.idx, price: top };
          z.firstBody = z.secondBody;
          z.valley = { idx: t, price: b.low };
          for (let j = z.second.idx + 1; j < t; j++) if (bars[j].low < z.valley.price) z.valley = { idx: j, price: bars[j].low };
        }
        z.touchedAt = null;
        z.second = null;
        z.secondBody = -Infinity;
        continue;
      }
      if (!z.second || b.high > z.second.price) z.second = { idx: t, price: b.high };
      z.secondBody = Math.max(z.secondBody, Math.max(b.open, b.close));

      const range = b.high - b.low;
      const upperWick = b.high - Math.max(b.open, b.close);
      const body = Math.abs(b.close - b.open);
      // rejeição: toca na zona, vela de tamanho a sério, pavio grande e fecha fora da zona do topo (rejeitou o nível)
      const rejection = reaches && range >= 0.8 * a && upperWick >= o.wick * range && b.close < top - 0.3 * a;
      // combinação: a vela que tocou na zona e a seguinte (uma das duas chegou ao nível), vistas como uma só vela
      // (duas de M5 = uma de M10): uma verde a subir e uma vermelha forte que fazem, juntas, uma rejeição
      const cHigh = Math.max(prev.high, b.high);
      const cRange = cHigh - Math.min(prev.low, b.low);
      const combo =
        (reaches || prevTouch === t - 1) &&
        prev.close > prev.open &&
        b.close < b.open &&
        body >= 0.6 * a &&
        cRange >= 0.8 * a &&
        cHigh - Math.max(prev.open, b.close) >= o.wick * cRange &&
        b.close < top - 0.3 * a;
      // expansão: vela forte contra o topo logo a seguir ao toque no nível (na própria vela ou na seguinte)
      const expansion = b.close < b.open && body >= o.expansion * a && t - z.touchedAt <= 1;
      if (fired || !(rejection || combo || expansion)) continue;
      // já há uma operação aberta: esta confirmação passa, e só se entra noutra depois de aquela acabar
      if (busy) {
        z.dead = true;
        continue;
      }

      const boxHi = Math.max(top, z.second.price);
      // a caixa vai dos pavios dos topos até ao topo dos corpos (pelo menos um pouco abaixo do topo mais baixo)
      const lowerTop = Math.min(top, z.second.price);
      const boxLo = Math.min(lowerTop - 0.15 * a, Math.max(z.firstBody, z.secondBody, lowerTop - 0.35 * a));
      const entry = b.close;
      const stop = boxHi + o.stopBuf * a;
      const leg = top - z.origin.price;
      const useValley = leg <= 0 || top - z.valley.price >= o.tpRatio * leg;
      const targetFrom = useValley ? z.valley : z.origin;
      const target = targetFrom.price;
      z.dead = true;
      if (!(target < entry) || !(stop > entry)) continue;
      // entrada longe demais (pouco R até ao alvo) ou alvo longe demais (demora, pode nem lá chegar): não entra
      if (o.minRR > 0 && (entry - target) / (stop - entry) < o.minRR) continue;
      if (o.maxTarget > 0 && entry - target > o.maxTarget * a) continue;
      fired = true;
      this.open = {
        dir: -1,
        first: z.first,
        second: z.second,
        boxHi,
        boxLo,
        idx: t,
        trigger: rejection ? 'rejeição' : combo ? 'combinação' : 'expansão',
        entry,
        stop,
        target,
        targetFrom,
        targetKind: useValley ? 'vale' : 'origem',
        exit: null,
      };
      this.signals.push(this.open);
      busy = true;
    }
    this.zones = this.zones.filter((z) => !z.dead);
  }

  /** Zonas tocadas à espera de confirmação na última vela. */
  pending(): DtPending[] {
    const last = this.bars.length - 1;
    return this.zones
      .filter((z) => z.touchedAt !== null && z.second && last - z.touchedAt <= WAIT)
      .map((z) => ({ dir: -1 as const, first: z.first, boxHi: Math.max(z.first.price, z.second!.price), boxLo: Math.min(z.first.price, z.second!.price, z.firstBody), touched: z.touchedAt! }));
  }
}

const mirror = (b: Bar): Bar => ({ ...b, open: -b.open, high: -b.low, low: -b.high, close: -b.close });

export interface DtResult {
  signals: DtSignal[];
  pending: DtPending[];
}

/**
 * Topos duplos (vendas) e fundos duplos (compras), já em preços reais.
 * Uma operação de cada vez: enquanto uma compra ou venda está aberta, não entra outra (nem do outro lado).
 */
export function scanDoubleTops(bars: readonly Bar[], atr: readonly number[], o: DtOptions = DT_DEFAULTS): DtResult {
  const tops = new TopScanner(bars, atr, o);
  const m = new TopScanner(bars.map(mirror), atr, o);
  for (let t = 1; t < bars.length; t++) {
    tops.exits(t);
    m.exits(t);
    tops.step(t, !!(tops.open || m.open));
    m.step(t, !!(tops.open || m.open));
  }
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
  const pendingBottoms = m.pending().map((p): DtPending => ({ ...p, dir: 1, first: neg(p.first), boxHi: -p.boxLo, boxLo: -p.boxHi }));
  return {
    signals: [...tops.signals, ...bottoms].sort((a, b) => a.idx - b.idx),
    pending: [...tops.pending(), ...pendingBottoms],
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

export function drawDoubleTops(bars: readonly Bar[], r: DtResult, maxShown = 3000, goal?: { target: number; historyDone: boolean }, levelNote?: string): DtOutput {
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
  const totalR = rs.reduce((x, y) => x + y, 0);
  const avgR = rs.length ? totalR / rs.length : 0;
  const lastSig = r.signals[r.signals.length - 1];
  const panel = [
    { text: `Topo/fundo duplo: ${r.signals.length} sinais`, color: '#d1d4dc' },
    closed.length
      ? { text: `${wins} alvos · ${closed.length - wins} stops (${Math.round((wins / closed.length) * 100)}%)`, color: '#d1d4dc' }
      : { text: 'ainda sem sinais fechados', color: '#d1d4dc' },
  ];
  if (closed.length) {
    const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(v >= 10 || v <= -10 ? 1 : 2)}R`;
    panel.push({ text: `soma ${sign(totalR)} · média ${sign(avgR)} por sinal`, color: totalR >= 0 ? TARGET : STOP });
  }
  if (levelNote) panel.push({ text: levelNote, color: '#d1d4dc' });
  if (goal && r.signals.length < goal.target) {
    panel.push({
      text: goal.historyDone ? `o histórico acabou: ${r.signals.length} de ${goal.target} sinais` : `a carregar mais passado… ${r.signals.length}/${goal.target} sinais`,
      color: '#d1d4dc',
    });
  }
  if (r.pending.length) panel.push({ text: 'há uma zona à espera de confirmação', color: '#d1d4dc' });
  else if (lastSig && !lastSig.exit) panel.push({ text: `${lastSig.dir === 1 ? 'compra' : 'venda'} em curso`, color: lastSig.dir === 1 ? BUY : SELL });

  return { draw: { rects, lines, texts, panel: { lines: panel, corner: 'bl' } }, markers };
}
