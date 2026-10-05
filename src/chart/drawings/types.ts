import type { PricePoint } from '@/core/types';

export type ToolId =
  | 'cross'
  | 'cursor'
  | 'trendline'
  | 'ray'
  | 'infoline'
  | 'extended'
  | 'arrowline'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'crossline'
  | 'channel'
  | 'fib'
  | 'fibext'
  | 'pitchfork'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'path'
  | 'brush'
  | 'text'
  | 'note'
  | 'pricelabel'
  | 'arrowup'
  | 'arrowdown'
  | 'long'
  | 'short'
  | 'pricerange'
  | 'daterange'
  | 'measure';

export interface FibLevel {
  value: number;
  color: string;
  visible: boolean;
}

export interface DrawingStyle {
  color: string;
  width: number;
  /** 0 = contínua, 1 = tracejada, 2 = pontilhada */
  dash: 0 | 1 | 2;
  fill?: string;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Posição do texto ao longo da linha (ou na caixa). */
  textAlign?: 'left' | 'center' | 'right';
  /** Texto por cima, sobre ou por baixo da linha. */
  textVAlign?: 'top' | 'middle' | 'bottom';
  /** Intervalos em que o desenho aparece (como "Visibilidade" no TradingView). Vazio/undefined = todos. */
  visibleOn?: ('m' | 'h' | 'D' | 'W' | 'M')[];
  extendLeft?: boolean;
  extendRight?: boolean;
  showLabel?: boolean;
  levels?: FibLevel[];
}

export interface PositionData {
  stop: number;
  target: number;
  /** Risco em % da conta. */
  riskPct: number;
  account: number;
}

export interface Drawing {
  id: string;
  type: ToolId;
  points: PricePoint[];
  style: DrawingStyle;
  data?: PositionData;
  locked?: boolean;
  hidden?: boolean;
  createdAt: number;
}

export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0, color: '#787b86', visible: true },
  { value: 0.236, color: '#f23645', visible: true },
  { value: 0.382, color: '#ff9800', visible: true },
  { value: 0.5, color: '#4caf50', visible: true },
  { value: 0.618, color: '#089981', visible: true },
  { value: 0.786, color: '#00bcd4', visible: true },
  { value: 1, color: '#787b86', visible: true },
  { value: 1.272, color: '#2962ff', visible: false },
  { value: 1.618, color: '#2962ff', visible: true },
  { value: 2.618, color: '#f23645', visible: false },
  { value: -0.272, color: '#9c27b0', visible: false },
];

export const DEFAULT_FIBEXT_LEVELS: FibLevel[] = [
  { value: 0, color: '#787b86', visible: true },
  { value: 0.618, color: '#ff9800', visible: true },
  { value: 1, color: '#089981', visible: true },
  { value: 1.272, color: '#00bcd4', visible: true },
  { value: 1.618, color: '#2962ff', visible: true },
  { value: 2, color: '#9c27b0', visible: false },
  { value: 2.618, color: '#f23645', visible: true },
];
