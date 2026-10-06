'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { vibrate } from '@/lib/haptics';
import { Drum } from './Drum';
import { shortestDelta, wrapIndex } from './wrapIndex';
import { cn } from './cn';

export { wrapIndex };

export interface WheelItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

const ROW = 40;
const STEP = 34; // px de arrasto por item

/**
 * Seletor em roda, como no TradingView do telemóvel: carregar num botão e arrastar para cima/baixo abre uma roda
 * por cima; cada item que passa no centro faz uma vibração curta; ao largar fica o item escolhido.
 * A roda é um cilindro 3D contínuo (acompanha o dedo ao milímetro) e infinito: depois do último vem o primeiro.
 * Um toque simples (sem arrastar) continua a fazer o clique normal do botão.
 */
export function useWheelPicker({ items, currentId, onSelect }: { items: WheelItem[]; currentId: string; onSelect: (item: WheelItem) => void }) {
  const n = items.length;
  const curIdx = Math.max(0, items.findIndex((i) => i.id === currentId));
  /** Posição "assentada" da roda (contínua e sem voltas: avança pelo caminho mais curto quando o item muda). */
  const [base, setBase] = useState(curIdx);
  const [drag, setDrag] = useState<{ off: number; rect: DOMRect } | null>(null);
  const live = useRef({ items, currentId, onSelect, curIdx, n, base });
  useEffect(() => {
    live.current = { items, currentId, onSelect, curIdx, n, base };
  });
  const suppress = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  // acompanha mudanças externas (ex.: escolher noutro sítio) a rodar pelo caminho mais curto
  const reconcile = useCallback(() => {
    const { curIdx: ci, n: nn } = live.current;
    setBase((b) => {
      const d = shortestDelta(wrapIndex(Math.round(b), nn), ci, nn);
      return d === 0 ? b : b + d;
    });
  }, []);
  useEffect(() => {
    reconcile();
  }, [curIdx, n, reconcile]);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    const el = e.currentTarget;
    const id = e.pointerId;
    const y0 = e.clientY;
    const start = live.current.base;
    let opened = false;
    let last = 0;
    let off = 0;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dy = y0 - ev.clientY;
      if (!opened && Math.abs(dy) < 10) return;
      if (!live.current.n) return;
      if (!opened) {
        opened = true;
        vibrate(20);
      }
      // arrastar para cima avança na lista (como girar a roda); contínuo e sem limites
      off = dy / STEP;
      const r = Math.round(start + off);
      if (r !== last) {
        last = r;
        vibrate(14);
      }
      setDrag({ off, rect: el.getBoundingClientRect() });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup.current?.();
      if (!opened) return;
      suppress.current = true;
      setTimeout(() => (suppress.current = false), 400);
      const { items: its, n: nn } = live.current;
      const steps = Math.round(off);
      const item = its[wrapIndex(Math.round(start) + steps, nn)];
      // assenta no item mais próximo (a mudança de posição é animada) e confirma
      setBase(start + steps);
      setDrag(null);
      if (item && steps !== 0 && wrapIndex(steps, nn) !== 0) {
        vibrate([22, 40, 22]);
        live.current.onSelect(item);
      }
      // se a escolha não foi aceite (ex.: limite do plano), a roda volta ao item que o gráfico tem
      setTimeout(reconcile, 600);
    };
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cleanup.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const bind = {
    onPointerDown,
    onClickCapture: (e: React.MouseEvent) => {
      if (suppress.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { touchAction: 'none', WebkitTouchCallout: 'none' } as CSSProperties,
  };

  const pos = base + (drag?.off ?? 0);
  const overlay =
    drag && typeof document !== 'undefined' ? createPortal(<Wheel items={items} pos={pos} rect={drag.rect} />, document.body) : null;
  return { bind, overlay, open: drag !== null, pos, dragging: drag !== null };
}

function Wheel({ items, pos, rect }: { items: WheelItem[]; pos: number; rect: DOMRect }) {
  const width = 220;
  const height = ROW * 5;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  // por baixo do botão; se não couber (faixa em baixo no telemóvel), por cima
  const top = rect.bottom + 10 + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 10) : rect.bottom + 10;
  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" data-testid="wheel-picker">
      <div className="absolute rounded-2xl border border-line bg-elev/90 shadow-pop backdrop-blur-md" style={{ left, top, width, height, overflow: 'hidden' }}>
        <div className="absolute inset-x-2 rounded-lg bg-accent-soft" style={{ top: ROW * 2, height: ROW }} />
        <Drum
          items={items}
          pos={pos}
          row={ROW}
          reach={2}
          step={30}
          smooth={false}
          style={{ position: 'absolute', inset: 0 }}
          render={(it, rel) => (
            <div className={cn('flex w-full items-center gap-2 px-4', Math.abs(rel) < 0.5 ? 'font-semibold text-text' : 'text-muted')}>
              {it.icon}
              <span className="min-w-0 flex-1 truncate text-[15px]">{it.label}</span>
              {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
            </div>
          )}
        />
      </div>
    </div>
  );
}
