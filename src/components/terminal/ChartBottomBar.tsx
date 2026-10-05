'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useSettings, TIMEZONES } from '@/store/settings';
import { useUi } from '@/store/ui';
import { useReplay } from '@/replay/engine';
import { getChart } from '@/chart/registry';
import { setChartTf } from '@/lib/gates';
import { tzName } from '@/lib/format';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuHeader } from '@/components/ui/Menu';
import { cn } from '@/components/ui/cn';
import type { ChartController } from '@/chart/controller';

const DAY = 86400;

/** Períodos como no TradingView: escolhem o intervalo e mostram esse tempo para trás. */
export const RANGES: { id: string; label: string; title: string; tf: string; sec: number | 'ytd' | 'all' }[] = [
  { id: '1D', label: '1D', title: '1 dia (velas de 1 minuto)', tf: '1m', sec: DAY },
  { id: '5D', label: '5D', title: '5 dias (velas de 5 minutos)', tf: '5m', sec: 5 * DAY },
  { id: '1M', label: '1M', title: '1 mês (velas de 30 minutos)', tf: '30m', sec: 30 * DAY },
  { id: '3M', label: '3M', title: '3 meses (velas de 1 hora)', tf: '1h', sec: 91 * DAY },
  { id: '6M', label: '6M', title: '6 meses (velas de 2 horas)', tf: '2h', sec: 182 * DAY },
  { id: 'YTD', label: 'YTD', title: 'Desde o início do ano (velas diárias)', tf: '1D', sec: 'ytd' },
  { id: '1Y', label: '1A', title: '1 ano (velas diárias)', tf: '1D', sec: 365 * DAY },
  { id: '5Y', label: '5A', title: '5 anos (velas semanais)', tf: '1W', sec: 5 * 365 * DAY },
  { id: 'ALL', label: 'Tudo', title: 'Todo o histórico (velas mensais)', tf: '1M', sec: 'all' },
];

/** Espera que o gráfico tenha carregado o intervalo pedido. */
async function waitForChart(id: string, tf: string, timeoutMs = 15000): Promise<ChartController | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const c = getChart(id);
    if (c && c.tf === tf) {
      await c.lastLoad;
      if (c.tf === tf && c.bars.length) return c;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return null;
}

export async function applyRange(id: string) {
  const r = RANGES.find((x) => x.id === id);
  const ws = useWorkspace.getState();
  const cfg = ws.charts[ws.active];
  if (!r || !cfg) return;
  if (cfg.tf !== r.tf && !setChartTf(r.tf, ws.active)) return;
  const c = await waitForChart(cfg.id, r.tf);
  if (!c) return;
  const rp = useReplay.getState();
  const end = rp.active && rp.cursor !== null ? rp.cursor : Math.floor(Date.now() / 1000);
  const from = r.sec === 'all' ? 0 : r.sec === 'ytd' ? Date.UTC(new Date(end * 1000).getUTCFullYear(), 0, 1) / 1000 : end - r.sec;
  await c.showRange(from);
}

function fmtClock(tz: string) {
  const zone = tzName(tz);
  const d = new Date();
  const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: zone }).format(d);
  // desvio do fuso, ex.: UTC+2
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(d);
  const off = parts.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? '';
  return `${time} ${off === 'UTC' ? 'UTC' : off}`;
}

/** Barra por baixo dos gráficos: períodos, ir para data, relógio/fuso e escalas %, log, auto. */
export function ChartBottomBar() {
  const tz = useSettings((s) => s.timezone);
  const scaleMode = useSettings((s) => s.appearance.scaleMode);
  const autoFit = useSettings((s) => s.autoFit);
  const setSettings = useSettings((s) => s.set);
  const active = useWorkspace((s) => s.active);
  const [clock, setClock] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const tzRef = useRef<HTMLButtonElement>(null);
  const [tzOpen, setTzOpen] = useState(false);

  useEffect(() => {
    const tick = () => setClock(fmtClock(tz));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [tz]);

  const setScale = (mode: 'normal' | 'log' | 'percent') => {
    const st = useSettings.getState();
    st.set({ appearance: { ...st.appearance, scaleMode: st.appearance.scaleMode === mode ? 'normal' : mode } });
  };
  const chartId = () => useWorkspace.getState().charts[active]?.id;

  return (
    <div className="flex h-[30px] shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-panel px-1.5 text-[12px] no-select" data-testid="chart-bottom-bar">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          title={r.title}
          disabled={!!busy}
          onClick={async () => {
            setBusy(r.id);
            try {
              await applyRange(r.id);
            } finally {
              setBusy(null);
            }
          }}
          className={cn('h-6 shrink-0 rounded px-1.5 font-medium transition-colors hover:bg-hover', busy === r.id ? 'text-accent' : 'text-text')}
          data-testid={`range-${r.id}`}
        >
          {r.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px shrink-0 bg-line" />
      <button type="button" title="Ir para data" aria-label="Ir para data" onClick={() => useUi.getState().set({ gotoDate: true })} className="flex h-6 w-7 shrink-0 items-center justify-center rounded text-text hover:bg-hover">
        <CalendarClock size={15} />
      </button>
      <div className="flex-1" />
      <button ref={tzRef} type="button" title="Fuso horário" onClick={() => setTzOpen((o) => !o)} className="h-6 shrink-0 rounded px-2 tnum text-muted hover:bg-hover hover:text-text" data-testid="clock">
        {clock}
      </button>
      <Popover anchor={tzRef} open={tzOpen} onClose={() => setTzOpen(false)} placement="top-end">
        <MenuList className="max-h-[60vh] w-[240px] overflow-y-auto">
          <MenuHeader>Fuso horário</MenuHeader>
          {TIMEZONES.map((z) => (
            <MenuItem
              key={z.value}
              label={z.label}
              checked={tz === z.value}
              onClick={() => {
                useSettings.getState().set({ timezone: z.value });
                setTzOpen(false);
              }}
            />
          ))}
        </MenuList>
      </Popover>
      <span className="mx-1 h-4 w-px shrink-0 bg-line" />
      <button type="button" title="Escala em percentagem" onClick={() => setScale('percent')} className={cn('h-6 shrink-0 rounded px-1.5', scaleMode === 'percent' ? 'text-accent' : 'text-muted hover:bg-hover hover:text-text')}>
        %
      </button>
      <button type="button" title="Escala logarítmica" onClick={() => setScale('log')} className={cn('h-6 shrink-0 rounded px-1.5', scaleMode === 'log' ? 'text-accent' : 'text-muted hover:bg-hover hover:text-text')}>
        log
      </button>
      <button
        type="button"
        title={autoFit ? 'Escala automática: ligada (ajusta-se aos dados à vista)' : 'Escala automática: desligada. Toque para ajustar e ligar'}
        onClick={() => {
          const id = chartId();
          setSettings({ autoFit: !autoFit });
          if (id && !autoFit) getChart(id)?.fitView();
        }}
        className={cn('h-6 shrink-0 rounded px-1.5', autoFit ? 'text-accent' : 'text-muted hover:bg-hover hover:text-text')}
        data-testid="auto-fit"
      >
        auto
      </button>
    </div>
  );
}
