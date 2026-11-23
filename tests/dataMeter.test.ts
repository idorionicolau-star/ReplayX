import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

async function fresh() {
  vi.resetModules();
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return import('@/lib/dataMeter');
}

describe('contador de dados', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('soma por origem e passa para o estado ao fim de 1 s', async () => {
    const m = await fresh();
    m.addBytes('history', 1000);
    m.addBytes('live', 300);
    m.addBytes('live', 200);
    m.addBytes('other', 50);
    expect(m.useDataMeter.getState().session.live).toBe(0); // ainda não passou 1 s
    vi.advanceTimersByTime(1100);
    const s = m.useDataMeter.getState();
    expect(s.session).toEqual({ history: 1000, live: 500, other: 50 });
    expect(s.today).toEqual({ history: 1000, live: 500, other: 50 });
    expect(s.monthly.history).toBe(1000);
    expect(m.meterTotal(s.session)).toBe(1550);
  });

  it('guarda o dia e o mês no armazenamento e a sessão recomeça a zero', async () => {
    const m = await fresh();
    m.addBytes('history', 2048);
    vi.advanceTimersByTime(7000);
    const saved = JSON.parse(store.get('rx-data-meter')!);
    expect(saved.today.history).toBe(2048);
    const m2 = await fresh(); // "recarregar a página"
    const s = m2.useDataMeter.getState();
    expect(s.today.history).toBe(2048);
    expect(s.session.history).toBe(0);
  });

  it('outro dia: o contador do dia recomeça, o do mês continua no mesmo mês', async () => {
    const d = new Date();
    const yesterday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    const sameMonth = yesterday.getMonth() === d.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    const key = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    store.set('rx-data-meter', JSON.stringify({ day: key(yesterday), month: key(yesterday).slice(0, 7), today: { history: 5, live: 5, other: 5 }, monthly: { history: 100, live: 0, other: 0 } }));
    const m = await fresh();
    const s = m.useDataMeter.getState();
    expect(s.today).toEqual({ history: 0, live: 0, other: 0 });
    expect(s.monthly.history).toBe(sameMonth ? 100 : 0);
  });

  it('repor contadores limpa tudo', async () => {
    const m = await fresh();
    m.addBytes('live', 999);
    vi.advanceTimersByTime(1100);
    m.resetDataMeter('all');
    expect(m.meterTotal(m.useDataMeter.getState().session)).toBe(0);
    expect(m.meterTotal(m.useDataMeter.getState().today)).toBe(0);
  });

  it('lê uma resposta JSON e conta o tamanho do texto', async () => {
    const m = await fresh();
    const body = JSON.stringify({ a: 1, b: 'olá' });
    const out = await m.meteredJson<{ a: number }>(new Response(body), 'other');
    expect(out.a).toBe(1);
    vi.advanceTimersByTime(1100);
    expect(m.useDataMeter.getState().session.other).toBe(body.length);
  });

  it('formata bytes', async () => {
    const m = await fresh();
    expect(m.fmtBytes(500)).toBe('500 B');
    expect(m.fmtBytes(2048)).toBe('2 KB');
    expect(m.fmtBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(m.fmtBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(m.fmtBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});
