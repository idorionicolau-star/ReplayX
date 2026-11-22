'use client';
import { useSyncExternalStore } from 'react';

/** Telemóvel em paisagem: ecrã baixo e tátil. Aí a interface fica limpa e o resto vai para o menu ☰. */
export const COMPACT_QUERY = '(pointer: coarse) and (max-height: 520px) and (orientation: landscape)';

export function useCompact(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(COMPACT_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}
