'use client';
import { useWorkspace, type LayoutId } from '@/store/workspace';
import { useReplay } from '@/replay/engine';
import { openUpgrade, replayTfAllowed, requirePro } from './billing';

/** Muda o intervalo de um gráfico respeitando o plano (no grátis, o replay só vai até 15m). */
export function setChartTf(tf: string, chart?: number): boolean {
  if (useReplay.getState().active && !replayTfAllowed(tf)) {
    openUpgrade('replayTf');
    return false;
  }
  useWorkspace.getState().setTf(tf, chart);
  return true;
}

/** Vários gráficos são do Pro. */
export function setLayoutGated(layout: LayoutId): boolean {
  if (layout !== '1' && !requirePro('layout')) return false;
  useWorkspace.getState().setLayout(layout);
  return true;
}
