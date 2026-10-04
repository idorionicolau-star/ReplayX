import type { Bar } from '../types';
import type { ParamValue } from '../indicators/registry';
import { runBacktest } from './backtester';
import { compileVisual, setPath, type VisualStrategy } from './visual';
import { runScript, scriptToProgram, type ScriptRunResult } from './script';
import { optimize, walkForwardEfficiency, walkForwardWindows, type Candidate, type OptimizeConfig, type WalkForwardConfig, type WalkForwardFold } from './optimizer';
import type { BacktestResult, BacktestSettings, SpecData, StrategyProgram } from './types';
import { computeStats, monteCarlo, type Stats } from '../trading/stats';

/** Pedidos tratados pelo worker de estratégias (ou no próprio thread, se não houver workers). */

export type StrategyRef = { kind: 'visual'; strategy: VisualStrategy } | { kind: 'script'; code: string; overrides?: Record<string, ParamValue> };

export interface Dataset {
  label: string;
  symbolId: string;
  bars: Bar[];
  spec: SpecData;
}

export type RunnerRequest =
  | { type: 'script'; code: string; bars: Bar[]; overrides?: Record<string, ParamValue>; backtest?: { symbolId: string; spec: SpecData; settings: BacktestSettings } }
  | { type: 'backtest'; strategy: StrategyRef; data: Dataset; settings: BacktestSettings }
  | { type: 'optimize'; strategy: StrategyRef; data: Dataset; settings: BacktestSettings; config: OptimizeConfig }
  | { type: 'walkforward'; strategy: StrategyRef; data: Dataset; settings: BacktestSettings; config: OptimizeConfig; wf: WalkForwardConfig }
  | { type: 'batch'; strategy: StrategyRef; datasets: Dataset[]; settings: BacktestSettings };

export interface OptimizeResult {
  candidates: { params: Record<string, number>; stats: Stats; score: number }[];
  best: BacktestResult | null;
  bestParams: Record<string, number> | null;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  oos: BacktestResult | null;
  efficiency: number;
}

export interface BatchRow {
  label: string;
  symbolId: string;
  stats: Stats | null;
  error?: string;
  buyHoldPct?: number;
  bars: number;
}

export type RunnerResponse = ScriptRunResult | BacktestResult | OptimizeResult | WalkForwardResult | { rows: BatchRow[]; monteCarlo?: ReturnType<typeof monteCarlo> };

function withParams(ref: StrategyRef, params: Record<string, number>): StrategyRef {
  if (!Object.keys(params).length) return ref;
  if (ref.kind === 'visual') {
    let s = ref.strategy;
    for (const [k, v] of Object.entries(params)) s = setPath(s, k, v);
    return { kind: 'visual', strategy: s };
  }
  return { kind: 'script', code: ref.code, overrides: { ...(ref.overrides ?? {}), ...params } };
}

export function buildProgram(ref: StrategyRef, bars: Bar[]): StrategyProgram {
  if (ref.kind === 'visual') return compileVisual(ref.strategy, bars);
  const { program, result } = scriptToProgram(ref.code, bars, ref.overrides);
  if (!program) throw new Error(result.meta.kind === 'strategy' ? 'A estratégia não tem onBar(i => …)' : 'Este script é um indicador, não uma estratégia (use strategy(...) e onBar).');
  return program;
}

export function backtestRef(ref: StrategyRef, data: Dataset, settings: BacktestSettings): BacktestResult {
  return runBacktest(buildProgram(ref, data.bars), { bars: data.bars, symbolId: data.symbolId, spec: data.spec, settings });
}

export async function handle(req: RunnerRequest, progress: (done: number, total: number, info?: string) => void): Promise<RunnerResponse> {
  switch (req.type) {
    case 'script':
      return runScript(req.code, req.bars, {
        overrides: req.overrides,
        backtest: req.backtest ? { symbolId: req.backtest.symbolId, spec: req.backtest.spec, settings: req.backtest.settings } : undefined,
      });
    case 'backtest':
      return backtestRef(req.strategy, req.data, req.settings);
    case 'optimize': {
      const cands = await optimize(
        (params) => backtestRef(withParams(req.strategy, params), req.data, req.settings).stats,
        req.config,
        (d, t) => progress(d, t),
      );
      const top = cands.slice(0, 50);
      const best = top[0] && Number.isFinite(top[0].score) ? top[0] : null;
      return {
        candidates: top.map((c) => ({ params: c.params, stats: c.stats, score: Number.isFinite(c.score) ? c.score : -1e18 })),
        best: best ? backtestRef(withParams(req.strategy, best.params), req.data, req.settings) : null,
        bestParams: best?.params ?? null,
      } satisfies OptimizeResult;
    }
    case 'walkforward': {
      const bars = req.data.bars;
      const windows = walkForwardWindows(bars.length, req.wf);
      const folds: WalkForwardFold[] = [];
      const oosTrades: BacktestResult['trades'] = [];
      const perFold = Math.max(4, Math.floor(req.config.maxRuns / Math.max(1, windows.length)));
      for (let k = 0; k < windows.length; k++) {
        const w = windows[k];
        const isSettings: BacktestSettings = { ...req.settings, startTime: bars[w.is[0]].time, endTime: bars[w.is[1]].time };
        const isData: Dataset = { ...req.data, bars: bars.slice(0, w.is[1]) };
        progress(k, windows.length, `Janela ${k + 1}/${windows.length}: a aprender`);
        const cands: Candidate[] = await optimize(
          (params) => backtestRef(withParams(req.strategy, params), isData, isSettings).stats,
          { ...req.config, maxRuns: perFold },
        );
        const best = cands[0] && Number.isFinite(cands[0].score) ? cands[0] : null;
        let oos: Stats | null = null;
        if (best) {
          const oosEnd = w.oos[1] < bars.length ? bars[w.oos[1]].time : undefined;
          const r = backtestRef(withParams(req.strategy, best.params), { ...req.data, bars: bars.slice(0, w.oos[1]) }, { ...req.settings, startTime: bars[w.oos[0]].time, endTime: oosEnd });
          oos = r.stats;
          oosTrades.push(...r.trades);
        }
        folds.push({ index: k, isFrom: bars[w.is[0]].time, isTo: bars[w.is[1] - 1].time, oosFrom: bars[w.oos[0]].time, oosTo: bars[w.oos[1] - 1].time, best, oos });
      }
      progress(windows.length, windows.length);
      const oosStats = computeStats(oosTrades, req.settings.initialCapital);
      return {
        folds,
        efficiency: walkForwardEfficiency(folds),
        oos: oosTrades.length
          ? { trades: oosTrades, fills: [], equity: [], stats: oosStats, buyHoldPct: 0, bars: bars.length, from: folds[0]?.oosFrom ?? 0, to: folds[folds.length - 1]?.oosTo ?? 0, openPositions: 0 }
          : null,
      } satisfies WalkForwardResult;
    }
    case 'batch': {
      const rows: BatchRow[] = [];
      const allTrades: BacktestResult['trades'] = [];
      for (let k = 0; k < req.datasets.length; k++) {
        const d = req.datasets[k];
        progress(k, req.datasets.length, d.label);
        try {
          const r = backtestRef(req.strategy, d, req.settings);
          rows.push({ label: d.label, symbolId: d.symbolId, stats: r.stats, buyHoldPct: r.buyHoldPct, bars: r.bars });
          allTrades.push(...r.trades);
        } catch (e) {
          rows.push({ label: d.label, symbolId: d.symbolId, stats: null, error: (e as Error).message, bars: d.bars.length });
        }
      }
      progress(req.datasets.length, req.datasets.length);
      return { rows, monteCarlo: allTrades.length >= 5 ? monteCarlo(allTrades, req.settings.initialCapital) : undefined };
    }
  }
}
