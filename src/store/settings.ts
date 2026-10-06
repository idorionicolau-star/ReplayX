import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DrawingStyle, ToolId } from '@/chart/drawings/types';
import { DEFAULT_APPEARANCE, type Appearance } from '@/chart/appearance';

export type Theme = 'dark' | 'light';
export type Magnet = 'off' | 'weak' | 'strong';

export interface TradingSettings {
  initialBalance: number;
  currency: string;
  /** Spread em pips/pontos aplicado nas execuções simuladas. */
  spreadPoints: number;
  slippagePoints: number;
  commission: { type: 'none' | 'percent' | 'perLot'; value: number };
  defaultRiskPct: number;
  defaultQty: number;
  sizing: 'qty' | 'risk';
  /** Mostrar confirmação antes de enviar ordens. */
  confirmOrders: boolean;
}

export type LoupePos = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'follow';

export interface DrawingTemplate {
  id: string;
  name: string;
  style: DrawingStyle;
}

export interface SettingsState {
  theme: Theme;
  timezone: string;
  upColor: string;
  downColor: string;
  showGrid: boolean;
  showWatermark: boolean;
  logScale: boolean;
  magnet: Magnet;
  stayInDrawingMode: boolean;
  /** Ferramentas de desenho favoritas (barra flutuante e topo da barra lateral). */
  favoriteTools: ToolId[];
  /** Barra flutuante de favoritos visível. */
  favoritesBar: boolean;
  /** Posição da barra flutuante (px a partir do canto superior esquerdo da área dos gráficos). */
  favoritesBarPos: { x: number; y: number } | null;
  /** Barra de favoritos na vertical. */
  favoritesBarVertical: boolean;
  /** Posição da barra do replay (null = por baixo, ao centro). */
  replayBarPos: { x: number; y: number } | null;
  /** Indicadores favoritos (id). */
  favoriteIndicators: string[];
  /** Linhas encaixam em ângulos de 15° (também com Shift). */
  angleSnap: boolean;
  /** Lupa ao desenhar com o dedo. */
  loupe: boolean;
  /** Onde fica a lupa: num canto fixo ou junto ao dedo. */
  loupePos: LoupePos;
  /** Escala de preços sempre ajustada aos dados à vista. */
  autoFit: boolean;
  /** Vibração ao rodar o seletor de símbolo/intervalo (Android). */
  haptics: boolean;
  /** Esconde as barras de baixo (separadores, períodos, navegação) para ver mais gráfico. */
  hideBottomBars: boolean;
  /** Aparência do gráfico (cores do símbolo, fundo, grelha, escalas…). */
  appearance: Appearance;
  /** Cores guardadas pelo utilizador no seletor de cores. */
  customColors: string[];
  /** Modelos de estilo (cores, texto…) guardados por ferramenta. */
  drawingTemplates: Partial<Record<ToolId, DrawingTemplate[]>>;
  sound: boolean;
  trading: TradingSettings;
  replaySpeedMs: number;
  replayIntrabar: boolean;
  updatedAt: number;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'setTrading'>>) => void;
  setTrading: (patch: Partial<TradingSettings>) => void;
}

export const DEFAULT_TRADING: TradingSettings = {
  initialBalance: 10000,
  currency: 'USD',
  spreadPoints: 0,
  slippagePoints: 0,
  commission: { type: 'none', value: 0 },
  defaultRiskPct: 1,
  defaultQty: 1,
  sizing: 'risk',
  confirmOrders: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      timezone: 'local',
      upColor: '#089981',
      downColor: '#f23645',
      showGrid: true,
      showWatermark: true,
      logScale: false,
      magnet: 'off',
      stayInDrawingMode: false,
      favoriteTools: ['trendline', 'hline', 'fib', 'rect', 'long', 'short'],
      favoritesBar: true,
      favoritesBarPos: null,
      favoritesBarVertical: false,
      replayBarPos: null,
      favoriteIndicators: ['ema', 'rsi', 'macd', 'bb'],
      angleSnap: false,
      loupe: true,
      loupePos: 'top-right',
      autoFit: true,
      haptics: true,
      // no telemóvel as barras de baixo começam recolhidas (o botão no canto do gráfico mostra-as)
      hideBottomBars: typeof window !== 'undefined' && window.innerWidth < 640,
      appearance: DEFAULT_APPEARANCE,
      customColors: [],
      drawingTemplates: {},
      sound: true,
      trading: DEFAULT_TRADING,
      replaySpeedMs: 1000,
      replayIntrabar: true,
      updatedAt: 0,
      set: (patch) => set({ ...patch, updatedAt: Date.now() }),
      setTrading: (patch) => set((s) => ({ trading: { ...s.trading, ...patch }, updatedAt: Date.now() })),
    }),
    {
      name: 'rx-settings',
      version: 3,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2) {
          // a grelha e a escala log passaram para a aparência
          p.appearance = {
            ...DEFAULT_APPEARANCE,
            gridVertVisible: p.showGrid !== false,
            gridHorzVisible: p.showGrid !== false,
            scaleMode: p.logScale ? 'log' : 'normal',
          };
        }
        if (version < 3 && typeof window !== 'undefined' && window.innerWidth < 640) p.hideBottomBars = true;
        return p as SettingsState;
      },
      // campos novos da aparência ficam com o valor por omissão
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return { ...current, ...p, appearance: { ...DEFAULT_APPEARANCE, ...(p.appearance ?? {}) } };
      },
    },
  ),
);

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'local', label: 'Do navegador' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Africa/Maputo', label: '(UTC+2) Maputo' },
  { value: 'Africa/Johannesburg', label: '(UTC+2) Joanesburgo' },
  { value: 'Africa/Luanda', label: '(UTC+1) Luanda' },
  { value: 'Europe/Lisbon', label: 'Lisboa' },
  { value: 'Europe/London', label: 'Londres' },
  { value: 'Europe/Berlin', label: 'Frankfurt' },
  { value: 'America/New_York', label: 'Nova Iorque' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Asia/Tokyo', label: 'Tóquio' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];
