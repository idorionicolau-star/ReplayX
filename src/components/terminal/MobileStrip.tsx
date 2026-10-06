'use client';
import { useRef, useState } from 'react';
import { FunctionSquare, Rewind, Undo2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { useReplay, replay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { tfsFor } from '@/core/feed/datafeed';
import { tfLabel, tfShort } from '@/core/timeframes';
import type { WheelItem } from '@/components/ui/WheelPicker';
import { setChartTf } from '@/lib/gates';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { Drum } from '@/components/ui/Drum';
import { useSymbolWheel, useTfWheel } from './useWheels';

/**
 * Faixa em baixo (telemóvel), como no TradingView: símbolo e intervalo à esquerda, atalhos à direita.
 * Carregar no símbolo ou no intervalo e arrastar para cima/baixo abre a roda (com vibração); um toque abre a pesquisa/lista.
 */
/** Mini-roda: cilindro que gira (item atual ao centro, vizinhos inclinados e esbatidos); acompanha o dedo e assenta com animação. */
function WheelFace({ items, pos, dragging, width, render }: { items: WheelItem[]; pos: number; dragging: boolean; width: number; render: (it: WheelItem, centre: boolean) => React.ReactNode }) {
  return (
    <Drum
      items={items}
      pos={pos}
      row={19}
      reach={1}
      step={40}
      smooth={!dragging}
      style={{ position: 'relative', height: 56, minWidth: width }}
      render={(it, rel) => {
        const centre = Math.abs(rel) < 0.5;
        return (
          <span className={cn('flex max-w-full items-center justify-center gap-1.5 truncate', centre ? 'text-[15px] font-semibold' : 'text-[11px] text-muted')} data-active={centre ? 'true' : undefined}>
            {render(it, centre)}
          </span>
        );
      }}
    />
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
        <WheelFace items={symWheel.items} pos={symWheel.pos} dragging={symWheel.dragging} width={120} render={(it, c) => (c ? <><AssetIcon symbol={resolveSymbol(it.id)} size={16} /><span className="truncate">{it.label}</span></> : <span className="truncate">{it.label}</span>)} />
      </button>
      <button ref={tfRef} type="button" {...tfWheel.bind} onClick={() => setTfOpen((o) => !o)} className="shrink-0 rounded-xl px-2 text-accent active:bg-hover" data-testid="mobile-tf" title="Toque para escolher; carregue e arraste para cima/baixo para girar os intervalos">
        <WheelFace items={tfWheel.items} pos={tfWheel.pos} dragging={tfWheel.dragging} width={52} render={(it) => it.hint ?? it.label} />
      </button>
      <Popover anchor={tfRef} open={tfOpen} onClose={() => setTfOpen(false)} placement="top-start" className="p-2">
        <div className="grid w-[260px] grid-cols-4 gap-1">
          {tfsFor(sym).map((t) => (
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
