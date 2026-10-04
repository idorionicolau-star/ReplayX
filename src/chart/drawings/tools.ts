import type { Bar, PricePoint } from '@/core/types';
import { DEFAULT_FIBEXT_LEVELS, DEFAULT_FIB_LEVELS, type Drawing, type DrawingStyle, type ToolId } from './types';
import { distToEllipse, distToPolyline, distToSegment, extendSegment, nearRectBorder, pointInPolygon, pointInRect, withAlpha, type Pt } from './geometry';
import { fmtDuration } from '@/lib/format';

export interface Viewport {
  width: number;
  height: number;
  timeToX(t: number): number | null;
  priceToY(p: number): number | null;
  fromXY(x: number, y: number): PricePoint | null;
  fmtPrice(p: number): string;
  barsBetween(t0: number, t1: number): number;
  tfSec: number;
  bars: readonly Bar[];
  dark: boolean;
  /** Fim do replay (para a ferramenta de posição mostrar o resultado até ao cursor). */
  cursor: number | null;
}

export interface Handle {
  id: number;
  x: number;
  y: number;
}

export type ToolGroup = 'cursor' | 'lines' | 'fib' | 'shapes' | 'text' | 'measure';

export interface ToolDef {
  id: ToolId;
  label: string;
  group: ToolGroup;
  shortcut?: string;
  /** Pontos a clicar; 0 = desenho livre (pincel), -1 = vários até duplo clique. */
  points: number;
  style: DrawingStyle;
  render(ctx: CanvasRenderingContext2D, d: Drawing, vp: Viewport, sel: boolean): void;
  hit(d: Drawing, vp: Viewport, p: Pt): boolean;
  handles(d: Drawing, vp: Viewport): Handle[];
  /** Arrasto de uma pega; por omissão move o ponto `id`. */
  drag?(d: Drawing, id: number, p: PricePoint, vp: Viewport): Partial<Drawing>;
  /** Inicialização depois de criado (ex.: stop/alvo da posição). */
  init?(d: Drawing, vp: Viewport): Drawing;
  /** Preços/tempos a destacar nos eixos quando selecionado. */
  axis?(d: Drawing): { prices: number[]; times: number[] };
}

const BLUE = '#2962ff';
const TOL = 6;

// ---------- utilitários de desenho ----------

function xy(d: Drawing, i: number, vp: Viewport): Pt | null {
  const p = d.points[i];
  if (!p) return null;
  const x = vp.timeToX(p.time);
  const y = vp.priceToY(p.price);
  if (x === null || y === null) return null;
  return { x, y };
}

function allXY(d: Drawing, vp: Viewport): Pt[] | null {
  const out: Pt[] = [];
  for (let i = 0; i < d.points.length; i++) {
    const p = xy(d, i, vp);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

function stroke(ctx: CanvasRenderingContext2D, s: DrawingStyle, sel = false) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width + (sel ? 0.5 : 0);
  ctx.setLineDash(s.dash === 1 ? [6, 4] : s.dash === 2 ? [2, 3] : []);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, size: number, color: string) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - 0.45), to.y - size * Math.sin(ang - 0.45));
  ctx.lineTo(to.x - size * Math.cos(ang + 0.45), to.y - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function labelBox(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  opts: { bg: string; fg: string; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; font?: string; pad?: number; radius?: number; border?: string },
): { x: number; y: number; w: number; h: number } {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = opts.font ?? '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
  const pad = opts.pad ?? 6;
  const lh = parseInt(/(\d+)px/.exec(ctx.font)?.[1] ?? '12', 10) + 4;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const h = lines.length * lh + pad * 2 - 4;
  let bx = x;
  if (opts.align === 'center' || opts.align === undefined) bx = x - w / 2;
  else if (opts.align === 'right') bx = x - w;
  let by = y;
  if (opts.valign === 'middle' || opts.valign === undefined) by = y - h / 2;
  else if (opts.valign === 'bottom') by = y - h;
  ctx.fillStyle = opts.bg;
  const r = opts.radius ?? 4;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, r);
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = opts.fg;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + i * lh));
  ctx.restore();
  return { x: bx, y: by, w, h };
}

function textSize(ctx: CanvasRenderingContext2D, text: string, font: string) {
  ctx.save();
  ctx.font = font;
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { w, lines };
}

function fontOf(s: DrawingStyle) {
  return `${s.bold ? '600 ' : ''}${s.fontSize ?? 14}px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif`;
}

const measureCtx = (): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  return c.getContext('2d');
};
let _mctx: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!_mctx) _mctx = measureCtx();
  return _mctx;
}

function textBounds(d: Drawing, p: Pt): { x: number; y: number; w: number; h: number } {
  const s = d.style;
  const size = s.fontSize ?? 14;
  const ctx = mctx();
  const lines = (s.text || 'Texto').split('\n');
  const w = ctx ? textSize(ctx, s.text || 'Texto', fontOf(s)).w : lines.reduce((a, l) => Math.max(a, l.length * size * 0.55), 0);
  return { x: p.x, y: p.y - size - 4, w: w + 8, h: lines.length * (size + 4) + 4 };
}

const pctChange = (a: number, b: number) => (a ? ((b - a) / a) * 100 : 0);

function defaultHandles(d: Drawing, vp: Viewport): Handle[] {
  const pts = allXY(d, vp);
  return pts ? pts.map((p, id) => ({ id, ...p })) : [];
}

// ---------- linhas ----------

function trendFamily(id: ToolId, label: string, extras: Partial<DrawingStyle>, opts: { arrow?: boolean; info?: boolean } = {}): ToolDef {
  return {
    id,
    label,
    group: 'lines',
    points: 2,
    style: { color: BLUE, width: 2, dash: 0, ...extras },
    render(ctx, d, vp, sel) {
      const pts = allXY(d, vp);
      if (!pts || pts.length < 2) return;
      const [a, b] = pts;
      const [s, e] = extendSegment(a, b, vp.width, vp.height, !!d.style.extendLeft, !!d.style.extendRight);
      stroke(ctx, d.style, sel);
      line(ctx, s, e);
      if (opts.arrow) arrowHead(ctx, a, b, 8 + d.style.width * 2, d.style.color);
      if (opts.info || d.style.showLabel) {
        const p0 = d.points[0];
        const p1 = d.points[1];
        const diff = p1.price - p0.price;
        const bars = vp.barsBetween(p0.time, p1.time);
        const angle = (Math.atan2(a.y - b.y, b.x - a.x) * 180) / Math.PI;
        labelBox(
          ctx,
          [
            `${diff >= 0 ? '+' : ''}${vp.fmtPrice(diff)} (${pctChange(p0.price, p1.price).toFixed(2)}%)`,
            `${Math.round(bars)} barras, ${fmtDuration(Math.abs(p1.time - p0.time))}`,
            `∠ ${angle.toFixed(1)}°`,
          ],
          b.x + 10,
          b.y,
          { bg: vp.dark ? 'rgba(30,34,45,0.92)' : 'rgba(255,255,255,0.95)', fg: vp.dark ? '#d1d4dc' : '#131722', align: 'left', valign: 'middle', border: d.style.color },
        );
      }
      if (d.style.text) {
        ctx.save();
        ctx.font = fontOf({ ...d.style, fontSize: d.style.fontSize ?? 13 });
        ctx.fillStyle = d.style.textColor ?? d.style.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.translate(mx, my);
        let ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        ctx.rotate(ang);
        ctx.fillText(d.style.text, 0, -4);
        ctx.restore();
      }
    },
    hit(d, vp, p) {
      const pts = allXY(d, vp);
      if (!pts || pts.length < 2) return false;
      const [s, e] = extendSegment(pts[0], pts[1], vp.width, vp.height, !!d.style.extendLeft, !!d.style.extendRight);
      return distToSegment(p, s, e) < TOL;
    },
    handles: defaultHandles,
    axis: (d) => ({ prices: d.points.map((p) => p.price), times: d.points.map((p) => p.time) }),
  };
}

const hline: ToolDef = {
  id: 'hline',
  label: 'Linha horizontal',
  group: 'lines',
  shortcut: 'Alt+H',
  points: 1,
  style: { color: BLUE, width: 1, dash: 0, showLabel: true },
  render(ctx, d, vp, sel) {
    const y = vp.priceToY(d.points[0].price);
    if (y === null) return;
    stroke(ctx, d.style, sel);
    line(ctx, { x: 0, y }, { x: vp.width, y });
    if (d.style.text) {
      ctx.save();
      ctx.font = fontOf({ ...d.style, fontSize: d.style.fontSize ?? 12 });
      ctx.fillStyle = d.style.textColor ?? d.style.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(d.style.text, vp.width - 8, y - 3);
      ctx.restore();
    }
  },
  hit(d, vp, p) {
    const y = vp.priceToY(d.points[0].price);
    return y !== null && Math.abs(p.y - y) < TOL;
  },
  handles(d, vp) {
    const y = vp.priceToY(d.points[0].price);
    const x = vp.timeToX(d.points[0].time);
    if (y === null) return [];
    return [{ id: 0, x: x !== null && x > 0 && x < vp.width ? x : vp.width / 2, y }];
  },
  drag: (d, _id, p) => ({ points: [{ time: p.time, price: p.price }] }),
  axis: (d) => ({ prices: [d.points[0].price], times: [] }),
};

const hray: ToolDef = {
  id: 'hray',
  label: 'Raio horizontal',
  group: 'lines',
  points: 1,
  style: { color: BLUE, width: 1, dash: 0 },
  render(ctx, d, vp, sel) {
    const p = xy(d, 0, vp);
    if (!p) return;
    stroke(ctx, d.style, sel);
    line(ctx, p, { x: vp.width + 10, y: p.y });
    if (d.style.text) {
      ctx.save();
      ctx.font = fontOf({ ...d.style, fontSize: d.style.fontSize ?? 12 });
      ctx.fillStyle = d.style.textColor ?? d.style.color;
      ctx.textBaseline = 'bottom';
      ctx.fillText(d.style.text, p.x + 6, p.y - 3);
      ctx.restore();
    }
  },
  hit(d, vp, p) {
    const a = xy(d, 0, vp);
    return !!a && p.x >= a.x - TOL && Math.abs(p.y - a.y) < TOL;
  },
  handles: defaultHandles,
  axis: (d) => ({ prices: [d.points[0].price], times: [] }),
};

const vline: ToolDef = {
  id: 'vline',
  label: 'Linha vertical',
  group: 'lines',
  shortcut: 'Alt+V',
  points: 1,
  style: { color: BLUE, width: 1, dash: 0 },
  render(ctx, d, vp, sel) {
    const x = vp.timeToX(d.points[0].time);
    if (x === null) return;
    stroke(ctx, d.style, sel);
    line(ctx, { x, y: 0 }, { x, y: vp.height });
    if (d.style.text) {
      ctx.save();
      ctx.font = fontOf({ ...d.style, fontSize: d.style.fontSize ?? 12 });
      ctx.fillStyle = d.style.textColor ?? d.style.color;
      ctx.translate(x - 4, vp.height - 10);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(d.style.text, 0, 0);
      ctx.restore();
    }
  },
  hit(d, vp, p) {
    const x = vp.timeToX(d.points[0].time);
    return x !== null && Math.abs(p.x - x) < TOL;
  },
  handles(d, vp) {
    const x = vp.timeToX(d.points[0].time);
    const y = vp.priceToY(d.points[0].price);
    return x === null ? [] : [{ id: 0, x, y: y !== null && y > 0 && y < vp.height ? y : vp.height / 2 }];
  },
  axis: (d) => ({ prices: [], times: [d.points[0].time] }),
};

const crossline: ToolDef = {
  id: 'crossline',
  label: 'Linha cruzada',
  group: 'lines',
  points: 1,
  style: { color: BLUE, width: 1, dash: 0 },
  render(ctx, d, vp, sel) {
    const p = xy(d, 0, vp);
    if (!p) return;
    stroke(ctx, d.style, sel);
    line(ctx, { x: 0, y: p.y }, { x: vp.width, y: p.y });
    line(ctx, { x: p.x, y: 0 }, { x: p.x, y: vp.height });
  },
  hit(d, vp, p) {
    const a = xy(d, 0, vp);
    return !!a && (Math.abs(p.x - a.x) < TOL || Math.abs(p.y - a.y) < TOL);
  },
  handles: defaultHandles,
  axis: (d) => ({ prices: [d.points[0].price], times: [d.points[0].time] }),
};

const channel: ToolDef = {
  id: 'channel',
  label: 'Canal paralelo',
  group: 'lines',
  points: 3,
  style: { color: BLUE, width: 2, dash: 0, fill: 'rgba(41,98,255,0.08)', extendRight: false },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    const [a, b] = pts;
    const off = pts[2] ? pts[2].y - (a.y + ((pts[2].x - a.x) * (b.y - a.y)) / (b.x - a.x || 1)) : 0;
    const a2 = { x: a.x, y: a.y + off };
    const b2 = { x: b.x, y: b.y + off };
    const [s1, e1] = extendSegment(a, b, vp.width, vp.height, !!d.style.extendLeft, !!d.style.extendRight);
    const [s2, e2] = extendSegment(a2, b2, vp.width, vp.height, !!d.style.extendLeft, !!d.style.extendRight);
    if (d.style.fill && pts[2]) {
      ctx.fillStyle = d.style.fill;
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(e1.x, e1.y);
      ctx.lineTo(e2.x, e2.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.closePath();
      ctx.fill();
    }
    stroke(ctx, d.style, sel);
    line(ctx, s1, e1);
    if (pts[2]) {
      line(ctx, s2, e2);
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      line(ctx, { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 }, { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 });
      ctx.restore();
    }
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return false;
    const [a, b] = pts;
    const off = pts[2] ? pts[2].y - (a.y + ((pts[2].x - a.x) * (b.y - a.y)) / (b.x - a.x || 1)) : 0;
    const a2 = { x: a.x, y: a.y + off };
    const b2 = { x: b.x, y: b.y + off };
    return distToSegment(p, a, b) < TOL || distToSegment(p, a2, b2) < TOL || pointInPolygon(p, [a, b, b2, a2]);
  },
  handles(d, vp) {
    const pts = allXY(d, vp);
    if (!pts) return [];
    return pts.map((p, id) => ({ id, ...p }));
  },
  axis: (d) => ({ prices: d.points.slice(0, 2).map((p) => p.price), times: d.points.slice(0, 2).map((p) => p.time) }),
};

// ---------- Fibonacci / Gann ----------

const fib: ToolDef = {
  id: 'fib',
  label: 'Retração de Fibonacci',
  group: 'fib',
  shortcut: 'Alt+F',
  points: 2,
  style: { color: '#787b86', width: 1, dash: 0, levels: DEFAULT_FIB_LEVELS, extendRight: false, showLabel: true, fill: 'on' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    const [a, b] = pts;
    const p0 = d.points[0].price;
    const p1 = d.points[1].price;
    const x0 = Math.min(a.x, b.x);
    const x1 = d.style.extendRight ? vp.width : Math.max(a.x, b.x);
    const levels = (d.style.levels ?? DEFAULT_FIB_LEVELS).filter((l) => l.visible).sort((m, n) => m.value - n.value);
    const ys = levels.map((l) => vp.priceToY(p1 + (p0 - p1) * l.value));
    if (d.style.fill) {
      for (let i = 1; i < levels.length; i++) {
        const ya = ys[i - 1];
        const yb = ys[i];
        if (ya === null || yb === null) continue;
        ctx.fillStyle = withAlpha(levels[i].color, 0.09);
        ctx.fillRect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya));
      }
    }
    levels.forEach((l, i) => {
      const y = ys[i];
      if (y === null) return;
      stroke(ctx, { ...d.style, color: l.color }, sel);
      line(ctx, { x: x0, y }, { x: x1, y });
      if (d.style.showLabel !== false) {
        ctx.save();
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        ctx.fillStyle = l.color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${l.value} (${vp.fmtPrice(p1 + (p0 - p1) * l.value)})`, x0 - 4, y);
        ctx.restore();
      }
    });
    ctx.save();
    stroke(ctx, { ...d.style, dash: 1 }, false);
    ctx.globalAlpha = 0.7;
    line(ctx, a, b);
    ctx.restore();
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return false;
    const [a, b] = pts;
    const x1 = d.style.extendRight ? vp.width : Math.max(a.x, b.x);
    if (p.x < Math.min(a.x, b.x) - TOL || p.x > x1 + TOL) return false;
    const p0 = d.points[0].price;
    const p1 = d.points[1].price;
    return (d.style.levels ?? DEFAULT_FIB_LEVELS).some((l) => {
      if (!l.visible) return false;
      const y = vp.priceToY(p1 + (p0 - p1) * l.value);
      return y !== null && Math.abs(p.y - y) < TOL;
    }) || distToSegment(p, a, b) < TOL;
  },
  handles: defaultHandles,
  axis: (d) => ({ prices: d.points.map((p) => p.price), times: d.points.map((p) => p.time) }),
};

const fibext: ToolDef = {
  id: 'fibext',
  label: 'Extensão de Fibonacci',
  group: 'fib',
  points: 3,
  style: { color: '#787b86', width: 1, dash: 0, levels: DEFAULT_FIBEXT_LEVELS, showLabel: true, fill: 'on' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    stroke(ctx, { ...d.style, dash: 1 }, false);
    line(ctx, pts[0], pts[1]);
    if (pts.length < 3) return;
    line(ctx, pts[1], pts[2]);
    const move = d.points[1].price - d.points[0].price;
    const base = d.points[2].price;
    const x0 = pts[2].x;
    const x1 = d.style.extendRight ? vp.width : Math.max(pts[2].x + Math.abs(pts[1].x - pts[0].x), pts[2].x + 60);
    const levels = (d.style.levels ?? DEFAULT_FIBEXT_LEVELS).filter((l) => l.visible).sort((m, n) => m.value - n.value);
    const ys = levels.map((l) => vp.priceToY(base + move * l.value));
    if (d.style.fill) {
      for (let i = 1; i < levels.length; i++) {
        const ya = ys[i - 1];
        const yb = ys[i];
        if (ya === null || yb === null) continue;
        ctx.fillStyle = withAlpha(levels[i].color, 0.09);
        ctx.fillRect(x0, Math.min(ya, yb), x1 - x0, Math.abs(yb - ya));
      }
    }
    levels.forEach((l, i) => {
      const y = ys[i];
      if (y === null) return;
      stroke(ctx, { ...d.style, color: l.color }, sel);
      line(ctx, { x: x0, y }, { x: x1, y });
      ctx.save();
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      ctx.fillStyle = l.color;
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${l.value} (${vp.fmtPrice(base + move * l.value)})`, x0 + 4, y - 2);
      ctx.restore();
    });
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 3) return false;
    if (distToSegment(p, pts[0], pts[1]) < TOL || distToSegment(p, pts[1], pts[2]) < TOL) return true;
    const move = d.points[1].price - d.points[0].price;
    const x1 = d.style.extendRight ? vp.width : Math.max(pts[2].x + Math.abs(pts[1].x - pts[0].x), pts[2].x + 60);
    if (p.x < pts[2].x || p.x > x1) return false;
    return (d.style.levels ?? DEFAULT_FIBEXT_LEVELS).some((l) => {
      const y = vp.priceToY(d.points[2].price + move * l.value);
      return l.visible && y !== null && Math.abs(p.y - y) < TOL;
    });
  },
  handles: defaultHandles,
};

const pitchfork: ToolDef = {
  id: 'pitchfork',
  label: 'Forquilha de Andrews',
  group: 'fib',
  points: 3,
  style: { color: '#ff9800', width: 1, dash: 0, fill: 'rgba(255,152,0,0.07)' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    stroke(ctx, d.style, sel);
    if (pts.length < 3) {
      line(ctx, pts[0], pts[1]);
      return;
    }
    const [a, b, c] = pts;
    const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const dx = m.x - a.x;
    const dy = m.y - a.y;
    const [, me] = extendSegment(a, m, vp.width, vp.height, false, true);
    const [, be] = extendSegment(b, { x: b.x + dx, y: b.y + dy }, vp.width, vp.height, false, true);
    const [, ce] = extendSegment(c, { x: c.x + dx, y: c.y + dy }, vp.width, vp.height, false, true);
    if (d.style.fill) {
      ctx.fillStyle = d.style.fill;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(be.x, be.y);
      ctx.lineTo(ce.x, ce.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fill();
    }
    line(ctx, a, me);
    line(ctx, b, be);
    line(ctx, c, ce);
    line(ctx, b, c);
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 3) return false;
    const [a, b, c] = pts;
    const m = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const dx = m.x - a.x;
    const dy = m.y - a.y;
    const [, me] = extendSegment(a, m, vp.width, vp.height, false, true);
    const [, be] = extendSegment(b, { x: b.x + dx, y: b.y + dy }, vp.width, vp.height, false, true);
    const [, ce] = extendSegment(c, { x: c.x + dx, y: c.y + dy }, vp.width, vp.height, false, true);
    return distToSegment(p, a, me) < TOL || distToSegment(p, b, be) < TOL || distToSegment(p, c, ce) < TOL || distToSegment(p, b, c) < TOL;
  },
  handles: defaultHandles,
};

// ---------- formas ----------

const rect: ToolDef = {
  id: 'rect',
  label: 'Retângulo',
  group: 'shapes',
  shortcut: 'Alt+Shift+R',
  points: 2,
  style: { color: '#9c27b0', width: 1, dash: 0, fill: 'rgba(156,39,176,0.15)' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    const [a, b] = pts;
    const x1 = d.style.extendRight ? vp.width : b.x;
    if (d.style.fill) {
      ctx.fillStyle = d.style.fill;
      ctx.fillRect(Math.min(a.x, x1), Math.min(a.y, b.y), Math.abs(x1 - a.x), Math.abs(b.y - a.y));
    }
    stroke(ctx, d.style, sel);
    ctx.strokeRect(Math.min(a.x, x1), Math.min(a.y, b.y), Math.abs(x1 - a.x), Math.abs(b.y - a.y));
    if (d.style.text) {
      ctx.save();
      ctx.font = fontOf({ ...d.style, fontSize: d.style.fontSize ?? 12 });
      ctx.fillStyle = d.style.textColor ?? d.style.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.style.text, (a.x + x1) / 2, (a.y + b.y) / 2);
      ctx.restore();
    }
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return false;
    const b = { x: d.style.extendRight ? vp.width : pts[1].x, y: pts[1].y };
    return d.style.fill ? pointInRect(p, pts[0], b, 3) : nearRectBorder(p, pts[0], b, TOL);
  },
  handles(d, vp) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return [];
    const [a, b] = pts;
    return [
      { id: 0, ...a },
      { id: 1, ...b },
      { id: 2, x: a.x, y: b.y },
      { id: 3, x: b.x, y: a.y },
    ];
  },
  drag(d, id, p) {
    const [p0, p1] = d.points;
    if (id === 0) return { points: [p, p1] };
    if (id === 1) return { points: [p0, p] };
    if (id === 2) return { points: [{ time: p.time, price: p0.price }, { time: p1.time, price: p.price }] };
    return { points: [{ time: p0.time, price: p.price }, { time: p.time, price: p1.price }] };
  },
  axis: (d) => ({ prices: d.points.map((p) => p.price), times: d.points.map((p) => p.time) }),
};

const ellipse: ToolDef = {
  id: 'ellipse',
  label: 'Elipse',
  group: 'shapes',
  points: 2,
  style: { color: '#ff9800', width: 1, dash: 0, fill: 'rgba(255,152,0,0.12)' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    const [a, b] = pts;
    ctx.beginPath();
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    if (d.style.fill) {
      ctx.fillStyle = d.style.fill;
      ctx.fill();
    }
    stroke(ctx, d.style, sel);
    ctx.stroke();
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return false;
    const r = distToEllipse(p, pts[0], pts[1]);
    return r.border < TOL || (!!d.style.fill && r.inside);
  },
  handles: defaultHandles,
};

const triangle: ToolDef = {
  id: 'triangle',
  label: 'Triângulo',
  group: 'shapes',
  points: 3,
  style: { color: '#089981', width: 1, dash: 0, fill: 'rgba(8,153,129,0.12)' },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    if (d.style.fill && pts.length === 3) {
      ctx.fillStyle = d.style.fill;
      ctx.fill();
    }
    stroke(ctx, d.style, sel);
    ctx.stroke();
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 3) return false;
    return distToPolyline(p, [...pts, pts[0]]) < TOL || (!!d.style.fill && pointInPolygon(p, pts));
  },
  handles: defaultHandles,
};

const path: ToolDef = {
  id: 'path',
  label: 'Caminho',
  group: 'shapes',
  points: -1,
  style: { color: BLUE, width: 2, dash: 0 },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    stroke(ctx, d.style, sel);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    arrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], 8 + d.style.width * 2, d.style.color);
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    return !!pts && distToPolyline(p, pts) < TOL;
  },
  handles: defaultHandles,
};

const brush: ToolDef = {
  id: 'brush',
  label: 'Pincel',
  group: 'shapes',
  points: 0,
  style: { color: '#f23645', width: 2, dash: 0 },
  render(ctx, d, vp, sel) {
    const pts = allXY(d, vp);
    if (!pts || pts.length < 2) return;
    stroke(ctx, { ...d.style, dash: 0 }, sel);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  },
  hit(d, vp, p) {
    const pts = allXY(d, vp);
    return !!pts && distToPolyline(p, pts) < TOL + d.style.width;
  },
  handles(d, vp) {
    const pts = allXY(d, vp);
    if (!pts || !pts.length) return [];
    return [{ id: 0, ...pts[0] }, { id: pts.length - 1, ...pts[pts.length - 1] }];
  },
  drag(d, id, p, vp) {
    // arrastar uma ponta desloca o traço inteiro
    const ref = d.points[id];
    const dt = p.time - ref.time;
    const dp = p.price - ref.price;
    void vp;
    return { points: d.points.map((q) => ({ time: q.time + dt, price: q.price + dp })) };
  },
};

// ---------- texto e marcas ----------

const text: ToolDef = {
  id: 'text',
  label: 'Texto',
  group: 'text',
  shortcut: 'Alt+T',
  points: 1,
  style: { color: BLUE, width: 1, dash: 0, text: 'Texto', textColor: '#2962ff', fontSize: 14 },
  render(ctx, d, vp, sel) {
    const p = xy(d, 0, vp);
    if (!p) return;
    const b = textBounds(d, p);
    ctx.save();
    if (d.style.fill) {
      ctx.fillStyle = d.style.fill;
      ctx.fillRect(b.x - 4, b.y, b.w, b.h);
    }
    ctx.font = fontOf(d.style);
    ctx.fillStyle = d.style.textColor ?? d.style.color;
    ctx.textBaseline = 'top';
    (d.style.text || 'Texto').split('\n').forEach((l, i) => ctx.fillText(l, p.x, b.y + 2 + i * ((d.style.fontSize ?? 14) + 4)));
    if (sel) {
      ctx.strokeStyle = BLUE;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(b.x - 4, b.y, b.w, b.h);
    }
    ctx.restore();
  },
  hit(d, vp, p) {
    const a = xy(d, 0, vp);
    if (!a) return false;
    const b = textBounds(d, a);
    return p.x >= b.x - 6 && p.x <= b.x + b.w && p.y >= b.y - 2 && p.y <= b.y + b.h + 2;
  },
  handles: () => [],
};

const note: ToolDef = {
  id: 'note',
  label: 'Nota (balão)',
  group: 'text',
  points: 1,
  style: { color: '#2962ff', width: 1, dash: 0, text: 'Nota', textColor: '#ffffff', fontSize: 13, fill: '#2962ff' },
  render(ctx, d, vp, sel) {
    const p = xy(d, 0, vp);
    if (!p) return;
    const lines = (d.style.text || 'Nota').split('\n');
    ctx.save();
    stroke(ctx, { ...d.style, dash: 0 }, sel);
    line(ctx, p, { x: p.x, y: p.y - 22 });
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    labelBox(ctx, lines, p.x, p.y - 22, { bg: d.style.fill ?? d.style.color, fg: d.style.textColor ?? '#fff', align: 'center', valign: 'bottom', font: fontOf(d.style), border: sel ? '#ffffff' : undefined });
    ctx.restore();
  },
  hit(d, vp, p) {
    const a = xy(d, 0, vp);
    if (!a) return false;
    const size = d.style.fontSize ?? 13;
    const lines = (d.style.text || 'Nota').split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * size * 0.6 + 16;
    const h = lines.length * (size + 4) + 12;
    return (p.x >= a.x - w / 2 && p.x <= a.x + w / 2 && p.y >= a.y - 22 - h && p.y <= a.y) || Math.hypot(p.x - a.x, p.y - a.y) < TOL;
  },
  handles: defaultHandles,
};

const pricelabel: ToolDef = {
  id: 'pricelabel',
  label: 'Etiqueta de preço',
  group: 'text',
  points: 1,
  style: { color: '#2962ff', width: 1, dash: 0 },
  render(ctx, d, vp, sel) {
    const p = xy(d, 0, vp);
    if (!p) return;
    ctx.save();
    ctx.fillStyle = d.style.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    labelBox(ctx, [vp.fmtPrice(d.points[0].price)], p.x + 8, p.y - 8, { bg: d.style.color, fg: '#fff', align: 'left', valign: 'bottom', border: sel ? '#fff' : undefined });
    ctx.restore();
  },
  hit(d, vp, p) {
    const a = xy(d, 0, vp);
    return !!a && p.x >= a.x - TOL && p.x <= a.x + 90 && p.y >= a.y - 32 && p.y <= a.y + TOL;
  },
  handles: defaultHandles,
};

function arrowMark(id: 'arrowup' | 'arrowdown'): ToolDef {
  const up = id === 'arrowup';
  return {
    id,
    label: up ? 'Seta para cima' : 'Seta para baixo',
    group: 'text',
    points: 1,
    style: { color: up ? '#089981' : '#f23645', width: 1, dash: 0, text: '' },
    render(ctx, d, vp, sel) {
      const p = xy(d, 0, vp);
      if (!p) return;
      const s = 10;
      ctx.save();
      ctx.fillStyle = d.style.color;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - s, p.y + s);
        ctx.lineTo(p.x - s / 2.5, p.y + s);
        ctx.lineTo(p.x - s / 2.5, p.y + s * 2.2);
        ctx.lineTo(p.x + s / 2.5, p.y + s * 2.2);
        ctx.lineTo(p.x + s / 2.5, p.y + s);
        ctx.lineTo(p.x + s, p.y + s);
      } else {
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - s, p.y - s);
        ctx.lineTo(p.x - s / 2.5, p.y - s);
        ctx.lineTo(p.x - s / 2.5, p.y - s * 2.2);
        ctx.lineTo(p.x + s / 2.5, p.y - s * 2.2);
        ctx.lineTo(p.x + s / 2.5, p.y - s);
        ctx.lineTo(p.x + s, p.y - s);
      }
      ctx.closePath();
      ctx.fill();
      if (sel) {
        ctx.strokeStyle = BLUE;
        ctx.stroke();
      }
      if (d.style.text) {
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = up ? 'top' : 'bottom';
        ctx.fillText(d.style.text, p.x, up ? p.y + s * 2.2 + 3 : p.y - s * 2.2 - 3);
      }
      ctx.restore();
    },
    hit(d, vp, p) {
      const a = xy(d, 0, vp);
      if (!a) return false;
      return Math.abs(p.x - a.x) < 12 && (up ? p.y >= a.y - 3 && p.y <= a.y + 25 : p.y <= a.y + 3 && p.y >= a.y - 25);
    },
    handles: () => [],
  };
}

// ---------- posição (risco/retorno) ----------

function positionTool(id: 'long' | 'short'): ToolDef {
  const long = id === 'long';
  const d0 = long ? 1 : -1;
  return {
    id,
    label: long ? 'Posição longa' : 'Posição curta',
    group: 'measure',
    points: 1,
    style: { color: long ? '#089981' : '#f23645', width: 1, dash: 0 },
    init(d, vp) {
      const entry = d.points[0].price;
      // distância do stop: 1,5x a amplitude média recente (ou 1% do preço)
      const recent = vp.bars.slice(-15);
      const avgRange = recent.length ? recent.reduce((a, b) => a + (b.high - b.low), 0) / recent.length : entry * 0.01;
      const dist = avgRange * 1.5 || entry * 0.01;
      const right = d.points[0].time + vp.tfSec * 25;
      return {
        ...d,
        points: [d.points[0], { time: right, price: entry }],
        data: { stop: entry - d0 * dist, target: entry + d0 * dist * 2, riskPct: 1, account: d.data?.account ?? 10000 },
      };
    },
    render(ctx, d, vp, sel) {
      const data = d.data;
      if (!data || d.points.length < 2) return;
      const x0 = vp.timeToX(d.points[0].time);
      const x1 = vp.timeToX(d.points[1].time);
      const ye = vp.priceToY(d.points[0].price);
      const ys = vp.priceToY(data.stop);
      const yt = vp.priceToY(data.target);
      if (x0 === null || x1 === null || ye === null || ys === null || yt === null) return;
      const left = Math.min(x0, x1);
      const w = Math.max(4, Math.abs(x1 - x0));
      const entry = d.points[0].price;
      ctx.save();
      ctx.fillStyle = 'rgba(8,153,129,0.18)';
      ctx.fillRect(left, Math.min(ye, yt), w, Math.abs(yt - ye));
      ctx.fillStyle = 'rgba(242,54,69,0.18)';
      ctx.fillRect(left, Math.min(ye, ys), w, Math.abs(ys - ye));

      // resultado até ao cursor/última barra
      const endT = Math.max(d.points[0].time, d.points[1].time);
      const bars = vp.bars.filter((b) => b.time >= d.points[0].time && b.time <= endT);
      let outcome: 'tp' | 'sl' | null = null;
      let lastPrice = entry;
      let lastTime = d.points[0].time;
      for (const b of bars) {
        lastTime = b.time;
        const hitT = long ? b.high >= data.target : b.low <= data.target;
        const hitS = long ? b.low <= data.stop : b.high >= data.stop;
        if (hitS) {
          outcome = 'sl';
          lastPrice = data.stop;
          break;
        }
        if (hitT) {
          outcome = 'tp';
          lastPrice = data.target;
          break;
        }
        lastPrice = b.close;
      }
      if (bars.length) {
        const xl = vp.timeToX(lastTime);
        const yl = vp.priceToY(lastPrice);
        if (xl !== null && yl !== null) {
          ctx.fillStyle = outcome === 'tp' ? 'rgba(8,153,129,0.28)' : outcome === 'sl' ? 'rgba(242,54,69,0.28)' : 'rgba(120,123,134,0.22)';
          ctx.fillRect(left, Math.min(ye, yl), Math.max(0, Math.min(xl, left + w) - left), Math.abs(yl - ye));
          ctx.strokeStyle = '#787b86';
          ctx.setLineDash([4, 3]);
          line(ctx, { x: left, y: ye }, { x: Math.min(xl, left + w), y: yl });
        }
      }

      ctx.setLineDash([]);
      ctx.strokeStyle = '#787b86';
      ctx.lineWidth = 1;
      line(ctx, { x: left, y: ye }, { x: left + w, y: ye });

      const risk = Math.abs(entry - data.stop);
      const reward = Math.abs(data.target - entry);
      const rr = risk ? reward / risk : 0;
      const riskAmt = (data.account * data.riskPct) / 100;
      const qty = risk ? riskAmt / risk : 0;
      const fg = '#ffffff';
      const font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      if (sel || w > 70) {
        labelBox(ctx, [`Alvo: ${vp.fmtPrice(data.target)} (${pctChange(entry, data.target).toFixed(2)}%) +${(riskAmt * rr).toFixed(2)}`], left + w / 2, long ? Math.min(yt, ye) - 4 : Math.max(yt, ye) + 4, { bg: '#089981', fg, valign: long ? 'bottom' : 'top', font });
        labelBox(ctx, [`Stop: ${vp.fmtPrice(data.stop)} (${pctChange(entry, data.stop).toFixed(2)}%) -${riskAmt.toFixed(2)}`], left + w / 2, long ? Math.max(ys, ye) + 4 : Math.min(ys, ye) - 4, { bg: '#f23645', fg, valign: long ? 'top' : 'bottom', font });
        labelBox(
          ctx,
          [`${outcome === 'tp' ? '✔ Alvo atingido · ' : outcome === 'sl' ? '✖ Stop atingido · ' : ''}R:R ${rr.toFixed(2)} · Qtd ${qty >= 100 ? qty.toFixed(0) : qty.toFixed(3)}`],
          left + w / 2,
          ye,
          { bg: long ? 'rgba(8,153,129,0.95)' : 'rgba(242,54,69,0.95)', fg, font },
        );
      }
      ctx.restore();
    },
    hit(d, vp, p) {
      const data = d.data;
      if (!data || d.points.length < 2) return false;
      const x0 = vp.timeToX(d.points[0].time);
      const x1 = vp.timeToX(d.points[1].time);
      const ys = vp.priceToY(data.stop);
      const yt = vp.priceToY(data.target);
      if (x0 === null || x1 === null || ys === null || yt === null) return false;
      return pointInRect(p, { x: x0, y: ys }, { x: x1, y: yt }, 2);
    },
    handles(d, vp) {
      const data = d.data;
      if (!data || d.points.length < 2) return [];
      const x0 = vp.timeToX(d.points[0].time);
      const x1 = vp.timeToX(d.points[1].time);
      const ye = vp.priceToY(d.points[0].price);
      const ys = vp.priceToY(data.stop);
      const yt = vp.priceToY(data.target);
      if (x0 === null || x1 === null || ye === null || ys === null || yt === null) return [];
      return [
        { id: 0, x: x0, y: ye },
        { id: 1, x: x1, y: ye },
        { id: 2, x: x0, y: ys },
        { id: 3, x: x0, y: yt },
      ];
    },
    drag(d, id, p) {
      const data = d.data!;
      const entry = d.points[0].price;
      if (id === 0) {
        const dp = p.price - entry;
        const width = d.points[1].time - d.points[0].time;
        return { points: [p, { time: p.time + width, price: p.price }], data: { ...data, stop: data.stop + dp, target: data.target + dp } };
      }
      if (id === 1) return { points: [d.points[0], { time: Math.max(p.time, d.points[0].time), price: entry }] };
      if (id === 2) return { data: { ...data, stop: long ? Math.min(p.price, entry) : Math.max(p.price, entry) } };
      return { data: { ...data, target: long ? Math.max(p.price, entry) : Math.min(p.price, entry) } };
    },
    axis: (d) => ({ prices: d.data ? [d.points[0].price, d.data.stop, d.data.target] : [], times: [] }),
  };
}

// ---------- medições ----------

function rangeTool(id: 'pricerange' | 'daterange' | 'measure', label: string): ToolDef {
  return {
    id,
    label,
    group: 'measure',
    points: 2,
    style: { color: BLUE, width: 1, dash: 0, fill: 'rgba(41,98,255,0.15)' },
    render(ctx, d, vp, sel) {
      const pts = allXY(d, vp);
      if (!pts || pts.length < 2) return;
      const [a, b] = pts;
      const up = d.points[1].price >= d.points[0].price;
      const color = id === 'measure' ? (up ? '#2962ff' : '#f23645') : d.style.color;
      ctx.save();
      ctx.fillStyle = id === 'measure' ? withAlpha(color, 0.15) : d.style.fill ?? 'rgba(41,98,255,0.15)';
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      stroke(ctx, { ...d.style, color }, sel);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (id !== 'daterange') {
        line(ctx, { x: mx, y: a.y }, { x: mx, y: b.y });
        arrowHead(ctx, { x: mx, y: a.y }, { x: mx, y: b.y }, 7, color);
      }
      if (id !== 'pricerange') {
        line(ctx, { x: a.x, y: my }, { x: b.x, y: my });
        arrowHead(ctx, { x: a.x, y: my }, { x: b.x, y: my }, 7, color);
      }
      const p0 = d.points[0];
      const p1 = d.points[1];
      const lines: string[] = [];
      if (id !== 'daterange') lines.push(`${p1.price - p0.price >= 0 ? '+' : ''}${vp.fmtPrice(p1.price - p0.price)} (${pctChange(p0.price, p1.price).toFixed(2)}%)`);
      if (id !== 'pricerange') lines.push(`${Math.round(vp.barsBetween(p0.time, p1.time))} barras, ${fmtDuration(Math.abs(p1.time - p0.time))}`);
      const below = b.y >= a.y;
      labelBox(ctx, lines, mx, below ? Math.max(a.y, b.y) + 6 : Math.min(a.y, b.y) - 6, { bg: color, fg: '#ffffff', valign: below ? 'top' : 'bottom' });
      ctx.restore();
    },
    hit(d, vp, p) {
      const pts = allXY(d, vp);
      return !!pts && pts.length === 2 && pointInRect(p, pts[0], pts[1], 3);
    },
    handles: defaultHandles,
  };
}

export const TOOLS: ToolDef[] = [
  trendFamily('trendline', 'Linha de tendência', {}, {}),
  trendFamily('ray', 'Raio', { extendRight: true }),
  trendFamily('infoline', 'Linha de informação', {}, { info: true }),
  trendFamily('extended', 'Linha prolongada', { extendLeft: true, extendRight: true }),
  trendFamily('arrowline', 'Seta', {}, { arrow: true }),
  hline,
  hray,
  vline,
  crossline,
  channel,
  fib,
  fibext,
  pitchfork,
  rect,
  ellipse,
  triangle,
  path,
  brush,
  text,
  note,
  pricelabel,
  arrowMark('arrowup'),
  arrowMark('arrowdown'),
  positionTool('long'),
  positionTool('short'),
  rangeTool('pricerange', 'Intervalo de preço'),
  rangeTool('daterange', 'Intervalo de datas'),
  rangeTool('measure', 'Medir (data e preço)'),
];

TOOLS.find((t) => t.id === 'trendline')!.shortcut = 'Alt+T';
TOOLS.find((t) => t.id === 'text')!.shortcut = undefined;

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
export function toolDef(id: ToolId): ToolDef | undefined {
  return BY_ID.get(id);
}

export const TOOL_GROUPS: { id: ToolGroup; label: string; tools: ToolId[] }[] = [
  { id: 'lines', label: 'Linhas', tools: ['trendline', 'ray', 'infoline', 'extended', 'arrowline', 'hline', 'hray', 'vline', 'crossline', 'channel'] },
  { id: 'fib', label: 'Fibonacci e Gann', tools: ['fib', 'fibext', 'pitchfork'] },
  { id: 'shapes', label: 'Formas', tools: ['rect', 'ellipse', 'triangle', 'path', 'brush'] },
  { id: 'text', label: 'Texto e marcas', tools: ['text', 'note', 'pricelabel', 'arrowup', 'arrowdown'] },
  { id: 'measure', label: 'Previsão e medição', tools: ['long', 'short', 'pricerange', 'daterange', 'measure'] },
];
