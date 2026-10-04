import type { ChartController } from './controller';
import { setCrosshairHookOnce } from './sync';

/** Controladores vivos, por id da célula do layout. */
const charts = new Map<string, ChartController>();
// acesso para testes automáticos e depuração no navegador
if (typeof window !== 'undefined') (window as unknown as { __rxCharts: typeof charts }).__rxCharts = charts;

export function registerChart(id: string, c: ChartController) {
  charts.set(id, c);
  setCrosshairHookOnce();
}

export function unregisterChart(id: string) {
  charts.delete(id);
}

export function getChart(id: string): ChartController | undefined {
  return charts.get(id);
}

export function allCharts(): [string, ChartController][] {
  return Array.from(charts.entries());
}

