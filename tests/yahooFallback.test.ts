import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bar, SymbolInfo } from '@/core/types';
import { parseTf } from '@/core/timeframes';

const yahooFetch = vi.fn();
vi.mock('@/core/feed/yahoo', () => ({ yahooProvider: { fetch: (...a: unknown[]) => yahooFetch(...a) } }));

import { extendWithYahoo, fallbackEligible, yahooTickerFor } from '@/core/feed/yahooFallback';

const sym = (ticker: string, provider: SymbolInfo['provider'] = 'deriv'): SymbolInfo => ({
  id: `${provider.toUpperCase()}:${ticker}`,
  provider,
  ticker,
  name: ticker,
  description: ticker,
  assetClass: 'forex',
  precision: 5,
});

const DAY = 86400;
const T0 = Date.UTC(2024, 0, 1) / 1000;
const bar = (time: number, p = 100): Bar => ({ time, open: p, high: p + 1, low: p - 1, close: p + 0.5 });
const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => bar(from + i * DAY, 100 + i));

beforeEach(() => yahooFetch.mockReset());

describe('passado extra do Yahoo (H4 e diário)', () => {
  it('traduz os símbolos da Deriv para o Yahoo, só os que têm equivalente fiável', () => {
    expect(yahooTickerFor(sym('frxEURUSD'))).toBe('EURUSD=X');
    expect(yahooTickerFor(sym('frxGBPJPY'))).toBe('GBPJPY=X');
    expect(yahooTickerFor(sym('frxXAUUSD'))).toBe('XAUUSD=X');
    expect(yahooTickerFor(sym('frxXAGUSD'))).toBe('XAGUSD=X');
    expect(yahooTickerFor(sym('frxXPTUSD'))).toBeNull(); // sem equivalente fiável
    expect(yahooTickerFor(sym('R_75'))).toBeNull(); // sintético
    expect(yahooTickerFor(sym('frxEURUSD', 'yahoo'))).toBeNull(); // só símbolos da Deriv
  });

  it('só em H4 e diário', () => {
    expect(fallbackEligible(parseTf('4h'))).toBe(true);
    expect(fallbackEligible(parseTf('1D'))).toBe(true);
    for (const t of ['1m', '15m', '1h', '2h', '8h', '1W']) expect(fallbackEligible(parseTf(t))).toBe(false);
  });

  it('diário: se a Deriv acabou, junta as velas mais antigas do Yahoo antes das dela', async () => {
    const deriv = days(T0, 30);
    const older = days(T0 - 70 * DAY, 70);
    yahooFetch.mockResolvedValue(older);
    const out = await extendWithYahoo(sym('frxEURUSD'), parseTf('1D'), { to: T0 + 100 * DAY, limit: 100 }, deriv);
    expect(out).toHaveLength(100);
    expect(out[0].time).toBe(T0 - 70 * DAY);
    expect(out[69].time).toBe(T0 - DAY);
    expect(out[70].time).toBe(T0);
    expect(out.every((b, i) => i === 0 || b.time > out[i - 1].time)).toBe(true);
    // pediu ao Yahoo só o que faltava, antes da primeira vela da Deriv, com o código do Yahoo
    const [ys, tf, args] = yahooFetch.mock.calls[0];
    expect((ys as SymbolInfo).ticker).toBe('EURUSD=X');
    expect((tf as { unit: string }).unit).toBe('D');
    expect(args).toEqual({ to: T0, limit: 70 });
  });

  it('se a Deriv deu as velas todas, não pergunta ao Yahoo', async () => {
    const deriv = days(T0, 100);
    const out = await extendWithYahoo(sym('frxEURUSD'), parseTf('1D'), { to: T0 + 200 * DAY, limit: 100 }, deriv);
    expect(out).toBe(deriv);
    expect(yahooFetch).not.toHaveBeenCalled();
  });

  it('não mexe em outros intervalos, em intervalos pedidos por datas, nem em símbolos sem equivalente', async () => {
    const deriv = days(T0, 10);
    const a = await extendWithYahoo(sym('frxEURUSD'), parseTf('1h'), { to: T0 + 100 * DAY, limit: 100 }, deriv);
    const b = await extendWithYahoo(sym('frxEURUSD'), parseTf('1D'), { from: T0 - 50 * DAY, to: T0 + 100 * DAY, limit: 100 }, deriv);
    const c = await extendWithYahoo(sym('R_75'), parseTf('1D'), { to: T0 + 100 * DAY, limit: 100 }, deriv);
    expect(a).toBe(deriv);
    expect(b).toBe(deriv);
    expect(c).toBe(deriv);
    expect(yahooFetch).not.toHaveBeenCalled();
  });

  it('se o Yahoo falha ou vem vazio, fica só o que a Deriv deu (nunca estoira)', async () => {
    const deriv = days(T0, 10);
    yahooFetch.mockRejectedValueOnce(new Error('HTTP 429'));
    expect(await extendWithYahoo(sym('frxEURUSD'), parseTf('1D'), { to: T0 + 100 * DAY, limit: 100 }, deriv)).toBe(deriv);
    yahooFetch.mockResolvedValueOnce([]);
    expect(await extendWithYahoo(sym('frxEURUSD'), parseTf('1D'), { to: T0 + 100 * DAY, limit: 100 }, deriv)).toBe(deriv);
  });

  it('sem nenhuma vela da Deriv, o Yahoo dá o passado até ao fim pedido', async () => {
    yahooFetch.mockResolvedValue(days(T0, 20));
    const out = await extendWithYahoo(sym('frxXAUUSD'), parseTf('1D'), { to: T0 + 20 * DAY, limit: 50 }, []);
    expect(out).toHaveLength(20);
    expect(yahooFetch.mock.calls[0][2]).toEqual({ to: T0 + 20 * DAY, limit: 50 });
  });

  it('H4: monta as velas de 4 horas a partir das de 1 hora, alinhadas, completas e antes da Deriv', async () => {
    const H = 3600;
    const first4h = T0 + 4 * H; // a Deriv começa aqui (alinhado a 4h)
    // 10 horas seguidas a terminar antes de first4h: 22:00 do dia anterior até 07:00... alinhado a 4h
    const hours = Array.from({ length: 24 }, (_, i) => bar(first4h - 24 * H + i * H, 100 + i));
    yahooFetch.mockResolvedValue(hours);
    const deriv = [bar(first4h), bar(first4h + 4 * H)];
    const out = await extendWithYahoo(sym('frxEURUSD'), parseTf('4h'), { to: first4h + 100 * H, limit: 8 }, deriv);
    const extra = out.slice(0, out.length - deriv.length);
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.every((b) => b.time % (4 * H) === 0)).toBe(true);
    expect(extra.every((b) => b.time + 4 * H <= first4h)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(8);
    const [, tf] = yahooFetch.mock.calls[0];
    expect((tf as { unit: string }).unit).toBe('h');
  });
});
