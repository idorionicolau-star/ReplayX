'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X, Pencil } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { resolveSymbol } from '@/core/symbols';
import { dataFeed } from '@/core/feed/datafeed';
import type { Quote } from '@/core/feed/provider';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { IconButton } from '@/components/ui/Button';
import { fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

function Row({ id, active, onPick, onRemove }: { id: string; active: boolean; onPick: () => void; onRemove: () => void }) {
  const sym = resolveSymbol(id);
  const [q, setQ] = useState<Quote | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const unsub = dataFeed().subscribeQuote(sym, (quote) => {
      if (prev.current !== null && quote.price !== prev.current) {
        setFlash(quote.price > prev.current ? 'up' : 'down');
        setTimeout(() => setFlash(null), 350);
      }
      prev.current = quote.price;
      setQ(quote);
    });
    return unsub;
  }, [sym]);
  const ch = q?.changePct;
  return (
    <div onClick={onPick} className={cn('group flex h-9 cursor-pointer items-center gap-2 px-3 text-[13px]', active ? 'bg-accent-soft' : 'hover:bg-hover')} data-testid={`watch-${id}`}>
      <AssetIcon symbol={sym} size={18} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{sym.name}</div>
      </div>
      <div className={cn('w-[86px] text-right tnum transition-colors', flash === 'up' && 'text-up', flash === 'down' && 'text-down')}>{q ? fmtPrice(q.price, sym.precision) : <span className="text-faint">—</span>}</div>
      <div className={cn('w-[58px] text-right text-xs tnum', ch === undefined ? 'text-faint' : ch >= 0 ? 'text-up' : 'text-down')}>{ch === undefined ? '—' : `${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%`}</div>
      <button
        type="button"
        aria-label="Remover"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="hidden rounded p-0.5 text-muted group-hover:block hover:text-down"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Watchlist() {
  const lists = useWorkspace((s) => s.watchlists);
  const activeId = useWorkspace((s) => s.activeWatchlist);
  const current = lists.find((l) => l.id === activeId) ?? lists[0];
  const activeSymbol = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const setSymbol = useWorkspace((s) => s.setSymbol);
  const remove = useWorkspace((s) => s.removeFromWatchlist);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
        <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-[13px] font-semibold hover:bg-hover">
          <span className="truncate">{current?.name}</span>
          <ChevronDown size={14} />
        </button>
        <IconButton size="sm" label="Adicionar símbolo" onClick={() => useUi.getState().openSymbolSearch('', undefined, 'watchlist')}>
          <Plus size={16} />
        </IconButton>
        <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
          <MenuList className="w-[220px]">
            {lists.map((l) => (
              <MenuItem key={l.id} label={l.name} hint={l.symbols.length} active={l.id === activeId} onClick={() => (useWorkspace.getState().setActiveWatchlist(l.id), setOpen(false))} />
            ))}
            <MenuSeparator />
            <MenuItem
              icon={<Plus size={15} />}
              label="Nova lista"
              onClick={() => {
                const name = prompt('Nome da nova lista');
                if (name?.trim()) useWorkspace.getState().addWatchlist(name.trim());
                setOpen(false);
              }}
            />
            <MenuItem
              icon={<Pencil size={15} />}
              label="Mudar o nome"
              onClick={() => {
                const name = prompt('Novo nome', current?.name);
                if (name?.trim() && current) useWorkspace.getState().renameWatchlist(current.id, name.trim());
                setOpen(false);
              }}
            />
            {lists.length > 1 && (
              <MenuItem
                icon={<Trash2 size={15} />}
                label="Apagar lista"
                danger
                onClick={() => {
                  if (current && confirm(`Apagar a lista "${current.name}"?`)) useWorkspace.getState().deleteWatchlist(current.id);
                  setOpen(false);
                }}
              />
            )}
          </MenuList>
        </Popover>
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line px-3 text-[11px] text-muted">
        <span className="flex-1 pl-6">Símbolo</span>
        <span className="w-[86px] text-right">Último</span>
        <span className="w-[58px] text-right">Var. %</span>
        <span className="w-[18px]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current?.symbols.map((id) => <Row key={id} id={id} active={id === activeSymbol} onPick={() => setSymbol(id)} onRemove={() => remove(id)} />)}
        {!current?.symbols.length && <div className="px-4 py-8 text-center text-xs text-muted">Lista vazia. Use + para adicionar símbolos.</div>}
      </div>
    </div>
  );
}
