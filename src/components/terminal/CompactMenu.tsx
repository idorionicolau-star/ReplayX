'use client';
import { Camera, Crown, FunctionSquare, Maximize, Minimize, PanelBottom, PencilRuler, Redo2, Settings, Sun, Moon, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { useAuth } from '@/lib/auth';
import { openUpgrade, usePlan } from '@/lib/billing';
import { resolveSymbol } from '@/core/symbols';
import { getChart } from '@/chart/registry';
import { MenuHeader, MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import { CHART_TYPES } from './TopBar';
import { RIGHT_TABS } from './RightSidebar';
import { UserMenu } from './UserMenu';

/** Menu ☰ do telemóvel em paisagem: tudo o que saiu da barra e das margens do gráfico. */
export function CompactMenu() {
  const open = useUi((s) => s.menu);
  const bottom = useUi((s) => s.compactBottom);
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const update = useWorkspace((s) => s.updateChart);
  const setTab = useWorkspace((s) => s.setRightTab);
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const undo = useDrawings((s) => s.undo);
  const redo = useDrawings((s) => s.redo);
  const user = useAuth((s) => s.user);
  const plan = usePlan();
  const [full, setFull] = useState(false);
  if (!open) return null;
  const ui = useUi.getState();
  const close = () => ui.set({ menu: false });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const screenshot = () => {
    if (!cfg) return;
    const c = getChart(cfg.id);
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.screenshot().toDataURL('image/png');
    a.download = `${resolveSymbol(cfg.symbolId)?.name ?? 'grafico'}_${cfg.tf}.png`;
    a.click();
  };
  const fullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFull(true);
      } else {
        await document.exitFullscreen();
        setFull(false);
      }
    } catch {
      /* sem suporte */
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex" data-testid="compact-menu">
      <button type="button" aria-label="Fechar o menu" className="absolute inset-0 bg-black/40" onClick={close} />
      <aside className="relative flex h-full w-[300px] max-w-[85%] flex-col overflow-y-auto border-r border-line bg-panel shadow-pop">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-[13px] font-semibold">Menu</span>
          <div className="flex items-center gap-1">
            <UserMenu />
            <button type="button" aria-label="Fechar" onClick={close} className="rounded p-1 text-muted hover:bg-hover hover:text-text">
              <X size={17} />
            </button>
          </div>
        </div>
        <MenuList className="pb-3">
          {!user?.guest && plan.loaded && plan.reason === 'free' && <MenuItem icon={<Crown size={15} className="text-warn" />} label="Assinar Pro" onClick={run(() => openUpgrade())} />}
          <MenuHeader>Ferramentas</MenuHeader>
          <MenuItem icon={<PencilRuler size={15} />} label="Ferramentas de desenho" onClick={run(() => useUi.getState().set({ mobileTools: true }))} />
          <MenuItem icon={<FunctionSquare size={15} />} label="Indicadores" onClick={run(() => useUi.getState().set({ indicators: true }))} />
          <MenuItem icon={<Undo2 size={15} />} label="Desfazer" onClick={() => cfg && undo(cfg.symbolId)} />
          <MenuItem icon={<Redo2 size={15} />} label="Refazer" onClick={() => cfg && redo(cfg.symbolId)} />
          <MenuHeader>Tipo de gráfico</MenuHeader>
          <div className="grid grid-cols-4 gap-1 px-2 pb-1">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.label}
                aria-label={t.label}
                onClick={() => update(active, { chartType: t.id })}
                className={cn('flex h-9 items-center justify-center rounded-md', (cfg?.chartType ?? 'candles') === t.id ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
              >
                <t.icon size={17} />
              </button>
            ))}
          </div>
          <MenuHeader>Painéis</MenuHeader>
          {RIGHT_TABS.map((t) => (
            <MenuItem key={t.id} icon={<t.icon size={15} />} label={t.label} onClick={run(() => setTab(t.id))} />
          ))}
          <MenuItem icon={<PanelBottom size={15} />} label="Barra de períodos e diário" checked={bottom} onClick={() => ui.set({ compactBottom: !bottom })} />
          <MenuSeparator />
          <MenuItem icon={<Camera size={15} />} label="Captura do gráfico" onClick={run(screenshot)} />
          <MenuItem icon={theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} />
          <MenuItem icon={full ? <Minimize size={15} /> : <Maximize size={15} />} label="Ecrã inteiro" onClick={run(() => void fullscreen())} />
          <MenuItem icon={<Settings size={15} />} label="Definições" onClick={run(() => useUi.getState().set({ settings: true }))} />
        </MenuList>
      </aside>
    </div>
  );
}
