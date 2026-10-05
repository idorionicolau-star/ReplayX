import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Drawing, DrawingStyle, ToolId } from '@/chart/drawings/types';

interface History {
  past: Drawing[][];
  future: Drawing[][];
}

export interface DrawingsState {
  bySymbol: Record<string, Drawing[]>;
  tool: ToolId;
  selected: { symbolId: string; id: string } | null;
  locked: boolean;
  hidden: boolean;
  /** Estilos usados da última vez por ferramenta. */
  lastStyle: Partial<Record<ToolId, Partial<DrawingStyle>>>;
  history: Record<string, History>;
  updatedAt: number;

  setTool: (t: ToolId) => void;
  select: (sel: { symbolId: string; id: string } | null) => void;
  add: (symbolId: string, d: Drawing) => void;
  /** Alteração sem histórico (ex.: durante o arrasto). */
  patchLive: (symbolId: string, id: string, patch: Partial<Drawing>) => void;
  /** Guarda um ponto no histórico antes de uma alteração. */
  checkpoint: (symbolId: string) => void;
  update: (symbolId: string, id: string, patch: Partial<Drawing>) => void;
  remove: (symbolId: string, id: string) => void;
  clear: (symbolId: string) => void;
  bringToFront: (symbolId: string, id: string) => void;
  undo: (symbolId: string) => void;
  redo: (symbolId: string) => void;
  setLocked: (v: boolean) => void;
  setHidden: (v: boolean) => void;
  rememberStyle: (tool: ToolId, style: Partial<DrawingStyle>) => void;
}

const MAX_HISTORY = 100;

export const useDrawings = create<DrawingsState>()(
  persist(
    (set, get) => {
      const push = (symbolId: string) => {
        const s = get();
        const h = s.history[symbolId] ?? { past: [], future: [] };
        const cur = s.bySymbol[symbolId] ?? [];
        return { ...s.history, [symbolId]: { past: [...h.past, cur].slice(-MAX_HISTORY), future: [] } };
      };
      return {
        bySymbol: {},
        tool: 'cross',
        selected: null,
        locked: false,
        hidden: false,
        lastStyle: {},
        history: {},
        updatedAt: 0,

        setTool: (tool) => set({ tool }),
        select: (selected) => set({ selected }),
        add: (symbolId, d) =>
          set((s) => ({
            history: push(symbolId),
            bySymbol: { ...s.bySymbol, [symbolId]: [...(s.bySymbol[symbolId] ?? []), d] },
            updatedAt: Date.now(),
          })),
        patchLive: (symbolId, id, patch) =>
          set((s) => ({
            bySymbol: { ...s.bySymbol, [symbolId]: (s.bySymbol[symbolId] ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) },
          })),
        checkpoint: (symbolId) => set({ history: push(symbolId) }),
        update: (symbolId, id, patch) =>
          set((s) => ({
            history: push(symbolId),
            bySymbol: { ...s.bySymbol, [symbolId]: (s.bySymbol[symbolId] ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)) },
            updatedAt: Date.now(),
          })),
        remove: (symbolId, id) =>
          set((s) => ({
            history: push(symbolId),
            bySymbol: { ...s.bySymbol, [symbolId]: (s.bySymbol[symbolId] ?? []).filter((d) => d.id !== id) },
            selected: s.selected?.id === id ? null : s.selected,
            updatedAt: Date.now(),
          })),
        clear: (symbolId) =>
          set((s) => ({ history: push(symbolId), bySymbol: { ...s.bySymbol, [symbolId]: [] }, selected: null, updatedAt: Date.now() })),
        bringToFront: (symbolId, id) =>
          set((s) => {
            const list = s.bySymbol[symbolId] ?? [];
            const d = list.find((x) => x.id === id);
            if (!d) return s;
            return { bySymbol: { ...s.bySymbol, [symbolId]: [...list.filter((x) => x.id !== id), d] }, updatedAt: Date.now() };
          }),
        undo: (symbolId) =>
          set((s) => {
            const h = s.history[symbolId];
            if (!h?.past.length) return s;
            const prev = h.past[h.past.length - 1];
            return {
              bySymbol: { ...s.bySymbol, [symbolId]: prev },
              history: { ...s.history, [symbolId]: { past: h.past.slice(0, -1), future: [s.bySymbol[symbolId] ?? [], ...h.future] } },
              selected: null,
              updatedAt: Date.now(),
            };
          }),
        redo: (symbolId) =>
          set((s) => {
            const h = s.history[symbolId];
            if (!h?.future.length) return s;
            const next = h.future[0];
            return {
              bySymbol: { ...s.bySymbol, [symbolId]: next },
              history: { ...s.history, [symbolId]: { past: [...h.past, s.bySymbol[symbolId] ?? []], future: h.future.slice(1) } },
              selected: null,
              updatedAt: Date.now(),
            };
          }),
        setLocked: (locked) => set({ locked }),
        setHidden: (hidden) => set({ hidden }),
        rememberStyle: (tool, style) =>
          set((s) => {
            // o texto e a visibilidade são de cada desenho: não passam para os próximos
            const { text: _t, visibleOn: _v, ...rest } = style;
            void _t;
            void _v;
            return { lastStyle: { ...s.lastStyle, [tool]: { ...s.lastStyle[tool], ...rest } } };
          }),
      };
    },
    {
      name: 'rx-drawings',
      version: 1,
      partialize: (s) => ({ bySymbol: s.bySymbol, lastStyle: s.lastStyle, locked: s.locked, hidden: s.hidden, updatedAt: s.updatedAt }) as unknown as DrawingsState,
    },
  ),
);
