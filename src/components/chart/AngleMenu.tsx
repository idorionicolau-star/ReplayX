'use client';
import { useRef, useState } from 'react';
import { Compass, RotateCcw, RotateCw } from 'lucide-react';
import { useDrawings } from '@/store/drawings';
import type { Drawing } from '@/chart/drawings/types';
import { ANGLE_TOOLS, lineAngle, normDeg, setLineAngle, type Geo } from '@/chart/angle';
import type { ChartController } from '@/chart/controller';
import { Popover } from '@/components/ui/Popover';
import { IconButton } from '@/components/ui/Button';

function geoOf(c: ChartController): Geo {
  return {
    timeToX: (t) => c.timeToX(t),
    priceToY: (p) => c.priceToY(p),
    xToPoint: (x, y) => {
      const l = c.xToLogical(x);
      const price = c.yToPrice(y);
      const time = l === null ? null : c.logicalToTime(l);
      return time === null || price === null ? null : { time, price };
    },
  };
}

/** Define o ângulo de uma linha: graus, horizontal, vertical, ±15°. */
export function AngleMenu({ symbolId, d, ctrl }: { symbolId: string; d: Drawing; ctrl: ChartController }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  if (!ANGLE_TOOLS.has(d.type)) return null;
  const cur = lineAngle(d, geoOf(ctrl));

  const apply = (deg: number) => {
    const pts = setLineAngle(d, deg, geoOf(ctrl));
    if (!pts) return;
    const st = useDrawings.getState();
    st.update(symbolId, d.id, { points: pts });
    setText(null);
  };
  const base = cur ?? 0;

  return (
    <>
      <IconButton ref={ref} size="sm" label="Ângulo" active={open} onClick={() => setOpen((o) => !o)} data-testid="angle-menu">
        <Compass size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-start" className="p-2">
        <div className="flex w-[232px] flex-col gap-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-12 text-muted">Ângulo</span>
            <input
              type="number"
              step={1}
              value={text ?? (cur === null ? '' : cur.toFixed(1))}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = parseFloat((text ?? '').replace(',', '.'));
                  if (Number.isFinite(v)) apply(normDeg(v));
                }
              }}
              onBlur={() => {
                const v = parseFloat((text ?? '').replace(',', '.'));
                if (text !== null && Number.isFinite(v)) apply(normDeg(v));
                else setText(null);
              }}
              className="h-7 min-w-0 flex-1 rounded-md border border-line bg-input px-2 text-[13px] outline-none focus:border-accent"
              data-testid="angle-input"
            />
            <span className="text-muted">°</span>
          </label>
          <div className="flex gap-1">
            <button type="button" onClick={() => apply(0)} className="h-7 flex-1 rounded-md border border-line hover:bg-hover" data-testid="angle-horizontal">
              Horizontal
            </button>
            <button type="button" onClick={() => apply(90)} className="h-7 flex-1 rounded-md border border-line hover:bg-hover" data-testid="angle-vertical">
              Vertical
            </button>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => apply(normDeg(base + 15))} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line hover:bg-hover">
              <RotateCcw size={13} /> +15°
            </button>
            <button type="button" onClick={() => apply(normDeg(base - 15))} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line hover:bg-hover">
              <RotateCw size={13} /> −15°
            </button>
          </div>
          <div className="text-[11px] text-faint">Dica: ao arrastar uma ponta, Shift (ou a bússola) encaixa de 15 em 15°.</div>
        </div>
      </Popover>
    </>
  );
}
