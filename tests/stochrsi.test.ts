import { describe, expect, it } from 'vitest';
import * as ta from '@/core/indicators/ta';

/** Stoch RSI como no Pine do TradingView, escrito à parte e à letra:
 *  rsi = ta.rsi(src, rsiLen); k = ta.sma(ta.stoch(rsi, rsi, rsi, stochLen), smoothK); d = ta.sma(k, smoothD). */
function pineStochRsi(src: number[], rsiLen: number, stochLen: number, smoothK: number, smoothD: number) {
  const n = src.length;
  const NA = NaN;
  // ta.rsi: rma dos ganhos e das perdas, a 1.ª média é a média simples das primeiras `rsiLen` mudanças
  const rsi = new Array<number>(n).fill(NA);
  let up = NA;
  let down = NA;
  for (let i = 1; i < n; i++) {
    if (i === rsiLen) {
      let su = 0;
      let sd = 0;
      for (let j = 1; j <= rsiLen; j++) {
        su += Math.max(src[j] - src[j - 1], 0);
        sd += Math.max(src[j - 1] - src[j], 0);
      }
      up = su / rsiLen;
      down = sd / rsiLen;
    } else if (i > rsiLen) {
      up = (up * (rsiLen - 1) + Math.max(src[i] - src[i - 1], 0)) / rsiLen;
      down = (down * (rsiLen - 1) + Math.max(src[i - 1] - src[i], 0)) / rsiLen;
    }
    if (i >= rsiLen) rsi[i] = down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down);
  }
  const win = (a: number[], i: number, len: number): number[] | null => {
    if (i < len - 1) return null;
    const w = a.slice(i - len + 1, i + 1);
    return w.some((v) => !Number.isFinite(v)) ? null : w;
  };
  const stoch = rsi.map((v, i) => {
    const w = win(rsi, i, stochLen);
    if (!w) return NA;
    const hh = Math.max(...w);
    const ll = Math.min(...w);
    return hh === ll ? NA : (100 * (v - ll)) / (hh - ll);
  });
  const sma = (a: number[], len: number) =>
    a.map((_, i) => {
      const w = win(a, i, len);
      return w ? w.reduce((x, y) => x + y, 0) / len : NA;
    });
  const k = sma(stoch, smoothK);
  const d = sma(k, smoothD);
  return { k, d };
}

function series(n: number, seed = 5): number[] {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let p = 100;
  return Array.from({ length: n }, () => (p += (rnd() - 0.5) * 2));
}

describe('Stoch RSI igual ao do TradingView', () => {
  for (const [rsiLen, stochLen, k, d] of [
    [14, 14, 3, 3],
    [14, 14, 1, 3],
    [10, 5, 3, 3],
  ]) {
    it(`RSI ${rsiLen}, Stoch ${stochLen}, K ${k}, D ${d}: mesmos valores e começa na mesma vela`, () => {
      const src = series(400);
      const mine = ta.stochRsi(src, rsiLen, stochLen, k, d);
      const ref = pineStochRsi(src, rsiLen, stochLen, k, d);
      for (let i = 0; i < src.length; i++) {
        expect(Number.isFinite(mine.k[i])).toBe(Number.isFinite(ref.k[i]));
        expect(Number.isFinite(mine.d[i])).toBe(Number.isFinite(ref.d[i]));
        if (Number.isFinite(ref.k[i])) expect(mine.k[i]).toBeCloseTo(ref.k[i], 9);
        if (Number.isFinite(ref.d[i])) expect(mine.d[i]).toBeCloseTo(ref.d[i], 9);
      }
      // 1.ª vela com valor: rsiLen + stochLen - 1 + (k - 1)
      expect(ta.stochRsi(src, rsiLen, stochLen, k, d).k.findIndex(Number.isFinite)).toBe(rsiLen + stochLen - 1 + (k - 1));
    });
  }

  it('a janela com valores em falta não dá máximo nem mínimo (como no Pine)', () => {
    const s = [NaN, NaN, 3, 1, 2, 5];
    expect(ta.highest(s, 3).map((v) => (Number.isFinite(v) ? v : null))).toEqual([null, null, null, null, 3, 5]);
    expect(ta.lowest(s, 3).map((v) => (Number.isFinite(v) ? v : null))).toEqual([null, null, null, null, 1, 1]);
  });
});
