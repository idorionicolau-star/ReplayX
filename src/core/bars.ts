import type { Bar } from './types';
import { alignTime, type Timeframe } from './timeframes';

/** Primeiro índice com bars[i].time >= t. */
export function lowerBound(bars: readonly { time: number }[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Primeiro índice com bars[i].time > t. */
export function upperBound(bars: readonly { time: number }[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Barras com time em [from, to). */
export function sliceRange(bars: readonly Bar[], from: number, to: number): Bar[] {
  return bars.slice(lowerBound(bars, from), lowerBound(bars, to));
}

/** Junta barras ordenadas (as novas substituem as antigas com o mesmo time). */
export function mergeBars(a: readonly Bar[], b: readonly Bar[]): Bar[] {
  if (!a.length) return b.slice();
  if (!b.length) return a.slice();
  // caso comum: blocos que não se sobrepõem
  if (b[0].time > a[a.length - 1].time) return a.concat(b);
  if (b[b.length - 1].time < a[0].time) return b.concat(a);
  const out: Bar[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].time < b[j].time)) out.push(a[i++]);
    else if (i >= a.length || b[j].time < a[i].time) out.push(b[j++]);
    else {
      out.push(b[j++]);
      i++;
    }
  }
  return out;
}

/** Agrega barras (ordenadas) para um timeframe maior. */
export function aggregate(bars: readonly Bar[], tf: Timeframe): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  for (const b of bars) {
    const t = alignTime(b.time, tf);
    if (!cur || cur.time !== t) {
      if (cur) out.push(cur);
      cur = { time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      if (b.volume !== undefined) cur.volume = (cur.volume ?? 0) + b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Combina várias barras numa só, com a abertura dada. */
export function combine(bars: readonly Bar[], time: number): Bar | null {
  if (!bars.length) return null;
  let high = -Infinity;
  let low = Infinity;
  let volume: number | undefined;
  for (const b of bars) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
    if (b.volume !== undefined) volume = (volume ?? 0) + b.volume;
  }
  return { time, open: bars[0].open, high, low, close: bars[bars.length - 1].close, volume };
}

/** Heikin Ashi a partir de barras normais. */
export function heikinAshi(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    out.push({
      time: b.time,
      open,
      close,
      high: Math.max(b.high, open, close),
      low: Math.min(b.low, open, close),
      volume: b.volume,
    });
    prevOpen = open;
    prevClose = close;
  }
  return out;
}

export function isValidBar(b: Bar): boolean {
  return (
    Number.isFinite(b.time) &&
    Number.isFinite(b.open) &&
    Number.isFinite(b.high) &&
    Number.isFinite(b.low) &&
    Number.isFinite(b.close)
  );
}

/** Ordena, remove duplicados e barras inválidas. */
export function sanitize(bars: Bar[]): Bar[] {
  const valid = bars.filter(isValidBar);
  valid.sort((a, b) => a.time - b.time);
  const out: Bar[] = [];
  for (const b of valid) {
    const fixed: Bar = {
      ...b,
      high: Math.max(b.high, b.open, b.close),
      low: Math.min(b.low, b.open, b.close),
    };
    if (out.length && out[out.length - 1].time === b.time) out[out.length - 1] = fixed;
    else out.push(fixed);
  }
  return out;
}
