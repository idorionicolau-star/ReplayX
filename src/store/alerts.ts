import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/uid';

export type AlertCondition = 'crossUp' | 'crossDown' | 'cross';

export interface PriceAlert {
  id: string;
  symbolId: string;
  price: number;
  condition: AlertCondition;
  message: string;
  active: boolean;
  /** Dispara só uma vez. */
  once: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export interface AlertLog {
  id: string;
  alertId: string;
  symbolId: string;
  price: number;
  time: number;
  message: string;
  replay: boolean;
}

interface AlertsState {
  alerts: PriceAlert[];
  log: AlertLog[];
  updatedAt: number;
  add: (a: Omit<PriceAlert, 'id' | 'createdAt' | 'active'>) => void;
  update: (id: string, patch: Partial<PriceAlert>) => void;
  remove: (id: string) => void;
  logTrigger: (entry: Omit<AlertLog, 'id'>) => void;
  clearLog: () => void;
}

export const useAlerts = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      log: [],
      updatedAt: 0,
      add: (a) => set((s) => ({ alerts: [...s.alerts, { ...a, id: uid('a'), createdAt: Date.now(), active: true }], updatedAt: Date.now() })),
      update: (id, patch) => set((s) => ({ alerts: s.alerts.map((x) => (x.id === id ? { ...x, ...patch } : x)), updatedAt: Date.now() })),
      remove: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id), updatedAt: Date.now() })),
      logTrigger: (entry) => set((s) => ({ log: [{ ...entry, id: uid('l') }, ...s.log].slice(0, 200) })),
      clearLog: () => set({ log: [] }),
    }),
    { name: 'rx-alerts', version: 1 },
  ),
);

/** Verifica se o preço passou pelo nível entre `prev` e `price`. */
export function crossed(a: PriceAlert, prev: number, price: number): boolean {
  if (!a.active) return false;
  const up = prev < a.price && price >= a.price;
  const down = prev > a.price && price <= a.price;
  if (a.condition === 'crossUp') return up;
  if (a.condition === 'crossDown') return down;
  return up || down;
}
