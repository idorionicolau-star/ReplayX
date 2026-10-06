'use client';
import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fmtLot, stepLot } from '@/core/trading/ticket';
import { fmtLotWith, snapLot, stepLotRule, type LotRule } from '@/core/trading/lots';
import { cn } from './cn';

/**
 * Lote intuitivo: − e + passam pela escada 0,01 · 0,02 · 0,05 · 0,1 · 0,2 · 0,5 · 1 · 2 · 5…
 * (manter carregado repete), tocar no valor escreve um número, a roda do rato também sobe/desce.
 */
export function QtyStepper({ value, onChange, className, unit, rule }: { value: number; onChange: (v: number) => void; className?: string; unit?: string; rule?: LotRule }) {
  const [editing, setEditing] = useState<string | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  const hold = useRef<{ t: ReturnType<typeof setTimeout> | null; i: ReturnType<typeof setInterval> | null }>({ t: null, i: null });

  const stop = () => {
    if (hold.current.t) clearTimeout(hold.current.t);
    if (hold.current.i) clearInterval(hold.current.i);
    hold.current = { t: null, i: null };
  };
  useEffect(() => stop, []);

  const press = (dir: 1 | -1, e: React.PointerEvent) => {
    e.preventDefault();
    stop();
    const next = (q: number) => (rule ? stepLotRule(q, dir, rule) : stepLot(q, dir));
    onChange(next(valueRef.current));
    hold.current.t = setTimeout(() => {
      hold.current.i = setInterval(() => onChange(next(valueRef.current)), 110);
    }, 380);
  };

  const commit = () => {
    const v = parseFloat((editing ?? '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) onChange(rule ? snapLot(v, rule) : +v.toFixed(4));
    setEditing(null);
  };

  const btn = 'flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-md bg-sunken text-text hover:bg-hover active:bg-active';
  return (
    <div
      className={cn('flex items-center gap-1 no-select', className)}
      onWheel={(e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        onChange(rule ? stepLotRule(valueRef.current, dir, rule) : stepLot(valueRef.current, dir));
      }}
    >
      <button type="button" aria-label="Menos lote" data-testid="qty-minus" className={btn} onPointerDown={(e) => press(-1, e)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
        <Minus size={15} />
      </button>
      {editing === null ? (
        <button type="button" title="Tocar para escrever o lote" data-testid="qty-value" onClick={() => setEditing(String(value))} className="h-8 min-w-[52px] rounded-md px-1.5 text-center text-[13px] font-semibold tnum hover:bg-hover">
          {rule ? fmtLotWith(value, rule) : fmtLot(value)}
          {unit && <span className="ml-0.5 text-[10px] font-normal text-muted">{unit}</span>}
        </button>
      ) : (
        <input
          autoFocus
          inputMode="decimal"
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 w-[64px] rounded-md border border-accent bg-input px-1.5 text-center text-[13px] font-semibold tnum outline-none"
          data-testid="qty-input"
        />
      )}
      <button type="button" aria-label="Mais lote" data-testid="qty-plus" className={btn} onPointerDown={(e) => press(1, e)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
        <Plus size={15} />
      </button>
    </div>
  );
}
