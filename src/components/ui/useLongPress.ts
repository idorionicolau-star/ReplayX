'use client';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

/**
 * Toque normal faz `onClick`; manter premido `ms` milissegundos faz `onLong` (e o clique que vem ao largar não conta).
 * `holding` fica verdadeiro enquanto se mantém premido (para mostrar o progresso).
 */
export function useLongPress({ ms = 3000, onLong, onClick }: { ms?: number; onLong: () => void; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);
  const onLongRef = useRef(onLong);
  useEffect(() => {
    onLongRef.current = onLong;
  }, [onLong]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);
  useEffect(() => cancel, [cancel]);

  return {
    holding,
    props: {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        fired.current = false;
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          setHolding(false);
          onLongRef.current();
        }, ms);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      // no telemóvel o toque longo abriria o menu do navegador
      onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick(e);
      },
    },
  };
}
