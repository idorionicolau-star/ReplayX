import type { Bar } from './types';
import { lowerBound, upperBound } from './bars';
import type { Drawing } from '@/chart/drawings/types';
import { positionOutcome } from '@/chart/drawings/positionOutcome';

export interface BtTrade {
  id: string;
  long: boolean;
  /** Vela em que a entrada foi tocada e vela em que acabou (alvo ou stop). */
  fillTime: number;
  endTime: number;
  /** Resultado em R: alvo = +(alvo/risco), stop = −1. */
  r: number;
  win: boolean;
}

export interface BtStats {
  trades: BtTrade[];
  wins: number;
  losses: number;
  /** Acertos / trades fechados (0 a 1); null sem trades fechados. */
  hitRate: number | null;
  totalR: number;
  avgR: number | null;
  /** Soma dos ganhos em R / soma das perdas em R; null sem perdas. */
  profitFactor: number | null;
  maxDrawdownR: number;
  maxLossStreak: number;
  /** Caixas à espera da entrada, abertas (entrou e ainda sem alvo/stop) e sem entrada (o preço foi ao alvo/stop sem a tocar). */
  pending: number;
  open: number;
  missed: number;
  /** R acumulado depois de cada trade fechado (começa em 0). */
  curve: number[];
  boxes: number;
}

/**
 * Backtest a partir das caixas de posição (Longa/Curta) desenhadas: cada caixa conta com as velas até à sua margem direita,
 * como na própria caixa, e só entra na estatística depois de o preço tocar na entrada e chegar ao alvo ou ao stop.
 */
export function computeBacktest(drawings: readonly Drawing[], bars: readonly Bar[]): BtStats {
  const trades: BtTrade[] = [];
  let pending = 0;
  let open = 0;
  let missed = 0;
  let boxes = 0;
  for (const d of drawings) {
    if ((d.type !== 'long' && d.type !== 'short') || !d.data || d.points.length < 2 || d.hidden) continue;
    boxes++;
    const long = d.type === 'long';
    const entry = d.points[0].price;
    const { stop, target } = d.data;
    const risk = Math.abs(entry - stop);
    if (!risk) continue;
    const t0 = d.points[0].time;
    const t1 = Math.max(t0, d.points[1].time);
    const win = bars.slice(lowerBound(bars, t0), upperBound(bars, t1));
    const res = positionOutcome(win, long, entry, stop, target);
    if (res.status === 'pending') pending++;
    else if (res.status === 'missed') missed++;
    else if (res.status === 'open') open++;
    else if (res.fillTime !== null && res.endTime !== null) {
      const w = res.status === 'tp';
      trades.push({ id: d.id, long, fillTime: res.fillTime, endTime: res.endTime, win: w, r: w ? Math.abs(target - entry) / risk : -1 });
    }
  }
  trades.sort((a, b) => a.endTime - b.endTime);
  let totalR = 0;
  let peak = 0;
  let maxDd = 0;
  let streak = 0;
  let maxStreak = 0;
  let gain = 0;
  let loss = 0;
  const curve = [0];
  for (const t of trades) {
    totalR += t.r;
    curve.push(totalR);
    peak = Math.max(peak, totalR);
    maxDd = Math.max(maxDd, peak - totalR);
    if (t.win) {
      gain += t.r;
      streak = 0;
    } else {
      loss += -t.r;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    }
  }
  const wins = trades.filter((t) => t.win).length;
  return {
    trades,
    wins,
    losses: trades.length - wins,
    hitRate: trades.length ? wins / trades.length : null,
    totalR,
    avgR: trades.length ? totalR / trades.length : null,
    profitFactor: loss > 0 ? gain / loss : null,
    maxDrawdownR: maxDd,
    maxLossStreak: maxStreak,
    pending,
    open,
    missed,
    curve,
    boxes,
  };
}

/** Uma linha da comparação "e se o alvo fosse…": as mesmas entradas e stops com outro RR. */
export interface WhatIfRow {
  rr: number;
  /** Trades fechados (alvo ou stop) e ainda abertos (as velas disponíveis acabaram sem alvo nem stop). */
  trades: number;
  wins: number;
  open: number;
  hitRate: number | null;
  totalR: number;
  avgR: number | null;
  maxDrawdownR: number;
  /** Acerto mínimo para não perder com este RR: 1 / (1 + RR). */
  breakEven: number;
}

/**
 * E se o alvo estivesse a RR × risco? Refaz cada trade das caixas com a MESMA entrada, o MESMO stop e as MESMAS velas
 * (a partir da vela em que a entrada foi tocada, sem limite à margem da caixa: um alvo mais longo pode demorar mais),
 * só com o alvo noutro sítio. Só entram as caixas em que a entrada foi tocada, por isso o conjunto de trades é igual
 * em todas as linhas. Se a mesma vela toca no alvo e no stop, conta o stop.
 */
export function whatIfRR(drawings: readonly Drawing[], bars: readonly Bar[], rrs: readonly number[]): WhatIfRow[] {
  const entries: { long: boolean; entry: number; stop: number; risk: number; from: Bar[] }[] = [];
  for (const d of drawings) {
    if ((d.type !== 'long' && d.type !== 'short') || !d.data || d.points.length < 2 || d.hidden) continue;
    const long = d.type === 'long';
    const entry = d.points[0].price;
    const { stop, target } = d.data;
    const risk = Math.abs(entry - stop);
    if (!risk) continue;
    const t0 = d.points[0].time;
    const t1 = Math.max(t0, d.points[1].time);
    const base = positionOutcome(bars.slice(lowerBound(bars, t0), upperBound(bars, t1)), long, entry, stop, target);
    if (base.fillTime === null) continue; // sem entrada tocada (à espera ou sem entrada): não é trade
    entries.push({ long, entry, stop, risk, from: bars.slice(lowerBound(bars, base.fillTime)) as Bar[] });
  }
  return rrs.map((rr) => {
    const res: { end: number; r: number }[] = [];
    let open = 0;
    for (const e of entries) {
      const target = e.long ? e.entry + rr * e.risk : e.entry - rr * e.risk;
      const o = positionOutcome(e.from, e.long, e.entry, e.stop, target);
      if (o.status === 'tp') res.push({ end: o.endTime ?? 0, r: rr });
      else if (o.status === 'sl') res.push({ end: o.endTime ?? 0, r: -1 });
      else open++;
    }
    res.sort((a, b) => a.end - b.end);
    let total = 0;
    let peak = 0;
    let dd = 0;
    for (const t of res) {
      total += t.r;
      peak = Math.max(peak, total);
      dd = Math.max(dd, peak - total);
    }
    const wins = res.filter((t) => t.r > 0).length;
    return {
      rr,
      trades: res.length,
      wins,
      open,
      hitRate: res.length ? wins / res.length : null,
      totalR: total,
      avgR: res.length ? total / res.length : null,
      maxDrawdownR: dd,
      breakEven: 1 / (1 + rr),
    };
  });
}
