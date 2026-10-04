'use client';
import { CalendarDays, Shuffle, X, MousePointerClick } from 'lucide-react';
import { replay } from '@/replay/engine';
import { useUi } from '@/store/ui';
import { Button } from '@/components/ui/Button';

export function ReplayPickBanner() {
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
