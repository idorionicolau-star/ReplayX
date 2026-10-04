import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_BACKTEST, type BacktestResult, type BacktestSettings } from '@/core/strategy/types';
import { templates, type VisualStrategy } from '@/core/strategy/visual';
import { SCRIPT_TEMPLATES } from '@/core/strategy/script';
import type { OptimizeResult, StrategyRef, WalkForwardResult, BatchRow } from '@/core/strategy/runner';
import type { monteCarlo } from '@/core/trading/stats';
import { uid } from '@/lib/uid';

export interface SavedScript {
  id: string;
  name: string;
  code: string;
  updatedAt: number;
}

export interface TesterResult {
  label: string;
  symbolId: string;
  tf: string;
  result: BacktestResult;
  at: number;
}

export interface StrategiesState {
  scripts: SavedScript[];
  visuals: VisualStrategy[];
  activeScript: string | null;
  activeVisual: string | null;
  settings: BacktestSettings;
  /** Estratégia cujas execuções aparecem no gráfico. */
  applied: { ref: StrategyRef; chartId: string; label: string } | null;
  /** Quantas barras usar no teste. */
  barsToTest: number;
  updatedAt: number;

  // resultados (não guardados)
  tester: TesterResult | null;
  optimization: (OptimizeResult & { label: string; keys: { key: string; label: string }[] }) | null;
  walkforward: (WalkForwardResult & { label: string }) | null;
  batch: { rows: BatchRow[]; monteCarlo?: ReturnType<typeof monteCarlo>; label: string } | null;
  running: { kind: string; done: number; total: number; info?: string } | null;
  error: string | null;

  saveScript: (s: Partial<SavedScript> & { code: string }) => string;
  deleteScript: (id: string) => void;
  setActiveScript: (id: string | null) => void;
  saveVisual: (v: VisualStrategy) => void;
  deleteVisual: (id: string) => void;
  setActiveVisual: (id: string | null) => void;
  setSettings: (patch: Partial<BacktestSettings>) => void;
  setApplied: (a: StrategiesState['applied']) => void;
  set: (patch: Partial<StrategiesState>) => void;
}

export const useStrategies = create<StrategiesState>()(
  persist(
    (set) => {
      const seedScripts: SavedScript[] = SCRIPT_TEMPLATES.map((t, i) => ({ id: `tpl${i}`, name: t.name, code: t.code, updatedAt: 0 }));
      const seedVisuals = templates();
      return {
        scripts: seedScripts,
        visuals: seedVisuals,
        activeScript: seedScripts[0].id,
        activeVisual: seedVisuals[0].id,
        settings: DEFAULT_BACKTEST,
        applied: null,
        barsToTest: 5000,
        updatedAt: 0,
        tester: null,
        optimization: null,
        walkforward: null,
        batch: null,
        running: null,
        error: null,

        saveScript: (s) => {
          const id = s.id ?? uid('sc');
          set((st) => {
            const existing = st.scripts.find((x) => x.id === id);
            const row: SavedScript = { id, name: s.name ?? existing?.name ?? 'Novo script', code: s.code, updatedAt: Date.now() };
            return { scripts: existing ? st.scripts.map((x) => (x.id === id ? row : x)) : [...st.scripts, row], activeScript: id, updatedAt: Date.now() };
          });
          return id;
        },
        deleteScript: (id) => set((st) => ({ scripts: st.scripts.filter((x) => x.id !== id), activeScript: st.activeScript === id ? (st.scripts[0]?.id ?? null) : st.activeScript, updatedAt: Date.now() })),
        setActiveScript: (activeScript) => set({ activeScript }),
        saveVisual: (v) =>
          set((st) => {
            const row = { ...v, updatedAt: Date.now() };
            const exists = st.visuals.some((x) => x.id === v.id);
            return { visuals: exists ? st.visuals.map((x) => (x.id === v.id ? row : x)) : [...st.visuals, row], activeVisual: v.id, updatedAt: Date.now() };
          }),
        deleteVisual: (id) => set((st) => ({ visuals: st.visuals.filter((x) => x.id !== id), activeVisual: st.activeVisual === id ? (st.visuals[0]?.id ?? null) : st.activeVisual, updatedAt: Date.now() })),
        setActiveVisual: (activeVisual) => set({ activeVisual }),
        setSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch }, updatedAt: Date.now() })),
        setApplied: (applied) => set({ applied }),
        set: (patch) => set(patch),
      };
    },
    {
      name: 'rx-strategies',
      version: 1,
      partialize: (s) =>
        ({
          scripts: s.scripts,
          visuals: s.visuals,
          activeScript: s.activeScript,
          activeVisual: s.activeVisual,
          settings: s.settings,
          barsToTest: s.barsToTest,
          updatedAt: s.updatedAt,
        }) as unknown as StrategiesState,
    },
  ),
);
