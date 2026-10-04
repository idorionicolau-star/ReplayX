'use client';
import { useRef, useState } from 'react';
import { Popover } from './Popover';
import { cn } from './cn';

const PALETTE = [
  '#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63',
  '#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0',
  '#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b',
];

function parse(c: string): { hex: string; alpha: number } {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
    const hex = '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    return { hex, alpha: Number.isFinite(a) ? a : 1 };
  }
  return { hex: c.length === 4 ? '#' + c.slice(1).split('').map((x) => x + x).join('') : c, alpha: 1 };
}

function compose(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${+alpha.toFixed(2)})`;
}

export function ColorPicker({ value, onChange, withAlpha, label }: { value: string; onChange: (c: string) => void; withAlpha?: boolean; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { hex, alpha } = parse(value || '#2962ff');
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label ?? 'Cor'}
        title={label ?? 'Cor'}
        onClick={() => setOpen((o) => !o)}
        className="h-7 w-7 shrink-0 rounded-md border border-line p-[3px] hover:border-accent"
      >
        <span className="block h-full w-full rounded-[3px]" style={{ background: value, backgroundImage: alpha < 1 ? `linear-gradient(${value}, ${value}), repeating-conic-gradient(#999 0 25%, #fff 0 50%) 50% / 8px 8px` : undefined }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} className="p-3">
        <div className="grid grid-cols-10 gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => onChange(compose(c, alpha))}
              className={cn('h-5 w-5 rounded-[3px] border', hex.toLowerCase() === c ? 'border-accent ring-1 ring-accent' : 'border-black/10')}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input type="color" value={hex} onChange={(e) => onChange(compose(e.target.value, alpha))} className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent" />
          <span className="text-xs text-muted tnum">{hex.toUpperCase()}</span>
        </div>
        {withAlpha && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Opacidade</span>
              <span className="tnum">{Math.round(alpha * 100)}%</span>
            </div>
            <input type="range" min={0} max={100} value={Math.round(alpha * 100)} onChange={(e) => onChange(compose(hex, Number(e.target.value) / 100))} className="w-full accent-[var(--c-accent)]" />
          </div>
        )}
      </Popover>
    </>
  );
}
