'use client';
import { useEffect, useRef, useState } from 'react';
import { GripHorizontal, GripVertical, Magnet, PanelLeft, PanelTop, Star, X } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { AngleIcon } from '@/components/ui/AngleIcon';
import { useDrawings } from '@/store/drawings';
import { toolDef } from '@/chart/drawings/tools';
import { TOOL_ICONS } from '@/components/terminal/DrawingToolbar';
import { cn } from '@/components/ui/cn';
import { SavedElements } from './SavedElements';
import { magnetLevel, magnetTitle, nextMagnet } from '@/core/magnet';
import { useLongPress } from '@/components/ui/useLongPress';
import { vibrate } from '@/lib/haptics';
import { toast } from '@/components/ui/Toast';
import { tr } from '@/i18n';


/** Barra flutuante com as ferramentas favoritas, como no TradingView. Arrasta-se pela pega. */
export function FavoritesBar() {
  const show = useSettings((s) => s.favoritesBar);
  const favs = useSettings((s) => s.favoriteTools);
  const pos = useSettings((s) => s.favoritesBarPos);
  const magnet = useSettings((s) => s.magnet);
  const magPress = useLongPress({
    onClick: () => set({ magnet: nextMagnet(magnet) }),
    // 3 s premido, em qualquer nível (1 a 5): desliga o íman
    onLong: () => {
      if (magnet === 'off') return;
      set({ magnet: 'off' });
      vibrate(30);
      toast(tr('Íman desligado'), { kind: 'success', duration: 1500 });
    },
  });
  const angleSnap = useSettings((s) => s.angleSnap);
  const vertical = useSettings((s) => s.favoritesBarVertical);
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
  }, [pos, vertical, set]);

  // fechada: fica um botão pequeno à vista para a voltar a abrir
  if (!show && favs.length) {
    return (
      <button
        type="button"
        aria-label={tr('Mostrar a barra de favoritos')}
        title={tr('Mostrar a barra de favoritos')}
        onClick={() => set({ favoritesBar: true })}
        className="absolute top-2 left-1/2 z-20 flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-elev/90 text-warn shadow-sm active:bg-hover"
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
      className={cn('absolute z-20 flex items-center gap-0.5 rounded-lg border border-line bg-elev/95 p-0.5 shadow-pop backdrop-blur no-select', vertical ? 'max-h-[calc(100%-16px)] flex-col overflow-y-auto' : 'max-w-[calc(100%-16px)] overflow-x-auto', !at && (vertical ? 'top-2 left-2' : 'top-2 left-1/2 -translate-x-1/2'))}
      style={at ? { left: at.x, top: at.y } : undefined}
      data-testid="favorites-bar"
    >
      <span onPointerDown={onGrip} className={cn('flex shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing', vertical ? 'h-5 w-8' : 'h-8 w-5')} title={tr('Arrastar')}>
        {vertical ? <GripHorizontal size={14} /> : <GripVertical size={14} />}
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
            className={cn('flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-md transition-colors', tool === t ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover')}
          >
            <I size={20} className="pointer-coarse:size-[25px]" />
          </button>
        );
      })}
      <span className={cn('shrink-0 bg-line', vertical ? 'my-0.5 h-px w-5' : 'mx-0.5 h-5 w-px')} />
      <SavedElements className="h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11" size={16} placement="bottom-start" />
      <button
        type="button"
        title={tr('{0} (toque para mudar; 3 s premido desliga o íman)', magnetTitle(magnet))}
        aria-label={tr('Íman')}
        {...magPress.props}
        className={cn('relative flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center overflow-hidden rounded-md', magnet !== 'off' ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        {magPress.holding && magnet !== 'off' && <span className="pointer-events-none absolute inset-0 origin-left bg-down/30" style={{ animation: 'rx-hold 3s linear forwards' }} aria-hidden />}
        <Magnet size={16} />
        {magnet !== 'off' && <span className="absolute right-0.5 bottom-0 text-[9px] leading-none font-semibold">{magnetLevel(magnet)?.level}</span>}
      </button>
      <button
        type="button"
        title={angleSnap ? tr('Alinhar ângulo: ligado') : tr('Alinhar ângulo: desligado')}
        aria-label={tr('Alinhar ângulo')}
        onClick={() => set({ angleSnap: !angleSnap })}
        className={cn('flex h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-md', angleSnap ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <AngleIcon size={16} />
      </button>
      <button
        type="button"
        title={vertical ? tr('Barra na horizontal') : tr('Barra na vertical')}
        aria-label={vertical ? tr('Barra na horizontal') : tr('Barra na vertical')}
        onClick={() => set({ favoritesBarVertical: !vertical })}
        className={cn('flex shrink-0 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-text', vertical ? 'h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11' : 'h-8 w-6')}
        data-testid="favorites-orient"
      >
        {vertical ? <PanelTop size={14} /> : <PanelLeft size={14} />}
      </button>
      <button type="button" title={tr('Esconder a barra (fica uma ⭐ para a voltar a abrir)')} aria-label={tr('Esconder a barra de favoritos')} onClick={() => set({ favoritesBar: false })} className={cn('flex shrink-0 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-text', vertical ? 'h-6 w-8' : 'h-8 w-6')}>
        <X size={13} />
      </button>
    </div>
  );
}
