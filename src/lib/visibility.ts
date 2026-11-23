'use client';

/** O separador/app está em segundo plano (ou o ecrã bloqueado). */
export const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** Chama `cb(hidden)` quando o separador passa para segundo plano ou volta. Devolve a função que cancela. */
export function onVisibilityChange(cb: (hidden: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const h = () => cb(isHidden());
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
}
