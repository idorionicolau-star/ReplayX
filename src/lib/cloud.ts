'use client';
import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { StoreApi, UseBoundStore } from 'zustand';
import { db } from './firebase';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useTrading } from '@/store/trading';
import { useStrategies } from '@/store/strategies';
import { useAlerts } from '@/store/alerts';

/**
 * Sincronização na nuvem (Firestore): cada utilizador tem os seus documentos em
 * replayx_users/{uid}/state/{chave}. Tudo continua a funcionar localmente se a nuvem falhar.
 */

export type SyncStatus = { state: 'off' | 'syncing' | 'ok' | 'error'; message?: string; at?: number };
export const useSync = create<SyncStatus>(() => ({ state: 'off' }));

type AnyStore = UseBoundStore<StoreApi<Record<string, unknown>>>;

interface Entry {
  key: string;
  store: AnyStore;
  pick: (s: Record<string, unknown>) => Record<string, unknown>;
}

const strip = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));

const ENTRIES: Entry[] = [
  { key: 'settings', store: useSettings as unknown as AnyStore, pick: strip },
  { key: 'workspace', store: useWorkspace as unknown as AnyStore, pick: strip },
  { key: 'drawings', store: useDrawings as unknown as AnyStore, pick: (s) => ({ bySymbol: s.bySymbol, lastStyle: s.lastStyle, updatedAt: s.updatedAt }) },
  {
    key: 'trading',
    store: useTrading as unknown as AnyStore,
    pick: (s) => {
      const t = s as unknown as ReturnType<typeof useTrading.getState>;
      const noShots = <T extends { trades: { screenshot?: string }[] }>(a: T): T => ({ ...a, trades: a.trades.map((x) => ({ ...x, screenshot: undefined })) });
      return { live: noShots(t.live), sessions: t.sessions.map((x) => ({ ...x, account: noShots(x.account) })), updatedAt: t.updatedAt };
    },
  },
  {
    key: 'strategies',
    store: useStrategies as unknown as AnyStore,
    pick: (s) => ({ scripts: s.scripts, visuals: s.visuals, settings: s.settings, barsToTest: s.barsToTest, updatedAt: s.updatedAt }),
  },
  { key: 'alerts', store: useAlerts as unknown as AnyStore, pick: (s) => ({ alerts: s.alerts, updatedAt: s.updatedAt }) },
];

const MAX_BYTES = 900_000;
let currentUid: string | null = null;
let unsubs: (() => void)[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let denied = false;

function ref(uid: string, key: string) {
  return doc(db(), 'replayx_users', uid, 'state', key);
}

async function push(e: Entry) {
  if (!currentUid || denied) return;
  const data = e.pick(e.store.getState());
  const json = JSON.stringify(data);
  if (json.length > MAX_BYTES) {
    useSync.setState({ state: 'error', message: `"${e.key}" é grande demais para a nuvem (fica só neste dispositivo).` });
    return;
  }
  useSync.setState({ state: 'syncing' });
  try {
    await setDoc(ref(currentUid, e.key), { data: json, updatedAt: Number(data.updatedAt) || Date.now(), savedAt: Date.now() });
    useSync.setState({ state: 'ok', at: Date.now(), message: undefined });
  } catch (err) {
    handleError(err);
  }
}

function handleError(err: unknown) {
  const code = String((err as { code?: string })?.code ?? '');
  if (code === 'permission-denied') {
    denied = true;
    useSync.setState({ state: 'error', message: 'A nuvem recusou o acesso (regras do Firestore). Os dados ficam guardados neste dispositivo.' });
  } else useSync.setState({ state: 'error', message: 'Sem ligação à nuvem. Os dados ficam guardados neste dispositivo.' });
}

function schedule(e: Entry) {
  const t = timers.get(e.key);
  if (t) clearTimeout(t);
  timers.set(
    e.key,
    setTimeout(() => {
      timers.delete(e.key);
      void push(e);
    }, 2500),
  );
}

export async function startSync(uid: string) {
  if (currentUid === uid) return;
  stopSync();
  currentUid = uid;
  denied = false;
  useSync.setState({ state: 'syncing' });
  for (const e of ENTRIES) {
    try {
      const snap = await getDoc(ref(uid, e.key));
      if (currentUid !== uid) return;
      const local = e.store.getState();
      const localAt = Number(local.updatedAt) || 0;
      if (snap.exists()) {
        const remote = snap.data() as { data: string; updatedAt: number };
        if ((remote.updatedAt ?? 0) > localAt) {
          const parsed = JSON.parse(remote.data) as Record<string, unknown>;
          e.store.setState(parsed);
          continue;
        }
      }
      if (localAt > 0) await push(e);
    } catch (err) {
      handleError(err);
      if (denied) break;
    }
  }
  if (!denied && useSync.getState().state === 'syncing') useSync.setState({ state: 'ok', at: Date.now() });
  for (const e of ENTRIES) {
    let last = Number(e.store.getState().updatedAt) || 0;
    unsubs.push(
      e.store.subscribe((s) => {
        const at = Number(s.updatedAt) || 0;
        if (at !== last) {
          last = at;
          schedule(e);
        }
      }),
    );
  }
}

export function stopSync() {
  unsubs.forEach((u) => u());
  unsubs = [];
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  currentUid = null;
  useSync.setState({ state: 'off' });
}

/** Força o envio imediato (ex.: antes de sair). */
export async function flushSync() {
  const pending = Array.from(timers.keys());
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  await Promise.all(ENTRIES.filter((e) => pending.includes(e.key)).map(push));
}
