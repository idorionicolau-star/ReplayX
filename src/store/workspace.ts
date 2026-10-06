import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartType } from '@/core/types';
import { DEFAULT_FAVORITE_TFS } from '@/core/timeframes';
import { DEFAULT_SYMBOL, DEFAULT_WATCHLIST, resolveSymbol } from '@/core/symbols';
import { dataFeed } from '@/core/feed/datafeed';
import { newInstance, type IndicatorInstance } from '@/core/indicators/registry';
import { uid } from '@/lib/uid';

export type LayoutId = '1' | '2h' | '2v' | '3' | '4';

export const LAYOUT_COUNT: Record<LayoutId, number> = { '1': 1, '2h': 2, '2v': 2, '3': 3, '4': 4 };

export interface ChartConfig {
  id: string;
  symbolId: string;
  tf: string;
  chartType: ChartType;
  indicators: IndicatorInstance[];
}

export type RightTab = 'watchlist' | 'trade' | 'news' | 'calendar' | 'objects' | 'alerts';
export type BottomTab = 'tester' | 'script' | 'visual' | 'optimizer' | 'journal';

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

export interface WorkspaceState {
  layout: LayoutId;
  charts: ChartConfig[];
  active: number;
  favoriteTfs: string[];
  sync: { symbol: boolean; crosshair: boolean; interval: boolean };
  rightTab: RightTab | null;
  bottomTab: BottomTab | null;
  bottomHeight: number;
  rightWidth: number;
  watchlists: Watchlist[];
  activeWatchlist: string;
  recent: string[];
  updatedAt: number;

  setLayout: (l: LayoutId) => void;
  setActive: (i: number) => void;
  updateChart: (i: number, patch: Partial<ChartConfig>) => void;
  setSymbol: (symbolId: string, chart?: number) => void;
  setTf: (tf: string, chart?: number) => void;
  addIndicator: (type: string, chart?: number) => void;
  updateIndicator: (uid: string, patch: Partial<IndicatorInstance>, chart?: number) => void;
  removeIndicator: (uid: string, chart?: number) => void;
  toggleFavoriteTf: (tf: string) => void;
  setRightTab: (t: RightTab | null) => void;
  setBottomTab: (t: BottomTab | null) => void;
  setBottomHeight: (h: number) => void;
  setRightWidth: (w: number) => void;
  setSync: (patch: Partial<WorkspaceState['sync']>) => void;
  addToWatchlist: (symbolId: string, listId?: string) => void;
  removeFromWatchlist: (symbolId: string, listId?: string) => void;
  moveInWatchlist: (from: number, to: number, listId?: string) => void;
  addWatchlist: (name: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  setActiveWatchlist: (id: string) => void;
}

function newChart(symbolId = DEFAULT_SYMBOL, tf = '15m'): ChartConfig {
  return { id: uid('c'), symbolId, tf, chartType: 'candles', indicators: [] };
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => {
      const touch = { updatedAt: Date.now() };
      const idx = (chart?: number) => chart ?? get().active;
      const patchChart = (i: number, fn: (c: ChartConfig) => ChartConfig) =>
        set((s) => ({ charts: s.charts.map((c, k) => (k === i ? fn(c) : c)), updatedAt: Date.now() }));
      const firstWatchlist: Watchlist = { id: 'default', name: 'Favoritos', symbols: DEFAULT_WATCHLIST };
      return {
        layout: '1',
        charts: [{ ...newChart(), indicators: [newInstance('ema'), { ...newInstance('ema'), params: { length: 50, source: 'close' }, styles: { ma: { color: '#e91e63' } } }] }],
        active: 0,
        favoriteTfs: DEFAULT_FAVORITE_TFS,
        sync: { symbol: false, crosshair: true, interval: false },
        rightTab: 'watchlist',
        bottomTab: null,
        bottomHeight: 300,
        rightWidth: 320,
        watchlists: [firstWatchlist],
        activeWatchlist: 'default',
        recent: [],
        ...touch,

        setLayout: (layout) =>
          set((s) => {
            const n = LAYOUT_COUNT[layout];
            const charts = s.charts.slice(0, n);
            const tfs = ['15m', '1h', '4h', '1D'];
            while (charts.length < n) charts.push(newChart(s.charts[0]?.symbolId ?? DEFAULT_SYMBOL, tfs[charts.length] ?? '1h'));
            return { layout, charts, active: Math.min(s.active, n - 1), updatedAt: Date.now() };
          }),
        setActive: (active) => set({ active }),
        updateChart: (i, patch) => patchChart(i, (c) => ({ ...c, ...patch })),
        setSymbol: (symbolId, chart) => {
          const s = get();
          const i = idx(chart);
          const recent = [symbolId, ...s.recent.filter((x) => x !== symbolId)].slice(0, 12);
          set({
            // segundos só existem em algumas fontes: se o novo símbolo não os tem, o gráfico volta a 1m
            charts: s.charts.map((c, k) => (k === i || s.sync.symbol ? { ...c, symbolId, tf: dataFeed().supports(resolveSymbol(symbolId), c.tf) ? c.tf : '1m' } : c)),
            recent,
            updatedAt: Date.now(),
          });
        },
        setTf: (tf, chart) => {
          const s = get();
          const i = idx(chart);
          set({ charts: s.charts.map((c, k) => (k === i || s.sync.interval ? { ...c, tf } : c)), updatedAt: Date.now() });
        },
        addIndicator: (type, chart) => patchChart(idx(chart), (c) => ({ ...c, indicators: [...c.indicators, newInstance(type)] })),
        updateIndicator: (u, patch, chart) =>
          patchChart(idx(chart), (c) => ({ ...c, indicators: c.indicators.map((x) => (x.uid === u ? { ...x, ...patch } : x)) })),
        removeIndicator: (u, chart) => patchChart(idx(chart), (c) => ({ ...c, indicators: c.indicators.filter((x) => x.uid !== u) })),
        toggleFavoriteTf: (tf) =>
          set((s) => ({
            favoriteTfs: s.favoriteTfs.includes(tf) ? s.favoriteTfs.filter((x) => x !== tf) : [...s.favoriteTfs, tf],
            updatedAt: Date.now(),
          })),
        setRightTab: (rightTab) => set({ rightTab }),
        setBottomTab: (bottomTab) => set({ bottomTab }),
        setBottomHeight: (bottomHeight) => set({ bottomHeight: Math.max(160, Math.min(900, bottomHeight)) }),
        setRightWidth: (rightWidth) => set({ rightWidth: Math.max(260, Math.min(640, rightWidth)) }),
        setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch }, updatedAt: Date.now() })),
        addToWatchlist: (symbolId, listId) =>
          set((s) => ({
            watchlists: s.watchlists.map((w) => (w.id === (listId ?? s.activeWatchlist) && !w.symbols.includes(symbolId) ? { ...w, symbols: [...w.symbols, symbolId] } : w)),
            updatedAt: Date.now(),
          })),
        removeFromWatchlist: (symbolId, listId) =>
          set((s) => ({
            watchlists: s.watchlists.map((w) => (w.id === (listId ?? s.activeWatchlist) ? { ...w, symbols: w.symbols.filter((x) => x !== symbolId) } : w)),
            updatedAt: Date.now(),
          })),
        moveInWatchlist: (from, to, listId) =>
          set((s) => ({
            watchlists: s.watchlists.map((w) => {
              if (w.id !== (listId ?? s.activeWatchlist)) return w;
              const arr = w.symbols.slice();
              const [x] = arr.splice(from, 1);
              arr.splice(to, 0, x);
              return { ...w, symbols: arr };
            }),
            updatedAt: Date.now(),
          })),
        addWatchlist: (name) =>
          set((s) => {
            const w = { id: uid('w'), name, symbols: [] };
            return { watchlists: [...s.watchlists, w], activeWatchlist: w.id, updatedAt: Date.now() };
          }),
        renameWatchlist: (id, name) => set((s) => ({ watchlists: s.watchlists.map((w) => (w.id === id ? { ...w, name } : w)), updatedAt: Date.now() })),
        deleteWatchlist: (id) =>
          set((s) => {
            if (s.watchlists.length <= 1) return s;
            const watchlists = s.watchlists.filter((w) => w.id !== id);
            return { watchlists, activeWatchlist: s.activeWatchlist === id ? watchlists[0].id : s.activeWatchlist, updatedAt: Date.now() };
          }),
        setActiveWatchlist: (activeWatchlist) => set({ activeWatchlist }),
      };
    },
    { name: 'rx-workspace', version: 1 },
  ),
);

export function activeChart(): ChartConfig {
  const s = useWorkspace.getState();
  return s.charts[s.active] ?? s.charts[0];
}
