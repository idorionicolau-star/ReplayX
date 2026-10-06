'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useWorkspace } from '@/store/workspace';
import { resolveSymbol } from '@/core/symbols';
import { compareTf, STANDARD_TFS, tfLabel, tfShort } from '@/core/timeframes';
import { setChartTf } from '@/lib/gates';
import { vibrate } from '@/lib/haptics';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { cn } from '@/components/ui/cn';

interface Chip {
  id: string;
  label: string;
  title?: string;
  icon?: React.ReactNode;
}

/** Rolo horizontal infinito: três cópias da lista; ao chegar a uma ponta salta uma cópia (invisível) e continua. */
function Roller({ chips, currentId, onPick, label, testid }: { chips: Chip[]; currentId: string; onPick: (id: string) => void; label: string; testid: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // cada cópia tem pelo menos 8 chips para haver sempre por onde rolar
  const copy = useMemo(() => {
    if (!chips.length) return [] as Chip[];
    const out: Chip[] = [];
    while (out.length < 8) out.push(...chips);
    return out;
  }, [chips]);
  const all = useMemo(() => [...copy, ...copy, ...copy], [copy]);
  const lastTick = useRef<number | null>(null);

  // centra o item atual na cópia do meio
  useEffect(() => {
    const el = ref.current;
    if (!el || !copy.length) return;
    const idx = copy.findIndex((c) => c.id === currentId);
    const target = el.querySelector<HTMLElement>(`[data-i="${copy.length + Math.max(0, idx)}"]`);
    if (target) el.scrollLeft = target.offsetLeft - el.clientWidth / 2 + target.offsetWidth / 2;
  }, [copy, currentId]);

  const onScroll = () => {
    const el = ref.current;
    if (!el || !copy.length) return;
    const one = el.scrollWidth / 3;
    if (el.scrollLeft < one * 0.5) el.scrollLeft += one;
    else if (el.scrollLeft > one * 1.5) el.scrollLeft -= one;
    // vibração suave a cada item que passa no centro
    const mid = el.scrollLeft + el.clientWidth / 2;
    const items = el.children;
    for (let i = 0; i < items.length; i++) {
      const c = items[i] as HTMLElement;
      if (mid >= c.offsetLeft && mid < c.offsetLeft + c.offsetWidth) {
        if (lastTick.current !== i) {
          if (lastTick.current !== null) vibrate(5);
          lastTick.current = i;
        }
        break;
      }
    }
  };

  return (
    <div className="relative" data-testid={testid}>
      <div
        ref={ref}
        onScroll={onScroll}
        aria-label={label}
        className="flex snap-x snap-proximity gap-1.5 overflow-x-auto px-[40%] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%)', maskImage: 'linear-gradient(90deg, transparent 0, #000 22%, #000 78%, transparent 100%)' }}
      >
        {all.map((c, i) => (
          <button
            key={i}
            type="button"
            data-i={i}
            title={c.title}
            onClick={() => onPick(c.id)}
            className={cn('flex h-8 shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap', c.id === currentId ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Aparece ao expandir as barras de baixo (telemóvel): dois rolos infinitos, um de símbolos e outro de intervalos. */
export function MobileRollers() {
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const watch = useWorkspace((s) => (s.watchlists.find((w) => w.id === s.activeWatchlist) ?? s.watchlists[0])?.symbols);
  const symbols: Chip[] = useMemo(() => {
    const ids = [...(watch ?? [])];
    if (cfg && !ids.includes(cfg.symbolId)) ids.unshift(cfg.symbolId);
    return ids.map((id) => {
      const r = resolveSymbol(id);
      return { id, label: r.name, icon: <AssetIcon symbol={r} size={16} /> };
    });
  }, [watch, cfg]);
  const tfs: Chip[] = useMemo(() => {
    const list = [...STANDARD_TFS] as string[];
    if (cfg && !list.includes(cfg.tf)) list.push(cfg.tf);
    return list.sort(compareTf).map((t) => ({ id: t, label: tfShort(t), title: tfLabel(t) }));
  }, [cfg]);
  if (!cfg) return null;
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-line bg-panel py-1 sm:hidden" data-testid="mobile-rollers">
      <Roller chips={symbols} currentId={cfg.symbolId} onPick={(id) => useWorkspace.getState().setSymbol(id, active)} label="Símbolos" testid="roller-symbols" />
      <Roller chips={tfs} currentId={cfg.tf} onPick={(id) => setChartTf(id, active)} label="Intervalos" testid="roller-tfs" />
    </div>
  );
}
