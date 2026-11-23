import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarStore } from '@/core/feed/store';
import { barDb, packBars, unpackBars, type BarDb, type CachedStore } from '@/core/feed/barCache';
import { parseTf } from '@/core/timeframes';
import type { Provider, FetchArgs } from '@/core/feed/provider';
import type { Bar, SymbolInfo } from '@/core/types';

const memory = new Map<string, CachedStore>();
const db: BarDb = {
  get: async (k) => memory.get(k),
  set: async (k, v) => void memory.set(k, v),
  clear: async () => memory.clear(),
  prune: async () => undefined,
};

const TF = parseTf('1m');
const MIN = 60;
const sym = { id: 'DERIV:R_100', ticker: 'R_100' } as unknown as SymbolInfo;

function fakeProvider(id = 'deriv') {
  const calls: FetchArgs[] = [];
  const bar = (t: number): Bar => ({ time: t, open: 100 + (t % 7), high: 110, low: 90, close: 105 });
  const provider = {
    id,
    maxPerRequest: 1000,
    nativeTfs: () => [TF],
    fetch: async (_s: SymbolInfo, _tf: unknown, a: FetchArgs): Promise<Bar[]> => {
      calls.push(a);
      const out: Bar[] = [];
      if (a.from !== undefined) for (let t = Math.ceil(a.from / MIN) * MIN; t < a.to; t += MIN) out.push(bar(t));
      else {
        const end = Math.floor((a.to - 1) / MIN) * MIN;
        for (let i = a.limit - 1; i >= 0; i--) out.push(bar(end - i * MIN));
      }
      return out;
    },
  } as unknown as Provider;
  return { provider, calls };
}

beforeEach(() => {
  memory.clear();
  barDb.current = db;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-23T12:00:30Z'));
});
afterEach(() => {
  vi.useRealTimers();
  barDb.current = null;
});

const now = () => Math.floor(Date.now() / 1000);

describe('cache das velas no dispositivo', () => {
  it('guarda as velas fechadas e a sessão seguinte só pede o que falta', async () => {
    const a = fakeProvider();
    const s1 = new BarStore(a.provider, sym, TF);
    await s1.ensureBefore(now() + MIN, 200);
    expect(a.calls).toHaveLength(1);
    expect(s1.bars.length).toBeGreaterThanOrEqual(199);
    await s1.persistNow();
    expect(memory.size).toBe(1);

    // passam 10 minutos e abre-se a app outra vez
    vi.setSystemTime(new Date('2026-11-23T12:10:30Z'));
    const b = fakeProvider();
    const s2 = new BarStore(b.provider, sym, TF);
    await s2.ensureBefore(now() + MIN, 200);
    // pediu só o troço novo (cerca de 10 velas), de `from` até agora, e as 2 últimas (a vela a formar-se) — não as 200 outra vez
    expect(b.calls).toHaveLength(2);
    expect(b.calls[0].from).toBeDefined();
    expect(b.calls[1].limit).toBe(2);
    const fetched = s2.bars.length - unpackBars(memory.values().next().value!.bars).length;
    expect(fetched).toBeGreaterThanOrEqual(9);
    expect(fetched).toBeLessThanOrEqual(13);
    expect(s2.bars.length).toBeGreaterThanOrEqual(209);
  });

  it('sem nada guardado, pede tudo como antes', async () => {
    const a = fakeProvider();
    const s = new BarStore(a.provider, sym, TF);
    await s.ensureBefore(now() + MIN, 150);
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].limit).toBe(150);
    expect(a.calls[0].from).toBeUndefined();
  });

  it('não guarda a vela a formar-se (só as fechadas)', async () => {
    const a = fakeProvider();
    const s = new BarStore(a.provider, sym, TF);
    await s.ensureBefore(now() + MIN, 50);
    s.upsert({ time: Math.floor(now() / MIN) * MIN, open: 1, high: 2, low: 0, close: 1.5 }); // a vela de agora
    await s.persistNow();
    const saved = memory.values().next().value!;
    const bars = unpackBars(saved.bars);
    expect(Math.max(...bars.map((b) => b.time))).toBeLessThan(Math.floor(now() / MIN) * MIN);
    expect(saved.ranges.every((r) => r[1] <= Math.floor(now() / MIN) * MIN)).toBe(true);
  });

  it('segundos e demonstração não se guardam', async () => {
    const a = fakeProvider();
    const secs = new BarStore(a.provider, sym, parseTf('5s'));
    await secs.ensureRange(now() - 600, now());
    await secs.persistNow();
    const demo = fakeProvider('demo');
    const d = new BarStore(demo.provider, sym, TF);
    await d.ensureBefore(now() + MIN, 50);
    await d.persistNow();
    expect(memory.size).toBe(0);
  });

  it('se o troço em falta for maior que o pedido, pede só as últimas velas (e mantém as antigas como estavam)', async () => {
    const a = fakeProvider();
    const s1 = new BarStore(a.provider, sym, TF);
    await s1.ensureBefore(now() + MIN, 100);
    await s1.persistNow();
    vi.setSystemTime(new Date('2026-11-23T20:00:30Z')); // 8 horas depois: 480 velas em falta > 100
    const b = fakeProvider();
    const s2 = new BarStore(b.provider, sym, TF);
    await s2.ensureBefore(now() + MIN, 100);
    expect(b.calls.every((c) => c.from === undefined)).toBe(true); // nenhum pedido "a partir de": só as últimas velas
    expect(b.calls[0].limit).toBe(100);
  });

  it('empacota e desempacota velas, com e sem volume', () => {
    const bars: Bar[] = [
      { time: 1, open: 1, high: 2, low: 0.5, close: 1.5 },
      { time: 2, open: 2, high: 3, low: 1, close: 2.5, volume: 10 },
    ];
    expect(unpackBars(packBars(bars))).toEqual(bars);
  });
});
