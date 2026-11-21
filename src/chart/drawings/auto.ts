import type { Drawing } from './types';

/** Cor "automática" dos desenhos: preto no tema claro e branco no escuro (acompanha o tema, em vez de ficar guardada). */
export const AUTO = 'auto';

export const autoColor = (dark: boolean): string => (dark ? '#ffffff' : '#000000');

/** A cor a mostrar (amostras, legendas): a automática vira preto ou branco. */
export function shownColor(c: string, dark: boolean): string {
  return c === AUTO ? autoColor(dark) : c;
}

/** O desenho com as cores automáticas já resolvidas, para o desenhar. Devolve o mesmo objeto se não houver nenhuma. */
export function resolveAuto(d: Drawing, dark: boolean): Drawing {
  const s = d.style;
  if (s.color !== AUTO && s.textColor !== AUTO && s.fill !== AUTO) return d;
  const c = autoColor(dark);
  return { ...d, style: { ...s, color: s.color === AUTO ? c : s.color, ...(s.textColor === AUTO ? { textColor: c } : {}), ...(s.fill === AUTO ? { fill: c } : {}) } };
}
