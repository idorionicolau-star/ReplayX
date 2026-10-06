'use client';
import { Minus, Plus } from 'lucide-react';

/** Risco em % da conta: − e + passam por valores habituais (0,25 · 0,5 · 1 · 2 …). */
export const RISK_STEPS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10];

export function PctStepper({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  const up = () => onChange(RISK_STEPS.find((x) => x > value + 1e-9) ?? RISK_STEPS[RISK_STEPS.length - 1]);
  const down = () => onChange([...RISK_STEPS].reverse().find((x) => x < value - 1e-9) ?? RISK_STEPS[0]);
  const btn = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sunken text-text hover:bg-hover active:bg-active';
  return (
    <div className={`flex items-center gap-1 no-select ${className ?? ''}`}>
      <button type="button" aria-label="Menos risco" className={btn} onClick={down} data-testid="risk-minus">
        <Minus size={14} />
      </button>
      <span className="min-w-[44px] text-center text-xs font-semibold tnum" data-testid="risk-value">
        {+value.toFixed(2)}%
      </span>
      <button type="button" aria-label="Mais risco" className={btn} onClick={up} data-testid="risk-plus">
        <Plus size={14} />
      </button>
    </div>
  );
}
