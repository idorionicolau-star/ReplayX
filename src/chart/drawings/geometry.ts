export interface Pt {
  x: number;
  y: number;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Prolonga o segmento a→b para lá das margens (o canvas corta o excesso). */
export function extendSegment(a: Pt, b: Pt, w: number, h: number, left: boolean, right: boolean): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [a, b];
  const far = (w + h) * 10 + Math.abs(a.x) + Math.abs(b.x);
  const ux = dx / len;
  const uy = dy / len;
  return [left ? { x: a.x - ux * far, y: a.y - uy * far } : a, right ? { x: b.x + ux * far, y: b.y + uy * far } : b];
}

export function pointInRect(p: Pt, a: Pt, b: Pt, pad = 0): boolean {
  const x0 = Math.min(a.x, b.x) - pad;
  const x1 = Math.max(a.x, b.x) + pad;
  const y0 = Math.min(a.y, b.y) - pad;
  const y1 = Math.max(a.y, b.y) + pad;
  return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
}

export function nearRectBorder(p: Pt, a: Pt, b: Pt, tol: number): boolean {
  const c = { x: a.x, y: b.y };
  const d = { x: b.x, y: a.y };
  return distToSegment(p, a, c) < tol || distToSegment(p, c, b) < tol || distToSegment(p, b, d) < tol || distToSegment(p, d, a) < tol;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function distToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  if (pts.length === 1) best = Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  return best;
}

/** Distância (aprox.) ao contorno de uma elipse inscrita no retângulo a-b. */
export function distToEllipse(p: Pt, a: Pt, b: Pt): { border: number; inside: boolean } {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2 || 1;
  const ry = Math.abs(b.y - a.y) / 2 || 1;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  const r = Math.hypot(nx, ny);
  return { border: Math.abs(r - 1) * Math.min(rx, ry), inside: r < 1 };
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const [r, g, b] = m[1].split(',').map((s) => s.trim());
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
