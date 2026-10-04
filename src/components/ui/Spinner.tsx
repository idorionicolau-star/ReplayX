import { cn } from './cn';

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <span style={{ width: size, height: size }} className={cn('inline-block animate-spin-slow rounded-full border-2 border-current border-t-transparent', className)} />;
}
