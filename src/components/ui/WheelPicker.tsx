'use client';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { vibrate } from '@/lib/haptics';
import { cn } from './cn';

export interface WheelItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

const ROW = 38;
const STEP = 34; // px de arrasto por item

/**
 * Seletor em roda, como no TradingView do telemóvel: carregar num botão e arrastar para cima/baixo abre uma roda
 * por cima; cada item que passa no centro faz uma vibração curta; ao largar fica o item escolhido.
 * Um toque simples (sem arrastar) continua a fazer o clique normal do botão.
 */
export function useWheelPicker({ items, currentId, onSelect }: { items: WheelItem[]; currentId: string; onSelect: (item: WheelItem) => void }) {
  const [state, setState] = useState<{ index: number; rect: DOMRect } | null>(null);
  const live = useRef({ items, currentId, onSelect });
  useEffect(() => {
    live.current = { items, currentId, onSelect };
  });
  const suppress = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    const el = e.currentTarget;
    const id = e.pointerId;
    const y0 = e.clientY;
    let opened = false;
    let idx = Math.max(0, live.current.items.findIndex((i) => i.id === live.current.currentId));
    const start = idx;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dy = y0 - ev.clientY;
      if (!opened && Math.abs(dy) < 10) return;
      const its = live.current.items;
      if (!its.length) return;
      if (!opened) {
        opened = true;
        vibrate(10);
      }
      // arrastar para cima avança na lista (como girar a roda)
      const next = Math.max(0, Math.min(its.length - 1, start + Math.round(dy / STEP)));
      if (next !== idx) {
        idx = next;
        vibrate(7);
      }
      setState({ index: idx, rect: el.getBoundingClientRect() });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup.current?.();
      if (opened) {
        suppress.current = true;
        setTimeout(() => (suppress.current = false), 400);
        const item = live.current.items[idx];
        setState(null);
        if (item && idx !== start) {
          vibrate([12, 30, 12]);
          live.current.onSelect(item);
        }
      }
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

  const overlay =
    state && typeof document !== 'undefined'
      ? createPortal(<Wheel items={items} index={state.index} rect={state.rect} />, document.body)
      : null;
  return { bind, overlay, open: state !== null };
}

function Wheel({ items, index, rect }: { items: WheelItem[]; index: number; rect: DOMRect }) {
  const width = 210;
  const height = ROW * 5;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  // por baixo do botão; se não couber (faixa em baixo no telemóvel), por cima
  const top = rect.bottom + 10 + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 10) : rect.bottom + 10;
  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" data-testid="wheel-picker">
      <div className="absolute rounded-2xl border border-line bg-elev/90 shadow-pop backdrop-blur-md" style={{ left, top, width, height, overflow: 'hidden' }}>
        <div className="absolute inset-x-2 rounded-lg bg-accent-soft" style={{ top: ROW * 2, height: ROW }} />
        {items.map((it, i) => {
          const d = i - index;
          if (Math.abs(d) > 3) return null;
          return (
            <div
              key={it.id}
              className={cn('absolute inset-x-0 flex items-center gap-2 px-4 transition-[transform,opacity] duration-100', d === 0 ? 'font-semibold text-text' : 'text-muted')}
              style={{ height: ROW, top: ROW * 2, transform: `translateY(${d * ROW}px) scale(${1 - Math.abs(d) * 0.06})`, opacity: Math.max(0.12, 1 - Math.abs(d) * 0.38) }}
              data-active={d === 0 ? 'true' : undefined}
            >
              {it.icon}
              <span className="min-w-0 flex-1 truncate text-[15px]">{it.label}</span>
              {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
