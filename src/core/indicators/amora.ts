import type { Bar } from '../types';
import { findPivots, type Pivot } from './apocalypse';
import type { DrawData, DrawLine, DrawRect, DrawText } from '../../chart/layer';
import type { IndicatorMarker } from './registry';
import { tr } from '@/i18n';

/**
 * Amora: rompimentos (breakouts) da estrutura com caixa de RR.
 *
 * A estrutura são os topos e fundos confirmados (zigzag pelo ATR) do próprio intervalo do gráfico. O sinal é a primeira vela
 * que FECHA acima do último topo (compra) ou abaixo do último fundo (venda). A entrada é no fecho dessa vela, o stop fica na
 * estrutura anterior (último fundo para compras, último topo para vendas) e o alvo a RR × risco. Só usa velas fechadas e
 * oscilações já confirmadas nessa altura, por isso não repinta e serve no replay.
 */

export interface AmoraOptions {
  /** Oscilação mínima (em ATR) para um topo/fundo contar como estrutura. */
  sensitivity: number;
  /** Alvo em múltiplos do risco (1,5 = 1:1,5). */
  rr: number;
  /** O fecho tem de passar o nível por pelo menos isto (ATR); 0 = basta fechar além. */
  minBreak: number;
  /** Folga do stop além da estrutura (ATR). */
  stopBuf: number;
  /** Risco máximo (ATR) entre a entrada e o stop; 0 = sem limite. */
  maxRisk: number;
  /** Lados a operar. */
  side: 'both' | 'long' | 'short';
  /** Uma operação de cada vez (enquanto há uma aberta, não entra outra). */
  oneAtATime: boolean;
  /**
   * Filtro de tendência: só compras com o fecho acima desta média e só vendas abaixo (ex.: EMA 200).
   * Sem média (ou ainda sem valor nas primeiras velas), não há filtro.
   */
  trend?: readonly number[];
}

export const AMORA_DEFAULTS: AmoraOptions = { sensitivity: 2, rr: 1.5, minBreak: 0, stopBuf: 0, maxRisk: 0, side: 'both', oneAtATime: true };

export interface AmoraSignal {
  dir: 1 | -1;
  /** Vela do rompimento (entrada no fecho). */
  idx: number;
  /** Nível rompido (o topo ou fundo da estrutura). */
  level: Pivot;
  /** Estrutura onde fica o stop. */
  structure: Pivot;
  entry: number;
  stop: number;
  target: number;
  exit: { idx: number; result: 'alvo' | 'stop' } | null;
}

export interface AmoraResult {
  signals: AmoraSignal[];
}

/**
 * R ganho ou perdido num sinal fechado. `cost` (em preço: spread + comissão de ida e volta) desconta-se em R:
 * custo ÷ risco. Com stops curtos o mesmo custo pesa muito mais.
 */
export function amoraR(s: AmoraSignal, cost = 0): number | null {
  if (!s.exit) return null;
  const risk = Math.abs(s.entry - s.stop);
  if (!(risk > 0)) return null;
  const gross = s.exit.result === 'stop' ? -1 : Math.abs(s.target - s.entry) / risk;
  return gross - Math.max(0, cost) / risk;
}

export function scanAmora(bars: readonly Bar[], atr: readonly number[], o: AmoraOptions = AMORA_DEFAULTS): AmoraResult {
  const signals: AmoraSignal[] = [];
  const rr = o.rr > 0 ? o.rr : AMORA_DEFAULTS.rr;
  const pivots = findPivots(bars, atr, Math.max(0.1, o.sensitivity)).sort((a, b) => a.confirmedAt - b.confirmedAt || a.idx - b.idx);
  let pi = 0;
  let lastH: Pivot | null = null;
  let lastL: Pivot | null = null;
  // cada nível só dá um sinal: o da primeira vela que fecha além dele
  let usedH = -1;
  let usedL = -1;
  let open: AmoraSignal[] = [];

  for (let t = 1; t < bars.length; t++) {
    const b = bars[t];
    // 1) operações abertas (a partir da vela seguinte à entrada; na mesma vela conta primeiro o stop)
    if (open.length) {
      const still: AmoraSignal[] = [];
      for (const s of open) {
        const stopHit = s.dir === 1 ? b.low <= s.stop : b.high >= s.stop;
        const targetHit = s.dir === 1 ? b.high >= s.target : b.low <= s.target;
        if (stopHit) s.exit = { idx: t, result: 'stop' };
        else if (targetHit) s.exit = { idx: t, result: 'alvo' };
        else still.push(s);
      }
      open = still;
    }
    // 2) estrutura conhecida até à vela anterior (a oscilação só se conhece depois de confirmada)
    while (pi < pivots.length && pivots[pi].confirmedAt <= t - 1) {
      const p = pivots[pi++];
      if (p.type === 'H') lastH = p;
      else lastL = p;
    }
    const a = atr[t] || atr[t - 1] || 0;
    if (!(a > 0)) continue;
    const busy = o.oneAtATime && open.length > 0;

    // tendência na vela do rompimento: com filtro, sem valor da média ainda não há sinais
    const m = o.trend ? o.trend[t] : NaN;
    const filtered = !!o.trend;
    const longOk = !filtered || (Number.isFinite(m) && b.close > m);
    const shortOk = !filtered || (Number.isFinite(m) && b.close < m);

    // 3) compra: primeira vela a fechar acima do último topo; stop no último fundo
    // (o nível fica gasto mesmo que o filtro recuse: só a primeira vela que fecha fora conta)
    if (lastH && usedH !== lastH.idx && t > lastH.idx && b.close > lastH.price + o.minBreak * a) {
      usedH = lastH.idx;
      if (!busy && o.side !== 'short' && longOk && lastL) {
        const entry = b.close;
        const stop = lastL.price - o.stopBuf * a;
        const risk = entry - stop;
        if (risk > 0 && (!(o.maxRisk > 0) || risk <= o.maxRisk * a)) {
          const s: AmoraSignal = { dir: 1, idx: t, level: lastH, structure: lastL, entry, stop, target: entry + rr * risk, exit: null };
          signals.push(s);
          open.push(s);
          continue;
        }
      }
    }
    // 4) venda: primeira vela a fechar abaixo do último fundo; stop no último topo
    if (lastL && usedL !== lastL.idx && t > lastL.idx && b.close < lastL.price - o.minBreak * a) {
      usedL = lastL.idx;
      if (!(o.oneAtATime && open.length > 0) && o.side !== 'long' && shortOk && lastH) {
        const entry = b.close;
        const stop = lastH.price + o.stopBuf * a;
        const risk = stop - entry;
        if (risk > 0 && (!(o.maxRisk > 0) || risk <= o.maxRisk * a)) {
          const s: AmoraSignal = { dir: -1, idx: t, level: lastL, structure: lastH, entry, stop, target: entry - rr * risk, exit: null };
          signals.push(s);
          open.push(s);
        }
      }
    }
  }
  return { signals };
}

const TARGET = '#089981';
const STOP = '#f23645';
const LEVEL = '#d1d4dc';
const BUY = '#2962ff';
const SELL = '#f23645';

export interface AmoraOutput {
  draw: DrawData;
  markers: IndicatorMarker[];
}

export function drawAmora(bars: readonly Bar[], r: AmoraResult, rr: number, goal?: { target: number; historyDone: boolean }, cost = 0, trendLen = 0): AmoraOutput {
  const last = bars.length - 1;
  const rects: DrawRect[] = [];
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const markers: IndicatorMarker[] = [];

  for (const s of r.signals) {
    const buy = s.dir === 1;
    // a caixa vai até à saída (ou até à última vela, se ainda estiver aberta); pelo menos 3 velas para se ver
    const end = Math.min(last, Math.max(s.idx + 3, s.exit?.idx ?? last));
    rects.push({ i1: s.idx, i2: end, p1: s.entry, p2: s.target, fill: 'rgba(8,153,129,0.18)', stroke: 'rgba(8,153,129,0.6)' });
    rects.push({ i1: s.idx, i2: end, p1: s.entry, p2: s.stop, fill: 'rgba(242,54,69,0.18)', stroke: 'rgba(242,54,69,0.6)' });
    // nível rompido e estrutura do stop
    lines.push({ i1: s.level.idx, p1: s.level.price, i2: s.idx, p2: s.level.price, color: LEVEL, width: 1, dash: true });
    lines.push({ i1: s.structure.idx, p1: s.structure.price, i2: s.idx, p2: s.structure.price, color: STOP, width: 1, dash: true });
    markers.push({ index: s.idx, position: buy ? 'below' : 'above', shape: buy ? 'arrowUp' : 'arrowDown', color: buy ? BUY : SELL, text: `${buy ? tr('COMPRA') : tr('VENDA')} 1:${rr.toFixed(1)}` });
    if (s.exit) {
      const ok = s.exit.result === 'alvo';
      texts.push({ i: s.exit.idx, p: ok ? s.target : s.stop, text: ok ? tr('✓ alvo +{0}R', (amoraR(s) ?? 0).toFixed(1)) : '✗ stop -1R', color: ok ? TARGET : STOP, size: 10, pos: ok === buy ? 'above' : 'below' });
    }
  }

  const closed = r.signals.filter((s) => s.exit);
  const wins = closed.filter((s) => s.exit!.result === 'alvo').length;
  const sum = closed.reduce((acc, s) => acc + (amoraR(s) ?? 0), 0);
  const rate = closed.length ? Math.round((wins / closed.length) * 100) : 0;
  const panel: { text: string; color?: string }[] = [
    { text: tr('Amora (breakouts 1:{0}): {1} sinais', rr.toFixed(1), r.signals.length), color: LEVEL },
    ...(trendLen > 0 ? [{ text: tr('só a favor da tendência (EMA {0})', trendLen), color: LEVEL }] : []),
    { text: tr('{0} alvos · {1} stops ({2}%) · soma {3}{4}R', wins, closed.length - wins, rate, sum >= 0 ? '+' : '', sum.toFixed(1)), color: cost > 0 ? LEVEL : sum >= 0 ? TARGET : STOP },
  ];
  if (cost > 0 && closed.length) {
    // resultado líquido: cada operação paga o custo, que em R é custo ÷ risco
    const net = closed.reduce((acc, s) => acc + (amoraR(s, cost) ?? 0), 0);
    const avgCost = (sum - net) / closed.length;
    panel.push({ text: tr('líquido (com custos): soma {0}{1}R · {2}{3}R por operação', net >= 0 ? '+' : '', net.toFixed(1), net >= 0 ? '+' : '', (net / closed.length).toFixed(2)), color: net >= 0 ? TARGET : STOP });
    panel.push({ text: tr('custo médio: {0}R por operação', avgCost.toFixed(2)), color: LEVEL });
  }
  const openOne = r.signals.find((s) => !s.exit);
  if (openOne) panel.push({ text: tr('{0} em curso', openOne.dir === 1 ? tr('compra') : tr('venda')), color: openOne.dir === 1 ? BUY : SELL });
  if (goal && r.signals.length < goal.target) {
    panel.push({ text: goal.historyDone ? tr('o histórico acabou: {0} de {1} sinais', r.signals.length, goal.target) : tr('a carregar mais passado… {0}/{1} sinais', r.signals.length, goal.target), color: LEVEL });
  }
  return { draw: { rects, lines, texts, panel: { lines: panel, corner: 'bl' } }, markers };
}
