'use client';
import { useUi } from '@/store/ui';
import { resolveSymbol, pipSize } from '@/core/symbols';
import { defaultLevels } from '@/core/trading/ticket';
import type { Side } from '@/core/trading/engine';
import { toast } from '@/components/ui/Toast';
import { allCharts } from '@/chart/registry';
import { currentPrice } from './actions';

/** Abre o bilhete de ordem no gráfico: entrada no preço dado (ou no atual) com SL e TP prontos para arrastar. */
export function openOrderTicket(symbolId: string, opts: { price?: number; side?: Side } = {}) {
  const cur = currentPrice(symbolId);
  if (cur === undefined) {
    toast('Ainda sem preço para este símbolo', { kind: 'error' });
    return;
  }
  const sym = resolveSymbol(symbolId);
  const entry = +(opts.price ?? cur).toFixed(sym.precision);
  const side: Side = opts.side ?? (opts.price !== undefined && opts.price > cur ? 'short' : 'long');
  // distância do SL por defeito: ~10% da altura visível do gráfico (visível e fácil de pegar em qualquer mercado)
  const pip = pipSize(sym);
  let slPips = 20;
  for (const [, c] of allCharts()) {
    if (c.symbol?.id !== symbolId) continue;
    const h = c.paneSize().height;
    const a = c.yToPrice(h * 0.45);
    const b = c.yToPrice(h * 0.55);
    if (a !== null && b !== null && Math.abs(a - b) > pip * 2) slPips = Math.abs(a - b) / pip;
    break;
  }
  const lv = defaultLevels(side, entry, pip, slPips);
  useUi.getState().set({ orderTicket: { symbolId, side, price: entry, sl: +lv.sl.toFixed(sym.precision), tp: +lv.tp.toFixed(sym.precision) } });
}

export function closeOrderTicket() {
  useUi.getState().set({ orderTicket: null });
}
