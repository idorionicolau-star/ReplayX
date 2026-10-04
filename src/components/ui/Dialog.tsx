'use client';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  bodyClassName?: string;
}

export function Dialog({ open, onClose, title, children, footer, width = 480, className, bodyClassName }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-[6vh] sm:p-6 sm:pt-[8vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: width }}
        className={cn('flex max-h-[86vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-elev text-text shadow-pop animate-pop', className)}
      >
        {title !== undefined && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <div className="text-[15px] font-semibold">{title}</div>
            <button type="button" aria-label="Fechar" onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-text">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'p-4')}>{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
