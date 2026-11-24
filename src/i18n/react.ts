'use client';
import { useSyncExternalStore } from 'react';
import { getLang, trIn, type Lang } from './index';

const noop = () => () => {};

/**
 * Para componentes que o servidor também pinta (página inicial, entrada, páginas legais):
 * a primeira pintura é em português, como a do servidor, e logo a seguir passa ao idioma escolhido.
 */
export function useLang(): Lang {
  return useSyncExternalStore(noop, getLang, () => 'pt');
}

export function useTr(): (pt: string, ...args: unknown[]) => string {
  const lang = useLang();
  return (pt, ...args) => trIn(lang, pt, ...args);
}
