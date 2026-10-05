'use client';
import { useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, Check, Trash2 } from 'lucide-react';
import { useSettings, type DrawingTemplate } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import type { Drawing } from '@/chart/drawings/types';
import { toolDef } from '@/chart/drawings/tools';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { toast } from '@/components/ui/Toast';
import { uid } from '@/lib/uid';
import { cn } from '@/components/ui/cn';

const EMPTY: DrawingTemplate[] = [];

/** Modelos de estilo (como no TradingView): guardar o estilo e o texto deste desenho e voltar a usá-los. */
export function TemplateMenu({ symbolId, d, compact }: { symbolId: string; d: Drawing; compact?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const list = useSettings((s) => s.drawingTemplates[d.type]) ?? EMPTY;
  const label = toolDef(d.type)?.label ?? 'desenho';

  const saveAll = (next: DrawingTemplate[]) => {
    const st = useSettings.getState();
    st.set({ drawingTemplates: { ...st.drawingTemplates, [d.type]: next } });
  };
  const save = () => {
    const name = (naming ?? '').trim();
    if (!name) return;
    const existing = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const tpl: DrawingTemplate = { id: existing?.id ?? uid('t'), name, style: structuredClone(d.style) };
    saveAll(existing ? list.map((t) => (t.id === existing.id ? tpl : t)) : [...list, tpl]);
    setNaming(null);
    setOpen(false);
    toast(`Modelo “${name}” guardado`, { kind: 'success', body: `Fica disponível em todas as ${label.toLowerCase()}s.` });
  };
  const apply = (t: DrawingTemplate) => {
    useDrawings.getState().update(symbolId, d.id, { style: { ...structuredClone(t.style), levels: t.style.levels ?? d.style.levels } });
    setOpen(false);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        title="Modelos"
        aria-label="Modelos"
        onClick={() => setOpen((o) => !o)}
        className={cn('flex items-center gap-1 rounded-md text-xs hover:bg-hover', compact ? 'h-7 w-7 justify-center' : 'h-8 px-2.5')}
        data-testid="template-menu"
      >
        <Bookmark size={15} />
        {!compact && 'Modelo'}
      </button>
      <Popover anchor={ref} open={open} onClose={() => (setOpen(false), setNaming(null))} placement="bottom-start">
        <MenuList className="w-[250px]">
          {naming === null ? (
            <MenuItem icon={<BookmarkPlus size={15} />} label="Guardar como modelo…" onClick={() => setNaming(d.style.text?.split('\n')[0]?.slice(0, 30) ?? '')} />
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') setNaming(null);
                }}
                placeholder="Nome do modelo"
                className="h-7 min-w-0 flex-1 rounded-md border border-line bg-input px-2 text-[13px] outline-none focus:border-accent"
                data-testid="template-name"
              />
              <button type="button" aria-label="Guardar modelo" onClick={save} className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                <Check size={14} />
              </button>
            </div>
          )}
          <MenuItem
            label="Usar este estilo nos próximos"
            onClick={() => {
              useDrawings.getState().rememberStyle(d.type, d.style);
              setOpen(false);
              toast('Estilo predefinido guardado', { kind: 'success' });
            }}
          />
          {list.length > 0 && (
            <>
              <MenuSeparator />
              <MenuHeader>Os meus modelos</MenuHeader>
              {list.map((t) => (
                <MenuItem
                  key={t.id}
                  icon={<span className="block h-3 w-3 rounded-sm" style={{ background: t.style.color }} />}
                  label={t.name}
                  hint={t.style.text ? '“T”' : undefined}
                  onClick={() => apply(t)}
                  trailing={
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Apagar modelo ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        saveAll(list.filter((x) => x.id !== t.id));
                      }}
                      className="-mr-1 flex h-7 w-7 items-center justify-center rounded text-faint hover:text-down"
                    >
                      <Trash2 size={13} />
                    </span>
                  }
                />
              ))}
            </>
          )}
        </MenuList>
      </Popover>
    </>
  );
}
