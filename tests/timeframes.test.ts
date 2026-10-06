import { describe, expect, it } from 'vitest';
import { SECOND_TFS, tfLabel, alignTime, divides, nextBarTime, normalizeTf, parseTf, prevBarTime, tfSeconds, tfShort } from '@/core/timeframes';
import { aggregate, combine, heikinAshi, mergeBars, sanitize } from '@/core/bars';

const T = (iso: string) => Date.parse(iso) / 1000;

describe('timeframes', () => {
  it('interpreta e normaliza', () => {
    expect(parseTf('15m')).toEqual({ n: 15, unit: 'm' });
    expect(parseTf('D')).toEqual({ n: 1, unit: 'D' });
    expect(normalizeTf('60m')).toBe('1h');
    expect(normalizeTf('240m')).toBe('4h');
    expect(normalizeTf('24h')).toBe('1D');
    expect(tfShort('1D')).toBe('D');
    expect(tfShort('4h')).toBe('4h');
    expect(() => parseTf('abc')).toThrow();
  });

  it('alinha minutos, horas e dias em UTC', () => {
    const t = T('2024-03-13T10:37:21Z');
    expect(alignTime(t, '1m')).toBe(T('2024-03-13T10:37:00Z'));
    expect(alignTime(t, '15m')).toBe(T('2024-03-13T10:30:00Z'));
    expect(alignTime(t, '4h')).toBe(T('2024-03-13T08:00:00Z'));
    expect(alignTime(t, '1D')).toBe(T('2024-03-13T00:00:00Z'));
  });

  it('semanas começam à segunda e meses no dia 1', () => {
    const wed = T('2024-03-13T10:37:21Z');
    expect(alignTime(wed, '1W')).toBe(T('2024-03-11T00:00:00Z'));
    expect(nextBarTime(T('2024-03-11T00:00:00Z'), '1W')).toBe(T('2024-03-18T00:00:00Z'));
    expect(alignTime(wed, '1M')).toBe(T('2024-03-01T00:00:00Z'));
    expect(nextBarTime(T('2024-12-01T00:00:00Z'), '1M')).toBe(T('2025-01-01T00:00:00Z'));
    expect(prevBarTime(T('2024-03-01T00:00:00Z'), '1M')).toBe(T('2024-02-01T00:00:00Z'));
    expect(alignTime(wed, '3M')).toBe(T('2024-01-01T00:00:00Z'));
  });

  it('sabe que timeframes dividem outros', () => {
    expect(divides(parseTf('1m'), parseTf('5m'))).toBe(true);
    expect(divides(parseTf('2m'), parseTf('5m'))).toBe(false);
    expect(divides(parseTf('8h'), parseTf('1D'))).toBe(true);
    expect(divides(parseTf('1D'), parseTf('1W'))).toBe(true);
    expect(divides(parseTf('1W'), parseTf('1M'))).toBe(false);
    expect(divides(parseTf('1D'), parseTf('1M'))).toBe(true);
    expect(divides(parseTf('7m'), parseTf('1h'))).toBe(false);
    expect(tfSeconds('1W')).toBe(604800);
  });
});

describe('segundos', () => {
  it('interpreta, normaliza e rotula', () => {
    expect(parseTf('5s')).toEqual({ n: 5, unit: 's' });
    expect(parseTf('s')).toEqual({ n: 1, unit: 's' });
    expect(normalizeTf('60s')).toBe('1m');
    expect(normalizeTf('30s')).toBe('30s');
    expect(tfShort('15s')).toBe('15s');
    expect(tfSeconds('30s')).toBe(30);
    expect(tfLabel('1s')).toBe('1 segundo');
    expect(tfLabel('15s')).toBe('15 segundos');
    // "5S" e "5M" continuam a ser coisas diferentes: maiúscula é mês
    expect(parseTf('5M')).toEqual({ n: 5, unit: 'M' });
  });

  it('alinha ao segundo e encaixa em minutos', () => {
    const t = T('2024-03-13T10:37:21Z');
    expect(alignTime(t, '1s')).toBe(t);
    expect(alignTime(t, '5s')).toBe(T('2024-03-13T10:37:20Z'));
    expect(alignTime(t, '15s')).toBe(T('2024-03-13T10:37:15Z'));
    expect(alignTime(t, '30s')).toBe(T('2024-03-13T10:37:00Z'));
    expect(nextBarTime(T('2024-03-13T10:37:45Z'), '15s')).toBe(T('2024-03-13T10:38:00Z'));
    expect(prevBarTime(T('2024-03-13T10:37:00Z'), '30s')).toBe(T('2024-03-13T10:36:30Z'));
    expect(divides(parseTf('1s'), parseTf('1m'))).toBe(true);
    expect(divides(parseTf('30s'), parseTf('1m'))).toBe(true);
    expect(divides(parseTf('1s'), parseTf('30s'))).toBe(true);
    expect(divides(parseTf('1m'), parseTf('30s'))).toBe(false);
    expect(divides(parseTf('15s'), parseTf('1D'))).toBe(true);
    expect(divides(parseTf('5s'), parseTf('1W'))).toBe(true);
    expect(SECOND_TFS.every((t) => parseTf(t).unit === 's')).toBe(true);
  });

  it('agrega segundos em velas maiores', () => {
    const t0 = T('2024-03-13T10:37:00Z');
    const secs = Array.from({ length: 30 }, (_, i) => ({ time: t0 + i, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 2 }));
    const out = aggregate(secs, parseTf('15s'));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ time: t0, open: 100, high: 115, low: 99, close: 114.5, volume: 30 });
    expect(out[1].time).toBe(t0 + 15);
  });
});

describe('barras', () => {
  const mk = (time: number, o: number, h: number, l: number, c: number, v = 1) => ({ time, open: o, high: h, low: l, close: c, volume: v });

  it('agrega para timeframes maiores', () => {
    const base = T('2024-03-13T10:00:00Z');
    const bars = [
      mk(base, 1, 2, 0.5, 1.5),
      mk(base + 60, 1.5, 3, 1, 2),
      mk(base + 120, 2, 2.5, 0.2, 0.3),
      mk(base + 300, 0.3, 1, 0.1, 0.9),
    ];
    const agg = aggregate(bars, parseTf('5m'));
    expect(agg).toHaveLength(2);
    expect(agg[0]).toEqual(mk(base, 1, 3, 0.2, 0.3, 3));
    expect(agg[1]).toEqual(mk(base + 300, 0.3, 1, 0.1, 0.9, 1));
    expect(combine(bars.slice(0, 2), base)).toEqual(mk(base, 1, 3, 0.5, 2, 2));
  });

  it('junta blocos e limpa dados', () => {
    const a = [mk(1, 1, 1, 1, 1), mk(2, 2, 2, 2, 2)];
    const b = [mk(2, 9, 9, 9, 9), mk(3, 3, 3, 3, 3)];
    expect(mergeBars(a, b).map((x) => x.open)).toEqual([1, 9, 3]);
    expect(sanitize([mk(3, 1, 0.5, 2, 1), mk(1, 1, 1, 1, 1), { ...mk(2, 1, 1, 1, 1), close: NaN }]).map((x) => x.time)).toEqual([1, 3]);
    expect(sanitize([mk(3, 1, 0.5, 2, 1)])[0]).toMatchObject({ high: 1, low: 1 });
  });

  it('calcula Heikin Ashi', () => {
    const ha = heikinAshi([mk(1, 10, 12, 9, 11), mk(2, 11, 13, 10, 12)]);
    expect(ha[0].close).toBeCloseTo(10.5);
    expect(ha[0].open).toBeCloseTo(10.5);
    expect(ha[1].open).toBeCloseTo(10.5);
  });
});
