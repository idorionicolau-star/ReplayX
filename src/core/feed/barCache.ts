import type { Bar } from '../types';

/** O que fica guardado de um símbolo num timeframe: as velas fechadas e os intervalos que se sabe estarem completos. */
export interface CachedStore {
  /** Velas em sequência: tempo, abertura, máximo, mínimo, fecho, volume (NaN = sem volume). */
  bars: Float64Array;
  ranges: [number, number][];
  startTime: number | null;
  savedAt: number;
}

/** Onde guardar. Em produção é o IndexedDB; nos testes, uma memória. */
export interface BarDb {
  get(key: string): Promise<CachedStore | undefined>;
  set(key: string, v: CachedStore): Promise<void>;
  clear(): Promise<void>;
  /** Mantém só as `max` entradas mais recentes. */
  prune(max: number): Promise<void>;
}

export function packBars(bars: readonly Bar[]): Float64Array {
  const out = new Float64Array(bars.length * 6);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    out.set([b.time, b.open, b.high, b.low, b.close, b.volume ?? NaN], i * 6);
  }
  return out;
}

export function unpackBars(a: Float64Array): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i + 5 < a.length; i += 6) {
    const bar: Bar = { time: a[i], open: a[i + 1], high: a[i + 2], low: a[i + 3], close: a[i + 4] };
    if (Number.isFinite(a[i + 5])) bar.volume = a[i + 5];
    out.push(bar);
  }
  return out;
}

const DB_NAME = 'rx-bars';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('bars')) db.createObjectStore('bars');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const r = fn(t);
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** IndexedDB do navegador (null se não existir, por exemplo em janela privada antiga). */
export function idbBarDb(): BarDb | null {
  if (typeof indexedDB === 'undefined') return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= open().catch((e) => {
    dbp = null;
    throw e;
  }));
  return {
    async get(key) {
      const d = await db();
      return (await tx<CachedStore>(d, ['bars'], 'readonly', (t) => t.objectStore('bars').get(key))) ?? undefined;
    },
    async set(key, v) {
      const d = await db();
      await tx(d, ['bars', 'meta'], 'readwrite', (t) => {
        t.objectStore('bars').put(v, key);
        t.objectStore('meta').put({ savedAt: v.savedAt, n: v.bars.length / 6 }, key);
      });
    },
    async clear() {
      const d = await db();
      await tx(d, ['bars', 'meta'], 'readwrite', (t) => {
        t.objectStore('bars').clear();
        t.objectStore('meta').clear();
      });
    },
    async prune(max) {
      const d = await db();
      const keys = (await tx<IDBValidKey[]>(d, ['meta'], 'readonly', (t) => t.objectStore('meta').getAllKeys())) ?? [];
      if (keys.length <= max) return;
      const metas = await Promise.all(keys.map(async (k) => ({ k, m: await tx<{ savedAt: number }>(d, ['meta'], 'readonly', (t) => t.objectStore('meta').get(k)) })));
      metas.sort((a, b) => (b.m?.savedAt ?? 0) - (a.m?.savedAt ?? 0));
      const drop = metas.slice(max);
      await tx(d, ['bars', 'meta'], 'readwrite', (t) => {
        for (const x of drop) {
          t.objectStore('bars').delete(x.k);
          t.objectStore('meta').delete(x.k);
        }
      });
    },
  };
}

/** A base em uso (os testes trocam-na). */
export const barDb: { current: BarDb | null } = { current: null };
let tried = false;
export function currentBarDb(): BarDb | null {
  if (!barDb.current && !tried) {
    tried = true;
    barDb.current = idbBarDb();
  }
  return barDb.current;
}

/** Apaga as velas guardadas no dispositivo. */
export async function clearBarCache(): Promise<void> {
  try {
    await currentBarDb()?.clear();
  } catch {
    /* sem armazenamento */
  }
}

/** Quantas entradas se guardam e quantas velas no máximo por entrada. */
export const MAX_CACHE_KEYS = 40;
export const MAX_CACHE_BARS = 30000;
