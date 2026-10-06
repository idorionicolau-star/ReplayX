import type { Bar } from '../types';

/** Séries numéricas: NaN significa "sem valor". Todas as funções devolvem arrays do mesmo tamanho. */
export type Series = number[];

export type Source = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4' | 'volume';

export const SOURCES: Source[] = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'volume'];

export function source(bars: readonly Bar[], src: Source): Series {
  switch (src) {
    case 'open':
      return bars.map((b) => b.open);
    case 'high':
      return bars.map((b) => b.high);
    case 'low':
      return bars.map((b) => b.low);
    case 'hl2':
      return bars.map((b) => (b.high + b.low) / 2);
    case 'hlc3':
      return bars.map((b) => (b.high + b.low + b.close) / 3);
    case 'ohlc4':
      return bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
    case 'hlcc4':
      return bars.map((b) => (b.high + b.low + 2 * b.close) / 4);
    case 'volume':
      return bars.map((b) => b.volume ?? 0);
    default:
      return bars.map((b) => b.close);
  }
}

const nan = (n: number): Series => new Array(n).fill(NaN);
const ok = (v: number) => Number.isFinite(v);

export function sma(src: Series, len: number): Series {
  const out = nan(src.length);
  len = Math.max(1, Math.floor(len));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (ok(v)) {
      sum += v;
      count++;
    }
    if (i >= len) {
      const old = src[i - len];
      if (ok(old)) {
        sum -= old;
        count--;
      }
    }
    if (i >= len - 1 && count === len) out[i] = sum / len;
  }
  return out;
}

export function ema(src: Series, len: number): Series {
  const out = nan(src.length);
  len = Math.max(1, Math.floor(len));
  const k = 2 / (len + 1);
  let prev = NaN;
  let seed = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!ok(v)) {
      out[i] = prev;
      continue;
    }
    if (!ok(prev)) {
      seed += v;
      seedCount++;
      if (seedCount === len) {
        prev = seed / len;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Média de Wilder (usada no RSI/ATR). */
export function rma(src: Series, len: number): Series {
  const out = nan(src.length);
  len = Math.max(1, Math.floor(len));
  let prev = NaN;
  let seed = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!ok(v)) {
      out[i] = prev;
      continue;
    }
    if (!ok(prev)) {
      seed += v;
      seedCount++;
      if (seedCount === len) {
        prev = seed / len;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (len - 1) + v) / len;
    out[i] = prev;
  }
  return out;
}

export function wma(src: Series, len: number): Series {
  const out = nan(src.length);
  len = Math.max(1, Math.floor(len));
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let s = 0;
    let valid = true;
    for (let j = 0; j < len; j++) {
      const v = src[i - j];
      if (!ok(v)) {
        valid = false;
        break;
      }
      s += v * (len - j);
    }
    if (valid) out[i] = s / denom;
  }
  return out;
}

export function hma(src: Series, len: number): Series {
  const half = wma(src, Math.max(1, Math.floor(len / 2)));
  const full = wma(src, len);
  const diff = half.map((v, i) => 2 * v - full[i]);
  return wma(diff, Math.max(1, Math.floor(Math.sqrt(len))));
}

export function dema(src: Series, len: number): Series {
  const e1 = ema(src, len);
  const e2 = ema(e1, len);
  return e1.map((v, i) => 2 * v - e2[i]);
}

export function tema(src: Series, len: number): Series {
  const e1 = ema(src, len);
  const e2 = ema(e1, len);
  const e3 = ema(e2, len);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

export function vwma(src: Series, vol: Series, len: number): Series {
  const pv = sma(src.map((v, i) => v * vol[i]), len);
  const vv = sma(vol, len);
  return pv.map((v, i) => (vv[i] ? v / vv[i] : NaN));
}

export type MaType = 'sma' | 'ema' | 'wma' | 'hma' | 'rma' | 'dema' | 'tema';
export const MA_TYPES: MaType[] = ['sma', 'ema', 'wma', 'hma', 'rma', 'dema', 'tema'];

export function ma(type: MaType, src: Series, len: number): Series {
  switch (type) {
    case 'ema':
      return ema(src, len);
    case 'wma':
      return wma(src, len);
    case 'hma':
      return hma(src, len);
    case 'rma':
      return rma(src, len);
    case 'dema':
      return dema(src, len);
    case 'tema':
      return tema(src, len);
    default:
      return sma(src, len);
  }
}

export function stdev(src: Series, len: number): Series {
  const out = nan(src.length);
  const mean = sma(src, len);
  for (let i = len - 1; i < src.length; i++) {
    if (!ok(mean[i])) continue;
    let s = 0;
    for (let j = 0; j < len; j++) s += (src[i - j] - mean[i]) ** 2;
    out[i] = Math.sqrt(s / len);
  }
  return out;
}

export function highest(src: Series, len: number): Series {
  const out = nan(src.length);
  const dq: number[] = [];
  for (let i = 0; i < src.length; i++) {
    while (dq.length && dq[0] <= i - len) dq.shift();
    while (dq.length && !(src[dq[dq.length - 1]] > src[i])) dq.pop();
    dq.push(i);
    if (i >= len - 1) out[i] = src[dq[0]];
  }
  return out;
}

export function lowest(src: Series, len: number): Series {
  const out = nan(src.length);
  const dq: number[] = [];
  for (let i = 0; i < src.length; i++) {
    while (dq.length && dq[0] <= i - len) dq.shift();
    while (dq.length && !(src[dq[dq.length - 1]] < src[i])) dq.pop();
    dq.push(i);
    if (i >= len - 1) out[i] = src[dq[0]];
  }
  return out;
}

export function sum(src: Series, len: number): Series {
  return sma(src, len).map((v) => v * len);
}

export function change(src: Series, n = 1): Series {
  return src.map((v, i) => (i >= n ? v - src[i - n] : NaN));
}

export function roc(src: Series, len: number): Series {
  return src.map((v, i) => (i >= len && src[i - len] ? ((v - src[i - len]) / src[i - len]) * 100 : NaN));
}

export function mom(src: Series, len: number): Series {
  return change(src, len);
}

export function tr(bars: readonly Bar[]): Series {
  return bars.map((b, i) => {
    if (i === 0) return b.high - b.low;
    const pc = bars[i - 1].close;
    return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
  });
}

export function atr(bars: readonly Bar[], len: number): Series {
  return rma(tr(bars), len);
}

export function rsi(src: Series, len: number): Series {
  const up = src.map((v, i) => (i === 0 ? NaN : Math.max(v - src[i - 1], 0)));
  const down = src.map((v, i) => (i === 0 ? NaN : Math.max(src[i - 1] - v, 0)));
  const ru = rma(up, len);
  const rd = rma(down, len);
  return ru.map((u, i) => {
    const d = rd[i];
    if (!ok(u) || !ok(d)) return NaN;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

export function macd(src: Series, fast = 12, slow = 26, signal = 9) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = f.map((v, i) => v - s[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { macd: line, signal: sig, hist };
}

export function stoch(bars: readonly Bar[], kLen = 14, kSmooth = 1, dLen = 3) {
  const hh = highest(source(bars, 'high'), kLen);
  const ll = lowest(source(bars, 'low'), kLen);
  const raw = bars.map((b, i) => (hh[i] - ll[i] ? ((b.close - ll[i]) / (hh[i] - ll[i])) * 100 : NaN));
  const k = sma(raw, kSmooth);
  const d = sma(k, dLen);
  return { k, d };
}

export function stochRsi(src: Series, rsiLen = 14, stochLen = 14, kSmooth = 3, dLen = 3) {
  const r = rsi(src, rsiLen);
  const hh = highest(r, stochLen);
  const ll = lowest(r, stochLen);
  const raw = r.map((v, i) => (hh[i] - ll[i] ? ((v - ll[i]) / (hh[i] - ll[i])) * 100 : NaN));
  const k = sma(raw, kSmooth);
  const d = sma(k, dLen);
  return { k, d };
}

export function bollinger(src: Series, len = 20, mult = 2) {
  const basis = sma(src, len);
  const dev = stdev(src, len);
  return {
    basis,
    upper: basis.map((v, i) => v + mult * dev[i]),
    lower: basis.map((v, i) => v - mult * dev[i]),
  };
}

export function keltner(bars: readonly Bar[], len = 20, mult = 2, atrLen = 10) {
  const basis = ema(source(bars, 'close'), len);
  const a = atr(bars, atrLen);
  return {
    basis,
    upper: basis.map((v, i) => v + mult * a[i]),
    lower: basis.map((v, i) => v - mult * a[i]),
  };
}

export function donchian(bars: readonly Bar[], len = 20) {
  const upper = highest(source(bars, 'high'), len);
  const lower = lowest(source(bars, 'low'), len);
  return { upper, lower, basis: upper.map((v, i) => (v + lower[i]) / 2) };
}

export function cci(bars: readonly Bar[], len = 20): Series {
  const tp = source(bars, 'hlc3');
  const m = sma(tp, len);
  const out = nan(bars.length);
  for (let i = len - 1; i < tp.length; i++) {
    if (!ok(m[i])) continue;
    let md = 0;
    for (let j = 0; j < len; j++) md += Math.abs(tp[i - j] - m[i]);
    md /= len;
    out[i] = md ? (tp[i] - m[i]) / (0.015 * md) : 0;
  }
  return out;
}

export function williamsR(bars: readonly Bar[], len = 14): Series {
  const hh = highest(source(bars, 'high'), len);
  const ll = lowest(source(bars, 'low'), len);
  return bars.map((b, i) => (hh[i] - ll[i] ? ((hh[i] - b.close) / (hh[i] - ll[i])) * -100 : NaN));
}

export function dmi(bars: readonly Bar[], len = 14, adxSmooth = 14) {
  const plusDM: Series = [];
  const minusDM: Series = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      plusDM.push(NaN);
      minusDM.push(NaN);
      continue;
    }
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const trr = rma(tr(bars).map((v, i) => (i === 0 ? NaN : v)), len);
  const plus = rma(plusDM, len).map((v, i) => (trr[i] ? (100 * v) / trr[i] : NaN));
  const minus = rma(minusDM, len).map((v, i) => (trr[i] ? (100 * v) / trr[i] : NaN));
  const dx = plus.map((p, i) => {
    const s = p + minus[i];
    return s ? (100 * Math.abs(p - minus[i])) / s : NaN;
  });
  return { plus, minus, adx: rma(dx, adxSmooth) };
}

export function mfi(bars: readonly Bar[], len = 14): Series {
  const tp = source(bars, 'hlc3');
  const out = nan(bars.length);
  for (let i = len; i < bars.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - len + 1; j <= i; j++) {
      const flow = tp[j] * (bars[j].volume ?? 0);
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function obv(bars: readonly Bar[]): Series {
  const out: Series = [];
  let acc = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      const v = bars[i].volume ?? 0;
      if (bars[i].close > bars[i - 1].close) acc += v;
      else if (bars[i].close < bars[i - 1].close) acc -= v;
    }
    out.push(acc);
  }
  return out;
}

export function cmf(bars: readonly Bar[], len = 20): Series {
  const mfv = bars.map((b) => {
    const r = b.high - b.low;
    return r ? (((b.close - b.low) - (b.high - b.close)) / r) * (b.volume ?? 0) : 0;
  });
  const s1 = sum(mfv, len);
  const s2 = sum(bars.map((b) => b.volume ?? 0), len);
  return s1.map((v, i) => (s2[i] ? v / s2[i] : NaN));
}

/** VWAP que reinicia a cada sessão (dia/semana/mês UTC). */
export function vwap(bars: readonly Bar[], anchor: 'D' | 'W' | 'M' = 'D', bands = 0) {
  const out = nan(bars.length);
  const up = nan(bars.length);
  const lo = nan(bars.length);
  let pv = 0;
  let vv = 0;
  let pv2 = 0;
  let key = '';
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].time * 1000);
    let k: string;
    if (anchor === 'M') k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    else if (anchor === 'W') k = String(Math.floor((bars[i].time - 4 * 86400) / (7 * 86400)));
    else k = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    if (k !== key) {
      key = k;
      pv = 0;
      vv = 0;
      pv2 = 0;
    }
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const v = bars[i].volume || 1;
    pv += tp * v;
    vv += v;
    pv2 += tp * tp * v;
    const val = pv / vv;
    out[i] = val;
    if (bands > 0) {
      const sd = Math.sqrt(Math.max(0, pv2 / vv - val * val));
      up[i] = val + bands * sd;
      lo[i] = val - bands * sd;
    }
  }
  return { vwap: out, upper: up, lower: lo };
}

export function supertrend(bars: readonly Bar[], period = 10, mult = 3) {
  const a = atr(bars, period);
  const line = nan(bars.length);
  const dir: number[] = new Array(bars.length).fill(0);
  let upper = NaN;
  let lower = NaN;
  let trend = 1;
  for (let i = 0; i < bars.length; i++) {
    if (!ok(a[i])) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const bu = hl2 + mult * a[i];
    const bl = hl2 - mult * a[i];
    const pc = i > 0 ? bars[i - 1].close : bars[i].close;
    upper = ok(upper) && (bu < upper || pc > upper) ? bu : ok(upper) ? upper : bu;
    lower = ok(lower) && (bl > lower || pc < lower) ? bl : ok(lower) ? lower : bl;
    if (ok(upper) && bars[i].close > upper) trend = 1;
    else if (ok(lower) && bars[i].close < lower) trend = -1;
    dir[i] = trend;
    line[i] = trend === 1 ? lower : upper;
  }
  return { line, dir };
}

export function psar(bars: readonly Bar[], start = 0.02, inc = 0.02, max = 0.2): Series {
  const out = nan(bars.length);
  if (bars.length < 2) return out;
  let long = bars[1].close >= bars[0].close;
  let af = start;
  let ep = long ? bars[0].high : bars[0].low;
  let sar = long ? bars[0].low : bars[0].high;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    sar = sar + af * (ep - sar);
    if (long) {
      sar = Math.min(sar, bars[i - 1].low, i > 1 ? bars[i - 2].low : bars[i - 1].low);
      if (b.low < sar) {
        long = false;
        sar = ep;
        ep = b.low;
        af = start;
      } else if (b.high > ep) {
        ep = b.high;
        af = Math.min(max, af + inc);
      }
    } else {
      sar = Math.max(sar, bars[i - 1].high, i > 1 ? bars[i - 2].high : bars[i - 1].high);
      if (b.high > sar) {
        long = true;
        sar = ep;
        ep = b.high;
        af = start;
      } else if (b.low < ep) {
        ep = b.low;
        af = Math.min(max, af + inc);
      }
    }
    out[i] = sar;
  }
  return out;
}

export function ichimoku(bars: readonly Bar[], conv = 9, base = 26, spanBLen = 52) {
  const mid = (len: number) => {
    const h = highest(source(bars, 'high'), len);
    const l = lowest(source(bars, 'low'), len);
    return h.map((v, i) => (v + l[i]) / 2);
  };
  const conversion = mid(conv);
  const baseLine = mid(base);
  const spanA = conversion.map((v, i) => (v + baseLine[i]) / 2);
  const spanB = mid(spanBLen);
  const lagging = bars.map((b) => b.close);
  return { conversion, base: baseLine, spanA, spanB, lagging };
}

export function aroon(bars: readonly Bar[], len = 14) {
  const up = nan(bars.length);
  const down = nan(bars.length);
  for (let i = len; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    let hiIdx = i;
    let loIdx = i;
    for (let j = i - len; j <= i; j++) {
      if (bars[j].high >= hi) {
        hi = bars[j].high;
        hiIdx = j;
      }
      if (bars[j].low <= lo) {
        lo = bars[j].low;
        loIdx = j;
      }
    }
    up[i] = (100 * (len - (i - hiIdx))) / len;
    down[i] = (100 * (len - (i - loIdx))) / len;
  }
  return { up, down };
}

export function awesome(bars: readonly Bar[]): Series {
  const hl2 = source(bars, 'hl2');
  const a = sma(hl2, 5);
  const b = sma(hl2, 34);
  return a.map((v, i) => v - b[i]);
}

export function trix(src: Series, len = 18): Series {
  const e = ema(ema(ema(src, len), len), len);
  return e.map((v, i) => (i > 0 && e[i - 1] ? ((v - e[i - 1]) / e[i - 1]) * 10000 : NaN));
}

export function linreg(src: Series, len: number, offset = 0): Series {
  const out = nan(src.length);
  for (let i = len - 1; i < src.length; i++) {
    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    let valid = true;
    for (let j = 0; j < len; j++) {
      const y = src[i - len + 1 + j];
      if (!ok(y)) {
        valid = false;
        break;
      }
      sx += j;
      sy += y;
      sxy += j * y;
      sxx += j * j;
    }
    if (!valid) continue;
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx || 1);
    const intercept = (sy - slope * sx) / len;
    out[i] = intercept + slope * (len - 1 - offset);
  }
  return out;
}

/** Pivots clássicos do período anterior (diário por omissão). */
export function pivots(bars: readonly Bar[], period: 'D' | 'W' | 'M' = 'D') {
  const keys = ['pp', 'r1', 'r2', 'r3', 's1', 's2', 's3'] as const;
  const out: Record<(typeof keys)[number], Series> = {} as never;
  keys.forEach((k) => (out[k] = nan(bars.length)));
  const keyOf = (t: number) => {
    const d = new Date(t * 1000);
    if (period === 'M') return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (period === 'W') return String(Math.floor((t - 4 * 86400) / (7 * 86400)));
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  };
  let curKey = '';
  let h = -Infinity;
  let l = Infinity;
  let c = NaN;
  let lv: Record<string, number> | null = null;
  for (let i = 0; i < bars.length; i++) {
    const k = keyOf(bars[i].time);
    if (k !== curKey) {
      if (curKey && ok(c)) {
        const pp = (h + l + c) / 3;
        lv = { pp, r1: 2 * pp - l, s1: 2 * pp - h, r2: pp + (h - l), s2: pp - (h - l), r3: h + 2 * (pp - l), s3: l - 2 * (h - pp) };
      }
      curKey = k;
      h = -Infinity;
      l = Infinity;
    }
    h = Math.max(h, bars[i].high);
    l = Math.min(l, bars[i].low);
    c = bars[i].close;
    if (lv) keys.forEach((kk) => (out[kk][i] = lv![kk]));
  }
  return out;
}

/** ZigZag: pontos de viragem com desvio mínimo em %. Devolve só os vértices (resto NaN). */
export function zigzag(bars: readonly Bar[], deviation = 5): Series {
  const n = bars.length;
  const out = nan(n);
  if (!n) return out;
  const d = deviation / 100;
  let trend = 0;
  let hiIdx = 0;
  let loIdx = 0;
  let ext = 0;
  for (let i = 1; i < n; i++) {
    const b = bars[i];
    if (trend === 0) {
      if (b.high > bars[hiIdx].high) hiIdx = i;
      if (b.low < bars[loIdx].low) loIdx = i;
      if (hiIdx > loIdx && bars[hiIdx].high >= bars[loIdx].low * (1 + d)) {
        out[loIdx] = bars[loIdx].low;
        trend = 1;
        ext = hiIdx;
      } else if (loIdx > hiIdx && bars[loIdx].low <= bars[hiIdx].high * (1 - d)) {
        out[hiIdx] = bars[hiIdx].high;
        trend = -1;
        ext = loIdx;
      }
      continue;
    }
    if (trend === 1) {
      if (b.high >= bars[ext].high) ext = i;
      else if (b.low <= bars[ext].high * (1 - d)) {
        out[ext] = bars[ext].high;
        trend = -1;
        ext = i;
      }
    } else if (b.low <= bars[ext].low) ext = i;
    else if (b.high >= bars[ext].low * (1 + d)) {
      out[ext] = bars[ext].low;
      trend = 1;
      ext = i;
    }
  }
  if (trend === 1) out[ext] = bars[ext].high;
  else if (trend === -1) out[ext] = bars[ext].low;
  return out;
}

/** Fractais de Williams: 1 = topo, -1 = fundo, 0 = nada. */
export function fractals(bars: readonly Bar[], n = 2): number[] {
  const out = new Array(bars.length).fill(0);
  for (let i = n; i < bars.length - n; i++) {
    let top = true;
    let bot = true;
    for (let j = 1; j <= n; j++) {
      if (!(bars[i].high > bars[i - j].high && bars[i].high > bars[i + j].high)) top = false;
      if (!(bars[i].low < bars[i - j].low && bars[i].low < bars[i + j].low)) bot = false;
    }
    out[i] = top ? 1 : bot ? -1 : 0;
  }
  return out;
}

export function pivotHigh(src: Series, left: number, right: number): Series {
  const out = nan(src.length);
  for (let i = left; i < src.length - right; i++) {
    let isPivot = true;
    for (let j = i - left; j <= i + right; j++) if (j !== i && !(src[i] > src[j])) isPivot = false;
    if (isPivot) out[i + right] = src[i];
  }
  return out;
}

export function pivotLow(src: Series, left: number, right: number): Series {
  const out = nan(src.length);
  for (let i = left; i < src.length - right; i++) {
    let isPivot = true;
    for (let j = i - left; j <= i + right; j++) if (j !== i && !(src[i] < src[j])) isPivot = false;
    if (isPivot) out[i + right] = src[i];
  }
  return out;
}

export function crossover(a: Series, b: Series | number): boolean[] {
  const bb = typeof b === 'number' ? null : b;
  return a.map((v, i) => {
    if (i === 0) return false;
    const cur = bb ? bb[i] : (b as number);
    const prev = bb ? bb[i - 1] : (b as number);
    return ok(v) && ok(a[i - 1]) && ok(cur) && ok(prev) && v > cur && a[i - 1] <= prev;
  });
}

export function crossunder(a: Series, b: Series | number): boolean[] {
  const bb = typeof b === 'number' ? null : b;
  return a.map((v, i) => {
    if (i === 0) return false;
    const cur = bb ? bb[i] : (b as number);
    const prev = bb ? bb[i - 1] : (b as number);
    return ok(v) && ok(a[i - 1]) && ok(cur) && ok(prev) && v < cur && a[i - 1] >= prev;
  });
}

export function rising(src: Series, len: number): boolean[] {
  return src.map((_, i) => {
    if (i < len) return false;
    for (let j = 0; j < len; j++) if (!(src[i - j] > src[i - j - 1])) return false;
    return true;
  });
}

export function falling(src: Series, len: number): boolean[] {
  return src.map((_, i) => {
    if (i < len) return false;
    for (let j = 0; j < len; j++) if (!(src[i - j] < src[i - j - 1])) return false;
    return true;
  });
}

export function barsSince(cond: boolean[]): Series {
  let last = -1;
  return cond.map((c, i) => {
    if (c) last = i;
    return last < 0 ? NaN : i - last;
  });
}

export function valueWhen(cond: boolean[], src: Series, occurrence = 0): Series {
  const hits: number[] = [];
  return cond.map((c, i) => {
    if (c) hits.push(src[i]);
    const k = hits.length - 1 - occurrence;
    return k >= 0 ? hits[k] : NaN;
  });
}

export function offset(src: Series, n: number): Series {
  return src.map((_, i) => (i - n >= 0 && i - n < src.length ? src[i - n] : NaN));
}

// ---------------------------------------------------------------- osciladores adicionais

/** Accelerator Oscillator (Bill Williams): AO menos a sua média de 5. Mostra se o momento acelera. */
export function accelerator(bars: readonly Bar[]): Series {
  const ao = awesome(bars);
  const avg = sma(ao, 5);
  return ao.map((v, i) => v - avg[i]);
}

/** Ultimate Oscillator (Larry Williams): junta três horizontes para evitar sinais falsos. */
export function ultimate(bars: readonly Bar[], a = 7, b = 14, c = 28): Series {
  const bp = bars.map((x, i) => x.close - Math.min(x.low, i ? bars[i - 1].close : x.low));
  const range = bars.map((x, i) => Math.max(x.high, i ? bars[i - 1].close : x.high) - Math.min(x.low, i ? bars[i - 1].close : x.low));
  const avg = (n: number) => {
    const sb = sum(bp, n);
    const sr = sum(range, n);
    return sb.map((v, i) => (sr[i] ? v / sr[i] : NaN));
  };
  const A = avg(a);
  const B = avg(b);
  const C = avg(c);
  return A.map((v, i) => (100 * (4 * v + 2 * B[i] + C[i])) / 7);
}

/** Chande Momentum Oscillator: -100 a +100. */
export function cmo(src: Series, len = 9): Series {
  const up = src.map((v, i) => (i === 0 ? NaN : Math.max(v - src[i - 1], 0)));
  const down = src.map((v, i) => (i === 0 ? NaN : Math.max(src[i - 1] - v, 0)));
  const su = sum(up, len);
  const sd = sum(down, len);
  return su.map((u, i) => (u + sd[i] ? (100 * (u - sd[i])) / (u + sd[i]) : NaN));
}

/** Elder Ray: força dos compradores (máximo − EMA) e dos vendedores (mínimo − EMA). */
export function elderRay(bars: readonly Bar[], len = 13) {
  const e = ema(source(bars, 'close'), len);
  return { bull: bars.map((b, i) => b.high - e[i]), bear: bars.map((b, i) => b.low - e[i]) };
}

/** Know Sure Thing (Martin Pring): quatro taxas de variação suavizadas e ponderadas. */
export function kst(src: Series, r = [10, 15, 20, 30], s = [10, 10, 10, 15], signal = 9) {
  const parts = r.map((len, k) => sma(roc(src, len), s[k]));
  const line = src.map((_, i) => parts.reduce((acc, p, k) => acc + (k + 1) * p[i], 0));
  return { kst: line, signal: sma(line, signal) };
}

/** Coppock Curve: média ponderada da soma de duas taxas de variação (fundos de longo prazo). */
export function coppock(src: Series, wmaLen = 10, long = 14, short = 11): Series {
  const a = roc(src, long);
  const b = roc(src, short);
  return wma(a.map((v, i) => v + b[i]), wmaLen);
}

/** Detrended Price Oscillator: tira a tendência para destacar os ciclos. */
export function dpo(src: Series, len = 21): Series {
  const m = sma(src, len);
  const shift = Math.floor(len / 2) + 1;
  return src.map((_, i) => (i - shift >= 0 ? src[i - shift] - m[i] : NaN));
}

/** Vortex Indicator: VI+ acima de VI− indica tendência de alta. */
export function vortex(bars: readonly Bar[], len = 14) {
  const vmp = bars.map((b, i) => (i ? Math.abs(b.high - bars[i - 1].low) : NaN));
  const vmm = bars.map((b, i) => (i ? Math.abs(b.low - bars[i - 1].high) : NaN));
  const t = sum(tr(bars).map((v, i) => (i ? v : NaN)), len);
  return { plus: sum(vmp, len).map((v, i) => v / t[i]), minus: sum(vmm, len).map((v, i) => v / t[i]) };
}

/** Linha de acumulação/distribuição (Chaikin). */
export function adl(bars: readonly Bar[]): Series {
  let acc = 0;
  return bars.map((b) => {
    const range = b.high - b.low;
    const clv = range ? (b.close - b.low - (b.high - b.close)) / range : 0;
    acc += clv * (b.volume ?? 0);
    return acc;
  });
}

/** Chaikin Oscillator: EMA 3 menos EMA 10 da linha de acumulação/distribuição. */
export function chaikinOsc(bars: readonly Bar[], fast = 3, slow = 10): Series {
  const a = adl(bars);
  const f = ema(a, fast);
  const s = ema(a, slow);
  return f.map((v, i) => v - s[i]);
}

/** Force Index (Elder): variação do preço vezes o volume, suavizada. */
export function forceIndex(bars: readonly Bar[], len = 13): Series {
  const raw = bars.map((b, i) => (i ? (b.close - bars[i - 1].close) * (b.volume ?? 0) : NaN));
  return ema(raw, len);
}

/** Choppiness Index: 100 = mercado lateral, 0 = tendência forte (referências em 38,2 e 61,8). */
export function choppiness(bars: readonly Bar[], len = 14): Series {
  const t = sum(tr(bars), len);
  const hi = highest(source(bars, 'high'), len);
  const lo = lowest(source(bars, 'low'), len);
  return t.map((v, i) => (hi[i] > lo[i] ? (100 * Math.log10(v / (hi[i] - lo[i]))) / Math.log10(len) : NaN));
}

/** Percentage Price Oscillator: MACD em percentagem. */
export function ppo(src: Series, fast = 12, slow = 26, signalLen = 9) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = f.map((v, i) => (s[i] ? ((v - s[i]) / s[i]) * 100 : NaN));
  const signal = ema(line, signalLen);
  return { ppo: line, signal, hist: line.map((v, i) => v - signal[i]) };
}

/** True Strength Index (William Blau). */
export function tsi(src: Series, long = 25, short = 13, signalLen = 7) {
  const m = change(src);
  const num = ema(ema(m, long), short);
  const den = ema(ema(m.map((v) => Math.abs(v)), long), short);
  const line = num.map((v, i) => (den[i] ? (100 * v) / den[i] : NaN));
  return { tsi: line, signal: ema(line, signalLen) };
}

/** %B das Bandas de Bollinger: 0 na banda de baixo, 1 na de cima. */
export function percentB(src: Series, len = 20, mult = 2): Series {
  const b = bollinger(src, len, mult);
  return src.map((v, i) => (b.upper[i] > b.lower[i] ? (v - b.lower[i]) / (b.upper[i] - b.lower[i]) : NaN));
}

/** Alligator (Bill Williams): três médias suavizadas do preço médio, deslocadas para o futuro. */
export function alligator(bars: readonly Bar[]) {
  const hl2 = source(bars, 'hl2');
  return { jaw: rma(hl2, 13), teeth: rma(hl2, 8), lips: rma(hl2, 5) };
}

/** Envelope de médias: média com bandas a uma percentagem fixa. */
export function envelope(src: Series, len = 20, pct = 2.5, type: MaType = 'sma') {
  const basis = ma(type, src, len);
  return { basis, upper: basis.map((v) => v * (1 + pct / 100)), lower: basis.map((v) => v * (1 - pct / 100)) };
}

/**
 * Squeeze Momentum (LazyBear): compressão quando as Bandas de Bollinger ficam dentro dos canais de Keltner;
 * o histograma é a regressão linear do desvio do preço à sua média.
 */
export function squeeze(bars: readonly Bar[], len = 20, bbMult = 2, kcMult = 1.5) {
  const close = source(bars, 'close');
  const bb = bollinger(close, len, bbMult);
  const mid = sma(close, len);
  const rangeMa = sma(tr(bars), len);
  const kcUp = mid.map((v, i) => v + rangeMa[i] * kcMult);
  const kcLow = mid.map((v, i) => v - rangeMa[i] * kcMult);
  const hi = highest(source(bars, 'high'), len);
  const lo = lowest(source(bars, 'low'), len);
  const delta = close.map((v, i) => v - ((hi[i] + lo[i]) / 2 + mid[i]) / 2);
  return {
    momentum: linreg(delta, len, 0),
    /** true = compressão ligada */
    on: bb.lower.map((v, i) => (Number.isFinite(v) && Number.isFinite(kcLow[i]) ? v > kcLow[i] && bb.upper[i] < kcUp[i] : false)),
  };
}
