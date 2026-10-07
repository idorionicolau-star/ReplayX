import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';

export interface ExecLike {
  time: number;
  side: 'long' | 'short';
  kind: 'entry' | 'exit';
  /** "Compra", "Venda", "TP", "SL", "Trail" ou "Fecho". */
  text: string;
  pnl?: number;
}

const UP = '#089981';
const DOWN = '#f23645';
const BUY = '#2962ff';
const SELL = '#e65100';

/** Lucro curto: "+175", "+27,3", "-1,36" (sem moeda, para o gráfico não ficar cheio de texto). */
export function compactMoney(v: number): string {
  const a = Math.abs(v);
  const s = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return `${v < 0 ? '-' : '+'}${s.replace('.', ',')}`.replace(/,0+$/, '');
}

/**
 * Marcas de execução compactas: as ordens da mesma vela, do mesmo lado e do mesmo tipo juntam-se numa só.
 * Entradas: só a seta (azul compra, laranja venda), com "×3" se forem várias.
 * Saídas: o resultado somado, curto ("+175 ×6"), verde se ganhou e vermelho se perdeu.
 */
export function compactExecMarkers(execs: readonly ExecLike[], barTimeOf: (t: number) => number | null): SeriesMarker<Time>[] {
  const groups = new Map<string, { time: number; buy: boolean; kind: 'entry' | 'exit'; n: number; pnl: number; hasPnl: boolean; reasons: Set<string> }>();
  for (const e of execs) {
    const bt = barTimeOf(e.time);
    if (bt === null) continue;
    const buy = (e.kind === 'entry') === (e.side === 'long');
    const key = `${bt}|${buy ? 'b' : 's'}|${e.kind}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { time: bt, buy, kind: e.kind, n: 0, pnl: 0, hasPnl: false, reasons: new Set() }));
    g.n++;
    if (e.pnl !== undefined) {
      g.pnl += e.pnl;
      g.hasPnl = true;
    }
    if (e.kind === 'exit') g.reasons.add(e.text);
  }
  const out: SeriesMarker<Time>[] = [];
  for (const g of groups.values()) {
    let text = '';
    let color: string;
    if (g.kind === 'entry') {
      color = g.buy ? BUY : SELL;
      if (g.n > 1) text = `×${g.n}`;
    } else {
      color = g.pnl >= 0 ? UP : DOWN;
      const reason = g.reasons.size === 1 ? [...g.reasons][0] : '';
      const tag = reason && reason !== 'Fecho' ? `${reason} ` : '';
      text = g.hasPnl ? `${tag}${compactMoney(g.pnl)}${g.n > 1 ? ` ×${g.n}` : ''}` : tag.trim();
    }
    out.push({ time: g.time as UTCTimestamp, position: g.buy ? 'belowBar' : 'aboveBar', shape: g.buy ? 'arrowUp' : 'arrowDown', color, text });
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number));
}
