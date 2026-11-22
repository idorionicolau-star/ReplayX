'use client';
import { Menu as MenuIcon, Rewind, Search } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { replay, useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { GuestCountdownBadge, TimeframeMenu } from './TopBar';

/** Barra fina do telemóvel em paisagem: menu ☰, par, intervalo e replay. O resto está no menu. */
export function CompactBar() {
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const replayActive = useReplay((s) => s.active);
  const sym = cfg ? resolveSymbol(cfg.symbolId) : null;
  return (
    <header className="flex h-9 shrink-0 items-center gap-0.5 overflow-hidden border-b border-line bg-panel px-1 no-select" data-testid="compact-bar">
      <IconButton label="Menu" onClick={() => useUi.getState().set({ menu: true })} data-testid="compact-menu-button">
        <MenuIcon size={19} />
      </IconButton>
      <button
        type="button"
        onClick={() => useUi.getState().openSymbolSearch('', active)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 active:bg-hover"
        data-testid="symbol-button"
      >
        {sym && <AssetIcon symbol={sym} size={17} />}
        <span className="max-w-[150px] truncate text-[14px] font-semibold">{sym?.name ?? '—'}</span>
        <Search size={13} className="text-muted" />
      </button>
      <TimeframeMenu />
      <button
        type="button"
        aria-label="Bar Replay"
        onClick={() => (replayActive ? replay.exit() : replay.enter())}
        className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium', replayActive ? 'bg-accent text-on-accent' : 'active:bg-hover')}
        data-testid="replay-button"
      >
        <Rewind size={17} />
        <span>Replay</span>
      </button>
      <div className="flex-1" />
      <GuestCountdownBadge />
    </header>
  );
}
