/** Aparência do gráfico (como em "Definições do gráfico" do TradingView). `null` = automático (segue o tema). */
export type ScaleMode = 'normal' | 'log' | 'percent' | 'indexed';

export interface Appearance {
  // símbolo
  bodyUp: string | null;
  bodyDown: string | null;
  borderUp: string | null;
  borderDown: string | null;
  wickUp: string | null;
  wickDown: string | null;
  showBody: boolean;
  showBorder: boolean;
  showWick: boolean;
  /** Linha/área. */
  lineColor: string;
  lineWidth: 1 | 2 | 3 | 4;
  // canvas
  background: string | null;
  /** Segunda cor para fundo em gradiente (de cima para baixo); null = cor única. */
  background2: string | null;
  gridVert: string | null;
  gridHorz: string | null;
  gridVertVisible: boolean;
  gridHorzVisible: boolean;
  crosshair: string | null;
  /** 0 contínua, 1 pontilhada, 2 tracejada, 3 tracejado largo. */
  crosshairStyle: 0 | 1 | 2 | 3;
  textColor: string | null;
  fontSize: number;
  watermarkColor: string | null;
  // escalas
  scaleMode: ScaleMode;
  priceLine: boolean;
  lastValueLabel: boolean;
  /** Tempo até fechar a vela, debaixo do preço atual. */
  countdown: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  bodyUp: null,
  bodyDown: null,
  borderUp: null,
  borderDown: null,
  wickUp: null,
  wickDown: null,
  showBody: true,
  showBorder: false,
  showWick: true,
  lineColor: '#2962ff',
  lineWidth: 2,
  background: null,
  background2: null,
  gridVert: null,
  gridHorz: null,
  gridVertVisible: true,
  gridHorzVisible: true,
  crosshair: null,
  crosshairStyle: 2,
  textColor: null,
  fontSize: 12,
  watermarkColor: null,
  scaleMode: 'normal',
  priceLine: true,
  lastValueLabel: true,
  countdown: true,
};

/** Cores automáticas de cada tema. */
export function themeDefaults(dark: boolean) {
  return {
    background: dark ? '#131722' : '#ffffff',
    grid: dark ? 'rgba(42,46,57,0.6)' : 'rgba(224,227,235,0.7)',
    crosshair: dark ? '#758696' : '#9598a1',
    text: dark ? '#d1d4dc' : '#131722',
    border: dark ? '#2a2e39' : '#e0e3eb',
    watermark: 'rgba(120,123,134,0.10)',
  };
}

/** Aparência completa com os automáticos resolvidos. */
export function resolveAppearance(a: Appearance, dark: boolean, up: string, down: string) {
  const d = themeDefaults(dark);
  return {
    ...a,
    bodyUp: a.bodyUp ?? up,
    bodyDown: a.bodyDown ?? down,
    borderUp: a.borderUp ?? a.bodyUp ?? up,
    borderDown: a.borderDown ?? a.bodyDown ?? down,
    wickUp: a.wickUp ?? a.bodyUp ?? up,
    wickDown: a.wickDown ?? a.bodyDown ?? down,
    background: a.background ?? d.background,
    gridVert: a.gridVert ?? d.grid,
    gridHorz: a.gridHorz ?? d.grid,
    crosshair: a.crosshair ?? d.crosshair,
    textColor: a.textColor ?? d.text,
    watermarkColor: a.watermarkColor ?? d.watermark,
    border: d.border,
  };
}

export type ResolvedAppearance = ReturnType<typeof resolveAppearance>;

/** "mm:ss", "hh:mm:ss" ou "Nd hh:mm:ss" até ao fecho da vela. */
export function fmtCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(r)}`;
  if (h > 0) return `${p(h)}:${p(m)}:${p(r)}`;
  return `${p(m)}:${p(r)}`;
}
