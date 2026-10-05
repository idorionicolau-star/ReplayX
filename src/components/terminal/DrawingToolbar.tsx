'use client';
import { useRef, useState, type ComponentType } from 'react';
import {
  Crosshair,
  MousePointer2,
  TrendingUp,
  MoveRight,
  Minus,
  ArrowRightFromLine,
  SeparatorVertical,
  Plus,
  GitFork,
  Square,
  Circle,
  Triangle,
  Spline,
  Brush,
  Type,
  MessageSquare,
  Tag,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  Ruler,
  CalendarRange,
  MoveVertical,
  Magnet,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  Trash2,
  PenLine,
  Info,
  Rows3,
  ChevronRight,
  ListTree,
  Star,
  Compass,
  ZoomIn,
  PanelTop,
} from 'lucide-react';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { TOOL_GROUPS, toolDef } from '@/chart/drawings/tools';
import type { ToolId } from '@/chart/drawings/types';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuHeader } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';

type Icon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

function FibIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M3 5h18M3 10h18M3 14h18M3 19h18" />
      <path d="M5 19 19 5" strokeDasharray="2 2" />
    </svg>
  );
}

function LongIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
      <rect x="4" y="4" width="16" height="8" rx="1" fill="rgba(8,153,129,0.35)" stroke="#089981" />
      <rect x="4" y="12" width="16" height="7" rx="1" fill="rgba(242,54,69,0.3)" stroke="#f23645" />
    </svg>
  );
}

function ShortIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
      <rect x="4" y="4" width="16" height="7" rx="1" fill="rgba(242,54,69,0.3)" stroke="#f23645" />
      <rect x="4" y="11" width="16" height="8" rx="1" fill="rgba(8,153,129,0.35)" stroke="#089981" />
    </svg>
  );
}

function ChannelIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M3 14 14 3M10 21 21 10" />
      <path d="M6.5 17.5 17.5 6.5" strokeDasharray="2 2" />
    </svg>
  );
}

export const TOOL_ICONS: Record<ToolId, Icon> = {
  cross: Crosshair,
  cursor: MousePointer2,
  trendline: TrendingUp,
  ray: MoveRight,
  infoline: Info,
  extended: PenLine,
  arrowline: ArrowUpRight,
  hline: Minus,
  hray: ArrowRightFromLine,
  vline: SeparatorVertical,
  crossline: Plus,
  channel: ChannelIcon as Icon,
  fib: FibIcon as Icon,
  fibext: Rows3,
  pitchfork: GitFork,
  rect: Square,
  ellipse: Circle,
  triangle: Triangle,
  path: Spline,
  brush: Brush,
  text: Type,
  note: MessageSquare,
  pricelabel: Tag,
  arrowup: ArrowUp,
  arrowdown: ArrowDown,
  long: LongIcon as Icon,
  short: ShortIcon as Icon,
  pricerange: MoveVertical,
  daterange: CalendarRange,
  measure: Ruler,
};

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
        onClick={() => setTool(inGroup ? 'cross' : shown)}
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
  const CursorIco = tool === 'cursor' ? MousePointer2 : Crosshair;

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
          <MenuItem icon={<Crosshair size={16} />} label="Mira" active={tool === 'cross'} onClick={() => (setTool('cross'), setCursorOpen(false))} />
          <MenuItem icon={<MousePointer2 size={16} />} label="Seta" active={tool === 'cursor'} onClick={() => (setTool('cursor'), setCursorOpen(false))} />
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
                onClick={() => setTool(tool === t ? 'cross' : t)}
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
        <Compass size={18} />
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
        title="Manter modo de desenho"
        onClick={() => setSettings({ stayInDrawingMode: !stay })}
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
