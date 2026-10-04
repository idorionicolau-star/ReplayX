import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes e resolve conflitos do Tailwind (ex.: "w-full" + "w-28" → "w-28"). */
export function cn(...v: ClassValue[]): string {
  return twMerge(clsx(v));
}
