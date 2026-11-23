'use client';
import { create } from 'zustand';

/** De onde vêm os dados: velas pedidas (histórico), ticks/velas em tempo real, e o resto (notícias, calendário…). */
export type MeterKind = 'history' | 'live' | 'other';
export interface MeterCounters {
  history: number;
  live: number;
  other: number;
}

const KEY = 'rx-data-meter';
const zero = (): MeterCounters => ({ history: 0, live: 0, other: 0 });
export const meterTotal = (c: MeterCounters) => c.history + c.live + c.other;

interface Stored {
  day: string;
  month: string;
  today: MeterCounters;
  monthly: MeterCounters;
}

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function load(): Stored {
  const now = dayKey();
  const fresh: Stored = { day: now, month: now.slice(0, 7), today: zero(), monthly: zero() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const s = JSON.parse(raw) as Stored;
    if (!s || typeof s.day !== 'string') return fresh;
    const monthly = s.month === now.slice(0, 7) ? { ...zero(), ...s.monthly } : zero();
    const today = s.day === now ? { ...zero(), ...s.today } : zero();
    return { day: now, month: now.slice(0, 7), today, monthly };
  } catch {
    return fresh;
  }
}

interface MeterState {
  session: MeterCounters;
  today: MeterCounters;
  monthly: MeterCounters;
  /** Muda quando há dados novos (para a interface atualizar). */
  tick: number;
  reset: () => void;
}

const initial = typeof window === 'undefined' ? { day: '', month: '', today: zero(), monthly: zero() } : load();

export const useDataMeter = create<MeterState>(() => ({
  session: zero(),
  today: initial.today,
  monthly: initial.monthly,
  tick: 0,
  reset: () => undefined,
}));

// os contadores somam-se à parte (milhares de mensagens por minuto) e só passam para o estado a cada segundo
const pending = zero();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  saveTimer = null;
  try {
    const s = useDataMeter.getState();
    localStorage.setItem(KEY, JSON.stringify({ day: dayKey(), month: dayKey().slice(0, 7), today: s.today, monthly: s.monthly } satisfies Stored));
  } catch {
    /* sem armazenamento */
  }
}

function flush() {
  flushTimer = null;
  const add = { ...pending };
  pending.history = pending.live = pending.other = 0;
  useDataMeter.setState((s) => {
    // passou a meia-noite (ou o mês): os contadores do dia/mês recomeçam
    const rolled = typeof window !== 'undefined' ? load() : null;
    const base = rolled && rolled.day === dayKey() ? s : { ...s, today: zero() };
    const sum = (a: MeterCounters): MeterCounters => ({ history: a.history + add.history, live: a.live + add.live, other: a.other + add.other });
    return { ...s, session: sum(s.session), today: sum(base.today), monthly: sum(base.monthly), tick: s.tick + 1 };
  });
  if (!saveTimer) saveTimer = setTimeout(save, 5000);
}

/** Soma `n` bytes recebidos. */
export function addBytes(kind: MeterKind, n: number) {
  if (!n || typeof window === 'undefined') return;
  pending[kind] += n;
  if (!flushTimer) flushTimer = setTimeout(flush, 1000);
}

/** Lê o corpo de uma resposta JSON e conta os bytes (o tamanho do texto; a compressão do transporte não conta). */
export async function meteredJson<T>(res: Response, kind: MeterKind): Promise<T> {
  const text = await res.text();
  addBytes(kind, text.length);
  return JSON.parse(text) as T;
}

export function resetDataMeter(scope: 'session' | 'all') {
  const z = zero();
  pending.history = pending.live = pending.other = 0;
  useDataMeter.setState((s) => (scope === 'all' ? { ...s, session: z, today: z, monthly: z, tick: s.tick + 1 } : { ...s, session: z, tick: s.tick + 1 }));
  if (scope === 'all') save();
}

/** "12,3 MB", "480 KB"… */
export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}
