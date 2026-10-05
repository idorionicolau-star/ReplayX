'use client';
import { useMemo } from 'react';
import { useWorkspace } from '@/store/workspace';
import { resolveSymbol } from '@/core/symbols';
import { compareTf, STANDARD_TFS, tfLabel, tfShort } from '@/core/timeframes';
import { setChartTf } from '@/lib/gates';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { useWheelPicker, type WheelItem } from '@/components/ui/WheelPicker';

/** Roda de símbolos: percorre a lista de observação ativa (o símbolo atual entra se não estiver nela). */
export function useSymbolWheel(chart: number) {
  const cfg = useWorkspace((s) => s.charts[chart]);
  const watch = useWorkspace((s) => (s.watchlists.find((w) => w.id === s.activeWatchlist) ?? s.watchlists[0])?.symbols);
  const items: WheelItem[] = useMemo(() => {
    const ids = [...(watch ?? [])];
    if (cfg && !ids.includes(cfg.symbolId)) ids.unshift(cfg.symbolId);
    return ids.map((id) => {
      const r = resolveSymbol(id);
      return { id, label: r.name, hint: r.assetClass, icon: <AssetIcon symbol={r} size={18} /> };
    });
  }, [watch, cfg]);
  return useWheelPicker({ items, currentId: cfg?.symbolId ?? '', onSelect: (it) => useWorkspace.getState().setSymbol(it.id, chart) });
}

/** Roda de intervalos: 1 minuto … 1 mês (respeita os limites do plano). */
export function useTfWheel(chart: number) {
  const tf = useWorkspace((s) => s.charts[chart]?.tf ?? '1h');
  const items: WheelItem[] = useMemo(() => {
    const list = [...STANDARD_TFS] as string[];
    if (!list.includes(tf)) list.push(tf);
    return list.sort(compareTf).map((t) => ({ id: t, label: tfLabel(t), hint: tfShort(t) }));
  }, [tf]);
  return useWheelPicker({ items, currentId: tf, onSelect: (it) => setChartTf(it.id, chart) });
}
