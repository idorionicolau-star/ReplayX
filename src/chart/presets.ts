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
  // nudes (tons de pele, bege, cappuccino)
  { id: 'nude-rose', name: 'Nude rosado', dark: false, up: '#7a8f6b', down: '#b5495b', background: '#f4e4de', grid: 'rgba(120,70,60,0.10)', text: '#5a3b36', crosshair: '#a0746c' },
  { id: 'nude-beige', name: 'Nude bege', dark: false, up: '#4f7a5a', down: '#a8554a', background: '#efe1d0', grid: 'rgba(110,80,50,0.11)', text: '#4d3b2a', crosshair: '#9c8467' },
  { id: 'nude-cream', name: 'Nude creme', dark: false, up: '#5b8a72', down: '#c0604f', background: '#faf3e7', grid: 'rgba(130,100,60,0.09)', text: '#54442f', crosshair: '#a8946f' },
  { id: 'nude-caramel', name: 'Caramelo', dark: false, up: '#5d7f4a', down: '#9c3d2e', background: '#e8d2b5', grid: 'rgba(100,60,20,0.12)', text: '#3f2d18', crosshair: '#8e6d45' },
  { id: 'nude-cappuccino', name: 'Cappuccino', dark: false, up: '#3f6f5a', down: '#a3483c', background: '#d9c3ad', grid: 'rgba(80,50,30,0.13)', text: '#3a2a1c', crosshair: '#7d6048' },
  { id: 'nude-champagne', name: 'Champanhe', dark: false, up: '#6b8e5a', down: '#b8574a', background: '#f3e8d3', grid: 'rgba(140,110,50,0.10)', text: '#5a4a28', crosshair: '#b09a64' },
  { id: 'nude-peach', name: 'Pêssego', dark: false, up: '#6a9a7e', down: '#d2604f', background: '#fbe3d3', grid: 'rgba(160,90,60,0.10)', text: '#5e3a2c', crosshair: '#c28a72' },
  { id: 'nude-terracotta', name: 'Terracota', dark: false, up: '#56785c', down: '#a24a35', background: '#e5c7b3', grid: 'rgba(110,60,40,0.12)', text: '#472d22', crosshair: '#94684f' },
  { id: 'nude-taupe', name: 'Taupe', dark: true, up: '#c9b79c', down: '#c2766a', background: '#2b2623', grid: 'rgba(220,200,180,0.07)', text: '#cdbfae', crosshair: '#8f7f6d' },
  { id: 'nude-mocha', name: 'Mocha escuro', dark: true, up: '#d6b98c', down: '#d98873', background: '#1f1814', background2: '#2a211b', grid: 'rgba(230,200,160,0.07)', text: '#d8c6ae', crosshair: '#9b8466' },
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
