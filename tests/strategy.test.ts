import { describe, expect, it } from 'vitest';
import { demoProvider } from '@/core/feed/demo';
import { resolveSymbol } from '@/core/symbols';
import { parseTf } from '@/core/timeframes';
import { runBacktest } from '@/core/strategy/backtester';
import { compileVisual, listParams, setPath, templates, toScript } from '@/core/strategy/visual';
import { runScript, SCRIPT_TEMPLATES, ScriptError } from '@/core/strategy/script';
import { optimize, walkForwardWindows } from '@/core/strategy/optimizer';
import { handle } from '@/core/strategy/runner';
import { DEFAULT_BACKTEST, type SpecData } from '@/core/strategy/types';
import type { Bar } from '@/core/types';
import { INDICATORS } from '@/core/indicators/registry';
import * as ta from '@/core/indicators/ta';

const spec: SpecData = { contractSize: 1, conversion: 'none', spread: 0, slippage: 0, commission: { type: 'none', value: 0 } };
let barsCache: Bar[] | null = null;
async function bars(): Promise<Bar[]> {
  if (!barsCache) barsCache = await demoProvider.fetch(resolveSymbol('DEMO:SIMVOL'), parseTf('1h'), { to: Date.parse('2024-06-01T00:00:00Z') / 1000, limit: 3000 });
  return barsCache;
}

describe('indicadores', () => {
  it('todos calculam sem erros e com o tamanho certo', async () => {
    const b = await bars();
    for (const def of INDICATORS) {
      const params = Object.fromEntries(def.inputs.map((i) => [i.key, i.default]));
      const r = def.compute(b, params);
      for (const [k, arr] of Object.entries(r.values)) {
        expect(arr.length, `${def.id}.${k}`).toBe(b.length);
        // as bandas do VWAP estão desligadas por omissão
        if (def.id === 'vwap' && k !== 'vwap') continue;
        expect(arr.some(Number.isFinite), `${def.id}.${k} tem valores`).toBe(true);
      }
    }
  });

  it('SMA/EMA/RSI batem com valores de referência', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(ta.sma(src, 3)[2]).toBe(2);
    expect(ta.sma(src, 3)[9]).toBe(9);
    expect(ta.ema(src, 3)[2]).toBe(2);
    expect(ta.ema(src, 3)[3]).toBe(3);
    const up = ta.rsi(src, 3);
    expect(up[9]).toBe(100);
    expect(ta.highest(src, 3)[5]).toBe(6);
    expect(ta.lowest(src, 3)[5]).toBe(4);
    expect(ta.crossover([1, 3], [2, 2])).toEqual([false, true]);
  });
});

describe('backtest', () => {
  it('corre todos os modelos visuais', async () => {
    const b = await bars();
    for (const t of templates()) {
      const r = runBacktest(compileVisual(t, b), { bars: b, symbolId: 'DEMO:SIMVOL', spec, settings: DEFAULT_BACKTEST });
      expect(r.stats.trades, t.name).toBeGreaterThan(0);
      expect(Number.isFinite(r.stats.netProfit)).toBe(true);
      expect(r.openPositions).toBe(0);
      // nenhuma operação começa antes de acabar a anterior (pyramiding 1)
      const sorted = [...r.trades].sort((x, y) => x.entryTime - y.entryTime);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].entryTime).toBeGreaterThanOrEqual(sorted[i - 1].exitTime);
    }
  });

  it('não olha para o futuro: a entrada é na abertura da barra seguinte', async () => {
    const b = await bars();
    const t = templates()[0];
    const r = runBacktest(compileVisual(t, b), { bars: b, symbolId: 'X', spec, settings: { ...DEFAULT_BACKTEST, sizing: { mode: 'fixed', value: 1 } } });
    const byTime = new Map(b.map((x, i) => [x.time, i]));
    const entries = r.fills.filter((f) => f.kind === 'entry');
    for (const e of entries.slice(0, 20)) {
      const i = byTime.get(e.time)!;
      expect(e.price).toBe(b[i].open);
    }
  });

  it('parâmetros otimizáveis e alteração por caminho', () => {
    const t = templates()[0];
    const ps = listParams(t);
    expect(ps.map((p) => p.path)).toContain('indicators.0.params.length');
    const t2 = setPath(t, 'indicators.0.params.length', 5);
    expect(t2.indicators[0].params.length).toBe(5);
    expect(t.indicators[0].params.length).toBe(9);
  });

  it('o script gerado a partir do modelo visual dá o mesmo resultado', async () => {
    const b = await bars();
    const t = templates()[0];
    const visual = runBacktest(compileVisual(t, b), { bars: b, symbolId: 'X', spec, settings: DEFAULT_BACKTEST });
    const code = toScript(t);
    const script = runScript(code, b, { backtest: { symbolId: 'X', spec, settings: DEFAULT_BACKTEST } });
    expect(script.backtest?.stats.trades).toBe(visual.stats.trades);
    expect(script.backtest?.stats.netProfit).toBeCloseTo(visual.stats.netProfit, 6);
  });
});

describe('scripts', () => {
  it('modelos de script correm', async () => {
    const b = await bars();
    for (const t of SCRIPT_TEMPLATES) {
      const r = runScript(t.code, b, { backtest: { symbolId: 'X', spec, settings: DEFAULT_BACKTEST } });
      expect(r.plots.length, t.name).toBeGreaterThan(0);
      if (r.meta.kind === 'strategy') expect(r.backtest?.stats.trades, t.name).toBeGreaterThan(0);
    }
  });

  it('inputs podem ser alterados', async () => {
    const b = await bars();
    const r = runScript(SCRIPT_TEMPLATES[0].code, b, { overrides: { 'EMA rápida': 5 } });
    expect(r.inputs.find((i) => i.title === 'EMA rápida')?.value).toBe(5);
  });

  it('erros indicam a linha', async () => {
    const b = await bars();
    try {
      runScript("indicator('x');\nconst a = 1;\nfoo();", b);
      expect.fail('devia falhar');
    } catch (e) {
      expect(e).toBeInstanceOf(ScriptError);
      expect((e as ScriptError).message).toMatch(/foo/);
      expect((e as ScriptError).line).toBe(3);
    }
  });
});

describe('otimizador', () => {
  it('grelha encontra o máximo de uma função', async () => {
    const res = await optimize(
      (p) => ({ trades: 10, netProfit: -((p.a - 3) ** 2) - (p.b - 7) ** 2 }) as never,
      { method: 'grid', ranges: [{ key: 'a', min: 0, max: 6, step: 1, integer: true }, { key: 'b', min: 0, max: 10, step: 1, integer: true }], objective: 'netProfit', minTrades: 1, maxRuns: 500 },
    );
    expect(res[0].params).toEqual({ a: 3, b: 7 });
    expect(res).toHaveLength(77);
  });

  it('genético aproxima-se do máximo', async () => {
    const res = await optimize(
      (p) => ({ trades: 10, netProfit: -((p.a - 30) ** 2) - (p.b - 70) ** 2 }) as never,
      { method: 'genetic', ranges: [{ key: 'a', min: 0, max: 100, step: 1, integer: true }, { key: 'b', min: 0, max: 100, step: 1, integer: true }], objective: 'netProfit', minTrades: 1, maxRuns: 400, seed: 7 },
    );
    expect(Math.abs(res[0].params.a - 30)).toBeLessThanOrEqual(5);
    expect(Math.abs(res[0].params.b - 70)).toBeLessThanOrEqual(5);
  });

  it('janelas walk-forward cobrem os dados sem se sobreporem no teste', () => {
    const w = walkForwardWindows(1000, { folds: 4, inSamplePct: 70, anchored: false });
    expect(w).toHaveLength(4);
    for (let i = 1; i < w.length; i++) expect(w[i].oos[0]).toBe(w[i - 1].oos[1]);
    expect(w[w.length - 1].oos[1]).toBe(1000);
    expect(w[0].is[1]).toBe(w[0].oos[0]);
  });

  it('runner: otimização, walk-forward e lote', async () => {
    const b = await bars();
    const strategy = { kind: 'visual' as const, strategy: templates()[0] };
    const data = { label: 'SIMVOL 1h', symbolId: 'X', bars: b, spec };
    const opt = (await handle({ type: 'optimize', strategy, data, settings: DEFAULT_BACKTEST, config: { method: 'random', ranges: [{ key: 'indicators.0.params.length', min: 5, max: 15, step: 1, integer: true }], objective: 'netProfit', minTrades: 1, maxRuns: 6 } }, () => undefined)) as { candidates: unknown[]; best: unknown };
    expect(opt.candidates.length).toBeGreaterThan(0);
    expect(opt.best).not.toBeNull();
    const wf = (await handle({ type: 'walkforward', strategy, data, settings: DEFAULT_BACKTEST, config: { method: 'random', ranges: [{ key: 'indicators.0.params.length', min: 5, max: 15, step: 1, integer: true }], objective: 'netProfit', minTrades: 1, maxRuns: 12 }, wf: { folds: 3, inSamplePct: 70, anchored: false } }, () => undefined)) as { folds: unknown[] };
    expect(wf.folds).toHaveLength(3);
    const batch = (await handle({ type: 'batch', strategy, datasets: [data, { ...data, label: 'metade', bars: b.slice(1500) }], settings: DEFAULT_BACKTEST }, () => undefined)) as { rows: { stats: unknown }[] };
    expect(batch.rows).toHaveLength(2);
    expect(batch.rows.every((r) => r.stats)).toBe(true);
  });
});
