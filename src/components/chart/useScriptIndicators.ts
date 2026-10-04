'use client';
import { useEffect, useRef } from 'react';
import type { ChartController } from '@/chart/controller';
import type { IndicatorInstance } from '@/core/indicators/registry';
import { useStrategies } from '@/store/strategies';
import { runStrategy } from '@/core/strategy/client';
import type { ScriptRunResult } from '@/core/strategy/script';

/** Corre (no worker) os scripts do utilizador adicionados ao gráfico como indicadores. */
export function useScriptIndicators(ctrl: ChartController | null, indicators: IndicatorInstance[], barsVersion: number) {
  const scripts = useStrategies((s) => s.scripts);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!ctrl) return;
    const list = indicators.filter((i) => i.type.startsWith('script:'));
    if (!list.length) return;
    const run = async () => {
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      try {
        const bars = ctrl.bars.slice(-5000);
        const offset = ctrl.bars.length - bars.length;
        for (const inst of list) {
          const id = inst.type.slice(7);
          const sc = scripts.find((s) => s.id === id);
          if (!sc) {
            ctrl.setScriptResult(inst.uid, { title: 'Script removido', overlay: true, plots: [], shapes: [], hlines: [], error: 'O script já não existe.' });
            continue;
          }
          try {
            const r = await runStrategy<ScriptRunResult>({ type: 'script', code: sc.code, bars, overrides: inst.params }, { timeoutMs: 8000 });
            const pad = (arr: number[]) => (offset ? [...new Array(offset).fill(NaN), ...arr] : arr);
            ctrl.setScriptResult(inst.uid, {
              title: r.meta.title,
              overlay: r.meta.overlay,
              plots: r.plots.map((p) => ({ ...p, data: pad(p.data), colors: p.colors ? [...new Array(offset).fill(undefined), ...p.colors] : undefined })),
              shapes: r.shapes.map((s) => ({ ...s, index: s.index + offset })),
              hlines: r.hlines,
            });
          } catch (e) {
            ctrl.setScriptResult(inst.uid, { title: sc.name, overlay: true, plots: [], shapes: [], hlines: [], error: (e as Error).message });
          }
        }
      } finally {
        running.current = false;
        if (pending.current) {
          pending.current = false;
          void run();
        }
      }
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ctrl, indicators, barsVersion, scripts]);
}
