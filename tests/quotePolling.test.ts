import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataFeed } from '@/core/feed/datafeed';
import type { Provider, Quote } from '@/core/feed/provider';
import type { SymbolInfo } from '@/core/types';

let visibility: 'visible' | 'hidden' = 'visible';
const listeners = new Set<() => void>();

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  (globalThis as unknown as { document: unknown }).document = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
});
afterEach(() => {
  vi.useRealTimers();
  listeners.clear();
  delete (globalThis as unknown as { document?: unknown }).document;
});

function setup(withOnce = true) {
  let n = 0;
  let liveSubs = 0;
  const provider = {
    id: 'demo',
    maxPerRequest: 100,
    nativeTfs: () => [],
    fetch: async () => [],
    ...(withOnce ? { quoteOnce: vi.fn(async (): Promise<Quote> => ({ price: 100 + ++n, time: n })) } : {}),
    subscribeQuote: () => {
      liveSubs++;
      return () => undefined;
    },
  } as unknown as Provider;
  const feed = new DataFeed({ demo: provider } as never);
  const sym = { id: 'DEMO:X', provider: 'demo', ticker: 'X' } as unknown as SymbolInfo;
  return { feed, sym, provider, liveSubs: () => liveSubs };
}

describe('lista de observação: atualização mais lenta (pedido único)', () => {
  it('pede uma cotação logo e depois de tempos a tempos, em vez de manter uma subscrição', async () => {
    const { feed, sym, provider, liveSubs } = setup();
    const got: number[] = [];
    const off = feed.subscribeQuote(sym, (q) => got.push(q.price), { everyMs: 5000 });
    await vi.advanceTimersByTimeAsync(10);
    expect(got).toEqual([101]);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(got).toEqual([101, 102, 103]);
    expect(liveSubs()).toBe(0); // não abriu a subscrição contínua
    off();
    await vi.advanceTimersByTimeAsync(20000);
    expect(got).toHaveLength(3); // cancelado
    expect(provider.quoteOnce).toHaveBeenCalledTimes(3);
  });

  it('em segundo plano não pede nada e, ao voltar, atualiza logo', async () => {
    const { feed, sym } = setup();
    const got: number[] = [];
    feed.subscribeQuote(sym, (q) => got.push(q.price), { everyMs: 5000 });
    await vi.advanceTimersByTimeAsync(10);
    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(30000);
    expect(got).toEqual([101]); // nada durante o segundo plano
    visibility = 'visible';
    listeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(10);
    expect(got).toEqual([101, 102]); // voltou: atualizou logo
  });

  it('sem everyMs (tempo real) ou sem pedido único no fornecedor, usa a subscrição contínua', () => {
    const a = setup();
    a.feed.subscribeQuote(a.sym, () => undefined);
    expect(a.liveSubs()).toBe(1);
    const b = setup(false);
    b.feed.subscribeQuote(b.sym, () => undefined, { everyMs: 5000 });
    expect(b.liveSubs()).toBe(1);
  });

  it('uma falha de rede não pára as voltas seguintes', async () => {
    const { feed, sym, provider } = setup();
    (provider.quoteOnce as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ price: 7, time: 1 });
    const got: number[] = [];
    feed.subscribeQuote(sym, (q) => got.push(q.price), { everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(2100);
    expect(got).toEqual([7, 7]);
  });
});
