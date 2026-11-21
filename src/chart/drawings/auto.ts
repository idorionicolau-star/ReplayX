import type { Drawing } from './types';

/** Cor "automática" dos desenhos: preto no tema claro e branco no escuro (acompanha o tema, em vez de ficar guardada). */
export const AUTO = 'auto';

export const autoColor = (dark: boolean): string => (dark ? '#ffffff' : '#000000');

/** Cores que antes eram o padrão dos desenhos: nos desenhos já guardados contam como "automático". */
const LEGACY_DEFAULTS = new Set(['#2962ff', '#ff9800', '#9c27b0']);

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parse(c: string): Rgb | null {
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16) };
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
  const f = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  return f ? { r: +f[1], g: +f[2], b: +f[3] } : null;
}

function lum({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: Rgb, b: Rgb): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contraste entre duas cores em texto (hex ou rgb); 21 se alguma não for reconhecida. */
export function contrastOf(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  return x && y ? contrast(x, y) : 21;
}

function toHsl({ r, g, b }: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const hex = ({ r, g, b }: Rgb) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

/** Mesma cor mais escura (delta < 0) ou mais clara (delta > 0): `delta` é a variação de luminosidade, de -1 a 1. */
export function shade(color: string, delta: number): string {
  const c = parse(color);
  if (!c) return color;
  const [h, s, l] = toHsl(c);
  return hex(fromHsl(h, s, Math.max(0, Math.min(1, l + delta))));
}

const MIN_CONTRAST = 3;

/**
 * Cor legível sobre o fundo `bg`: se a cor escolhida quase se confunde com o fundo, passa para a cor oposta
 * (cor complementar com a luminosidade invertida; preto/branco se for cinzenta). Cores legíveis ficam como estão.
 */
export function legible(color: string, bg: string, dark: boolean): string {
  if (color === AUTO || LEGACY_DEFAULTS.has(color.toLowerCase())) return autoColor(dark);
  const c = parse(color);
  const b = parse(bg);
  if (!c || !b || contrast(c, b) >= MIN_CONTRAST) return color;
  const [h, s, l] = toHsl(c);
  if (s < 0.15) return hex(contrast({ r: 255, g: 255, b: 255 }, b) > contrast({ r: 0, g: 0, b: 0 }, b) ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 });
  const opp = fromHsl((h + 180) % 360, s, 1 - l);
  if (contrast(opp, b) >= MIN_CONTRAST) return hex(opp);
  return autoColor(dark);
}

/** A cor a mostrar (amostras, legendas): a automática vira preto ou branco. */
export function shownColor(c: string, dark: boolean, bg?: string): string {
  return bg ? legible(c, bg, dark) : c === AUTO ? autoColor(dark) : c;
}

/** O desenho com as cores já adaptadas ao fundo e ao tema (automáticas, guardadas ou ilegíveis), para o desenhar. */
export function resolveAuto(d: Drawing, dark: boolean, bg: string): Drawing {
  const s = d.style;
  const color = legible(s.color, bg, dark);
  const textColor = s.textColor === undefined || d.type === 'note' ? s.textColor : legible(s.textColor, bg, dark);
  const fill = s.fill === AUTO ? autoColor(dark) : s.fill;
  if (color === s.color && textColor === s.textColor && fill === s.fill) return d;
  return { ...d, style: { ...s, color, ...(textColor !== undefined ? { textColor } : {}), ...(fill !== undefined ? { fill } : {}) } };
}
