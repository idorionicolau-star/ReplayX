'use client';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function Tabs<T extends string>({ value, onChange, items, className, size = 'md' }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === it.value ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text',
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-md border border-line p-0.5', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn('h-6 flex-1 rounded px-2.5 text-xs font-medium whitespace-nowrap transition-colors', value === it.value ? 'bg-accent text-white' : 'text-muted hover:text-text')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
