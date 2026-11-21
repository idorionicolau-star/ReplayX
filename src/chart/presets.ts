import type { Appearance } from './appearance';

/** Estilo pré-definido do gráfico: cores das velas, fundo, grelha, texto e cruz. `null` = automático do tema. */
export interface ChartPreset {
  id: string;
  name: string;
  dark: boolean;
  up: string;
  down: string;
  background: string | null;
  background2?: string | null;
  grid: string | null;
  text: string | null;
  crosshair: string | null;
  /** Corpo oco/borda: só a borda colorida. */
  border?: boolean;
}

export const CHART_PRESETS: ChartPreset[] = [
  { id: 'classic-dark', name: 'Clássico escuro', dark: true, up: '#089981', down: '#f23645', background: null, grid: null, text: null, crosshair: null },
  { id: 'classic-light', name: 'Clássico claro', dark: false, up: '#089981', down: '#f23645', background: null, grid: null, text: null, crosshair: null },
  { id: 'mono', name: 'Monocromático', dark: true, up: '#e6e6e6', down: '#5a5a5a', background: '#0b0b0b', grid: 'rgba(255,255,255,0.05)', text: '#bdbdbd', crosshair: '#8a8a8a', border: true },
  { id: 'paper', name: 'Papel', dark: false, up: '#ffffff', down: '#111111', background: '#f6f3ec', grid: 'rgba(0,0,0,0.07)', text: '#2b2b2b', crosshair: '#777777', border: true },
  { id: 'midnight', name: 'Meia-noite', dark: true, up: '#26a69a', down: '#ef5350', background: '#0a0e1a', background2: '#10172b', grid: 'rgba(80,100,160,0.12)', text: '#a9b4d0', crosshair: '#5c6b99' },
  { id: 'terminal', name: 'Terminal', dark: true, up: '#00e676', down: '#ff3d71', background: '#050805', grid: 'rgba(0,230,118,0.07)', text: '#7bd88f', crosshair: '#2f7d4f' },
  { id: 'ocean', name: 'Oceano', dark: true, up: '#4fc3f7', down: '#ff8a65', background: '#0d1b24', grid: 'rgba(79,195,247,0.08)', text: '#9db8c7', crosshair: '#4b7388' },
  { id: 'sand', name: 'Areia', dark: false, up: '#2e7d32', down: '#c62828', background: '#fbf6ea', grid: 'rgba(120,95,40,0.10)', text: '#4a3f2a', crosshair: '#9a8a63' },
  { id: 'daltonic', name: 'Daltónico (azul/laranja)', dark: true, up: '#2196f3', down: '#ff9800', background: null, grid: null, text: null, crosshair: null },
  { id: 'contrast', name: 'Alto contraste', dark: true, up: '#00ff88', down: '#ff2e2e', background: '#000000', grid: 'rgba(255,255,255,0.10)', text: '#ffffff', crosshair: '#ffffff' },
];

/** O que o estilo escreve nas definições. */
export function presetPatch(p: ChartPreset): { appearance: Partial<Appearance>; upColor: string; downColor: string } {
  return {
    upColor: p.up,
    downColor: p.down,
    appearance: {
      bodyUp: null,
      bodyDown: null,
      borderUp: null,
      borderDown: null,
      wickUp: null,
      wickDown: null,
      showBody: true,
      showBorder: !!p.border,
      background: p.background,
      background2: p.background2 ?? null,
      gridVert: p.grid,
      gridHorz: p.grid,
      textColor: p.text,
      crosshair: p.crosshair,
    },
  };
}
