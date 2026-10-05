'use client';
import { parseTf } from '@/core/timeframes';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ChartController, type ChartStatus, type CrosshairInfo } from '@/chart/controller';
import { Interaction } from '@/chart/interaction';
import { focus } from '@/chart/bus';
import { registerChart, unregisterChart } from '@/chart/registry';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useDrawings } from '@/store/drawings';
import { useTrading, specFor } from '@/store/trading';
import { useAlerts } from '@/store/alerts';
import { useStrategies } from '@/store/strategies';
import { useUi } from '@/store/ui';
import { replay, useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { pnlFor, unrealized } from '@/core/trading/engine';
import { applyTradeAction, setLivePrice, tradingMode } from '@/trading/actions';
import { fmtMoney } from '@/lib/format';
import { Legend } from './Legend';
import { DrawingToolbarFloat } from './DrawingToolbarFloat';
import { ReplayPickBanner } from './ReplayPickBanner';
import { useScriptIndicators } from './useScriptIndicators';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

export function ChartPane({ index }: { index: number }) {
  const cfg = useWorkspace((s) => s.charts[index]);
  const isActive = useWorkspace((s) => s.active === index);
  const multi = useWorkspace((s) => s.charts.length > 1);
  const theme = useSettings((s) => s.theme);
  const upColor = useSettings((s) => s.upColor);
  const downColor = useSettings((s) => s.downColor);
  const timezone = useSettings((s) => s.timezone);
  const appearance = useSettings((s) => s.appearance);
  const watermark = useSettings((s) => s.showWatermark);
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  const selecting = useReplay((s) => s.active && s.selecting);
  const tool = useDrawings((s) => s.tool);

  const containerRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<ChartController | null>(null);
  const [ctrl, setCtrl] = useState<ChartController | null>(null);
  const [status, setStatus] = useState<ChartStatus>({ state: 'idle' });
  const [legend, setLegend] = useState<CrosshairInfo | null>(null);
  const [panes, setPanes] = useState<number[]>([]);
  const [barsVersion, setBarsVersion] = useState(0);

  const symbolId = cfg?.symbolId;
  const symbol = useMemo(() => (symbolId ? resolveSymbol(symbolId) : null), [symbolId]);
  const indexRef = useRef(index);
  const symbolRef = useRef(symbolId);
  const tfRef = useRef(cfg?.tf);
  const chartTf = cfg?.tf;
  useEffect(() => {
    indexRef.current = index;
    symbolRef.current = symbolId;
    tfRef.current = cfg?.tf;
  });

  // ---------- criar o gráfico ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !cfg) return;
    const s = useSettings.getState();
    const c = new ChartController(
      el,
      { dark: s.theme === 'dark', upColor: s.upColor, downColor: s.downColor, timezone: s.timezone, watermark: s.showWatermark, appearance: s.appearance },
      {
        onStatus: setStatus,
        onLegend: setLegend,
        onPanes: setPanes,
        onBars: () => setBarsVersion((v) => v + 1),
        getCursor: () => {
          const r = useReplay.getState();
          return r.active && !r.selecting ? r.cursor : null;
        },
      },
    );
    ctrlRef.current = c;
    setCtrl(c);
    const inter = new Interaction(c, {
      tool: () => useDrawings.getState().tool,
      setTool: (t) => useDrawings.getState().setTool(t),
      magnet: () => useSettings.getState().magnet,
      angleSnap: () => useSettings.getState().angleSnap,
      loupe: () => useSettings.getState().loupe,
      stayInDrawing: () => useSettings.getState().stayInDrawingMode,
      globalLocked: () => useDrawings.getState().locked,
      lastStyle: (t) => useDrawings.getState().lastStyle[t] ?? {},
      addDrawing: (d) => {
        const sid = symbolRef.current;
        if (!sid) return;
        if (d.data) d.data.account = useTrading.getState()[tradingMode()].balance;
        useDrawings.getState().add(sid, d);
      },
      patchDrawing: (id, patch) => symbolRef.current && useDrawings.getState().patchLive(symbolRef.current, id, patch),
      checkpoint: () => symbolRef.current && useDrawings.getState().checkpoint(symbolRef.current),
      commit: () => useDrawings.setState({ updatedAt: Date.now() }),
      select: (id) => useDrawings.getState().select(id && symbolRef.current ? { symbolId: symbolRef.current, id } : null),
      removeDrawing: (id) => symbolRef.current && useDrawings.getState().remove(symbolRef.current, id),
      replaySelecting: () => useReplay.getState().selecting,
      onReplayPick: (time) => {
        void replay.pickBar(time, tfRef.current ?? '1h');
      },
      onTrade: applyTradeAction,
      onContextMenu: (e) => useUi.getState().set({ contextMenu: { chart: indexRef.current, x: e.clientX, y: e.clientY, price: e.price, time: e.time, drawingId: e.drawingId } }),
      onEditDrawing: (id) => symbolRef.current && useUi.getState().set({ drawingSettings: { symbolId: symbolRef.current, id } }),
      onActivate: () => {
        if (useWorkspace.getState().active !== indexRef.current) useWorkspace.getState().setActive(indexRef.current);
      },
      accountSize: () => useTrading.getState()[tradingMode()].balance,
    });
    const chartId = cfg.id;
    registerChart(chartId, c);
    replay.register(chartId, {
      get symbol() {
        return c.symbol;
      },
      get tf() {
        return c.tf;
      },
      prepareReplay: (cur) => c.prepareReplay(cur),
      applyReplay: (cur) => c.applyReplay(cur),
    });
    return () => {
      inter.dispose();
      replay.unregister(chartId);
      unregisterChart(chartId);
      c.destroy();
      ctrlRef.current = null;
    };
    // o gráfico vive enquanto o id da célula não mudar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.id]);

  // ---------- tema ----------
  useEffect(() => {
    ctrl?.setTheme({ dark: theme === 'dark', upColor, downColor, timezone, watermark, appearance });
  }, [ctrl, theme, upColor, downColor, timezone, watermark, appearance]);

  // ---------- símbolo / timeframe / modo replay ----------
  useEffect(() => {
    if (!ctrl || !symbol || !cfg) return;
    const r = useReplay.getState();
    const cursor = r.active && !r.selecting ? r.cursor : null;
    void ctrl.load(symbol, cfg.tf, cursor).then(() => {
      if (cursor !== null) void replay.updatePrices();
    });
  }, [ctrl, symbol, cfg?.tf, replayOn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctrl && cfg) ctrl.setChartType(cfg.chartType);
  }, [ctrl, cfg?.chartType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctrl && cfg) ctrl.setIndicators(cfg.indicators);
  }, [ctrl, cfg?.indicators]); // eslint-disable-line react-hooks/exhaustive-deps

  useScriptIndicators(ctrl, cfg?.indicators ?? [], barsVersion);

  // ---------- desenhos ----------
  useEffect(() => {
    if (!ctrl || !symbolId) return;
    // "Visibilidade": alguns desenhos só aparecem em certos intervalos
    const unit = parseTf(chartTf ?? '1h').unit;
    const apply = (s: ReturnType<typeof useDrawings.getState>) => {
      const list = s.hidden ? [] : (s.bySymbol[symbolId] ?? []).filter((d) => !d.style.visibleOn || d.style.visibleOn.includes(unit as 'm'));
      ctrl.setDrawings(list, s.selected?.symbolId === symbolId ? s.selected.id : null);
    };
    apply(useDrawings.getState());
    return useDrawings.subscribe(apply);
  }, [ctrl, symbolId, chartTf]);

  // ---------- ordens e posições ----------
  useEffect(() => {
    if (!ctrl || !symbolId || !symbol) return;
    const spec = specFor(symbol);
    const update = () => {
      const mode = tradingMode();
      const acc = useTrading.getState()[mode];
      const priceNow = mode === 'replay' ? useReplay.getState().prices[symbolId] : ctrl.lastPrice();
      if (mode === 'live' && priceNow !== undefined && ctrl.cursor === null) setLivePrice(symbolId, priceNow);
      ctrl.setTrading({
        positions: acc.positions.filter((p) => p.symbolId === symbolId),
        orders: acc.orders.filter((o) => o.symbolId === symbolId),
        pnl: (p) => (priceNow === undefined ? 0 : unrealized(p, priceNow, spec)),
        pnlAt: (p, x) => pnlFor(p.side, p.qty, p.entryPrice, x, spec),
        fmtMoney: (v) => fmtMoney(v),
      });
      // marcas de execução
      const execs = useTrading.getState().execs[mode].filter((e) => e.symbolId === symbolId);
      const markers: SeriesMarker<Time>[] = execs.map((e) => {
        const buy = (e.kind === 'entry') === (e.side === 'long');
        return {
          time: e.time as UTCTimestamp,
          position: buy ? 'belowBar' : 'aboveBar',
          shape: buy ? 'arrowUp' : 'arrowDown',
          color: e.kind === 'exit' ? ((e.pnl ?? 0) >= 0 ? '#089981' : '#f23645') : buy ? '#2962ff' : '#e65100',
          text: e.kind === 'exit' && e.pnl !== undefined ? `${e.text} ${fmtMoney(e.pnl)}` : e.text,
        };
      });
      ctrl.setExecMarkers(markers);
    };
    update();
    const u1 = useTrading.subscribe(update);
    const u2 = useReplay.subscribe((s, prev) => {
      if (s.prices !== prev.prices || s.active !== prev.active || s.cursor !== prev.cursor) update();
    });
    const timer = setInterval(() => {
      if (tradingMode() === 'live') update();
    }, 1000);
    return () => {
      u1();
      u2();
      clearInterval(timer);
    };
  }, [ctrl, symbolId, symbol]);

  // ---------- execuções da estratégia testada ----------
  const applied = useStrategies((s) => s.applied);
  const tester = useStrategies((s) => s.tester);
  useEffect(() => {
    if (!ctrl || !cfg) return;
    if (!applied || applied.chartId !== cfg.id || !tester || tester.symbolId !== cfg.symbolId) {
      ctrl.setStrategyMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = tester.result.fills.map((f) => {
      const buy = (f.kind === 'entry') === (f.side === 'long');
      return {
        time: f.time as UTCTimestamp,
        position: buy ? 'belowBar' : 'aboveBar',
        shape: buy ? 'arrowUp' : 'arrowDown',
        color: f.kind === 'exit' ? '#9c27b0' : buy ? '#2962ff' : '#f23645',
        text: f.kind === 'entry' ? (f.side === 'long' ? 'Long' : 'Short') : f.pnl !== undefined ? fmtMoney(f.pnl) : 'Saída',
      };
    });
    ctrl.setStrategyMarkers(markers.slice(-1500));
  }, [ctrl, applied, tester, cfg]);

  // ---------- alertas ----------
  useEffect(() => {
    if (!ctrl || !symbolId || !symbol) return;
    const apply = () => {
      ctrl.setAlerts(
        useAlerts
          .getState()
          .alerts.filter((a) => a.symbolId === symbolId && a.active && a.source.kind === 'price')
          .flatMap((a) => {
            const name = a.name || 'Alerta';
            if (a.target.kind === 'value') return [{ price: a.target.value, label: `${name} ${a.target.value.toFixed(symbol.precision)}` }];
            if (a.target.kind === 'range')
              return [
                { price: a.target.high, label: `${name} ↑ ${a.target.high.toFixed(symbol.precision)}` },
                { price: a.target.low, label: `${name} ↓ ${a.target.low.toFixed(symbol.precision)}` },
              ];
            return [];
          }),
      );
    };
    apply();
    return useAlerts.subscribe(apply);
  }, [ctrl, symbolId, symbol]);

  // cursor de desenho
  useEffect(() => {
    ctrl?.setCursorStyle(tool !== 'cross' && tool !== 'cursor' ? 'crosshair' : '');
  }, [ctrl, tool]);

  if (!cfg || !symbol) return null;

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', multi && 'border', multi && (isActive ? 'border-accent' : 'border-line'))}
      onPointerDownCapture={() => {
        focus.chartId = ctrl?.id ?? '';
      }}
    >
      <div ref={containerRef} className="absolute inset-0" data-testid={`chart-${index}`} />
      <Legend index={index} symbol={symbol} tf={cfg.tf} info={legend} panes={panes} ctrl={ctrl} status={status} />
      {selecting && isActive && <ReplayPickBanner />}
      {ctrl && isActive && <DrawingToolbarFloat symbolId={cfg.symbolId} />}
      {status.state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-elev/95 px-3 py-2 text-xs text-muted shadow-pop">
            <Spinner size={14} className="text-accent" /> A carregar {symbol.name}…
          </div>
        </div>
      )}
      {status.state === 'error' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="max-w-sm rounded-xl border border-line bg-elev p-4 text-center shadow-pop">
            <AlertTriangle size={22} className="mx-auto text-warn" />
            <div className="mt-2 text-[13px] font-medium">Não foi possível mostrar {symbol.name}</div>
            <div className="mt-1 text-xs break-words text-muted">{status.message}</div>
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" variant="primary" onClick={() => ctrl?.reload()}>
                <RefreshCw size={14} /> Tentar de novo
              </Button>
              <Button size="sm" onClick={() => useUi.getState().openSymbolSearch('', index)}>
                Outro símbolo
              </Button>
            </div>
            {symbol.provider !== 'demo' && <div className="mt-3 text-[11px] text-muted">Sem internet? Experimente os símbolos “Simulado (offline)”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
