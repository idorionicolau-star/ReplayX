'use client';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { useTrading, specFor } from '@/store/trading';
import { useUi } from '@/store/ui';
import { resolveSymbol, pipSize } from '@/core/symbols';
import { pnlFor, type Side } from '@/core/trading/engine';
import { fmtLotWith, lotForRisk, snapLot } from '@/core/trading/lots';
import { orderKind } from '@/core/trading/ticket';
import { toolDef } from '@/chart/drawings/tools';
import { getChart, allCharts } from '@/chart/registry';
import type { Drawing, PositionSizing } from '@/chart/drawings/types';
import { toast } from '@/components/ui/Toast';
import { uid } from '@/lib/uid';
import { currentPrice, submitOrder, tradingMode } from './actions';
import { ruleFor } from './lotRule';

const KIND_LABEL = { market: 'A MERCADO', limit: 'LIMITE', stop: 'STOP' } as const;

export const isPositionDrawing = (d: Drawing): boolean => (d.type === 'long' || d.type === 'short') && !!d.data;

/** Lote, risco e tipo de ordem da ferramenta de posição, com o ativo, as regras de lote e a conta atuais. */
export function positionSizing(symbolId: string | null | undefined, d: Drawing): PositionSizing | null {
  if (!symbolId || !isPositionDrawing(d) || d.points.length < 1) return null;
  const data = d.data!;
  const side: Side = d.type === 'long' ? 'long' : 'short';
  const sym = resolveSymbol(symbolId);
  const spec = specFor(sym);
  const rule = ruleFor(symbolId);
  const st = useSettings.getState();
  const balance = useTrading.getState()[tradingMode()].balance;
  const entry = d.points[0].price;
  const sizing = data.sizing ?? st.trading.sizing;
  let qty: number;
  let minExceeds = false;
  if (sizing === 'qty') {
    qty = snapLot(data.qty ?? st.trading.defaultQty, rule);
  } else {
    const rl = lotForRisk(side, (balance * data.riskPct) / 100, entry, data.stop, spec, rule);
    qty = rl.qty;
    minExceeds = rl.minExceeds;
  }
  const risk = Math.abs(pnlFor(side, qty, entry, data.stop, spec));
  const reward = Math.abs(pnlFor(side, qty, entry, data.target, spec));
  const cur = currentPrice(symbolId);
  const kind = cur === undefined ? 'market' : orderKind(side, entry, cur, pipSize(sym) * 0.5);
  const label = kind === 'market' ? `${side === 'long' ? 'COMPRA' : 'VENDA'} ${KIND_LABEL.market.toLowerCase()}` : `${side === 'long' ? 'COMPRA' : 'VENDA'} ${KIND_LABEL[kind]}`;
  return { qty, risk, reward, riskPct: balance > 0 ? (risk / balance) * 100 : 0, minExceeds, label, kind, qtyText: fmtLotWith(qty, rule) };
}

/** Envia a ordem da ferramenta de posição: limite, stop ou mercado conforme a entrada está face ao preço atual. */
export function sendPosition(symbolId: string, d: Drawing): boolean {
  const sz = positionSizing(symbolId, d);
  if (!sz || !d.data) return false;
  const side: Side = d.type === 'long' ? 'long' : 'short';
  const ok = submitOrder({ symbolId, side, type: sz.kind, qty: sz.qty, price: sz.kind === 'market' ? undefined : d.points[0].price, sl: d.data.stop, tp: d.data.target });
  if (ok) toast(sz.kind === 'market' ? 'Ordem enviada a mercado' : `Ordem ${KIND_LABEL[sz.kind].toLowerCase()} pendente colocada`, { kind: 'success', body: `Lote ${sz.qtyText} · risco ${sz.risk.toFixed(2)}` });
  return ok;
}

/** Inverte a direção (compra ↔ venda) espelhando o stop e o alvo à volta da entrada. */
export function flipPosition(symbolId: string, d: Drawing) {
  if (!d.data) return;
  const entry = d.points[0].price;
  const type = d.type === 'long' ? 'short' : 'long';
  const def = toolDef(type);
  useDrawings.getState().update(symbolId, d.id, {
    type,
    style: { ...d.style, color: def?.style.color ?? d.style.color },
    data: { ...d.data, stop: 2 * entry - d.data.stop, target: 2 * entry - d.data.target },
  });
}

/** Cria uma ferramenta de posição no preço dado (ou no atual), pronta para arrastar a entrada, o stop e o alvo. */
export function createPosition(symbolId: string, opts: { price?: number; side?: Side } = {}): boolean {
  const cur = currentPrice(symbolId);
  const chartEntry = allCharts().find(([, c]) => c.symbol?.id === symbolId);
  const ctrl = chartEntry ? getChart(chartEntry[0]) : undefined;
  const vp = ctrl?.viewport();
  if (cur === undefined || !ctrl || !vp || !ctrl.bars.length) {
    toast('Ainda sem preço para este símbolo', { kind: 'error' });
    return false;
  }
  const side: Side = opts.side ?? (opts.price !== undefined && opts.price > cur ? 'short' : 'long');
  const def = toolDef(side);
  if (!def?.init) return false;
  const sym = resolveSymbol(symbolId);
  const price = +(opts.price ?? cur).toFixed(sym.precision);
  const t = ctrl.bars[ctrl.bars.length - 1].time;
  const st = useSettings.getState();
  const last = useDrawings.getState().lastStyle[side] ?? {};
  const base: Drawing = { id: uid('d'), type: side, points: [{ time: t, price }], style: { ...def.style, ...last }, createdAt: Date.now() };
  const d = def.init({ ...base, data: { stop: 0, target: 0, riskPct: st.trading.defaultRiskPct, account: useTrading.getState()[tradingMode()].balance, sizing: st.trading.sizing, qty: st.trading.defaultQty } }, vp);
  useDrawings.getState().add(symbolId, d);
  useDrawings.getState().select({ symbolId, id: d.id });
  useUi.getState().set({ mobileTools: false });
  return true;
}
