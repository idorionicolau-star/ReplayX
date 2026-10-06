'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { useAuth } from '@/lib/auth';
import { startSync, stopSync } from '@/lib/cloud';
import { setChartTf } from '@/lib/gates';
import { startBilling, usePlan } from '@/lib/billing';
import { UpgradeDialog } from '@/components/dialogs/UpgradeDialog';
import { FavoritesBar } from '@/components/chart/FavoritesBar';
import { AlertPopups } from '@/components/dialogs/AlertPopups';
import { PwaPrompts } from './PwaPrompts';
import { ChartBottomBar } from './ChartBottomBar';
import { replay, useReplay } from '@/replay/engine';
import { getChart } from '@/chart/registry';
import { isValidTf, normalizeTf } from '@/core/timeframes';
import { ensureLiveWatch, notifyFills, submitOrder } from '@/trading/actions';
import { TopBar } from './TopBar';
import { DrawingToolbar } from './DrawingToolbar';
import { ChartGrid } from './ChartGrid';
import { RIGHT_TABS, RightIconBar, RightPanel } from './RightSidebar';
import { BottomPanel } from './BottomPanel';
import { ChartContextMenu } from './ChartContextMenu';
import { TfQuickInput } from './TfQuickInput';
import { useAlertMonitor } from './useAlertMonitor';
import { ReplayBar } from '@/components/replay/ReplayBar';
import { MobileStrip } from './MobileStrip';
import { SymbolSearch } from '@/components/dialogs/SymbolSearch';
import { IndicatorsDialog } from '@/components/dialogs/IndicatorsDialog';
import { IndicatorSettings } from '@/components/dialogs/IndicatorSettings';
import { DrawingSettings } from '@/components/dialogs/DrawingSettings';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { GoToDate } from '@/components/dialogs/GoToDate';
import { Shortcuts } from '@/components/dialogs/Shortcuts';
import { AlertDialog } from '@/components/dialogs/AlertDialog';
import { Toaster } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import type { ToolId } from '@/chart/drawings/types';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ui = useUi.getState();
      if (ui.symbolSearch.open || ui.indicators || ui.settings || ui.gotoDate || ui.drawingSettings || ui.indicatorSettings) return;
      const ws = useWorkspace.getState();
      const cfg = ws.charts[ws.active];
      const r = useReplay.getState();
      // replay
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'ArrowRight' && r.active && !r.selecting) {
          e.preventDefault();
          void replay.stepForward();
          return;
        }
        if (e.key === 'ArrowLeft' && r.active && !r.selecting) {
          e.preventDefault();
          void replay.stepBack();
          return;
        }
        if (e.key === 'ArrowDown' && r.active && !r.selecting) {
          e.preventDefault();
          replay.toggle();
          return;
        }
      }
      // desfazer/refazer
      if ((e.ctrlKey || e.metaKey) && !e.altKey && cfg) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          useDrawings.getState().undo(cfg.symbolId);
          return;
        }
        if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
          e.preventDefault();
          useDrawings.getState().redo(cfg.symbolId);
          return;
        }
        return;
      }
      // ferramentas com Alt
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.code;
        const map: Record<string, ToolId> = { KeyT: 'trendline', KeyH: 'hline', KeyV: 'vline', KeyF: 'fib', KeyL: 'long', KeyS: 'short', KeyC: 'crossline' };
        if (e.shiftKey && k === 'KeyR') {
          e.preventDefault();
          useDrawings.getState().setTool('rect');
          return;
        }
        if (k === 'KeyR' && cfg) {
          e.preventDefault();
          getChart(cfg.id)?.resetView();
          return;
        }
        if ((k === 'KeyB' || k === 'KeyN') && cfg) {
          e.preventDefault();
          submitOrder({ symbolId: cfg.symbolId, side: k === 'KeyB' ? 'long' : 'short', type: 'market', qty: useSettings.getState().trading.defaultQty });
          return;
        }
        if (map[k]) {
          e.preventDefault();
          useDrawings.getState().setTool(map[k]);
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        ui.set({ indicators: true });
        return;
      }
      if (e.key === 'Escape' && r.selecting) {
        replay.cancelSelection();
        return;
      }
      // escrever no gráfico: letras → pesquisa de símbolo, números → intervalo
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (/[0-9]/.test(e.key)) {
          e.preventDefault();
          ui.set({ tfInput: (ui.tfInput ?? '') + e.key });
        } else if (/[a-zA-Z]/.test(e.key) && ui.tfInput !== null && /^[mhdwMHDW]$/.test(e.key)) {
          e.preventDefault();
          const v = normalizeTf(`${ui.tfInput}${e.key === 'H' ? 'h' : e.key === 'd' ? 'D' : e.key === 'w' ? 'W' : e.key}`);
          if (isValidTf(v) && cfg) setChartTf(v);
          ui.set({ tfInput: null });
        } else if (/[a-zA-Z]/.test(e.key)) {
          e.preventDefault();
          ui.openSymbolSearch(e.key, ws.active);
        }
      } else if (e.key === 'Enter' && ui.tfInput) {
        const n = parseInt(ui.tfInput, 10);
        if (n > 0 && cfg) setChartTf(normalizeTf(`${n}m`));
        ui.set({ tfInput: null });
      } else if (e.key === 'Escape' && ui.tfInput !== null) ui.set({ tfInput: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Terminal() {
  const theme = useSettings((s) => s.theme);
  const user = useAuth((s) => s.user);
  const mobileTools = useUi((s) => s.mobileTools);
  // esconder as barras de baixo só vale no telemóvel (no computador não há botão para as voltar a mostrar)
  const narrow = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(max-width: 639px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  );
  const hideBottom = useSettings((s) => s.hideBottomBars) && narrow;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (user && !user.guest) void startSync(user.uid);
    return () => stopSync();
  }, [user]);

  useEffect(() => {
    startBilling(user && !user.guest ? user.uid : null);
  }, [user]);

  // no plano grátis só há um gráfico (o layout guardado de quando era Pro volta a 1)
  const plan = usePlan();
  const layout = useWorkspace((s) => s.layout);
  useEffect(() => {
    if (plan.loaded && !plan.pro && layout !== '1') useWorkspace.getState().setLayout('1');
  }, [plan.loaded, plan.pro, layout]);

  useEffect(() => {
    // no telemóvel começa com o gráfico livre
    if (window.innerWidth < 640) useWorkspace.getState().setRightTab(null);
    ensureLiveWatch();
    const off = replay.onFills(notifyFills);
    // retoma um replay que estava ativo antes de recarregar a página
    const r = useReplay.getState();
    if (r.active && r.cursor === null) useReplay.setState({ active: false });
    if (r.selecting) useReplay.setState({ selecting: false, active: r.cursor !== null });
    // atalhos da app instalada (manifesto): ?action=replay, ?tab=alerts
    const q = new URLSearchParams(window.location.search);
    const tab = q.get('tab');
    if (tab === 'alerts' || tab === 'watchlist' || tab === 'trade' || tab === 'news') useWorkspace.getState().setRightTab(tab);
    if (q.get('action') === 'replay' && !useReplay.getState().active) replay.enter();
    if (q.has('tab') || q.has('action') || q.has('source')) window.history.replaceState(null, '', window.location.pathname);
    return off;
  }, []);

  useShortcuts();
  useAlertMonitor();

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <DrawingToolbar className="hidden sm:flex" />
        {/* a barra de ferramentas fica aberta enquanto se escolhem opções; fecha com ☰ ou ao escolher uma ferramenta */}
        {mobileTools && (
          <div className="absolute inset-y-0 left-0 z-40 flex sm:hidden" data-testid="mobile-tools">
            <DrawingToolbar className="flex shadow-pop" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn('relative min-h-0 flex-1')}>
            <ChartGrid />
            <FavoritesBar />
            <ReplayBar />
            <TfQuickInput />
            <HideBottomButton hidden={hideBottom} />
          </div>
          {!hideBottom && <ChartBottomBar />}
          {!hideBottom && <BottomPanel />}
        </div>
        <RightPanel />
        <RightIconBar />
      </div>
      <MobileStrip />
      <MobileNav />
      <SymbolSearch />
      <IndicatorsDialog />
      <IndicatorSettings />
      <DrawingSettings />
      <SettingsDialog />
      <GoToDate />
      <Shortcuts />
      <AlertDialog />
      <ChartContextMenu />
      <UpgradeDialog />
      <AlertPopups />
      <PwaPrompts />
      <Toaster />
    </div>
  );
}


function MobileNav() {
  const tab = useWorkspace((s) => s.rightTab);
  const setTab = useWorkspace((s) => s.setRightTab);
  return (
    <nav className="flex h-12 shrink-0 items-center justify-around border-t border-line bg-panel sm:hidden">
      {RIGHT_TABS.map((t) => (
        <button key={t.id} type="button" aria-label={t.label} onClick={() => setTab(tab === t.id ? null : t.id)} className={cn('flex h-10 w-12 items-center justify-center rounded-md', tab === t.id ? 'text-accent' : 'text-muted')}>
          <t.icon size={20} />
        </button>
      ))}
    </nav>
  );
}

/** No telemóvel: esconde/mostra as barras de baixo para ter o gráfico todo à vista. */
function HideBottomButton({ hidden }: { hidden: boolean }) {
  const picking = useReplay((s) => s.active && s.selecting);
  if (picking) return null; // o painel de escolha do replay ocupa esse canto
  return (
    <button
      type="button"
      aria-label={hidden ? 'Mostrar as barras de baixo' : 'Esconder as barras de baixo'}
      title={hidden ? 'Mostrar as barras de baixo' : 'Esconder as barras de baixo'}
      onClick={() => useSettings.getState().set({ hideBottomBars: !hidden })}
      className="absolute bottom-2 left-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-elev/90 text-muted shadow-sm active:bg-hover sm:hidden"
      data-testid="toggle-bottom"
    >
      {hidden ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );
}
