import { describe, expect, it } from 'vitest';
import { demoProvider, demoLiveBar } from '@/core/feed/demo';
import { ticksToBars } from '@/core/feed/deriv';
import { DataFeed, PROVIDERS } from '@/core/feed/datafeed';
import { parseTf, alignTime } from '@/core/timeframes';
import { resolveSymbol } from '@/core/symbols';
import type { SymbolInfo } from '@/core/types';
import { aggregate } from '@/core/bars';

const sym = (id: string): SymbolInfo => resolveSymbol(id);
const SIMFX = () => sym('DEMO:SIMFX');
// um instante bem no passado: todos os minutos e segundos estão completos
const T0 = Date.UTC(2024, 2, 13, 10, 0, 0) / 1000;

describe('segundos na demonstração', () => {
  it('1s, 5s, 15s e 30s somam exatamente a vela de 1 minuto', async () => {
    const s = SIMFX();
    const minute = (await demoProvider.fetch(s, parseTf('1m'), { from: T0, to: T0 + 60 * 20, limit: 20 }))!;
    expect(minute).toHaveLength(20);
    for (const tf of ['1s', '5s', '15s', '30s']) {
      const secs = await demoProvider.fetch(s, parseTf(tf), { from: T0, to: T0 + 60 * 20, limit: 5000 });
      const agg = aggregate(secs, parseTf('1m'));
      expect(agg).toHaveLength(20);
      agg.forEach((b, i) => {
        expect(b.time).toBe(minute[i].time);
        expect(b.open).toBe(minute[i].open);
        expect(b.close).toBe(minute[i].close);
        expect(b.high).toBe(minute[i].high);
        expect(b.low).toBe(minute[i].low);
        expect(b.volume).toBe(minute[i].volume);
      });
    }
  });

  it('cada vela de segundos é coerente (máximo ≥ abertura/fecho ≥ mínimo) e as de 1s encadeiam', async () => {
    const secs = await demoProvider.fetch(SIMFX(), parseTf('1s'), { from: T0, to: T0 + 300, limit: 400 });
    expect(secs).toHaveLength(300);
    secs.forEach((b, i) => {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      expect(b.time).toBe(T0 + i);
      if (i > 0) expect(b.open).toBe(secs[i - 1].close);
    });
  });

  it('pedir por quantidade devolve as últimas barras alinhadas', async () => {
    const to = T0 + 3600;
    const bars = await demoProvider.fetch(SIMFX(), parseTf('15s'), { to, limit: 10 });
    expect(bars).toHaveLength(10);
    expect(bars[9].time).toBe(to - 15);
    expect(bars.every((b) => b.time % 15 === 0)).toBe(true);
  });

  it('a vela em curso tem o mesmo aspeto que a vela completa terá depois', async () => {
    const s = SIMFX();
    const now = T0 + 125; // 2 min e 5 s
    const live = demoLiveBar(s, parseTf('15s'), now)!;
    expect(live.time).toBe(alignTime(now, '15s'));
    const full = (await demoProvider.fetch(s, parseTf('15s'), { from: live.time, to: live.time + 15, limit: 1 }))[0];
    expect(live.open).toBe(full.open);
    // o instante 125 está a 5 s do início da vela: só os segundos até aí
    expect(live.high).toBeLessThanOrEqual(full.high);
    expect(live.low).toBeGreaterThanOrEqual(full.low);
  });
});

describe('segundos a partir de ticks (Deriv)', () => {
  it('agrupa ticks em velas de 5s sem inventar segundos vazios', () => {
    const times = [100, 102, 104, 105, 111, 119];
    const prices = ['10', '12', '9', '11', '8', '13'];
    const bars = ticksToBars(times, prices, parseTf('5s'), { from: undefined, to: 200, limit: 100 });
    expect(bars).toEqual([
      { time: 100, open: 10, high: 12, low: 9, close: 9 },
      { time: 105, open: 11, high: 11, low: 11, close: 11 },
      { time: 110, open: 8, high: 8, low: 8, close: 8 },
      { time: 115, open: 13, high: 13, low: 13, close: 13 },
    ]);
  });

  it('respeita from/to e a ordem', () => {
    const bars = ticksToBars([100, 101, 130, 131], [1, 2, 3, 4], parseTf('1s'), { from: 101, to: 131, limit: 10 });
    expect(bars.map((b) => b.time)).toEqual([101, 130]);
  });
});

describe('que fontes dão segundos', () => {
  const feed = new DataFeed(PROVIDERS);
  it('demonstração, Deriv e Binance dão segundos; Yahoo não', () => {
    expect(feed.supports(SIMFX(), '15s')).toBe(true);
    expect(feed.supports({ ...SIMFX(), provider: 'deriv' } as SymbolInfo, '30s')).toBe(true);
    expect(feed.supports({ ...SIMFX(), provider: 'binance' } as SymbolInfo, '5s')).toBe(true);
    expect(feed.supports({ ...SIMFX(), provider: 'yahoo' } as SymbolInfo, '5s')).toBe(false);
    expect(feed.supports({ ...SIMFX(), provider: 'yahoo' } as SymbolInfo, '5m')).toBe(true);
  });

  it('em segundos pede menos barras por carga', () => {
    const deriv = { ...SIMFX(), provider: 'deriv' } as SymbolInfo;
    expect(feed.historyCount(deriv, '1m', 1500)).toBe(1500);
    expect(feed.historyCount(deriv, '1s', 1500)).toBe(1500);
    expect(feed.historyCount(deriv, '30s', 1500)).toBe(200);
    expect(feed.historyCount(deriv, '5s', 1500)).toBe(1200);
  });
});

describe('trocar de símbolo com um intervalo de segundos', () => {
  it('volta a 1m se a nova fonte não tem segundos e mantém se tem', async () => {
    const { useWorkspace } = await import('@/store/workspace');
    const st = useWorkspace.getState();
    st.setSymbol('DEMO:SIMFX', 0);
    st.setTf('5s', 0);
    expect(useWorkspace.getState().charts[0].tf).toBe('5s');
    useWorkspace.getState().setSymbol('DERIV:R_100', 0);
    expect(useWorkspace.getState().charts[0].tf).toBe('5s'); // sintético: tem segundos
    useWorkspace.getState().setSymbol('YAHOO:^GSPC', 0);
    expect(useWorkspace.getState().charts[0].symbolId).toBe('YAHOO:^GSPC');
    expect(useWorkspace.getState().charts[0].tf).toBe('1m'); // Yahoo: sem segundos
  });
});
