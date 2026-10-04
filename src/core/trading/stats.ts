import type { Trade } from './engine';

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netProfit: number;
  netProfitPct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgTrade: number;
  avgWin: number;
  avgLoss: number;
  payoff: number;
  largestWin: number;
  largestLoss: number;
  expectancy: number;
  avgR: number | null;
  totalR: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  avgDurationSec: number;
  sharpe: number;
  sortino: number;
  recoveryFactor: number;
  commission: number;
  longTrades: number;
  longWinRate: number;
  shortTrades: number;
  shortWinRate: number;
  finalBalance: number;
}

export interface EquityPoint {
  time: number;
  value: number;
}

/** Curva de capital (fechada) a partir das operações. */
export function equityCurve(trades: readonly Trade[], initial: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const out: EquityPoint[] = [];
  let eq = initial;
  if (sorted.length) out.push({ time: sorted[0].entryTime, value: initial });
  for (const t of sorted) {
    eq += t.pnl;
    out.push({ time: t.exitTime, value: eq });
  }
  return out;
}

export function maxDrawdown(curve: readonly EquityPoint[]): { abs: number; pct: number } {
  let peak = -Infinity;
  let abs = 0;
  let pct = 0;
  for (const p of curve) {
    if (p.value > peak) peak = p.value;
    const dd = peak - p.value;
    if (dd > abs) abs = dd;
    if (peak > 0 && dd / peak > pct) pct = dd / peak;
  }
  return { abs, pct: pct * 100 };
}

export function computeStats(trades: readonly Trade[], initial: number, curve?: readonly EquityPoint[]): Stats {
  const sorted = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const wins = sorted.filter((t) => t.pnl > 0);
  const losses = sorted.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  const net = grossProfit - grossLoss;
  const n = sorted.length;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const withR = sorted.filter((t) => t.r !== undefined && Number.isFinite(t.r));
  const totalR = withR.length ? withR.reduce((a, t) => a + (t.r as number), 0) : null;

  let cw = 0;
  let cl = 0;
  let maxCw = 0;
  let maxCl = 0;
  for (const t of sorted) {
    if (t.pnl > 0) {
      cw++;
      cl = 0;
    } else {
      cl++;
      cw = 0;
    }
    maxCw = Math.max(maxCw, cw);
    maxCl = Math.max(maxCl, cl);
  }

  const eq = curve && curve.length ? curve : equityCurve(sorted, initial);
  const dd = maxDrawdown(eq);

  // retornos por operação (relativos ao capital antes da operação)
  let bal = initial;
  const rets: number[] = [];
  for (const t of sorted) {
    rets.push(bal > 0 ? t.pnl / bal : 0);
    bal += t.pnl;
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const downside = rets.filter((r) => r < 0);
  const dsd = downside.length ? Math.sqrt(downside.reduce((a, r) => a + r * r, 0) / downside.length) : 0;

  const longs = sorted.filter((t) => t.side === 'long');
  const shorts = sorted.filter((t) => t.side === 'short');

  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? (wins.length / n) * 100 : 0,
    netProfit: net,
    netProfitPct: initial ? (net / initial) * 100 : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgTrade: n ? net / n : 0,
    avgWin,
    avgLoss,
    payoff: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    expectancy: n ? (wins.length / n) * avgWin - (losses.length / n) * avgLoss : 0,
    avgR: withR.length ? (totalR as number) / withR.length : null,
    totalR,
    maxDrawdown: dd.abs,
    maxDrawdownPct: dd.pct,
    maxConsecWins: maxCw,
    maxConsecLosses: maxCl,
    avgDurationSec: n ? sorted.reduce((a, t) => a + (t.exitTime - t.entryTime), 0) / n : 0,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(Math.min(n, 252)) : 0,
    sortino: dsd > 0 ? (mean / dsd) * Math.sqrt(Math.min(n, 252)) : 0,
    recoveryFactor: dd.abs > 0 ? net / dd.abs : net > 0 ? Infinity : 0,
    commission: sorted.reduce((a, t) => a + t.commission, 0),
    longTrades: longs.length,
    longWinRate: longs.length ? (longs.filter((t) => t.pnl > 0).length / longs.length) * 100 : 0,
    shortTrades: shorts.length,
    shortWinRate: shorts.length ? (shorts.filter((t) => t.pnl > 0).length / shorts.length) * 100 : 0,
    finalBalance: initial + net,
  };
}

/** Estatísticas por dia da semana e hora (UTC) — para o diário. */
export function breakdown(trades: readonly Trade[]) {
  const byDay = Array.from({ length: 7 }, () => ({ trades: 0, pnl: 0, wins: 0 }));
  const byHour = Array.from({ length: 24 }, () => ({ trades: 0, pnl: 0, wins: 0 }));
  for (const t of trades) {
    const d = new Date(t.entryTime * 1000);
    const day = byDay[d.getUTCDay()];
    const hour = byHour[d.getUTCHours()];
    for (const b of [day, hour]) {
      b.trades++;
      b.pnl += t.pnl;
      if (t.pnl > 0) b.wins++;
    }
  }
  return { byDay, byHour };
}

/** Monte Carlo: baralha a ordem das operações e mede o risco de drawdown. */
export function monteCarlo(trades: readonly Trade[], initial: number, runs = 1000, seed = 42) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const pnls = trades.map((t) => t.pnl);
  const dds: number[] = [];
  const finals: number[] = [];
  let ruin = 0;
  for (let r = 0; r < runs; r++) {
    const arr = pnls.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    let eq = initial;
    let peak = initial;
    let dd = 0;
    let ruined = false;
    for (const p of arr) {
      eq += p;
      peak = Math.max(peak, eq);
      dd = Math.max(dd, peak > 0 ? (peak - eq) / peak : 0);
      if (eq <= initial * 0.5) ruined = true;
    }
    if (ruined) ruin++;
    dds.push(dd * 100);
    finals.push(eq);
  }
  const pct = (arr: number[], q: number) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  };
  return {
    runs,
    ddMedian: pct(dds, 0.5),
    dd95: pct(dds, 0.95),
    dd99: pct(dds, 0.99),
    finalP5: pct(finals, 0.05),
    finalMedian: pct(finals, 0.5),
    finalP95: pct(finals, 0.95),
    ruinPct: (ruin / runs) * 100,
  };
}
