'use client';
import { useRef, useState } from 'react';
import { ChevronUp, FunctionSquare, Rewind, Undo2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { useReplay, replay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { STANDARD_TFS, tfLabel, tfShort } from '@/core/timeframes';
import { setChartTf } from '@/lib/gates';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { useSymbolWheel, useTfWheel } from './useWheels';

/**
 * Faixa em baixo (telemóvel), como no TradingView: símbolo e intervalo à esquerda, atalhos à direita.
 * Carregar no símbolo ou no intervalo e arrastar para cima/baixo abre a roda (com vibração); um toque abre a pesquisa/lista.
 */
export function MobileStrip() {
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const replayActive = useReplay((s) => s.active);
  const undo = useDrawings((s) => s.undo);
  const symWheel = useSymbolWheel(active);
  const tfWheel = useTfWheel(active);
  const tfRef = useRef<HTMLButtonElement>(null);
  const [tfOpen, setTfOpen] = useState(false);
  if (!cfg) return null;
  const sym = resolveSymbol(cfg.symbolId);
  const chip = 'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-semibold active:bg-hover';

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-line bg-panel px-1.5 no-select sm:hidden" data-testid="mobile-strip">
      {symWheel.overlay}
      {tfWheel.overlay}
      <button type="button" {...symWheel.bind} onClick={() => useUi.getState().openSymbolSearch('', active)} className={cn(chip, 'min-w-0 max-w-[48%]')} data-testid="mobile-symbol" title="Toque para procurar; carregue e arraste para percorrer a lista">
        <AssetIcon symbol={sym} size={18} />
        <span className="truncate">{sym.name}</span>
      </button>
      <button ref={tfRef} type="button" {...tfWheel.bind} onClick={() => setTfOpen((o) => !o)} className={cn(chip, 'text-accent')} data-testid="mobile-tf" title="Toque para escolher; carregue e arraste para percorrer os intervalos">
        {tfShort(cfg.tf)}
        <ChevronUp size={13} className="text-muted" />
      </button>
      <Popover anchor={tfRef} open={tfOpen} onClose={() => setTfOpen(false)} placement="top-start" className="p-2">
        <div className="grid w-[260px] grid-cols-4 gap-1">
          {STANDARD_TFS.map((t) => (
            <button
              key={t}
              type="button"
              title={tfLabel(t)}
              onClick={() => {
                setChartTf(t, active);
                setTfOpen(false);
              }}
              className={cn('h-9 rounded-md text-[13px] font-medium', cfg.tf === t ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
            >
              {tfShort(t)}
            </button>
          ))}
        </div>
      </Popover>
      <span className="flex-1" />
      <button type="button" aria-label="Indicadores" onClick={() => useUi.getState().set({ indicators: true })} className="flex h-9 w-9 items-center justify-center rounded-lg active:bg-hover">
        <FunctionSquare size={19} />
      </button>
      <button type="button" aria-label="Bar Replay" onClick={() => (replayActive ? replay.exit() : replay.enter())} className={cn('flex h-9 w-9 items-center justify-center rounded-lg active:bg-hover', replayActive && 'bg-accent text-white')}>
        <Rewind size={19} />
      </button>
      <button type="button" aria-label="Desfazer" onClick={() => undo(cfg.symbolId)} className="flex h-9 w-9 items-center justify-center rounded-lg active:bg-hover">
        <Undo2 size={19} />
      </button>
    </div>
  );
}
