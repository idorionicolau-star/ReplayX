import type { Appearance } from './appearance';
import { contrastOf } from './drawings/auto';
import { tr } from '@/i18n';

/** Cores de um estilo num dos modos (claro ou escuro). `null` = automático do tema. */
export interface PresetColors {
  up: string;
  down: string;
  background: string | null;
  background2?: string | null;
  grid: string | null;
  text: string | null;
  crosshair: string | null;
  /** Cores de baixo do corpo: com elas as velas têm gradiente (de `up`/`down` em cima até `up2`/`down2` em baixo). */
  up2?: string;
  down2?: string;
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
  { id: 'classic', name: tr('Clássico'),
    light: { up: G, down: R, background: null, grid: null, text: null, crosshair: null },
    dark: { up: G, down: R, background: null, grid: null, text: null, crosshair: null } },
  { id: 'mono', name: tr('Monocromático'),
    light: { up: '#ffffff', down: '#1a1a1a', background: '#f4f4f4', grid: 'rgba(0,0,0,0.06)', text: '#333333', crosshair: '#777777', border: true },
    dark: { up: '#e6e6e6', down: '#5a5a5a', background: '#0b0b0b', grid: 'rgba(255,255,255,0.05)', text: '#bdbdbd', crosshair: '#8a8a8a', border: true } },
  { id: 'paper', name: tr('Papel'),
    light: { up: '#2f6fe4', down: '#141414', background: '#f6f3ec', grid: 'rgba(0,0,0,0.07)', text: '#2b2b2b', crosshair: '#777777', border: true },
    dark: { up: '#5b94ff', down: '#e8e8e8', background: '#1c1b18', grid: 'rgba(255,250,235,0.06)', text: '#c9c4b6', crosshair: '#8b867a', border: true } },
  { id: 'midnight', name: tr('Meia-noite'),
    light: { up: '#00a5c2', down: '#c2185b', up2: '#056a85', down2: '#6a1b9a', background: '#eef2fa', background2: '#e2e9f6', grid: 'rgba(60,80,140,0.10)', text: '#3a4666', crosshair: '#7b88b0' },
    dark: { up: '#22e5ff', down: '#ff3df0', up2: '#0a7fb0', down2: '#7a2cff', background: '#0a0e1a', background2: '#10172b', grid: 'rgba(80,100,160,0.12)', text: '#a9b4d0', crosshair: '#5c6b99' } },
  { id: 'terminal', name: 'Terminal',
    light: { up: '#0a9d4e', down: '#e08600', background: '#eef6ee', grid: 'rgba(10,120,60,0.09)', text: '#20502f', crosshair: '#5d9a74' },
    dark: { up: '#00ff7b', down: '#ffae00', background: '#050805', grid: 'rgba(0,230,118,0.07)', text: '#7bd88f', crosshair: '#2f7d4f' } },
  { id: 'ocean', name: tr('Oceano'),
    light: { up: '#2fbf9f', down: '#e0405f', up2: '#0b7a87', down2: '#8e1f4a', background: '#e8f4f8', grid: 'rgba(20,110,150,0.10)', text: '#27536a', crosshair: '#6aa3bb' },
    dark: { up: '#5ff2cf', down: '#ff6b8f', up2: '#0e7490', down2: '#a3194f', background: '#0d1b24', grid: 'rgba(79,195,247,0.08)', text: '#9db8c7', crosshair: '#4b7388' } },
  { id: 'sand', name: tr('Areia'),
    light: { up: '#1fa38c', down: '#161616', background: '#fbf6ea', grid: 'rgba(120,95,40,0.10)', text: '#4a3f2a', crosshair: '#9a8a63' },
    dark: { up: '#2dd4bf', down: '#e0e0e0', background: '#1d1a12', grid: 'rgba(230,210,150,0.07)', text: '#d3c8a6', crosshair: '#8d8157' } },
  { id: 'daltonic', name: tr('Daltónico (azul/laranja)'),
    light: { up: '#1565c0', down: '#ef6c00', background: null, grid: null, text: null, crosshair: null },
    dark: { up: '#2196f3', down: '#ff9800', background: null, grid: null, text: null, crosshair: null } },
  { id: 'contrast', name: tr('Alto contraste'),
    light: { up: '#0033cc', down: '#ff9100', background: '#ffffff', grid: 'rgba(0,0,0,0.12)', text: '#000000', crosshair: '#000000' },
    dark: { up: '#ffe600', down: '#3d9bff', background: '#000000', grid: 'rgba(255,255,255,0.10)', text: '#ffffff', crosshair: '#ffffff' } },
  // nudes: tons de pele, bege, café
  { id: 'nude-rose', name: tr('Nude rosado'),
    light: { up: '#8db8a8', down: '#d4607f', up2: '#4f8c80', down2: '#8a3a5e', background: '#f4e4de', grid: 'rgba(120,70,60,0.10)', text: '#5a3b36', crosshair: '#a0746c' },
    dark: { up: '#9ad6c2', down: '#f0809f', up2: '#3f7f74', down2: '#8a3a62', background: '#241a1a', grid: 'rgba(240,200,190,0.07)', text: '#dbc3bd', crosshair: '#8f6a66' } },
  { id: 'nude-beige', name: tr('Nude bege'),
    light: { up: '#2f78a0', down: '#c0392b', background: '#efe1d0', grid: 'rgba(110,80,50,0.11)', text: '#4d3b2a', crosshair: '#9c8467' },
    dark: { up: '#5bb0dc', down: '#ff6a58', background: '#221c16', grid: 'rgba(235,215,185,0.07)', text: '#d6c7b2', crosshair: '#8a7658' } },
  { id: 'nude-cream', name: tr('Nude creme'),
    light: { up: '#7fb0a2', down: '#a02f78', up2: '#4a8794', down2: '#5d2a63', background: '#faf3e7', grid: 'rgba(130,100,60,0.09)', text: '#54442f', crosshair: '#a8946f' },
    dark: { up: '#74d3c0', down: '#e04aa8', up2: '#2f7f91', down2: '#6a2c80', background: '#26221b', grid: 'rgba(245,230,200,0.07)', text: '#e0d4bd', crosshair: '#988a6b' } },
  { id: 'nude-caramel', name: tr('Caramelo'),
    light: { up: '#d98200', down: '#4a2c17', background: '#e8d2b5', grid: 'rgba(100,60,20,0.12)', text: '#3f2d18', crosshair: '#8e6d45' },
    dark: { up: '#ffb02e', down: '#b57a54', background: '#241a0f', grid: 'rgba(230,190,130,0.08)', text: '#e0c9a4', crosshair: '#8f6f43' } },
  { id: 'nude-cappuccino', name: 'Cappuccino',
    light: { up: '#7fb38f', down: '#c9724f', up2: '#3f7a58', down2: '#7f3a28', background: '#d9c3ad', grid: 'rgba(80,50,30,0.13)', text: '#3a2a1c', crosshair: '#7d6048' },
    dark: { up: '#8fd6a5', down: '#ff9a76', up2: '#2f7a52', down2: '#8f3f28', background: '#1e1611', grid: 'rgba(220,190,160,0.07)', text: '#d3bca4', crosshair: '#8a6e56' } },
  { id: 'nude-champagne', name: tr('Champanhe'),
    light: { up: '#b8860b', down: '#6a2a68', background: '#f3e8d3', grid: 'rgba(140,110,50,0.10)', text: '#5a4a28', crosshair: '#b09a64' },
    dark: { up: '#f0c24a', down: '#d070d0', background: '#25200f', grid: 'rgba(240,220,160,0.07)', text: '#e3d6aa', crosshair: '#9b8745' } },
  { id: 'nude-peach', name: tr('Pêssego'),
    light: { up: '#1fb09e', down: '#e8603f', background: '#fbe3d3', grid: 'rgba(160,90,60,0.10)', text: '#5e3a2c', crosshair: '#c28a72' },
    dark: { up: '#3fe0c8', down: '#ff8a65', background: '#261a15', grid: 'rgba(250,200,175,0.07)', text: '#e6c8b8', crosshair: '#a07562' } },
  { id: 'nude-terracotta', name: tr('Terracota'),
    light: { up: '#2f78b0', down: '#c4502a', background: '#e5c7b3', grid: 'rgba(110,60,40,0.12)', text: '#472d22', crosshair: '#94684f' },
    dark: { up: '#5aa9e6', down: '#ff7a50', background: '#221510', grid: 'rgba(230,180,150,0.07)', text: '#dcbca8', crosshair: '#8c5f48' } },
  { id: 'nude-taupe', name: 'Taupe',
    light: { up: '#6f8a3a', down: '#6b3e5e', background: '#e4dad0', grid: 'rgba(90,70,50,0.10)', text: '#4a3f35', crosshair: '#8f7f6d' },
    dark: { up: '#d6c6a5', down: '#d070a8', background: '#2b2623', grid: 'rgba(220,200,180,0.07)', text: '#cdbfae', crosshair: '#8f7f6d' } },
  { id: 'nude-mocha', name: 'Mocha',
    light: { up: '#d9a441', down: '#3e2723', background: '#ecdcc8', grid: 'rgba(100,70,40,0.11)', text: '#4a3626', crosshair: '#96784f' },
    dark: { up: '#f0c060', down: '#a1887f', background: '#1f1814', background2: '#2a211b', grid: 'rgba(230,200,160,0.07)', text: '#d8c6ae', crosshair: '#9b8466' } },
  { id: 'nude-clay', name: tr('Argila'),
    light: { up: '#3f8fb0', down: '#b5523b', background: '#e9d6cb', grid: 'rgba(120,70,55,0.11)', text: '#50362d', crosshair: '#a07768' },
    dark: { up: '#6cc0e0', down: '#ff8566', background: '#231a17', grid: 'rgba(235,200,185,0.07)', text: '#d9c0b5', crosshair: '#8d6a5d' } },
];

export const DEFAULT_PRESET_ID = 'classic';

/** O que o estilo escreve nas definições, no modo pedido. */
export function presetPatch(p: ChartPreset, dark: boolean): { appearance: Partial<Appearance>; upColor: string; downColor: string } {
  const c = dark ? p.dark : p.light;
  const bg = c.background ?? (dark ? '#131722' : '#ffffff');
  const gradient = !!(c.up2 && c.down2);
  // vela que quase se confunde com o fundo (ex.: branca em papel claro) ganha contorno, para nunca ficar invisível
  const outline = c.text ?? (dark ? '#d1d4dc' : '#131722');
  const outlined = !!c.border || contrastOf(c.up, bg) < 2.2 || contrastOf(c.down, bg) < 2.2;
  // gradiente: contorno fino na cor de baixo, como nas velas de gradiente do TradingView
  const edgeUp = gradient ? c.up2! : outlined ? outline : null;
  const edgeDown = gradient ? c.down2! : outlined ? outline : null;
  return {
    upColor: c.up,
    downColor: c.down,
    appearance: {
      bodyUp: null,
      bodyDown: null,
      gradient,
      bodyUp2: gradient ? c.up2! : null,
      bodyDown2: gradient ? c.down2! : null,
      borderUp: edgeUp,
      borderDown: edgeDown,
      wickUp: edgeUp,
      wickDown: edgeDown,
      showBody: true,
      showBorder: outlined || gradient,
      background: c.background,
      background2: c.background2 ?? null,
      gridVert: c.grid,
      gridHorz: c.grid,
      textColor: c.text,
      crosshair: c.crosshair,
    },
  };
}
