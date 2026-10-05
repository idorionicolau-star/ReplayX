'use client';
import { useEffect, useRef, useState } from 'react';
import { Compass, GripVertical, Magnet, Star, X } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import { toolDef } from '@/chart/drawings/tools';
import { TOOL_ICONS } from '@/components/terminal/DrawingToolbar';
import { cn } from '@/components/ui/cn';
import { SavedElements } from './SavedElements';

const MAGNET_NEXT = { off: 'weak', weak: 'strong', strong: 'off' } as const;
const MAGNET_LABEL = { off: 'Íman desligado', weak: 'Íman fraco', strong: 'Íman forte' } as const;

/** Barra flutuante com as ferramentas favoritas, como no TradingView. Arrasta-se pela pega. */
export function FavoritesBar() {
  const show = useSettings((s) => s.favoritesBar);
  const favs = useSettings((s) => s.favoriteTools);
  const pos = useSettings((s) => s.favoritesBarPos);
  const magnet = useSettings((s) => s.magnet);
  const angleSnap = useSettings((s) => s.angleSnap);
  const set = useSettings((s) => s.set);
  const tool = useDrawings((s) => s.tool);
  const setTool = useDrawings((s) => s.setTool);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  // mantém a barra dentro da área quando a janela muda de tamanho
  useEffect(() => {
    if (!pos) return;
    const fit = () => {
      const el = ref.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;
      const x = Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, pos.x));
      const y = Math.max(0, Math.min(parent.clientHeight - el.offsetHeight, pos.y));
      if (x !== pos.x || y !== pos.y) set({ favoritesBarPos: { x, y } });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [pos, set]);

  // fechada: fica um botão pequeno à vista para a voltar a abrir
  if (!show && favs.length) {
    return (
      <button
        type="button"
        aria-label="Mostrar a barra de favoritos"
        title="Mostrar a barra de favoritos"
        onClick={() => set({ favoritesBar: true })}
        className="absolute top-2 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-elev/90 text-warn shadow-sm active:bg-hover"
        data-testid="favorites-show"
      >
        <Star size={15} fill="currentColor" />
      </button>
    );
  }
  if (!show || !favs.length) return null;
  const at = drag ?? pos;

  const onGrip = (e: React.PointerEvent) => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    e.preventDefault();
    const pr = parent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let last = { x: r.left - pr.left, y: r.top - pr.top };
    const move = (ev: PointerEvent) => {
      last = {
        x: Math.max(0, Math.min(pr.width - r.width, ev.clientX - pr.left - dx)),
        y: Math.max(0, Math.min(pr.height - r.height, ev.clientY - pr.top - dy)),
      };
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      set({ favoritesBarPos: last });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      className={cn('absolute z-20 flex items-center gap-0.5 rounded-lg border border-line bg-elev/95 p-0.5 shadow-pop backdrop-blur no-select', !at && 'top-2 left-1/2 -translate-x-1/2')}
      style={at ? { left: at.x, top: at.y } : undefined}
      data-testid="favorites-bar"
    >
      <span onPointerDown={onGrip} className="flex h-8 w-5 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing" title="Arrastar">
        <GripVertical size={14} />
      </span>
      {favs.map((t) => {
        const I = TOOL_ICONS[t];
        const def = toolDef(t);
        if (!I || !def) return null;
        return (
          <button
            key={t}
            type="button"
            title={def.label}
            aria-label={def.label}
            onClick={() => setTool(tool === t ? 'cross' : t)}
            className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors', tool === t ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover')}
          >
            <I size={17} />
          </button>
        );
      })}
      <span className="mx-0.5 h-5 w-px bg-line" />
      <SavedElements className="h-8 w-8" size={16} placement="bottom-start" />
      <button
        type="button"
        title={`${MAGNET_LABEL[magnet]} (toque para mudar)`}
        aria-label="Íman"
        onClick={() => set({ magnet: MAGNET_NEXT[magnet] })}
        className={cn('relative flex h-8 w-8 items-center justify-center rounded-md', magnet !== 'off' ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <Magnet size={16} />
        {magnet === 'strong' && <span className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-accent" />}
      </button>
      <button
        type="button"
        title={angleSnap ? 'Alinhar ângulo: ligado' : 'Alinhar ângulo: desligado'}
        aria-label="Alinhar ângulo"
        onClick={() => set({ angleSnap: !angleSnap })}
        className={cn('flex h-8 w-8 items-center justify-center rounded-md', angleSnap ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <Compass size={16} />
      </button>
      <button type="button" title="Esconder a barra (fica uma ⭐ para a voltar a abrir)" aria-label="Esconder a barra de favoritos" onClick={() => set({ favoritesBar: false })} className="flex h-8 w-6 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-text">
        <X size={13} />
      </button>
    </div>
  );
}
