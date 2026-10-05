'use client';
import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { Popover } from './Popover';
import { cn } from './cn';

const PALETTE = [
  '#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63',
  '#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0',
  '#f7a9a7', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1',
  '#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b',
  '#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f',
];
const MAX_CUSTOM = 30;

export function parseColor(c: string): { hex: string; alpha: number } {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
    const hex = '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    return { hex, alpha: Number.isFinite(a) ? a : 1 };
  }
  if (/^#[0-9a-f]{8}$/i.test(c)) return { hex: c.slice(0, 7).toLowerCase(), alpha: +(parseInt(c.slice(7), 16) / 255).toFixed(2) };
  if (/^#[0-9a-f]{3}$/i.test(c)) return { hex: ('#' + c.slice(1).split('').map((x) => x + x).join('')).toLowerCase(), alpha: 1 };
  return { hex: /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#2962ff', alpha: 1 };
}

export function composeColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${+alpha.toFixed(2)})`;
}

const checker = 'repeating-conic-gradient(#999 0 25%, #fff 0 50%) 50% / 8px 8px';

function Swatch({ color, active, onClick, onRemove }: { color: string; active?: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <span className="group relative">
      <button
        type="button"
        aria-label={color}
        title={onRemove ? `${color} (botão direito para remover)` : color}
        onClick={onClick}
        onContextMenu={(e) => {
          if (!onRemove) return;
          e.preventDefault();
          onRemove();
        }}
        className={cn('block h-5 w-5 rounded-[3px] border', active ? 'border-accent ring-1 ring-accent' : 'border-black/10')}
        style={{ background: `linear-gradient(${color}, ${color}), ${checker}` }}
      />
      {onRemove && (
        <button
          type="button"
          aria-label={`Remover ${color}`}
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-text text-bg group-hover:flex"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}

/**
 * Seletor de cores como no TradingView: paleta, cores guardadas pelo utilizador (+), código hex e opacidade.
 * `onReset` mostra o botão "Automático" (cor do tema).
 */
export function ColorPicker({
  value,
  onChange,
  withAlpha = true,
  label,
  onReset,
  isAuto,
}: {
  value: string;
  onChange: (c: string) => void;
  withAlpha?: boolean;
  label?: string;
  onReset?: () => void;
  isAuto?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const custom = useSettings((s) => s.customColors);
  const { hex, alpha } = parseColor(value || '#2962ff');
  const [hexText, setHexText] = useState(hex);
  const [lastHex, setLastHex] = useState(hex);
  // acompanha mudanças de fora (padrão "estado anterior" do React)
  if (hex !== lastHex) {
    setLastHex(hex);
    setHexText(hex);
  }
  const setCustom = (list: string[]) => useSettings.getState().set({ customColors: list.slice(0, MAX_CUSTOM) });
  const current = composeColor(hex, alpha);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label ?? 'Cor'}
        title={label ?? 'Cor'}
        onClick={() => setOpen((o) => !o)}
        className="relative h-7 w-7 shrink-0 rounded-md border border-line p-[3px] hover:border-accent"
      >
        <span className="block h-full w-full rounded-[3px]" style={{ background: `linear-gradient(${value}, ${value}), ${checker}` }} />
        {isAuto && <span className="absolute -right-1 -bottom-1 rounded bg-elev px-0.5 text-[8px] leading-tight font-bold text-muted">A</span>}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} className="w-[252px] p-3">
        <div className="grid grid-cols-10 gap-1">
          {PALETTE.map((c) => (
            <Swatch key={c} color={c} active={hex === c} onClick={() => onChange(composeColor(c, alpha))} />
          ))}
        </div>

        <div className="mt-3 mb-1 text-[11px] text-muted">As minhas cores</div>
        <div className="flex flex-wrap gap-1" data-testid="custom-colors">
          {custom.map((c) => (
            <Swatch key={c} color={c} active={current === c} onClick={() => onChange(c)} onRemove={() => setCustom(custom.filter((x) => x !== c))} />
          ))}
          <button
            type="button"
            aria-label="Guardar esta cor"
            title="Guardar esta cor nas minhas cores"
            onClick={() => !custom.includes(current) && setCustom([current, ...custom])}
            className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-dashed border-line text-muted hover:border-accent hover:text-accent"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input type="color" value={hex} onChange={(e) => onChange(composeColor(e.target.value, alpha))} className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent" aria-label="Escolher cor" />
          <input
            value={hexText}
            onChange={(e) => {
              const v = e.target.value.trim();
              setHexText(v);
              const h = v.startsWith('#') ? v : `#${v}`;
              if (/^#[0-9a-f]{6}$/i.test(h)) onChange(composeColor(h.toLowerCase(), alpha));
            }}
            aria-label="Código da cor"
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-input px-2 font-mono text-xs uppercase outline-none focus:border-accent"
          />
          {onReset && (
            <button type="button" onClick={onReset} className={cn('h-7 shrink-0 rounded-md px-2 text-xs', isAuto ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover')} title="Usar a cor do tema">
              Automático
            </button>
          )}
        </div>
        {withAlpha && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Opacidade</span>
              <span className="tnum">{Math.round(alpha * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(alpha * 100)}
              onChange={(e) => onChange(composeColor(hex, Number(e.target.value) / 100))}
              className="w-full accent-[var(--c-accent)]"
              aria-label="Opacidade"
            />
          </div>
        )}
      </Popover>
    </>
  );
}
