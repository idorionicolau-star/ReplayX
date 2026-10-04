import type { Stats } from '../trading/stats';

/**
 * Otimização de parâmetros ("aprender"): grelha, aleatória ou algoritmo genético,
 * e validação walk-forward (aprende num período, testa no seguinte).
 */

export interface OptimizeRange {
  key: string;
  label?: string;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export type Objective = 'netProfit' | 'profitFactor' | 'sharpe' | 'winRate' | 'expectancy' | 'recovery' | 'netProfitDD';

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  netProfit: 'Lucro líquido',
  profitFactor: 'Fator de lucro',
  sharpe: 'Sharpe',
  winRate: 'Taxa de acerto',
  expectancy: 'Expectativa por operação',
  recovery: 'Fator de recuperação',
  netProfitDD: 'Lucro / drawdown',
};

export interface OptimizeConfig {
  method: 'grid' | 'random' | 'genetic';
  ranges: OptimizeRange[];
  objective: Objective;
  minTrades: number;
  maxRuns: number;
  seed?: number;
}

export interface Candidate {
  params: Record<string, number>;
  stats: Stats;
  score: number;
}

export function score(stats: Stats, objective: Objective, minTrades: number): number {
  if (stats.trades < minTrades) return -Infinity;
  const cap = (v: number) => (Number.isFinite(v) ? v : 100);
  switch (objective) {
    case 'profitFactor':
      return cap(stats.profitFactor);
    case 'sharpe':
      return stats.sharpe;
    case 'winRate':
      return stats.winRate;
    case 'expectancy':
      return stats.expectancy;
    case 'recovery':
      return cap(stats.recoveryFactor);
    case 'netProfitDD':
      return stats.netProfit / (stats.maxDrawdown + 1e-9 + Math.abs(stats.netProfit) * 0.01);
    default:
      return stats.netProfit;
  }
}

function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function valuesOf(r: OptimizeRange): number[] {
  const out: number[] = [];
  const step = r.step > 0 ? r.step : (r.max - r.min) / 10 || 1;
  for (let v = r.min; v <= r.max + step * 1e-6; v += step) out.push(r.integer ? Math.round(v) : +v.toFixed(6));
  return Array.from(new Set(out));
}

export function gridSize(ranges: OptimizeRange[]): number {
  return ranges.reduce((a, r) => a * valuesOf(r).length, 1);
}

function key(p: Record<string, number>) {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join('&');
}

/**
 * `evaluate` corre um backtest com os parâmetros dados e devolve as estatísticas.
 * Devolve os candidatos ordenados (melhor primeiro).
 */
export async function optimize(
  evaluate: (params: Record<string, number>) => Stats | Promise<Stats>,
  cfg: OptimizeConfig,
  onProgress?: (done: number, total: number, best?: Candidate) => void,
): Promise<Candidate[]> {
  const rand = rng(cfg.seed ?? 12345);
  const grids = cfg.ranges.map(valuesOf);
  const seen = new Map<string, Candidate>();
  const total = cfg.method === 'grid' ? Math.min(gridSize(cfg.ranges), cfg.maxRuns) : cfg.maxRuns;
  let best: Candidate | undefined;

  const run = async (params: Record<string, number>): Promise<Candidate> => {
    const k = key(params);
    const cached = seen.get(k);
    if (cached) return cached;
    const stats = await evaluate(params);
    const c: Candidate = { params, stats, score: score(stats, cfg.objective, cfg.minTrades) };
    seen.set(k, c);
    if (!best || c.score > best.score) best = c;
    onProgress?.(seen.size, total, best);
    return c;
  };

  const randomParams = () => {
    const p: Record<string, number> = {};
    cfg.ranges.forEach((r, i) => (p[r.key] = grids[i][Math.floor(rand() * grids[i].length)]));
    return p;
  };

  if (!cfg.ranges.length) {
    await run({});
  } else if (cfg.method === 'grid' && gridSize(cfg.ranges) <= cfg.maxRuns) {
    const idx = new Array(grids.length).fill(0);
    for (;;) {
      const p: Record<string, number> = {};
      cfg.ranges.forEach((r, i) => (p[r.key] = grids[i][idx[i]]));
      await run(p);
      let d = 0;
      while (d < idx.length) {
        idx[d]++;
        if (idx[d] < grids[d].length) break;
        idx[d] = 0;
        d++;
      }
      if (d === idx.length) break;
    }
  } else if (cfg.method === 'genetic') {
    const popSize = Math.max(8, Math.min(30, Math.round(Math.sqrt(cfg.maxRuns) * 2)));
    let pop: Candidate[] = [];
    for (let i = 0; i < popSize && seen.size < cfg.maxRuns; i++) pop.push(await run(randomParams()));
    let stall = 0;
    while (seen.size < cfg.maxRuns && stall < 40) {
      pop.sort((a, b) => b.score - a.score);
      const elite = pop.slice(0, Math.max(2, Math.round(popSize * 0.2)));
      const pick = () => {
        const a = pop[Math.floor(rand() * pop.length)];
        const b = pop[Math.floor(rand() * pop.length)];
        return a.score > b.score ? a : b;
      };
      const next: Candidate[] = [...elite];
      const before = seen.size;
      while (next.length < popSize && seen.size < cfg.maxRuns) {
        const pa = pick();
        const pb = pick();
        const child: Record<string, number> = {};
        cfg.ranges.forEach((r, i) => {
          let v = rand() < 0.5 ? pa.params[r.key] : pb.params[r.key];
          if (rand() < 0.25) {
            const g = grids[i];
            const pos = g.indexOf(v);
            const jump = Math.max(1, Math.round(g.length * 0.15));
            const np = Math.min(g.length - 1, Math.max(0, (pos < 0 ? Math.floor(rand() * g.length) : pos) + Math.round((rand() * 2 - 1) * jump)));
            v = g[np];
          }
          child[r.key] = v;
        });
        next.push(await run(child));
      }
      stall = seen.size === before ? stall + 1 : 0;
      pop = next;
    }
  } else {
    let guard = 0;
    while (seen.size < cfg.maxRuns && guard++ < cfg.maxRuns * 5) await run(randomParams());
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

export interface WalkForwardFold {
  index: number;
  isFrom: number;
  isTo: number;
  oosFrom: number;
  oosTo: number;
  best: Candidate | null;
  oos: Stats | null;
}

export interface WalkForwardConfig {
  folds: number;
  /** Percentagem de cada janela usada para aprender (in-sample). */
  inSamplePct: number;
  /** Janela ancorada no início (expande) em vez de rolante. */
  anchored: boolean;
}

/** Divide os índices [0, n) em janelas de aprendizagem/teste. */
export function walkForwardWindows(n: number, cfg: WalkForwardConfig): { is: [number, number]; oos: [number, number] }[] {
  const r = cfg.inSamplePct / (100 - cfg.inSamplePct);
  const oosLen = Math.floor(n / (cfg.folds + r));
  const isLen = Math.floor(oosLen * r);
  const out: { is: [number, number]; oos: [number, number] }[] = [];
  for (let k = 0; k < cfg.folds; k++) {
    const isStart = cfg.anchored ? 0 : k * oosLen;
    const isEnd = k * oosLen + isLen;
    const oosEnd = k === cfg.folds - 1 ? n : isEnd + oosLen;
    if (isEnd >= n || oosEnd <= isEnd) break;
    out.push({ is: [isStart, isEnd], oos: [isEnd, oosEnd] });
  }
  return out;
}

/** Eficiência walk-forward: quanto do desempenho "aprendido" se mantém fora da amostra. */
export function walkForwardEfficiency(folds: WalkForwardFold[]): number {
  let isSum = 0;
  let oosSum = 0;
  for (const f of folds) {
    if (!f.best || !f.oos) continue;
    const isBars = Math.max(1, f.isTo - f.isFrom);
    const oosBars = Math.max(1, f.oosTo - f.oosFrom);
    isSum += f.best.stats.netProfit / isBars;
    oosSum += f.oos.netProfit / oosBars;
  }
  return isSum > 0 ? (oosSum / isSum) * 100 : 0;
}
