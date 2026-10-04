import { create } from 'zustand';

export interface ContextMenuState {
  chart: number;
  x: number;
  y: number;
  price: number | null;
  time: number | null;
  drawingId: string | null;
}

interface UiState {
  symbolSearch: { open: boolean; chart: number; initial: string; mode: 'set' | 'watchlist' | 'compare' };
  indicators: boolean;
  indicatorSettings: { chart: number; uid: string } | null;
  drawingSettings: { symbolId: string; id: string } | null;
  settings: boolean;
  gotoDate: boolean;
  shortcuts: boolean;
  contextMenu: ContextMenuState | null;
  tfInput: string | null;
  mobileTools: boolean;
  alertDraft: { symbolId: string; price: number } | null;
  set: (patch: Partial<UiState>) => void;
  openSymbolSearch: (initial?: string, chart?: number, mode?: UiState['symbolSearch']['mode']) => void;
}

export const useUi = create<UiState>((set) => ({
  symbolSearch: { open: false, chart: 0, initial: '', mode: 'set' },
  indicators: false,
  indicatorSettings: null,
  drawingSettings: null,
  settings: false,
  gotoDate: false,
  shortcuts: false,
  contextMenu: null,
  tfInput: null,
  mobileTools: false,
  alertDraft: null,
  set: (patch) => set(patch),
  openSymbolSearch: (initial = '', chart, mode = 'set') =>
    set((s) => ({ symbolSearch: { open: true, chart: chart ?? s.symbolSearch.chart, initial, mode } })),
}));
