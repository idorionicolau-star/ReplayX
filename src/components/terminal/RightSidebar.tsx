'use client';
import { ListOrdered, Briefcase, Newspaper, CalendarDays, ListTree, Bell, X } from 'lucide-react';
import { useWorkspace, type RightTab } from '@/store/workspace';
import { Watchlist } from '@/components/panels/Watchlist';
import { TradePanel } from '@/components/panels/TradePanel';
import { NewsPanel } from '@/components/panels/NewsPanel';
import { CalendarPanel } from '@/components/panels/CalendarPanel';
import { ObjectTree } from '@/components/panels/ObjectTree';
import { AlertsPanel } from '@/components/panels/AlertsPanel';
import { Resizer } from './Resizer';
import { cn } from '@/components/ui/cn';
import { useCompact } from '@/lib/compact';
import { tr } from '@/i18n';

export const RIGHT_TABS: { id: RightTab; label: string; icon: typeof ListOrdered }[] = [
  { id: 'watchlist', label: tr('Lista de observação'), icon: ListOrdered },
  { id: 'trade', label: tr('Negociar'), icon: Briefcase },
  { id: 'news', label: tr('Notícias'), icon: Newspaper },
  { id: 'calendar', label: tr('Calendário económico'), icon: CalendarDays },
  { id: 'objects', label: tr('Árvore de objetos'), icon: ListTree },
  { id: 'alerts', label: 'Alertas', icon: Bell },
];

export function RightIconBar() {
  const tab = useWorkspace((s) => s.rightTab);
  const setTab = useWorkspace((s) => s.setRightTab);
  return (
    <nav className="hidden w-[46px] shrink-0 flex-col items-center gap-1 border-l border-line bg-panel py-1.5 sm:flex">
      {RIGHT_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          onClick={() => setTab(tab === t.id ? null : t.id)}
          className={cn('flex h-10 w-10 items-center justify-center rounded-md transition-colors', tab === t.id ? 'bg-accent-soft text-accent' : 'text-text hover:bg-hover')}
          data-testid={`right-tab-${t.id}`}
        >
          <t.icon size={19} />
        </button>
      ))}
    </nav>
  );
}

export function RightPanel() {
  const compact = useCompact();
  const tab = useWorkspace((s) => s.rightTab);
  const width = useWorkspace((s) => s.rightWidth);
  const setWidth = useWorkspace((s) => s.setRightWidth);
  const setTab = useWorkspace((s) => s.setRightTab);
  if (!tab) return null;
  const info = RIGHT_TABS.find((t) => t.id === tab)!;
  return (
    <>
      {!compact && <Resizer direction="horizontal" onResize={(d) => setWidth(width - d)} className="hidden sm:block" />}
      <section
        className={cn(
          'flex flex-col bg-panel',
          compact
            ? 'fixed top-11 right-0 bottom-0 z-40 w-[min(360px,60vw)] border-l border-line shadow-pop'
            : 'fixed inset-x-0 bottom-12 z-40 h-[62vh] rounded-t-xl border-t border-line shadow-pop sm:static sm:z-auto sm:h-auto sm:rounded-none sm:border-t-0 sm:shadow-none',
        )}
        style={{ width: !compact && typeof window !== 'undefined' && window.innerWidth >= 640 ? width : undefined }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-[13px] font-semibold">{info.label}</span>
          <button type="button" aria-label={tr('Fechar painel')} onClick={() => setTab(null)} className="rounded p-1 text-muted hover:bg-hover hover:text-text">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'watchlist' && <Watchlist />}
          {tab === 'trade' && <TradePanel />}
          {tab === 'news' && <NewsPanel />}
          {tab === 'calendar' && <CalendarPanel />}
          {tab === 'objects' && <ObjectTree />}
          {tab === 'alerts' && <AlertsPanel />}
        </div>
      </section>
    </>
  );
}
