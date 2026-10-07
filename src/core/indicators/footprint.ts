import type { Bar } from '../types';
import { findPivots } from './apocalypse';
import type { DrawData, DrawLine, DrawText } from '../../chart/layer';
import type { IndicatorMarker } from './registry';

/**
 * Método Footprint + Layer Line + divergência escondida no Estocástico.
 *
 * Para compras (o espelho dá as vendas):
 * 1. Footprint: topo (H1), fundo (L1), topo mais baixo (H2) e uma segunda descida (H2 → L2) que faz um fundo
 *    mais baixo e é mais inclinada que a primeira (H1 → L1).
 * 2. Layer line: a linha mais inclinada que sai de H2 e toca nos topos dos recuos da segunda descida sem cortar
 *    nenhuma vela. Quando um fecho a rompe para cima, há rompimento.
 * 3. Reteste: o preço recua e faz um fundo mais alto que L2 (L3).
 * 4. Divergência escondida: no reteste, o preço faz um fundo mais alto mas o Estocástico faz um fundo mais baixo.
 *    É obrigatória. Sem divergência não se entra.
 * 5. Entrada: depois da divergência, quando o %K cruza o %D para cima.
 *
 * Só usa o que já se sabia em cada vela (oscilações confirmadas, fechos): não repinta e serve no replay.
 */

export interface FpPoint {
  idx: number;
  price: number;
}

export interface FpSetup {
  /** 1 = compra (footprint de queda), -1 = venda (footprint de alta). */
  dir: 1 | -1;
  h1: FpPoint;
  l1: FpPoint;
  h2: FpPoint;
  /** Extremo da segunda perna. */
  l2: FpPoint;
  /** Preço da layer line em cada vela (a partir de H2). */
  layerAt: (idx: number) => number;
  /** Vela do último topo de recuo em que a linha toca. */
  touch: number;
  /** Vela do rompimento da layer line. */
  brk: number | null;
  /** Fundo do reteste. */
  l3: FpPoint | null;
  /** Vela da entrada (cruzamento depois da divergência). */
  signal: number | null;
  /** Stop sugerido: para lá do fundo do reteste. */
  stop: number | null;
  status: 'leg' | 'retest' | 'signal';
}

export interface FpOptions {
  sens: number;
  /** Quantas vezes a segunda perna tem de ser mais inclinada que a primeira. */
  slopeRatio: number;
  /** Quantas vezes a segunda perna tem de ser maior (em preço) que a primeira. */
  sizeRatio: number;
  /** Cada movimento tem de valer pelo menos isto em ATR (impulsivo, não ruído). */
  minMove: number;
}

interface Engine {
  H: number[];
  L: number[];
  C: number[];
  K: readonly number[];
  D: readonly number[];
}

interface Live {
  h1: FpPoint;
  l1: FpPoint;
  h2: FpPoint;
  l2: FpPoint;
  /** Maior razão (alta - H2) / distância já dentro da perna, e a vela onde ocorre; e o mesmo para as velas depois do fundo. */
  sLeg: number;
  touchLeg: number;
  sPend: number;
  touchPend: number;
  brk: number | null;
  l3: FpPoint | null;
}

const MIN_LEG_BARS = 3;
/** Um topo de recuo está pelo menos esta distância depois do topo mais baixo (a vela logo a seguir não conta). */
const MIN_TOUCH_GAP = 2;

/** Quantas ideias em paralelo (as mais recentes): uma ideia pequena e velha não pode tapar a estrutura grande que vem depois. */
const MAX_LIVE = 6;

/** Procura o método para compras. Para vendas chama-se com tudo espelhado (preços negativos, 100 - %K/%D). */
function scanBuy(bars: readonly Bar[], atr: readonly number[], k: readonly number[], d: readonly number[], o: FpOptions): FpSetup[] {
  const n = bars.length;
  const e: Engine = { H: bars.map((b) => b.high), L: bars.map((b) => b.low), C: bars.map((b) => b.close), K: k, D: d };
  const pivots = findPivots(bars, atr, o.sens);
  const out: FpSetup[] = [];
  let lives: { lv: Live; setup: FpSetup | null }[] = [];
  let cursor = 0;

  const stochLow = (i: number, t: number) => {
    let m = Infinity;
    for (let j = Math.max(0, i - 2); j <= Math.min(i + 2, t); j++) if (Number.isFinite(e.K[j]) && e.K[j] < m) m = e.K[j];
    return m;
  };

  const ratio = (j: number, h2: FpPoint) => (e.H[j] - h2.price) / (j - h2.idx);

  /** Se a vela j é um topo de recuo (máximo local), entra na procura da layer line. */
  const consider = (lv: Live, j: number, t: number) => {
    if (j < lv.h2.idx + MIN_TOUCH_GAP || j + 1 > t) return;
    if (!(e.H[j] > e.H[j - 1] && e.H[j] >= e.H[j + 1])) return;
    const r = ratio(j, lv.h2);
    if (j <= lv.l2.idx) {
      if (r > lv.sLeg) {
        lv.sLeg = r;
        lv.touchLeg = j;
      }
    } else if (r > lv.sPend) {
      lv.sPend = r;
      lv.touchPend = j;
    }
  };

  const make = (lv: Live): FpSetup => {
    const s = lv.sLeg;
    const h2 = lv.h2;
    return {
      dir: 1,
      h1: lv.h1,
      l1: lv.l1,
      h2,
      l2: lv.l2,
      layerAt: (idx: number) => h2.price + s * (idx - h2.idx),
      touch: lv.touchLeg,
      brk: lv.brk,
      l3: lv.l3,
      signal: null,
      stop: null,
      status: 'leg',
    };
  };

  /** Avança uma ideia uma vela. Devolve false quando morre ou chega à entrada. */
  const step = (ent: { lv: Live; setup: FpSetup | null }, t: number): boolean => {
    const lv = ent.lv;
    if (e.H[t] > lv.h2.price) return false; // o topo mais baixo deixou de o ser
    if (lv.brk === null) {
      // a vela anterior é um topo de recuo (máximo local) agora confirmado pela vela atual
      consider(lv, t - 1, t);
      if (e.L[t] < lv.l2.price) {
        lv.l2 = { idx: t, price: e.L[t] };
        // os topos desde o fundo anterior passam a fazer parte da perna
        if (lv.sPend > lv.sLeg) {
          lv.sLeg = lv.sPend;
          lv.touchLeg = lv.touchPend;
        }
        lv.sPend = -Infinity;
        return true;
      }
      const legBars = lv.l2.idx - lv.h2.idx;
      const line = lv.h2.price + lv.sLeg * (t - lv.h2.idx);
      if (legBars < MIN_LEG_BARS || !Number.isFinite(lv.sLeg) || !(e.C[t] > line)) return true;
      const size1 = lv.h1.price - lv.l1.price;
      const size2 = lv.h2.price - lv.l2.price;
      const slope1 = size1 / Math.max(1, lv.l1.idx - lv.h1.idx);
      const slope2 = size2 / Math.max(1, legBars);
      const ok = lv.l2.price < lv.l1.price && size2 >= o.sizeRatio * size1 && size2 >= o.minMove * atr[t] && slope2 >= o.slopeRatio * slope1;
      // ainda não é um footprint válido (a perna pode continuar e vir a sê-lo): segue-se a perna
      if (!ok) return true;
      lv.brk = t;
      ent.setup = make(lv);
      ent.setup.status = 'retest';
      out.push(ent.setup);
      return true;
    }
    // reteste: os topos de recuo continuam a contar para a linha, caso o rompimento se mostre falso
    consider(lv, t - 1, t);
    if (e.L[t] < lv.l2.price) {
      // a perna continuou: o rompimento era falso. Volta a ser perna e a linha refaz-se com os novos recuos
      const at = out.indexOf(ent.setup!);
      if (at >= 0) out.splice(at, 1);
      ent.setup = null;
      lv.brk = null;
      lv.l3 = null;
      lv.l2 = { idx: t, price: e.L[t] };
      if (lv.sPend > lv.sLeg) {
        lv.sLeg = lv.sPend;
        lv.touchLeg = lv.touchPend;
      }
      lv.sPend = -Infinity;
      return true;
    }
    if (!lv.l3 || e.L[t] <= lv.l3.price) lv.l3 = { idx: t, price: e.L[t] };
    const s = ent.setup!;
    s.l3 = lv.l3;
    const crossed = e.K[t - 1] <= e.D[t - 1] && e.K[t] > e.D[t];
    if (crossed && lv.l3.idx < t && lv.l3.idx > lv.brk) {
      const hidden = lv.l3.price > lv.l2.price && stochLow(lv.l3.idx, t) < stochLow(lv.l2.idx, t);
      if (hidden) {
        s.signal = t;
        s.status = 'signal';
        s.stop = lv.l3.price - 0.1 * atr[t];
        return false;
      }
    }
    return true;
  };

  for (let t = 1; t < n; t++) {
    // novas oscilações confirmadas nesta vela
    let fresh: (typeof pivots)[number] | null = null;
    while (cursor < pivots.length && pivots[cursor].confirmedAt <= t) {
      if (pivots[cursor].confirmedAt === t) fresh = pivots[cursor];
      cursor++;
    }

    lives = lives.filter((ent) => step(ent, t));

    if (fresh && fresh.type === 'H') {
      const h2 = fresh;
      // H1: o último topo mais alto que este. L1: o fundo mais baixo entre os dois.
      // (oscilações pequenas pelo meio, por ruído, não partem o padrão)
      const at = pivots.indexOf(h2);
      let h1: (typeof pivots)[number] | undefined;
      for (let q = at - 1; q >= 0; q--) {
        if (pivots[q].type === 'H' && pivots[q].price > h2.price) {
          h1 = pivots[q];
          break;
        }
      }
      let l1: (typeof pivots)[number] | undefined;
      if (h1) {
        for (let q = pivots.indexOf(h1) + 1; q < at; q++) if (pivots[q].type === 'L' && (!l1 || pivots[q].price < l1.price)) l1 = pivots[q];
      }
      if (l1 && h1 && h1.price - l1.price >= o.minMove * atr[h2.confirmedAt]) {
        let low: FpPoint = { idx: h2.idx + 1, price: e.L[Math.min(n - 1, h2.idx + 1)] };
        for (let j = h2.idx + 1; j <= t; j++) if (e.L[j] <= low.price) low = { idx: j, price: e.L[j] };
        const lv: Live = {
          h1: { idx: h1.idx, price: h1.price },
          l1: { idx: l1.idx, price: l1.price },
          h2: { idx: h2.idx, price: h2.price },
          l2: low,
          sLeg: -Infinity,
          touchLeg: h2.idx + 1,
          sPend: -Infinity,
          touchPend: h2.idx + 1,
          brk: null,
          l3: null,
        };
        for (let j = h2.idx + MIN_TOUCH_GAP; j < t; j++) consider(lv, j, t);
        lives.push({ lv, setup: null });
        // só ficam as ideias mais recentes; as que já romperam têm prioridade sobre as que ainda seguem a perna
        if (lives.length > MAX_LIVE) {
          const drop = lives.findIndex((x) => x.lv.brk === null);
          lives.splice(drop === -1 ? 0 : drop, 1);
        }
      }
    }
  }

  // o que ainda está em curso na última vela (perna a seguir, sem rompimento) também se devolve
  for (const ent of lives) {
    if (ent.lv.brk === null) {
      const s = make(ent.lv);
      s.status = 'leg';
      out.push(s);
    }
  }
  return out;
}

const mirror = (b: Bar): Bar => ({ ...b, open: -b.open, high: -b.low, low: -b.high, close: -b.close });

/** Compras e vendas do método, já em preços reais. */
export function scanFootprint(bars: readonly Bar[], atr: readonly number[], k: readonly number[], d: readonly number[], o: FpOptions): FpSetup[] {
  const buys = scanBuy(bars, atr, k, d, o);
  const m = bars.map(mirror);
  const sells = scanBuy(m, atr, k.map((v) => 100 - v), d.map((v) => 100 - v), o).map((s): FpSetup => {
    const pt = (p: FpPoint): FpPoint => ({ idx: p.idx, price: -p.price });
    return {
      dir: -1,
      h1: pt(s.h1),
      l1: pt(s.l1),
      h2: pt(s.h2),
      l2: pt(s.l2),
      layerAt: (idx) => -s.layerAt(idx),
      touch: s.touch,
      brk: s.brk,
      l3: s.l3 ? pt(s.l3) : null,
      signal: s.signal,
      stop: s.stop === null ? null : -s.stop,
      status: s.status,
    };
  });
  return [...buys, ...sells].sort((a, b) => a.h2.idx - b.h2.idx);
}

const TEAL = '#26a69a';
const RED = '#ff5252';
const WHITE = '#e0e0e0';
const GREEN = '#26a69a';

export interface FootprintOutput {
  draw: DrawData;
  markers: IndicatorMarker[];
  setups: FpSetup[];
}

/** Desenho e marcadores: os últimos métodos completos e o que está em curso agora. */
export function drawFootprint(bars: readonly Bar[], setups: FpSetup[]): FootprintOutput {
  const n = bars.length;
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const markers: IndicatorMarker[] = [];
  const last = n - 1;
  const shown = setups.filter((s) => s.brk !== null || s.status === 'leg').slice(-8);

  for (const s of shown) {
    const buy = s.dir === 1;
    const end = s.signal ?? s.brk ?? last;
    const stop = Math.min(last, Math.max(end + 6, s.brk ?? 0));
    // footprint: reta que une H1 e H2, prolongada até ao rompimento
    const slope = (s.h2.price - s.h1.price) / (s.h2.idx - s.h1.idx);
    const fpEnd = Math.max(s.l2.idx, end);
    lines.push({ i1: s.h1.idx, p1: s.h1.price, i2: fpEnd, p2: s.h1.price + slope * (fpEnd - s.h1.idx), color: TEAL, width: 1.5 });
    // layer line: de H2, tocando nos topos dos recuos, até logo depois do rompimento
    const lEnd = s.brk !== null ? Math.min(last, s.brk + 8) : last;
    if (Number.isFinite(s.layerAt(lEnd))) lines.push({ i1: s.h2.idx, p1: s.h2.price, i2: lEnd, p2: s.layerAt(lEnd), color: RED, width: 2 });
    texts.push({ i: s.h2.idx, p: s.h2.price, text: buy ? 'footprint ↓' : 'footprint ↑', color: TEAL, size: 10, pos: buy ? 'above' : 'below', bold: false });
    if (s.brk !== null) {
      texts.push({ i: s.brk, p: bars[s.brk].close, text: 'layer line rompida', color: RED, size: 10, pos: buy ? 'below' : 'above', bold: false });
    }
    if (s.l3 && s.brk !== null) {
      // divergência: preço (fundo mais alto) contra o Estocástico (fundo mais baixo)
      lines.push({ i1: s.l2.idx, p1: s.l2.price, i2: s.l3.idx, p2: s.l3.price, color: WHITE, width: 1.5, dash: true });
      texts.push({ i: s.l3.idx, p: s.l3.price, text: 'reteste', color: WHITE, size: 10, pos: buy ? 'below' : 'above', bold: false });
    }
    if (s.signal !== null) {
      markers.push({ index: s.signal, position: buy ? 'below' : 'above', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? GREEN : RED, text: buy ? 'COMPRA' : 'VENDA' });
      if (s.stop !== null) {
        lines.push({ i1: s.l3 ? s.l3.idx : s.signal, p1: s.stop, i2: Math.min(last, stop + 8), p2: s.stop, color: RED, width: 1, dash: true });
        texts.push({ i: Math.min(last, stop + 8), p: s.stop, text: 'stop', color: RED, size: 10, pos: buy ? 'below' : 'above', bold: false });
      }
    }
  }

  const cur = setups[setups.length - 1];
  const panel = cur
    ? [
        { text: `${cur.dir === 1 ? 'Compra' : 'Venda'}: footprint de ${cur.dir === 1 ? 'queda' : 'alta'}`, color: cur.dir === 1 ? GREEN : RED },
        {
          text:
            cur.status === 'signal'
              ? cur.signal === last
                ? 'ENTRADA agora: divergência + cruzamento'
                : `entrada há ${last - (cur.signal ?? last)} velas`
              : cur.brk !== null
                ? 'layer line rompida: à espera de divergência'
                : 'a seguir a layer line',
          color: '#d1d4dc',
        },
      ]
    : [{ text: 'sem footprint à vista', color: '#d1d4dc' }];

  return { draw: { lines, texts, panel: { lines: panel, corner: 'bl' } }, markers, setups };
}
