'use client';
import type { ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from './cn';

export function MenuList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-[180px] py-1.5', className)}>{children}</div>;
}

export function MenuItem({
  icon,
  label,
  hint,
  checked,
  danger,
  disabled,
  submenu,
  onClick,
  active,
  trailing,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  submenu?: boolean;
  active?: boolean;
  /** Elemento à direita (ex.: estrela de favorito). */
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] transition-colors',
        active ? 'bg-accent-soft text-accent' : 'hover:bg-hover',
        danger && 'text-down',
        disabled && 'opacity-40',
      )}
    >
      <span className="flex w-4 shrink-0 justify-center text-muted">{checked ? <Check size={15} className="text-accent" /> : icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
      {submenu && <ChevronRight size={14} className="text-muted" />}
      {trailing}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line" />;
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{children}</div>;
}
