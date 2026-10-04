'use client';
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn('h-8 w-full rounded-md border border-line bg-input px-2.5 text-[13px] outline-none transition-colors placeholder:text-faint focus:border-accent', className)}
      {...rest}
    />
  );
});

/** Campo numérico que aceita vírgula ou ponto e só confirma valores válidos. */
export function NumberInput({
  value,
  onChange,
  step,
  min,
  max,
  className,
  placeholder,
  disabled,
  allowEmpty,
  suffix,
}: {
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  suffix?: ReactNode;
}) {
  const fmt = (v: number | undefined | null) => (v === undefined || v === null || !Number.isFinite(v) ? '' : String(v));
  const [text, setText] = useState(fmt(value));
  // sincroniza com o valor vindo de fora sem estragar o que está a ser escrito ("1," → 1)
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    const cur = parseFloat(text.replace(',', '.'));
    if (fmt(value) === '' ? text !== '' && !(allowEmpty && Number.isFinite(cur)) : cur !== value) setText(fmt(value));
  }
  const commit = (raw: string) => {
    const t = raw.replace(',', '.').trim();
    if (t === '') {
      if (allowEmpty) onChange(undefined);
      return;
    }
    let v = parseFloat(t);
    if (!Number.isFinite(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          if (value !== undefined && value !== null && Number.isFinite(value)) setText(String(value));
        }}
        onKeyDown={(e) => {
          if (!step || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const base = value ?? 0;
          const next = +(base + (e.key === 'ArrowUp' ? step : -step)).toFixed(10);
          commit(String(next));
          setText(String(next));
        }}
        className="h-8 w-full rounded-md border border-line bg-input px-2.5 text-[13px] tnum outline-none transition-colors placeholder:text-faint focus:border-accent disabled:opacity-50"
      />
      {suffix && <span className="pointer-events-none absolute right-2 text-[11px] text-muted">{suffix}</span>}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn('h-8 w-full rounded-md border border-line bg-input px-2 text-[13px] outline-none focus:border-accent', className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 select-none', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-faint')}
      >
        <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all', checked ? 'left-[16px]' : 'left-[2px]')} />
      </button>
      {label && <span className="text-[13px]">{label}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--c-accent)]" />
      {label}
    </label>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
      <span>{children}</span>
      {hint && <span className="text-[11px]">{hint}</span>}
    </div>
  );
}

export function Row({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1.5', className)}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}
