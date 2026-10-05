import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from '@/lib/uid';
import { migrateV1, type Alert } from '@/core/alerts';

export type { Alert } from '@/core/alerts';

export interface AlertLog {
  id: string;
  alertId: string;
  symbolId: string;
  price: number;
  time: number;
  message: string;
  replay: boolean;
}

/** Janela de alerta no ecrã (fica até ser fechada). */
export interface AlertPopup {
  id: string;
  alertId: string;
  title: string;
  body: string;
  time: number;
  replay: boolean;
}

interface AlertsState {
  alerts: Alert[];
  log: AlertLog[];
  popups: AlertPopup[];
  updatedAt: number;
  add: (a: Omit<Alert, 'id' | 'createdAt' | 'active'>) => string;
  update: (id: string, patch: Partial<Alert>) => void;
  remove: (id: string) => void;
  logTrigger: (entry: Omit<AlertLog, 'id'>) => void;
  clearLog: () => void;
  pushPopup: (p: Omit<AlertPopup, 'id'>) => void;
  closePopup: (id: string) => void;
  closeAllPopups: () => void;
}

/** Alertas antigos (só preço) passam ao modelo atual — também os que chegam da nuvem. */
function normalize(list: unknown[]): Alert[] {
  return list.map((a) => ((a as Alert).source ? (a as Alert) : migrateV1(a as Parameters<typeof migrateV1>[0])));
}

export const useAlerts = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      log: [],
      popups: [],
      updatedAt: 0,
      add: (a) => {
        const id = uid('a');
        set((s) => ({ alerts: [...s.alerts, { ...a, id, createdAt: Date.now(), active: true }], updatedAt: Date.now() }));
        return id;
      },
      update: (id, patch) => set((s) => ({ alerts: s.alerts.map((x) => (x.id === id ? { ...x, ...patch } : x)), updatedAt: Date.now() })),
      remove: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id), updatedAt: Date.now() })),
      logTrigger: (entry) => set((s) => ({ log: [{ ...entry, id: uid('l') }, ...s.log].slice(0, 200) })),
      clearLog: () => set({ log: [] }),
      pushPopup: (p) => set((s) => ({ popups: [...s.popups, { ...p, id: uid('p') }].slice(-6) })),
      closePopup: (id) => set((s) => ({ popups: s.popups.filter((x) => x.id !== id) })),
      closeAllPopups: () => set({ popups: [] }),
    }),
    {
      name: 'rx-alerts',
      version: 2,
      partialize: (s) => ({ alerts: s.alerts, log: s.log, updatedAt: s.updatedAt }) as unknown as AlertsState,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as { alerts?: unknown[] };
        return { ...p, alerts: normalize(p.alerts ?? []) } as unknown as AlertsState;
      },
    },
  ),
);

// dados vindos da nuvem de uma versão antiga
useAlerts.subscribe((s) => {
  if (s.alerts.some((a) => !a.source)) useAlerts.setState({ alerts: normalize(s.alerts) });
});
