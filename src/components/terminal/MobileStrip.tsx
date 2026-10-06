'use client';
import { useRef, useState } from 'react';
import { FunctionSquare, Rewind, Undo2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { useReplay, replay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { STANDARD_TFS, tfLabel, tfShort } from '@/core/timeframes';
import type { WheelItem } from '@/components/ui/WheelPicker';
import { setChartTf } from '@/lib/gates';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { useSymbolWheel, useTfWheel } from './useWheels';

/**
 * Faixa em baixo (telemóvel), como no TradingView: símbolo e intervalo à esquerda, atalhos à direita.
 * Carregar no símbolo ou no intervalo e arrastar para cima/baixo abre a roda (com vibração); um toque abre a pesquisa/lista.
 */
/** Mini-roda: item atual ao centro, anterior esbatido por cima e seguinte por baixo (mostra que se pode girar). */
function WheelFace({ prev, next, width, children }: { prev?: string; next?: string; width: number; children: React.ReactNode }) {
  return (
    <span className="flex h-[54px] flex-col items-stretch justify-center text-left" style={{ minWidth: width, WebkitMaskImage: 'linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%)', maskImage: 'linear-gradient(180deg, transparent 0, #000 12%, #000 88%, transparent 100%)' }}>
      <span className="h-[15px] truncate text-center text-[11px] leading-[15px] text-muted opacity-75" style={{ transform: 'scale(0.92)' }} data-testid="wheel-prev">
        {prev ?? ''}
      </span>
      <span className="flex h-[24px] items-center justify-center gap-1.5 text-[15px] font-semibold">{children}</span>
      <span className="h-[15px] truncate text-center text-[11px] leading-[15px] text-muted opacity-75" style={{ transform: 'scale(0.92)' }} data-testid="wheel-next">
        {next ?? ''}
      </span>
    </span>
  );
}

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
  

  return (
    <div className="flex h-[62px] shrink-0 items-center gap-1 border-t border-line bg-panel px-1.5 no-select sm:hidden" data-testid="mobile-strip">
      {symWheel.overlay}
      {tfWheel.overlay}
      <button type="button" {...symWheel.bind} onClick={() => useUi.getState().openSymbolSearch('', active)} className="min-w-0 max-w-[46%] shrink-0 rounded-xl px-2 active:bg-hover" data-testid="mobile-symbol" title="Toque para procurar; carregue e arraste para cima/baixo para girar a lista">
        <WheelFace prev={symWheel.prev?.label} next={symWheel.next?.label} width={118}>
          <AssetIcon symbol={sym} size={16} />
          <span className="truncate">{sym.name}</span>
        </WheelFace>
      </button>
      <button ref={tfRef} type="button" {...tfWheel.bind} onClick={() => setTfOpen((o) => !o)} className="shrink-0 rounded-xl px-2 text-accent active:bg-hover" data-testid="mobile-tf" title="Toque para escolher; carregue e arraste para cima/baixo para girar os intervalos">
        <WheelFace prev={tfWheel.prev?.hint} next={tfWheel.next?.hint} width={48}>
          {tfShort(cfg.tf)}
        </WheelFace>
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
