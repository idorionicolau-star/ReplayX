'use client';
import { useWorkspace } from '@/store/workspace';
import { useStrategies } from '@/store/strategies';
import { specData } from '@/store/trading';
import { useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { dataFeed, barEnd } from '@/core/feed/datafeed';
import { nowSec } from '@/core/feed/provider';
import { tfSeconds, tfShort } from '@/core/timeframes';
import { runStrategy } from '@/core/strategy/client';
import type { Dataset, StrategyRef } from '@/core/strategy/runner';
import type { BacktestResult } from '@/core/strategy/types';
import type { Bar } from '@/core/types';

/** Dados do gráfico ativo para testar (no replay, só até ao cursor — sem espreitar o futuro). */
export async function loadDataset(count: number, symbolId?: string, tf?: string): Promise<Dataset & { tf: string }> {
  const ws = useWorkspace.getState();
  const cfg = ws.charts[ws.active];
  const sym = resolveSymbol(symbolId ?? cfg.symbolId);
  const theTf = tf ?? cfg.tf;
  const r = useReplay.getState();
  const cursor = r.active && !r.selecting ? r.cursor : null;
  const to = cursor ?? nowSec() + tfSeconds(theTf);
  const h = await dataFeed().history(sym, theTf, to, count);
  let bars: Bar[] = h.bars;
  if (cursor !== null) bars = bars.filter((b) => barEnd(b.time, theTf) <= cursor);
  if (bars.length < 50) throw new Error(`Poucos dados para testar ${sym.name} ${tfShort(theTf)} (${bars.length} barras).`);
  return { label: `${sym.name} · ${tfShort(theTf)}`, symbolId: sym.id, bars, spec: specData(sym), tf: theTf };
}

export function currentRef(kind: 'visual' | 'script'): { ref: StrategyRef; label: string } | null {
  const st = useStrategies.getState();
  if (kind === 'visual') {
    const v = st.visuals.find((x) => x.id === st.activeVisual) ?? st.visuals[0];
    return v ? { ref: { kind: 'visual', strategy: v }, label: v.name } : null;
  }
  const s = st.scripts.find((x) => x.id === st.activeScript) ?? st.scripts[0];
  return s ? { ref: { kind: 'script', code: s.code }, label: s.name } : null;
}

/** Corre um backtest e mostra-o no Testador (e no gráfico). */
export async function runTester(ref: StrategyRef, label: string): Promise<BacktestResult | null> {
  const st = useStrategies.getState();
  st.set({ running: { kind: 'backtest', done: 0, total: 1, info: 'A carregar dados…' }, error: null });
  try {
    const data = await loadDataset(st.barsToTest);
    st.set({ running: { kind: 'backtest', done: 0, total: 1, info: 'A testar…' } });
    const result = await runStrategy<BacktestResult>({ type: 'backtest', strategy: ref, data, settings: st.settings }, { timeoutMs: 60000 });
    const ws = useWorkspace.getState();
    st.set({ tester: { label: `${label} — ${data.label}`, symbolId: data.symbolId, tf: data.tf, result, at: Date.now() }, running: null });
    st.setApplied({ ref, chartId: ws.charts[ws.active].id, label });
    return result;
  } catch (e) {
    st.set({ running: null, error: (e as Error).message });
    return null;
  }
}
