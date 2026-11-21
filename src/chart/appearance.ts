import { contrastOf, shade } from './drawings/auto';

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
  /** Velas com gradiente: o corpo vai da cor de cima (bodyUp/bodyDown) à de baixo (bodyUp2/bodyDown2, null = automática: a mesma mais escura). */
  gradient: boolean;
  bodyUp2: string | null;
  bodyDown2: string | null;
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
  gradient: false,
  bodyUp2: null,
  bodyDown2: null,
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

const MIN_BODY_CONTRAST = 2.2;

/** Aparência completa com os automáticos resolvidos. Velas que se confundem com o fundo (cor escolhida à mão ou do estilo) ganham contorno visível. */
export function resolveAppearance(a: Appearance, dark: boolean, up: string, down: string) {
  const d = themeDefaults(dark);
  const background = a.background ?? d.background;
  const textColor = a.textColor ?? d.text;
  const bodyUp = a.bodyUp ?? up;
  const bodyDown = a.bodyDown ?? down;
  let borderUp = a.borderUp ?? bodyUp;
  let borderDown = a.borderDown ?? bodyDown;
  let wickUp = a.wickUp ?? bodyUp;
  let wickDown = a.wickDown ?? bodyDown;
  let showBorder = a.showBorder;
  const weak = (c: string) => contrastOf(c, background) < MIN_BODY_CONTRAST;
  // só se o corpo é visível por si (senão não há o que proteger) e a parte em causa também se confunde com o fundo
  if (a.showBody && weak(bodyUp)) {
    showBorder = true;
    if (weak(borderUp)) borderUp = textColor;
    if (weak(wickUp)) wickUp = textColor;
  }
  if (a.showBody && weak(bodyDown)) {
    showBorder = true;
    if (weak(borderDown)) borderDown = textColor;
    if (weak(wickDown)) wickDown = textColor;
  }
  return {
    ...a,
    showBorder,
    bodyUp,
    bodyDown,
    bodyUp2: a.bodyUp2 ?? shade(bodyUp, -0.22),
    bodyDown2: a.bodyDown2 ?? shade(bodyDown, -0.22),
    borderUp,
    borderDown,
    wickUp,
    wickDown,
    background,
    gridVert: a.gridVert ?? d.grid,
    gridHorz: a.gridHorz ?? d.grid,
    crosshair: a.crosshair ?? d.crosshair,
    textColor,
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
