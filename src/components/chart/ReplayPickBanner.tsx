'use client';
import { CalendarDays, ChevronLeft, ChevronRight, Play, Shuffle, X, MousePointerClick } from 'lucide-react';
import { replay } from '@/replay/engine';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { usePick } from '@/chart/pick';
import { coarsePointer, type ChartController } from '@/chart/controller';
import { fmtDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';

/** Escolha do ponto de partida do replay. No rato: clicar no gráfico. No dedo: arrastar a linha e confirmar. */
export function ReplayPickBanner({ ctrl }: { ctrl: ChartController | null }) {
  const time = usePick((s) => s.time);
  const tz = useSettings((s) => s.timezone);
  if (!coarsePointer() || !ctrl) {
    return (
      <div className="absolute top-12 left-1/2 z-20 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-accent/40 bg-elev/95 px-3 py-2 shadow-pop">
        <MousePointerClick size={16} className="text-accent" />
        <span className="text-[13px] font-medium">Clique no gráfico para escolher onde começa o replay</span>
        <Button size="sm" variant="subtle" onClick={() => useUi.getState().set({ gotoDate: true })}>
          <CalendarDays size={14} /> Data
        </Button>
        <Button size="sm" variant="subtle" onClick={() => void replay.randomStart()}>
          <Shuffle size={14} /> Barra aleatória
        </Button>
        <Button size="sm" variant="ghost" onClick={() => replay.cancelSelection()}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 rounded-2xl border border-accent/40 bg-elev/95 p-2.5 shadow-pop" data-testid="pick-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" aria-label="Uma barra para trás" onClick={() => ctrl.nudgePick(-1)} className="flex h-10 w-12 items-center justify-center rounded-lg bg-hover active:brightness-90" data-testid="pick-prev">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold tnum">{time === null ? '—' : fmtDateTime(time, tz)}</div>
          <div className="text-[11px] text-muted">Arraste a linha ✂ ou ajuste de barra em barra</div>
        </div>
        <button type="button" aria-label="Uma barra para a frente" onClick={() => ctrl.nudgePick(1)} className="flex h-10 w-12 items-center justify-center rounded-lg bg-hover active:brightness-90" data-testid="pick-next">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button size="lg" variant="primary" className="flex-1" disabled={time === null} onClick={() => time !== null && void replay.pickBar(time, ctrl.tf)} data-testid="pick-confirm">
          <Play size={16} /> Começar aqui
        </Button>
        <Button size="lg" variant="subtle" aria-label="Escolher data" onClick={() => useUi.getState().set({ gotoDate: true })}>
          <CalendarDays size={16} />
        </Button>
        <Button size="lg" variant="subtle" aria-label="Barra aleatória" onClick={() => void replay.randomStart()}>
          <Shuffle size={16} />
        </Button>
        <Button size="lg" variant="ghost" aria-label="Cancelar" onClick={() => replay.cancelSelection()}>
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
