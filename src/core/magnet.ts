import { tr } from '@/i18n';
/**
 * Níveis do íman do desenho. 'weak' e 'strong' são os que já existiam (guardados nas definições de quem já os escolheu);
 * os três do meio ficam entre eles.
 */
export type Magnet = 'off' | 'weak' | 'light' | 'medium' | 'firm' | 'strong';

export interface MagnetLevel {
  id: Exclude<Magnet, 'off'>;
  /** 1 a 5, por ordem de força. */
  level: number;
  label: string;
  /** Distância máxima (px) do cursor a um preço da vela (abertura, máximo, mínimo, fecho) para o íman o apanhar. */
  reachPx: number;
}

export const MAGNET_LEVELS: readonly MagnetLevel[] = [
  { id: 'weak', level: 1, label: tr('Íman 1 · fraco (perto do preço)'), reachPx: 14 },
  { id: 'light', level: 2, label: tr('Íman 2 · leve'), reachPx: 28 },
  { id: 'medium', level: 3, label: tr('Íman 3 · médio'), reachPx: 48 },
  { id: 'firm', level: 4, label: tr('Íman 4 · firme'), reachPx: 80 },
  { id: 'strong', level: 5, label: tr('Íman 5 · forte (sempre OHLC)'), reachPx: Infinity },
];

export function magnetLevel(m: Magnet): MagnetLevel | null {
  return MAGNET_LEVELS.find((l) => l.id === m) ?? null;
}

/** Próximo nível ao tocar no botão: desligado → 1 → 2 → 3 → 4 → 5 → desligado. */
export function nextMagnet(m: Magnet): Magnet {
  if (m === 'off') return MAGNET_LEVELS[0].id;
  const i = MAGNET_LEVELS.findIndex((l) => l.id === m);
  return i < 0 || i === MAGNET_LEVELS.length - 1 ? 'off' : MAGNET_LEVELS[i + 1].id;
}

export function magnetTitle(m: Magnet): string {
  return m === 'off' ? tr('Íman desligado') : magnetLevel(m)?.label ?? tr('Íman');
}

/**
 * Quantas velas para cada lado do cursor o íman olha: o fraco e o forte só olham para a vela debaixo do cursor
 * (como sempre); os do meio olham para as vizinhas que ficam dentro do alcance.
 */
export function magnetBarReach(m: Magnet, barSpacingPx: number): number {
  const l = magnetLevel(m);
  if (!l || l.id === 'weak' || !Number.isFinite(l.reachPx)) return 0;
  return Math.min(30, Math.ceil(l.reachPx / Math.max(2, barSpacingPx)));
}
