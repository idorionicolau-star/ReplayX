'use client';
import { Menu as MenuIcon, Rewind } from 'lucide-react';
import { useUi } from '@/store/ui';
import { replay, useReplay } from '@/replay/engine';
import { IconButton } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { GuestCountdownBadge } from './TopBar';
import { WheelPair } from './MobileStrip';

/** Barra fina do telemóvel em paisagem: menu ☰, par, intervalo e replay. O resto está no menu. */
export function CompactBar() {
  const replayActive = useReplay((s) => s.active);
  return (
    <header className="flex h-11 shrink-0 items-center gap-0.5 overflow-hidden border-b border-line bg-panel px-1 no-select" data-testid="compact-bar">
      <IconButton label="Menu" onClick={() => useUi.getState().set({ menu: true })} data-testid="compact-menu-button">
        <MenuIcon size={19} />
      </IconButton>
      {/* as mesmas rodas do telemóvel em pé: toque abre a pesquisa/lista, arrastar para cima/baixo gira */}
      <WheelPair height={40} row={16} />
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
