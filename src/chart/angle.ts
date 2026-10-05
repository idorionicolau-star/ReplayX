import type { PricePoint } from '@/core/types';
import type { Drawing, ToolId } from './drawings/types';

/** Ferramentas de duas pontas onde faz sentido definir o ângulo. */
export const ANGLE_TOOLS = new Set<ToolId>(['trendline', 'ray', 'extended', 'infoline', 'arrowline']);

export interface Geo {
  timeToX(t: number): number | null;
  priceToY(p: number): number | null;
  xToPoint(x: number, y: number): PricePoint | null;
}

/** Ângulo no ecrã (graus, para cima = positivo, -180..180) da linha ponto 0 → ponto 1. */
export function lineAngle(d: Drawing, g: Geo): number | null {
  if (d.points.length < 2) return null;
  const [a, b] = d.points;
  const ax = g.timeToX(a.time);
  const ay = g.priceToY(a.price);
  const bx = g.timeToX(b.time);
  const by = g.priceToY(b.price);
  if (ax === null || ay === null || bx === null || by === null || (ax === bx && ay === by)) return null;
  return (-Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

/**
 * Roda a linha à volta do ponto 0 até ao ângulo pedido, mantendo o comprimento no ecrã.
 * Devolve os novos pontos (ou null se não for possível).
 */
export function setLineAngle(d: Drawing, deg: number, g: Geo): PricePoint[] | null {
  if (d.points.length < 2) return null;
  const [a, b] = d.points;
  const ax = g.timeToX(a.time);
  const ay = g.priceToY(a.price);
  const bx = g.timeToX(b.time);
  const by = g.priceToY(b.price);
  if (ax === null || ay === null || bx === null || by === null) return null;
  const len = Math.hypot(bx - ax, by - ay) || 80;
  const rad = (-deg * Math.PI) / 180;
  const q = g.xToPoint(ax + Math.cos(rad) * len, ay + Math.sin(rad) * len);
  if (!q) return null;
  return [a, q];
}

/** Normaliza para -180..180. */
export function normDeg(v: number): number {
  const m = ((((v + 180) % 360) + 360) % 360) - 180;
  return m === -180 ? 180 : m;
}
