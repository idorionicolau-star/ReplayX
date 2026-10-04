import { describe, expect, it } from 'vitest';
import { DataFeed } from '@/core/feed/datafeed';
import type { Provider } from '@/core/feed/provider';
import { demoProvider } from '@/core/feed/demo';
import { resolveSymbol } from '@/core/symbols';
import type { Bar, SymbolInfo } from '@/core/types';
import { alignTime, parseTf, tfSeconds, type Timeframe } from '@/core/timeframes';
import { aggregate } from '@/core/bars';

const T = (iso: string) => Date.parse(iso) / 1000;

/** Fornecedor de teste com 1m nativo e contagem de pedidos. */
function fakeProvider(natives: string[] = ['1m', '5m', '1h', '1D']): Provider & { calls: number } {
  const p = {
    id: 'demo' as const,
    maxPerRequest: 1000,
    calls: 0,
    nativeTfs: () => natives.map(parseTf),
    async fetch(_s: SymbolInfo, tf: Timeframe, args: { from?: number; to: number; limit: number }): Promise<Bar[]> {
      p.calls++;
      const d = tfSeconds(tf);
      const start = args.from ?? alignTime(args.to - args.limit * d, tf);
      const out: Bar[] = [];
      for (let t = alignTime(start, tf); t < args.to; t += d) {
        if (t < start) continue;
        const i = t / 60;
        out.push({ time: t, open: i, high: i + d / 60, low: i - 1, close: i + d / 60 - 1, volume: d / 60 });
      }
      return args.from === undefined ? out.slice(-args.limit) : out;
    },
  };
  return p;
}

const sym = resolveSymbol('DEMO:SIMFX');

describe('DataFeed', () => {
  it('escolhe o timeframe nativo certo', () => {
    const feed = new DataFeed({ demo: fakeProvider(), binance: fakeProvider(), deriv: fakeProvider(), yahoo: fakeProvider() });
    expect(feed.nativeTf(sym, '15m')).toEqual(parseTf('5m'));
    expect(feed.nativeTf(sym, '4h')).toEqual(parseTf('1h'));
    expect(feed.nativeTf(sym, '1W')).toEqual(parseTf('1D'));
    expect(feed.nativeTf(sym, '1h')).toEqual(parseTf('1h'));
  });

  it('carrega histórico agregado e reaproveita a cache', async () => {
    const p = fakeProvider();
    const feed = new DataFeed({ demo: p, binance: p, deriv: p, yahoo: p });
    const to = T('2024-03-13T12:00:00Z');
    const r = await feed.history(sym, '15m', to, 100);
    expect(r.bars.length).toBe(100);
    expect(r.bars[r.bars.length - 1].time).toBe(to - 900);
    const calls = p.calls;
    const r2 = await feed.history(sym, '15m', to, 50);
    expect(r2.bars.length).toBe(50);
    expect(p.calls).toBe(calls);
    // mais para trás: só pede o que falta
    const r3 = await feed.history(sym, '15m', r.bars[0].time, 100);
    expect(r3.bars.length).toBe(100);
    expect(r3.bars[r3.bars.length - 1].time).toBe(r.bars[0].time - 900);
  });

  it('constrói barras parciais para trocar de timeframe a meio do replay', async () => {
    const p = fakeProvider();
    const feed = new DataFeed({ demo: p, binance: p, deriv: p, yahoo: p });
    const open = T('2024-03-13T08:00:00Z');
    const cursor = T('2024-03-13T10:37:00Z');
    expect(feed.peekPartial(sym, '4h', open, cursor)).toBeNull();
    await feed.preparePartial(sym, '4h', open, cursor);
    const partial = feed.peekPartial(sym, '4h', open, cursor)!;
    expect(partial).not.toBeNull();
    // deve ser igual a agregar os minutos de 08:00 a 10:36
    const minutes = await feed.range(sym, '1m', open, cursor);
    const ref = aggregate(minutes, parseTf('4h'))[0];
    expect(partial.time).toBe(open);
    expect(partial.open).toBe(ref.open);
    expect(partial.high).toBe(ref.high);
    expect(partial.low).toBe(ref.low);
    expect(partial.close).toBe(ref.close);
    expect(partial.volume).toBe(ref.volume);
  });

  it('barra parcial semanal combina dias, horas e minutos', async () => {
    const p = fakeProvider();
    const feed = new DataFeed({ demo: p, binance: p, deriv: p, yahoo: p });
    const open = T('2024-03-11T00:00:00Z');
    const cursor = T('2024-03-13T10:37:00Z');
    await feed.preparePartial(sym, '1W', open, cursor);
    const partial = feed.peekPartial(sym, '1W', open, cursor)!;
    const minutes = await feed.range(sym, '1m', open, cursor);
    expect(partial.close).toBe(minutes[minutes.length - 1].close);
    expect(partial.open).toBe(minutes[0].open);
    expect(partial.volume).toBe(minutes.reduce((a, b) => a + (b.volume ?? 0), 0));
  });

  it('peekRange só responde com dados em cache', async () => {
    const p = fakeProvider();
    const feed = new DataFeed({ demo: p, binance: p, deriv: p, yahoo: p });
    const from = T('2024-03-13T00:00:00Z');
    const to = T('2024-03-14T00:00:00Z');
    expect(feed.peekRange(sym, '1h', from, to)).toBeNull();
    await feed.range(sym, '1h', from, to);
    expect(feed.peekRange(sym, '1h', from, to)?.length).toBe(24);
    expect(feed.peekFinest(sym, from, from + 3600)?.length).toBe(1);
  });
});

describe('fornecedor simulado', () => {
  it('é determinístico e coerente', async () => {
    const to = T('2024-03-13T12:00:00Z');
    const a = await demoProvider.fetch(sym, parseTf('1h'), { to, limit: 50 });
    const b = await demoProvider.fetch(sym, parseTf('1h'), { to, limit: 50 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(50);
    expect(a[a.length - 1].time).toBe(to - 3600);
    for (const bar of a) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
      expect(bar.open).toBeGreaterThan(0.5);
      expect(bar.open).toBeLessThan(3);
    }
    // continuidade: fecho = abertura seguinte
    expect(Math.abs(a[1].open - a[0].close)).toBeLessThan(1e-4);
  });

  it('as velas de 1h são exatamente a junção das de 15m e de 1m', async () => {
    const from = T('2024-03-13T00:00:00Z');
    const to = T('2024-03-13T06:00:00Z');
    const h = await demoProvider.fetch(sym, parseTf('1h'), { from, to, limit: 100 });
    const q = await demoProvider.fetch(sym, parseTf('15m'), { from, to, limit: 100 });
    const m = await demoProvider.fetch(sym, parseTf('1m'), { from, to, limit: 1000 });
    expect(h).toHaveLength(6);
    expect(aggregate(q, parseTf('1h'))).toEqual(h);
    expect(aggregate(m, parseTf('1h'))).toEqual(h);
    const d = await demoProvider.fetch(sym, parseTf('1D'), { from: T('2024-03-11T00:00:00Z'), to: T('2024-03-14T00:00:00Z'), limit: 10 });
    const h3 = await demoProvider.fetch(sym, parseTf('1h'), { from: T('2024-03-11T00:00:00Z'), to: T('2024-03-14T00:00:00Z'), limit: 100 });
    expect(aggregate(h3, parseTf('1D'))).toEqual(d);
  });
});
