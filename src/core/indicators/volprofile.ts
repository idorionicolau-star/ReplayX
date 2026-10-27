import type { Bar } from '../types';
import type { DrawData, DrawLine, DrawRect, DrawText } from '../../chart/layer';
import { volumeProfile, type VpResult } from '../volumeProfile';

export interface VpDrawOptions {
  rows: number;
  /** Largura máxima das barras, em % do intervalo visível. */
  widthPct: number;
  valueArea: number;
  place: 'right' | 'left';
  mode: 'auto' | 'volume' | 'tempo';
  showPoc: boolean;
  showVa: boolean;
  /** Barras de subida/descida separadas (como no TradingView) ou só o total. */
  split: boolean;
}

export const VP_DEFAULTS: VpDrawOptions = { rows: 24, widthPct: 30, valueArea: 0.7, place: 'right', mode: 'auto', showPoc: true, showVa: true, split: true };

const UP_IN = 'rgba(41,98,255,0.60)';
const DOWN_IN = 'rgba(251,140,0,0.60)';
const UP_OUT = 'rgba(41,98,255,0.28)';
const DOWN_OUT = 'rgba(251,140,0,0.28)';
const TOTAL_IN = 'rgba(120,123,134,0.55)';
const TOTAL_OUT = 'rgba(120,123,134,0.28)';
const POC = '#f23645';
const VA = '#787b86';

/**
 * Perfil de volume do intervalo visível (como o VPVR do TradingView): histograma horizontal por faixa de preço,
 * ao lado direito (ou esquerdo) do gráfico, com a linha de controlo (POC) e a área de valor (VAH/VAL).
 * `from`/`to` são as posições (em velas) das margens do gráfico.
 */
export function drawVolumeProfile(bars: readonly Bar[], from: number, to: number, o: VpDrawOptions): { draw: DrawData; result: VpResult | null } {
  const rects: DrawRect[] = [];
  const lines: DrawLine[] = [];
  const texts: DrawText[] = [];
  const r = volumeProfile(bars, from, to, { rows: o.rows, valueArea: o.valueArea, mode: o.mode });
  if (!r) return { draw: { rects, lines, texts }, result: null };
  const span = Math.max(1, to - from);
  const maxLen = (o.widthPct / 100) * span;
  const right = o.place === 'right';
  const anchor = right ? to : from;
  const dir = right ? -1 : 1;
  // as etiquetas ficam ao lado do histograma, do lado de dentro do gráfico
  const lx = anchor + dir * (maxLen + Math.min(9, span * 0.1));
  for (const l of r.levels) {
    if (!(l.total > 0)) continue;
    const len = (l.total / r.max) * maxLen;
    const upLen = o.split ? (l.up / l.total) * len : 0;
    const a0 = anchor;
    if (o.split) {
      if (l.up > 0) rects.push({ i1: Math.min(a0, a0 + dir * upLen), i2: Math.max(a0, a0 + dir * upLen), p1: l.hi, p2: l.lo, fill: l.inVa ? UP_IN : UP_OUT });
      const a1 = a0 + dir * upLen;
      const dl = len - upLen;
      if (l.down > 0) rects.push({ i1: Math.min(a1, a1 + dir * dl), i2: Math.max(a1, a1 + dir * dl), p1: l.hi, p2: l.lo, fill: l.inVa ? DOWN_IN : DOWN_OUT });
    } else {
      rects.push({ i1: Math.min(a0, a0 + dir * len), i2: Math.max(a0, a0 + dir * len), p1: l.hi, p2: l.lo, fill: l.inVa ? TOTAL_IN : TOTAL_OUT });
    }
  }
  if (o.showPoc) {
    lines.push({ i1: from, p1: r.poc, i2: to, p2: r.poc, color: POC, width: 1 });
    texts.push({ i: lx, p: r.poc, text: `POC ${fmt(r.poc)}`, color: POC, size: 10, pos: 'above', bold: true });
  }
  if (o.showVa) {
    lines.push({ i1: from, p1: r.vah, i2: to, p2: r.vah, color: VA, width: 1, dash: true });
    lines.push({ i1: from, p1: r.val, i2: to, p2: r.val, color: VA, width: 1, dash: true });
    texts.push({ i: lx, p: r.vah, text: `VAH ${fmt(r.vah)}`, color: VA, size: 10, pos: 'above' });
    texts.push({ i: lx, p: r.val, text: `VAL ${fmt(r.val)}`, color: VA, size: 10, pos: 'below' });
  }
  const label = r.mode === 'volume' ? 'Perfil de volume' : 'Perfil de tempo (os dados não trazem volume)';
  return {
    draw: {
      rects,
      lines,
      texts,
      panel: { lines: [{ text: label, color: '#d1d4dc' }, { text: `${r.levels.length} linhas · ${r.to - r.from + 1} velas`, color: '#9598a1' }], corner: 'bl' },
    },
    result: r,
  };
}

function fmt(v: number): string {
  const a = Math.abs(v);
  return v.toFixed(a >= 1000 ? 1 : a >= 10 ? 2 : a >= 1 ? 4 : 5);
}
