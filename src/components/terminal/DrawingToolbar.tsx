'use client';
import { useRef, useState, type ComponentType } from 'react';
import {
  Magnet,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  Trash2,
  PenLine,
  ChevronRight,
  ListTree,
  Star,
  ZoomIn,
  PanelTop,
} from 'lucide-react';
import { AngleIcon } from '@/components/ui/AngleIcon';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { TOOL_GROUPS, toolDef } from '@/chart/drawings/tools';
import type { ToolId } from '@/chart/drawings/types';
import { ToolIconSet } from '@/components/ui/ToolIcons';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuHeader } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import { toast } from '@/components/ui/Toast';
import { SavedElements } from '@/components/chart/SavedElements';

type Icon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

export const TOOL_ICONS: Record<ToolId, Icon> = ToolIconSet;

/** No telemóvel a barra cobre o gráfico: fecha-se ao escolher uma ferramenta (para desenhar logo), não ao mudar opções. */
function closeMobileTools() {
  if (typeof window !== 'undefined' && window.innerWidth < 640) useUi.getState().set({ mobileTools: false });
}

export function toggleFavoriteTool(t: ToolId) {
  const st = useSettings.getState();
  const favs = st.favoriteTools;
  st.set({ favoriteTools: favs.includes(t) ? favs.filter((x) => x !== t) : [...favs, t] });
}

/** Estrela para marcar/desmarcar uma ferramenta como favorita (dentro de um item de menu). */
export function FavStar({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={on ? `Tirar ${label} dos favoritos` : `Adicionar ${label} aos favoritos`}
      title={on ? 'Tirar dos favoritos' : 'Adicionar aos favoritos'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }
      }}
      className={cn('-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded', on ? 'text-warn' : 'text-faint hover:text-text')}
    >
      <Star size={14} fill={on ? 'currentColor' : 'none'} />
    </span>
  );
}

function GroupButton({ group }: { group: (typeof TOOL_GROUPS)[number] }) {
  const favs = useSettings((s) => s.favoriteTools);
  const tool = useDrawings((s) => s.tool);
  const setTool = useDrawings((s) => s.setTool);
  const [last, setLast] = useState<ToolId>(group.tools[0]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inGroup = group.tools.includes(tool);
  const shown = inGroup ? tool : last;
  const Ico = TOOL_ICONS[shown];
  return (
    <div ref={ref} className="group relative flex">
      <button
        type="button"
        title={toolDef(shown)?.label + (toolDef(shown)?.shortcut ? ` (${toolDef(shown)!.shortcut})` : '')}
        aria-label={toolDef(shown)?.label}
        onClick={() => {
          setTool(inGroup ? 'cross' : shown);
          if (!inGroup) closeMobileTools();
        }}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md transition-colors', inGroup ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover')}
        data-testid={`tool-${shown}`}
      >
        <Ico size={19} />
      </button>
      <button
        type="button"
        aria-label={`Mais: ${group.label}`}
        onClick={() => setOpen((o) => !o)}
        className="absolute top-0 -right-1.5 flex h-9 w-3 items-center justify-center rounded text-faint opacity-60 hover:bg-hover hover:text-text group-hover:opacity-100"
      >
        <ChevronRight size={10} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="right-start">
        <MenuList className="w-[230px]">
          <MenuHeader>{group.label}</MenuHeader>
          {group.tools.map((t) => {
            const I = TOOL_ICONS[t];
            const def = toolDef(t);
            return (
              <MenuItem
                key={t}
                icon={<I size={16} />}
                label={def?.label ?? t}
                hint={def?.shortcut}
                active={tool === t}
                trailing={<FavStar on={favs.includes(t)} onToggle={() => toggleFavoriteTool(t)} label={def?.label ?? t} />}
                onClick={() => {
                  setLast(t);
                  setTool(t);
                  closeMobileTools();
                  setOpen(false);
                }}
              />
            );
          })}
        </MenuList>
      </Popover>
    </div>
  );
}

export function DrawingToolbar({ className }: { className?: string }) {
  const tool = useDrawings((s) => s.tool);
  const setTool = useDrawings((s) => s.setTool);
  const locked = useDrawings((s) => s.locked);
  const hidden = useDrawings((s) => s.hidden);
  const setLocked = useDrawings((s) => s.setLocked);
  const setHidden = useDrawings((s) => s.setHidden);
  const clear = useDrawings((s) => s.clear);
  const magnet = useSettings((s) => s.magnet);
  const stay = useSettings((s) => s.stayInDrawingMode);
  const favs = useSettings((s) => s.favoriteTools);
  const angleSnap = useSettings((s) => s.angleSnap);
  const loupe = useSettings((s) => s.loupe);
  const favBar = useSettings((s) => s.favoritesBar);
  const setSettings = useSettings((s) => s.set);
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const ref = useRef<HTMLButtonElement>(null);
  const [cursorOpen, setCursorOpen] = useState(false);
  const magRef = useRef<HTMLButtonElement>(null);
  const [magOpen, setMagOpen] = useState(false);
  const CursorIco = TOOL_ICONS[tool === 'cursor' ? 'cursor' : 'cross'];

  return (
    <aside className={cn('flex w-[46px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-1.5 no-select', className)}>
      <button
        ref={ref}
        type="button"
        title="Cursor"
        onClick={() => (tool === 'cross' || tool === 'cursor' ? setCursorOpen(true) : setTool('cross'))}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', tool === 'cross' || tool === 'cursor' ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <CursorIco size={19} />
      </button>
      <Popover anchor={ref} open={cursorOpen} onClose={() => setCursorOpen(false)} placement="right-start">
        <MenuList>
          <MenuItem icon={<TOOL_ICONS.cross size={16} />} label="Mira" active={tool === 'cross'} onClick={() => (setTool('cross'), setCursorOpen(false))} />
          <MenuItem icon={<TOOL_ICONS.cursor size={16} />} label="Seta" active={tool === 'cursor'} onClick={() => (setTool('cursor'), setCursorOpen(false))} />
        </MenuList>
      </Popover>
      <span className="my-0.5 h-px w-7 bg-line" />
      {favs.length > 0 && (
        <>
          {favs.map((t) => {
            const I = TOOL_ICONS[t];
            const def = toolDef(t);
            if (!I || !def) return null;
            return (
              <button
                key={t}
                type="button"
                title={`${def.label} (favorito)`}
                aria-label={def.label}
                onClick={() => {
                  setTool(tool === t ? 'cross' : t);
                  if (tool !== t) closeMobileTools();
                }}
                className={cn('flex h-8 w-9 items-center justify-center rounded-md transition-colors', tool === t ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover')}
                data-testid={`fav-tool-${t}`}
              >
                <I size={17} />
              </button>
            );
          })}
          <span className="my-0.5 h-px w-7 bg-line" />
        </>
      )}
      {TOOL_GROUPS.map((g) => (
        <GroupButton key={g.id} group={g} />
      ))}
      <span className="my-0.5 h-px w-7 bg-line" />
      <SavedElements className="h-9 w-9" onPicked={closeMobileTools} />
      <button
        ref={magRef}
        type="button"
        title={magnet === 'off' ? 'Íman desligado' : magnet === 'weak' ? 'Íman fraco' : 'Íman forte'}
        onClick={() => setMagOpen(true)}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', magnet !== 'off' ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <Magnet size={18} />
      </button>
      <Popover anchor={magRef} open={magOpen} onClose={() => setMagOpen(false)} placement="right-start">
        <MenuList>
          <MenuItem label="Sem íman" checked={magnet === 'off'} onClick={() => (setSettings({ magnet: 'off' }), setMagOpen(false))} />
          <MenuItem label="Íman fraco (perto do preço)" checked={magnet === 'weak'} onClick={() => (setSettings({ magnet: 'weak' }), setMagOpen(false))} />
          <MenuItem label="Íman forte (sempre OHLC)" checked={magnet === 'strong'} onClick={() => (setSettings({ magnet: 'strong' }), setMagOpen(false))} />
        </MenuList>
      </Popover>
      <button
        type="button"
        title={angleSnap ? 'Alinhar ângulo: ligado (linhas encaixam de 15 em 15°)' : 'Alinhar ângulo (também com Shift)'}
        aria-label="Alinhar ângulo"
        onClick={() => setSettings({ angleSnap: !angleSnap })}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', angleSnap ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
        data-testid="angle-snap"
      >
        <AngleIcon size={18} />
      </button>
      <button
        type="button"
        title={loupe ? 'Lupa ao desenhar com o dedo: ligada' : 'Lupa ao desenhar com o dedo: desligada'}
        aria-label="Lupa"
        onClick={() => setSettings({ loupe: !loupe })}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', loupe ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <ZoomIn size={18} />
      </button>
      <button
        type="button"
        title={favBar ? 'Esconder a barra de favoritos' : 'Mostrar a barra de favoritos'}
        aria-label="Barra de favoritos"
        onClick={() => setSettings({ favoritesBar: !favBar })}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', favBar ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <PanelTop size={18} />
      </button>
      <button
        type="button"
        title={stay ? 'Modo de desenho contínuo: ligado (só com rato)' : 'Manter modo de desenho (só com rato)'}
        aria-label="Manter modo de desenho"
        onClick={() => {
          setSettings({ stayInDrawingMode: !stay });
          toast(stay ? 'Cada ferramenta serve para um desenho' : 'Modo contínuo: a ferramenta fica ativa (só com rato)', { duration: 2200 });
        }}
        className={cn('flex h-9 w-9 items-center justify-center rounded-md', stay ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
      >
        <PenLine size={18} />
      </button>
      <button type="button" title={locked ? 'Desbloquear desenhos' : 'Bloquear todos os desenhos'} onClick={() => setLocked(!locked)} className={cn('flex h-9 w-9 items-center justify-center rounded-md', locked ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}>
        {locked ? <Lock size={18} /> : <LockOpen size={18} />}
      </button>
      <button type="button" title={hidden ? 'Mostrar desenhos' : 'Ocultar todos os desenhos'} onClick={() => setHidden(!hidden)} className={cn('flex h-9 w-9 items-center justify-center rounded-md', hidden ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}>
        {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
      <button type="button" title="Árvore de objetos" onClick={() => useWorkspace.getState().setRightTab('objects')} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-hover">
        <ListTree size={18} />
      </button>
      <button
        type="button"
        title="Remover todos os desenhos deste símbolo"
        onClick={() => {
          if (symbolId && confirm('Remover todos os desenhos deste símbolo? (pode desfazer com Ctrl+Z)')) clear(symbolId);
          useUi.getState().set({ mobileTools: false });
        }}
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-hover hover:text-down"
      >
        <Trash2 size={18} />
      </button>
    </aside>
  );
}
