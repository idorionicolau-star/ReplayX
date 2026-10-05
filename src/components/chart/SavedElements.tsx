'use client';
import { useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import { toolDef } from '@/chart/drawings/tools';
import { TOOL_ICONS } from '@/components/terminal/DrawingToolbar';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import type { ToolId } from '@/chart/drawings/types';

/** Elementos guardados (modelos de todas as ferramentas) numa lista só: um toque ativa a ferramenta já com esse estilo. */
export function SavedElements({ className, placement = 'right-start', size = 18, onPicked }: { className?: string; placement?: 'right-start' | 'bottom-start'; size?: number; onPicked?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const templates = useSettings((s) => s.drawingTemplates);
  const setTool = useDrawings((s) => s.setTool);
  const entries = Object.entries(templates).flatMap(([type, list]) => (list ?? []).map((t) => ({ type: type as ToolId, t })));

  return (
    <>
      <button
        ref={ref}
        type="button"
        title="Elementos guardados"
        aria-label="Elementos guardados"
        onClick={() => setOpen((o) => !o)}
        className={cn('flex items-center justify-center rounded-md hover:bg-hover', open && 'bg-accent-soft text-accent', className)}
        data-testid="saved-elements"
      >
        <Bookmark size={size} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement={placement}>
        <MenuList className="max-h-[60vh] w-[250px] overflow-y-auto">
          <MenuHeader>Elementos guardados</MenuHeader>
          {entries.length === 0 && <div className="px-3 py-2 text-xs text-muted">Ainda não guardou nenhum. Desenhe, escolha o desenho e use “Modelo → Guardar como modelo”.</div>}
          {entries.map(({ type, t }) => {
            const I = TOOL_ICONS[type];
            return (
              <MenuItem
                key={t.id}
                icon={I ? <I size={16} /> : <span className="block h-3 w-3 rounded-sm" style={{ background: t.style.color }} />}
                label={t.name}
                hint={toolDef(type)?.label}
                onClick={() => {
                  useDrawings.getState().rememberStyle(type, t.style);
                  setTool(type);
                  setOpen(false);
                  onPicked?.();
                }}
              />
            );
          })}
        </MenuList>
      </Popover>
    </>
  );
}
