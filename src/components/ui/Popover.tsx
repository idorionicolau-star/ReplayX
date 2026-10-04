'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

export type Placement = 'bottom-start' | 'bottom-end' | 'right-start' | 'top-start' | 'top-end' | 'left-start';

interface PopoverProps {
  anchor: RefObject<HTMLElement | null> | { x: number; y: number } | null;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  className?: string;
  children: ReactNode;
  offset?: number;
}

/** Caixa flutuante ancorada a um elemento (ou a um ponto), fecha ao clicar fora ou com Esc. */
export function Popover({ anchor, open, onClose, placement = 'bottom-start', className, children, offset = 4 }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = ref.current;
      if (!el || !anchor) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let r: { left: number; top: number; right: number; bottom: number };
      if ('current' in anchor) {
        const a = anchor.current;
        if (!a) return;
        const b = a.getBoundingClientRect();
        r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      } else r = { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y };
      let left = r.left;
      let top = r.bottom + offset;
      if (placement === 'bottom-end') left = r.right - w;
      if (placement === 'right-start') {
        left = r.right + offset;
        top = r.top;
      }
      if (placement === 'left-start') {
        left = r.left - w - offset;
        top = r.top;
      }
      if (placement === 'top-start') top = r.top - h - offset;
      if (placement === 'top-end') {
        top = r.top - h - offset;
        left = r.right - w;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
      if (left < 4) left = 4;
      if (top + h > vh - 4) top = Math.max(4, ('current' in anchor ? r.top - h - offset : vh - h - 4));
      if (top < 4) top = 4;
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, placement, offset]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor && 'current' in anchor && anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', down, true), 0);
    window.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, anchor]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className={cn('fixed z-[60] rounded-lg border border-line bg-elev text-text shadow-pop animate-pop', className)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
