'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'success' | 'subtle';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  ghost: 'text-text hover:bg-hover',
  outline: 'border border-line text-text hover:bg-hover',
  danger: 'bg-down text-white hover:brightness-110',
  success: 'bg-up text-white hover:brightness-110',
  subtle: 'bg-hover text-text hover:brightness-95 dark:hover:brightness-125',
};

const SIZES = {
  xs: 'h-6 px-2 text-[11px] gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'outline', size = 'md', block, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors select-none', VARIANTS[variant], SIZES[size], block && 'w-full', className)}
      {...rest}
    />
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ active, size = 'md', label, className, type = 'button', children, ...rest }, ref) {
  const s = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md transition-colors select-none', s, active ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover', className)}
      {...rest}
    >
      {children}
    </button>
  );
});
