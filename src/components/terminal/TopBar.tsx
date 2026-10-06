'use client';
import { useRef, useState } from 'react';
import {
  CandlestickChart,
  ChevronDown,
  Camera,
  Settings,
  Maximize,
  Minimize,
  Undo2,
  Redo2,
  Rewind,
  Star,
  LayoutGrid,
  BarChart,
  LineChart,
  AreaChart,
  BarChart3,
  Sun,
  Moon,
  Activity,
  Search,
  Columns2,
  Rows2,
  Square,
  Grid2x2,
  PanelsLeftRight,
  Link2,
  FunctionSquare,
  Menu as MenuIcon,
  Crown,
} from 'lucide-react';
import { useWorkspace, type LayoutId } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { replay, useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { dataFeed, tfsFor } from '@/core/feed/datafeed';
import { isValidTf, normalizeTf, STANDARD_TFS, tfLabel, tfShort, compareTf } from '@/core/timeframes';
import type { ChartType } from '@/core/types';
import { getChart } from '@/chart/registry';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { cn } from '@/components/ui/cn';
import { AssetIcon } from '@/components/chart/AssetIcon';
import { UserMenu } from './UserMenu';
import { toast } from '@/components/ui/Toast';
import { setChartTf, setLayoutGated } from '@/lib/gates';
import { useSymbolWheel, useTfWheel } from './useWheels';
import { canAddIndicator, openUpgrade, usePlan } from '@/lib/billing';
import { getIndicator } from '@/core/indicators/registry';

const CHART_TYPES: { id: ChartType; label: string; icon: typeof CandlestickChart }[] = [
  { id: 'candles', label: 'Velas', icon: CandlestickChart },
  { id: 'hollow', label: 'Velas ocas', icon: CandlestickChart },
  { id: 'heikin', label: 'Heikin Ashi', icon: CandlestickChart },
  { id: 'bars', label: 'Barras', icon: BarChart },
  { id: 'line', label: 'Linha', icon: LineChart },
  { id: 'area', label: 'Área', icon: AreaChart },
  { id: 'baseline', label: 'Linha de base', icon: Activity },
  { id: 'columns', label: 'Colunas', icon: BarChart3 },
];

const LAYOUTS: { id: LayoutId; label: string; icon: typeof Square }[] = [
  { id: '1', label: '1 gráfico', icon: Square },
  { id: '2h', label: '2 lado a lado', icon: Columns2 },
  { id: '2v', label: '2 empilhados', icon: Rows2 },
  { id: '3', label: '3 gráficos', icon: PanelsLeftRight },
  { id: '4', label: '4 gráficos', icon: Grid2x2 },
];

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function TimeframeMenu() {
  const active = useWorkspace((s) => s.active);
  const tf = useWorkspace((s) => s.charts[s.active]?.tf ?? '1h');
  const favorites = useWorkspace((s) => s.favoriteTfs);
  const setTf = setChartTf;
  const toggleFav = useWorkspace((s) => s.toggleFavoriteTf);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const favs = [...favorites].sort(compareTf);
  const wheel = useTfWheel(active);
  const symId = useWorkspace((s) => s.charts[active]?.symbolId);
  const secs = tfsFor(symId ? resolveSymbol(symId) : null).filter((t) => t.endsWith('s'));
  const groups: { label: string; items: string[] }[] = [
    ...(secs.length ? [{ label: 'Segundos', items: secs }] : []),
    { label: 'Minutos', items: STANDARD_TFS.filter((t) => t.endsWith('m')) },
    { label: 'Horas', items: STANDARD_TFS.filter((t) => t.endsWith('h')) },
    { label: 'Dias', items: STANDARD_TFS.filter((t) => /[DWM]$/.test(t)) },
  ];
  const pick = (t: string) => {
    setTf(t, active);
    setOpen(false);
  };
  return (
    <div className="flex items-center">
      <div className="hidden items-center md:flex">
        {favs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTf(t, active)}
            title={tfLabel(t)}
            className={cn('h-8 min-w-8 rounded-md px-1.5 text-[13px] font-medium transition-colors', tf === t ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
          >
            {tfShort(t)}
          </button>
        ))}
      </div>
      {wheel.overlay}
      <button
        ref={ref}
        type="button"
        {...wheel.bind}
        onClick={() => setOpen((o) => !o)}
        title="Intervalo de tempo (no telemóvel: carregue e arraste para cima/baixo)"
        className={cn('flex h-8 items-center gap-0.5 rounded-md px-1.5 text-[13px] font-medium hover:bg-hover', !favs.includes(tf) && 'text-accent')}
      >
        <span className="md:hidden">{tfShort(tf)}</span>
        {!favs.includes(tf) && <span className="hidden md:inline">{tfShort(tf)}</span>}
        <ChevronDown size={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <MenuList className="w-[230px]">
          <div className="px-2 pb-1.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = custom.trim();
                if (!isValidTf(v)) {
                  toast('Intervalo inválido', { kind: 'error', body: 'Use, por exemplo: 7m, 90m, 2h, 3D' });
                  return;
                }
                if (symId && !dataFeed().supports(resolveSymbol(symId), normalizeTf(v))) {
                  toast('Intervalo não disponível', { kind: 'error', body: 'Este símbolo não tem esse intervalo (segundos só existem em sintéticos, cripto e demonstração).' });
                  return;
                }
                pick(normalizeTf(v));
                setCustom('');
              }}
            >
              <Input placeholder="Personalizado (ex.: 7m, 3h)" value={custom} onChange={(e) => setCustom(e.target.value)} />
            </form>
          </div>
          {groups.map((g) => (
            <div key={g.label}>
              <MenuHeader>{g.label}</MenuHeader>
              {g.items.map((t) => (
                <div key={t} className="group flex items-center">
                  <MenuItem label={tfLabel(t)} active={tf === t} onClick={() => pick(t)} />
                  <button type="button" aria-label="Favorito" onClick={() => toggleFav(t)} className={cn('mr-2 rounded p-1', favorites.includes(t) ? 'text-warn' : 'text-faint opacity-0 group-hover:opacity-100')}>
                    <Star size={14} fill={favorites.includes(t) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </MenuList>
      </Popover>
    </div>
  );
}

function ChartTypeMenu() {
  const active = useWorkspace((s) => s.active);
  const type = useWorkspace((s) => s.charts[s.active]?.chartType ?? 'candles');
  const update = useWorkspace((s) => s.updateChart);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cur = CHART_TYPES.find((c) => c.id === type) ?? CHART_TYPES[0];
  return (
    <>
      <IconButton ref={ref} label={`Tipo de gráfico: ${cur.label}`} onClick={() => setOpen((o) => !o)}>
        <cur.icon size={18} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <MenuList>
          {CHART_TYPES.map((c) => (
            <MenuItem
              key={c.id}
              icon={<c.icon size={16} />}
              label={c.label}
              active={c.id === type}
              onClick={() => {
                update(active, { chartType: c.id });
                setOpen(false);
              }}
            />
          ))}
        </MenuList>
      </Popover>
    </>
  );
}

function LayoutMenu() {
  const layout = useWorkspace((s) => s.layout);
  const setLayout = setLayoutGated;
  const sync = useWorkspace((s) => s.sync);
  const setSync = useWorkspace((s) => s.setSync);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton ref={ref} label="Layout de gráficos" onClick={() => setOpen((o) => !o)}>
        <LayoutGrid size={18} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-end">
        <MenuList className="w-[240px]">
          <MenuHeader>Layout</MenuHeader>
          {LAYOUTS.map((l) => (
            <MenuItem key={l.id} icon={<l.icon size={16} />} label={l.label} active={layout === l.id} onClick={() => (setOpen(false), setLayout(l.id))} />
          ))}
          <MenuSeparator />
          <MenuHeader>Sincronizar entre gráficos</MenuHeader>
          <MenuItem icon={<Link2 size={15} />} label="Símbolo" checked={sync.symbol} onClick={() => setSync({ symbol: !sync.symbol })} />
          <MenuItem icon={<Link2 size={15} />} label="Intervalo" checked={sync.interval} onClick={() => setSync({ interval: !sync.interval })} />
          <MenuItem icon={<Link2 size={15} />} label="Mira (crosshair)" checked={sync.crosshair} onClick={() => setSync({ crosshair: !sync.crosshair })} />
          <div className="px-3 pt-1 pb-1 text-[11px] text-muted">O replay usa sempre o mesmo instante em todos os gráficos.</div>
        </MenuList>
      </Popover>
    </>
  );
}

export function TopBar() {
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const replayActive = useReplay((s) => s.active);
  const undo = useDrawings((s) => s.undo);
  const redo = useDrawings((s) => s.redo);
  const [full, setFull] = useState(false);
  const sym = cfg ? resolveSymbol(cfg.symbolId) : null;
  const symWheel = useSymbolWheel(active);

  const screenshot = () => {
    if (!cfg) return;
    const c = getChart(cfg.id);
    if (!c) return;
    const canvas = c.screenshot();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${sym?.name ?? 'grafico'}_${cfg.tf}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
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
    <header className="flex h-[42px] shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line bg-panel px-1.5 no-select">
      <IconButton label="Ferramentas de desenho" className="sm:hidden" onClick={() => useUi.getState().set({ mobileTools: !useUi.getState().mobileTools })}>
        <MenuIcon size={18} />
      </IconButton>
      {symWheel.overlay}
      <button
        type="button"
        {...symWheel.bind}
        onClick={() => useUi.getState().openSymbolSearch('', active)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 hover:bg-hover max-sm:hidden"
        title="Procurar símbolo (no telemóvel: carregue e arraste para cima/baixo para percorrer a lista)"
        data-testid="symbol-button"
      >
        {sym && <AssetIcon symbol={sym} size={18} />}
        <span className="max-w-[140px] truncate text-[14px] font-semibold">{sym?.name ?? '—'}</span>
        <Search size={14} className="text-muted" />
      </button>
      <div className="contents max-sm:hidden">
        <Divider />
        <TimeframeMenu />
        <Divider />
      </div>
      <ChartTypeMenu />
      <button
        type="button"
        onClick={() => useUi.getState().set({ indicators: true })}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] hover:bg-hover"
        title="Indicadores (/)"
        data-testid="indicators-button"
      >
        <FunctionSquare size={18} />
        <span className="hidden lg:inline">Indicadores</span>
      </button>
      <FavIndicatorsMenu />
      <Divider />
      <button
        type="button"
        onClick={() => (replayActive ? replay.exit() : replay.enter())}
        className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors', replayActive ? 'bg-accent text-white hover:bg-accent-hover' : 'hover:bg-hover')}
        title="Bar Replay"
        data-testid="replay-button"
      >
        <Rewind size={17} />
        <span className="hidden sm:inline">Replay</span>
      </button>
      <Divider />
      <IconButton label="Desfazer (Ctrl+Z)" onClick={() => cfg && undo(cfg.symbolId)}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Refazer (Ctrl+Y)" onClick={() => cfg && redo(cfg.symbolId)}>
        <Redo2 size={17} />
      </IconButton>

      <div className="flex-1" />

      <PlanBadge />
      <LayoutMenu />
      <IconButton label="Captura do gráfico" onClick={screenshot}>
        <Camera size={17} />
      </IconButton>
      <IconButton label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}>
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </IconButton>
      <IconButton label="Definições" onClick={() => useUi.getState().set({ settings: true })}>
        <Settings size={17} />
      </IconButton>
      <IconButton label="Ecrã inteiro" className="hidden sm:inline-flex" onClick={fullscreen}>
        {full ? <Minimize size={17} /> : <Maximize size={17} />}
      </IconButton>
      <Divider />
      <UserMenu />
    </header>
  );
}

/** Plano atual: "Pro" (pago ou em teste) ou botão para assinar. */
function PlanBadge() {
  const plan = usePlan();
  if (!plan.loaded) return null;
  const label = plan.reason === 'paid' || plan.reason === 'lifetime' ? 'Pro' : plan.reason === 'trial' ? `Pro · ${plan.daysLeft}d` : 'Assinar Pro';
  return (
    <button
      type="button"
      onClick={() => openUpgrade()}
      title={plan.reason === 'trial' ? 'Teste do Pro' : plan.reason === 'lifetime' ? 'Pro vitalício' : plan.reason === 'paid' ? 'Plano Pro' : 'Ver o plano Pro'}
      className={cn(
        'mr-1 flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors',
        plan.reason === 'free' ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-warn/15 text-warn hover:bg-warn/25',
      )}
      data-testid="plan-badge"
    >
      <Crown size={13} />
      {label}
    </button>
  );
}

/** Atalho para os indicadores favoritos: um toque adiciona ao gráfico ativo. */
function FavIndicatorsMenu() {
  const favs = useSettings((s) => s.favoriteIndicators);
  const active = useWorkspace((s) => s.active);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!favs.length) return null;
  return (
    <>
      <button ref={ref} type="button" aria-label="Indicadores favoritos" title="Indicadores favoritos" onClick={() => setOpen((o) => !o)} className="-ml-1 flex h-8 w-5 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-text">
        <ChevronDown size={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} placement="bottom-start">
        <MenuList className="w-[240px]">
          <MenuHeader>Indicadores favoritos</MenuHeader>
          {favs.map((id) => {
            const def = getIndicator(id);
            if (!def) return null;
            return (
              <MenuItem
                key={id}
                icon={<Star size={14} className="text-warn" fill="currentColor" />}
                label={def.name}
                hint={def.short}
                onClick={() => {
                  setOpen(false);
                  const ws = useWorkspace.getState();
                  if (!canAddIndicator(ws.charts[active]?.indicators.length ?? 0)) return;
                  ws.addIndicator(id, active);
                  toast(`${def.name} adicionado`, { kind: 'success', duration: 1800 });
                }}
              />
            );
          })}
          <MenuSeparator />
          <MenuItem icon={<FunctionSquare size={15} />} label="Todos os indicadores…" onClick={() => (setOpen(false), useUi.getState().set({ indicators: true }))} />
        </MenuList>
      </Popover>
    </>
  );
}
