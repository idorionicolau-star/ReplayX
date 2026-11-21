import type { Appearance } from './appearance';
import { contrastOf } from './drawings/auto';

/** Cores de um estilo num dos modos (claro ou escuro). `null` = automático do tema. */
export interface PresetColors {
  up: string;
  down: string;
  background: string | null;
  background2?: string | null;
  grid: string | null;
  text: string | null;
  crosshair: string | null;
  /** Velas ocas: só a borda colorida. */
  border?: boolean;
}

/** Estilo pré-definido: uma identidade com versão clara e escura, que acompanha o botão sol/lua. */
export interface ChartPreset {
  id: string;
  name: string;
  light: PresetColors;
  dark: PresetColors;
}

const G = '#089981';
const R = '#f23645';

export const CHART_PRESETS: ChartPreset[] = [
  { id: 'classic', name: 'Clássico',
    light: { up: G, down: R, background: null, grid: null, text: null, crosshair: null },
    dark: { up: G, down: R, background: null, grid: null, text: null, crosshair: null } },
  { id: 'mono', name: 'Monocromático',
    light: { up: '#ffffff', down: '#1a1a1a', background: '#f4f4f4', grid: 'rgba(0,0,0,0.06)', text: '#333333', crosshair: '#777777', border: true },
    dark: { up: '#e6e6e6', down: '#5a5a5a', background: '#0b0b0b', grid: 'rgba(255,255,255,0.05)', text: '#bdbdbd', crosshair: '#8a8a8a', border: true } },
  { id: 'paper', name: 'Papel',
    light: { up: '#ffffff', down: '#111111', background: '#f6f3ec', grid: 'rgba(0,0,0,0.07)', text: '#2b2b2b', crosshair: '#777777', border: true },
    dark: { up: '#d9d4c7', down: '#4a4740', background: '#1c1b18', grid: 'rgba(255,250,235,0.06)', text: '#c9c4b6', crosshair: '#8b867a', border: true } },
  { id: 'midnight', name: 'Meia-noite',
    light: { up: '#1e8e84', down: '#d9433f', background: '#eef2fa', background2: '#e2e9f6', grid: 'rgba(60,80,140,0.10)', text: '#3a4666', crosshair: '#7b88b0' },
    dark: { up: '#26a69a', down: '#ef5350', background: '#0a0e1a', background2: '#10172b', grid: 'rgba(80,100,160,0.12)', text: '#a9b4d0', crosshair: '#5c6b99' } },
  { id: 'terminal', name: 'Terminal',
    light: { up: '#0a8f4a', down: '#d6275a', background: '#eef6ee', grid: 'rgba(10,120,60,0.09)', text: '#20502f', crosshair: '#5d9a74' },
    dark: { up: '#00e676', down: '#ff3d71', background: '#050805', grid: 'rgba(0,230,118,0.07)', text: '#7bd88f', crosshair: '#2f7d4f' } },
  { id: 'ocean', name: 'Oceano',
    light: { up: '#0277bd', down: '#e0623a', background: '#e8f4f8', grid: 'rgba(20,110,150,0.10)', text: '#27536a', crosshair: '#6aa3bb' },
    dark: { up: '#4fc3f7', down: '#ff8a65', background: '#0d1b24', grid: 'rgba(79,195,247,0.08)', text: '#9db8c7', crosshair: '#4b7388' } },
  { id: 'sand', name: 'Areia',
    light: { up: '#2e7d32', down: '#c62828', background: '#fbf6ea', grid: 'rgba(120,95,40,0.10)', text: '#4a3f2a', crosshair: '#9a8a63' },
    dark: { up: '#7cb342', down: '#ef6a5b', background: '#1d1a12', grid: 'rgba(230,210,150,0.07)', text: '#d3c8a6', crosshair: '#8d8157' } },
  { id: 'daltonic', name: 'Daltónico (azul/laranja)',
    light: { up: '#1565c0', down: '#ef6c00', background: null, grid: null, text: null, crosshair: null },
    dark: { up: '#2196f3', down: '#ff9800', background: null, grid: null, text: null, crosshair: null } },
  { id: 'contrast', name: 'Alto contraste',
    light: { up: '#007a3d', down: '#d50000', background: '#ffffff', grid: 'rgba(0,0,0,0.12)', text: '#000000', crosshair: '#000000' },
    dark: { up: '#00ff88', down: '#ff2e2e', background: '#000000', grid: 'rgba(255,255,255,0.10)', text: '#ffffff', crosshair: '#ffffff' } },
  // nudes: tons de pele, bege, café
  { id: 'nude-rose', name: 'Nude rosado',
    light: { up: '#7a8f6b', down: '#b5495b', background: '#f4e4de', grid: 'rgba(120,70,60,0.10)', text: '#5a3b36', crosshair: '#a0746c' },
    dark: { up: '#a9c29a', down: '#e07a8c', background: '#241a1a', grid: 'rgba(240,200,190,0.07)', text: '#dbc3bd', crosshair: '#8f6a66' } },
  { id: 'nude-beige', name: 'Nude bege',
    light: { up: '#4f7a5a', down: '#a8554a', background: '#efe1d0', grid: 'rgba(110,80,50,0.11)', text: '#4d3b2a', crosshair: '#9c8467' },
    dark: { up: '#8fbf9b', down: '#d98578', background: '#221c16', grid: 'rgba(235,215,185,0.07)', text: '#d6c7b2', crosshair: '#8a7658' } },
  { id: 'nude-cream', name: 'Nude creme',
    light: { up: '#5b8a72', down: '#c0604f', background: '#faf3e7', grid: 'rgba(130,100,60,0.09)', text: '#54442f', crosshair: '#a8946f' },
    dark: { up: '#92c4a9', down: '#e08a79', background: '#26221b', grid: 'rgba(245,230,200,0.07)', text: '#e0d4bd', crosshair: '#988a6b' } },
  { id: 'nude-caramel', name: 'Caramelo',
    light: { up: '#5d7f4a', down: '#9c3d2e', background: '#e8d2b5', grid: 'rgba(100,60,20,0.12)', text: '#3f2d18', crosshair: '#8e6d45' },
    dark: { up: '#9cc47f', down: '#e07a64', background: '#241a0f', grid: 'rgba(230,190,130,0.08)', text: '#e0c9a4', crosshair: '#8f6f43' } },
  { id: 'nude-cappuccino', name: 'Cappuccino',
    light: { up: '#3f6f5a', down: '#a3483c', background: '#d9c3ad', grid: 'rgba(80,50,30,0.13)', text: '#3a2a1c', crosshair: '#7d6048' },
    dark: { up: '#86b8a0', down: '#d98474', background: '#1e1611', grid: 'rgba(220,190,160,0.07)', text: '#d3bca4', crosshair: '#8a6e56' } },
  { id: 'nude-champagne', name: 'Champanhe',
    light: { up: '#6b8e5a', down: '#b8574a', background: '#f3e8d3', grid: 'rgba(140,110,50,0.10)', text: '#5a4a28', crosshair: '#b09a64' },
    dark: { up: '#a6c796', down: '#de8678', background: '#25200f', grid: 'rgba(240,220,160,0.07)', text: '#e3d6aa', crosshair: '#9b8745' } },
  { id: 'nude-peach', name: 'Pêssego',
    light: { up: '#6a9a7e', down: '#d2604f', background: '#fbe3d3', grid: 'rgba(160,90,60,0.10)', text: '#5e3a2c', crosshair: '#c28a72' },
    dark: { up: '#9fcfb2', down: '#ee8a78', background: '#261a15', grid: 'rgba(250,200,175,0.07)', text: '#e6c8b8', crosshair: '#a07562' } },
  { id: 'nude-terracotta', name: 'Terracota',
    light: { up: '#56785c', down: '#a24a35', background: '#e5c7b3', grid: 'rgba(110,60,40,0.12)', text: '#472d22', crosshair: '#94684f' },
    dark: { up: '#8fb596', down: '#dd8068', background: '#221510', grid: 'rgba(230,180,150,0.07)', text: '#dcbca8', crosshair: '#8c5f48' } },
  { id: 'nude-taupe', name: 'Taupe',
    light: { up: '#6d7f5c', down: '#a85f55', background: '#e4dad0', grid: 'rgba(90,70,50,0.10)', text: '#4a3f35', crosshair: '#8f7f6d' },
    dark: { up: '#c9b79c', down: '#c2766a', background: '#2b2623', grid: 'rgba(220,200,180,0.07)', text: '#cdbfae', crosshair: '#8f7f6d' } },
  { id: 'nude-mocha', name: 'Mocha',
    light: { up: '#6f7f4f', down: '#b0604c', background: '#ecdcc8', grid: 'rgba(100,70,40,0.11)', text: '#4a3626', crosshair: '#96784f' },
    dark: { up: '#d6b98c', down: '#d98873', background: '#1f1814', background2: '#2a211b', grid: 'rgba(230,200,160,0.07)', text: '#d8c6ae', crosshair: '#9b8466' } },
  { id: 'nude-clay', name: 'Argila',
    light: { up: '#667a58', down: '#b4574b', background: '#e9d6cb', grid: 'rgba(120,70,55,0.11)', text: '#50362d', crosshair: '#a07768' },
    dark: { up: '#a3b793', down: '#d9857a', background: '#231a17', grid: 'rgba(235,200,185,0.07)', text: '#d9c0b5', crosshair: '#8d6a5d' } },
];

export const DEFAULT_PRESET_ID = 'classic';

/** O que o estilo escreve nas definições, no modo pedido. */
export function presetPatch(p: ChartPreset, dark: boolean): { appearance: Partial<Appearance>; upColor: string; downColor: string } {
  const c = dark ? p.dark : p.light;
  const bg = c.background ?? (dark ? '#131722' : '#ffffff');
  // vela que quase se confunde com o fundo (ex.: branca em papel claro) ganha contorno, para nunca ficar invisível
  const outline = c.text ?? (dark ? '#d1d4dc' : '#131722');
  const outlined = !!c.border || contrastOf(c.up, bg) < 2.2 || contrastOf(c.down, bg) < 2.2;
  return {
    upColor: c.up,
    downColor: c.down,
    appearance: {
      bodyUp: null,
      bodyDown: null,
      borderUp: outlined ? outline : null,
      borderDown: outlined ? outline : null,
      wickUp: outlined ? outline : null,
      wickDown: outlined ? outline : null,
      showBody: true,
      showBorder: outlined,
      background: c.background,
      background2: c.background2 ?? null,
      gridVert: c.grid,
      gridHorz: c.grid,
      textColor: c.text,
      crosshair: c.crosshair,
    },
  };
}
