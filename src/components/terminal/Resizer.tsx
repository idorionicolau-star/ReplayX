'use client';
import { useRef } from 'react';
import { cn } from '@/components/ui/cn';

/** Barra para redimensionar painéis com o rato/dedo. */
export function Resizer({ direction, onResize, className }: { direction: 'horizontal' | 'vertical'; onResize: (delta: number) => void; className?: string }) {
  const start = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        start.current = direction === 'horizontal' ? e.clientX : e.clientY;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const pos = direction === 'horizontal' ? e.clientX : e.clientY;
        onResize(pos - start.current);
        start.current = pos;
      }}
      onPointerUp={() => (start.current = null)}
      className={cn(
        'shrink-0 bg-line transition-colors hover:bg-accent',
        direction === 'horizontal' ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize',
        className,
      )}
    />
  );
}
