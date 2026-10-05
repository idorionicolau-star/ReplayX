import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  LineType,
  PriceScaleMode,
  TickMarkType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type Logical,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar, ChartType, SymbolInfo } from '@/core/types';
import { heikinAshi, lowerBound, mergeBars, upperBound } from '@/core/bars';
import { alignTime, tfSeconds, tfShort } from '@/core/timeframes';
import { barEnd, dataFeed } from '@/core/feed/datafeed';
import { nowSec } from '@/core/feed/provider';
import { getIndicator, instanceLabel, type IndicatorDef, type IndicatorInstance, type ParamValue } from '@/core/indicators/registry';
import { OverlayPrimitive, type ChartEvent, type OverlayHost, type TradingOverlay } from './overlay';
import { BandFill } from './fill';
import type { Viewport } from './drawings/tools';
import type { Drawing } from './drawings/types';
import { usePick } from './pick';
import { fmtCountdown, resolveAppearance, type Appearance, type ResolvedAppearance } from './appearance';
import { withAlpha } from './drawings/geometry';
import { fmtDateTime, fmtPrice, fmtTick } from '@/lib/format';
import type { PlotOutput, ShapeOutput } from '@/core/strategy/types';
import type { PlotStyle } from '@/core/indicators/registry';

export interface ChartTheme {
  dark: boolean;
  upColor: string;
  downColor: string;
  timezone: string;
  watermark: boolean;
  appearance: Appearance;
}

const SCALE_MODE = { normal: PriceScaleMode.Normal, log: PriceScaleMode.Logarithmic, percent: PriceScaleMode.Percentage, indexed: PriceScaleMode.IndexedTo100 } as const;
const CROSS_STYLE = [LineStyle.Solid, LineStyle.Dotted, LineStyle.Dashed, LineStyle.LargeDashed] as const;

export interface LegendValue {
  label: string;
  color: string;
  value: string;
}

export interface LegendIndicator {
  uid: string;
  label: string;
  values: LegendValue[];
  hidden: boolean;
  pane: number;
  error?: string;
}

export interface CrosshairInfo {
  bar: Bar | null;
  prevClose: number | null;
  indicators: LegendIndicator[];
}

export type ChartStatus = { state: 'idle' | 'loading' | 'ready' | 'error'; message?: string };

export interface ScriptIndicatorResult {
  title: string;
  overlay: boolean;
  plots: PlotOutput[];
  shapes: ShapeOutput[];
  hlines: { value: number; title: string; color: string }[];
  error?: string;
}

export interface ChartCallbacks {
  onStatus(s: ChartStatus): void;
  onLegend(info: CrosshairInfo): void;
  onPanes(layout: { top: number; height: number }[]): void;
  /** Os dados visíveis mudaram (para scripts/estratégias recalcularem). */
  onBars?(bars: readonly Bar[]): void;
  /** Cursor atual do replay (null = tempo real). */
  getCursor?(): number | null;
}

interface IndicatorView {
  inst: IndicatorInstance;
  key: string;
  def: IndicatorDef | null;
  script?: ScriptIndicatorResult;
  series: { key: string; label: string; s: ISeriesApi<SeriesType>; color: string; style: PlotStyle; offset: number; sparse: boolean }[];
  fills: { fill: BandFill; a: string; b: string }[];
  lines: IPriceLine[];
  values: Record<string, number[]>;
  colors?: Record<string, (string | undefined)[]>;
  overlay: boolean;
  error?: string;
}

type AnySeries = ISeriesApi<SeriesType>;

const HISTORY_COUNT = 1500;
const MORE_COUNT = 1500;

let chartSeq = 0;


/** Ecrã tátil como meio principal (telemóvel, tablet). */
export function coarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export class ChartController {
  readonly id: string;
  chart: IChartApi;
  main!: AnySeries;
  overlay: OverlayPrimitive;
  private markersApi: ISeriesMarkersPluginApi<Time> | null = null;
  private watermark: ITextWatermarkPluginApi<Time> | null = null;

  symbol: SymbolInfo | null = null;
  tf = '15m';
  chartType: ChartType = 'candles';
  theme: ChartTheme;

  /** Barras mostradas (já cortadas pelo replay). */
  bars: Bar[] = [];
  private times: number[] = [];
  /** Replay: todas as barras carregadas do timeframe (passado e futuro). */
  private replayBars: Bar[] = [];
  cursor: number | null = null;
  private startReached = false;
  private loadingMore = false;
  private gen = 0;
  private liveUnsub: (() => void) | null = null;
  private indicators = new Map<string, IndicatorView>();
  private indicatorOrder: string[] = [];
  private scriptResults = new Map<string, ScriptIndicatorResult>();
  private extraMarkers: { exec: SeriesMarker<Time>[]; strategy: SeriesMarker<Time>[] } = { exec: [], strategy: [] };
  private destroyed = false;
  private lastLegendIdx: number | null = null;
  private rafLegend = 0;
  private status: ChartStatus = { state: 'idle' };

  // estado do overlay (alimentado pelo componente)
  drawings: Drawing[] = [];
  selectedId: string | null = null;
  hoveredId: string | null = null;
  preview: Drawing | null = null;
  trading: TradingOverlay | null = null;
  alerts: { price: number; label: string }[] = [];
  hint: { x: number; y: number; text: string } | null = null;
  events: ChartEvent[] = [];
  replayPickX: number | null = null;
  /** Barra escolhida para começar o replay (modo de arrastar, no telemóvel) e posição livre do dedo. */
  pickTime: number | null = null;
  pickDragX: number | null = null;
  private resizeObs: ResizeObserver | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly container: HTMLElement,
    theme: ChartTheme,
    private readonly cb: ChartCallbacks,
  ) {
    this.id = `chart${++chartSeq}`;
    this.theme = theme;
    this.chart = createChart(container, this.chartOptions(theme));
    const host: OverlayHost = {
      viewport: () => this.viewport(),
      drawings: () => this.drawings,
      selectedId: () => this.selectedId,
      hoveredId: () => this.hoveredId,
      preview: () => this.preview,
      trading: () => this.trading,
      replayPick: () => {
        if (this.pickTime !== null) {
          const x = this.pickDragX ?? this.timeToX(this.pickTime);
          return x === null ? null : { x, label: fmtDateTime(this.pickTime, this.theme.timezone), handle: true };
        }
        return this.replayPickX === null ? null : { x: this.replayPickX };
      },
      alerts: () => this.alerts,
      dark: () => this.theme.dark,
      hint: () => this.hint,
      coarse: () => coarsePointer(),
      countdown: () => this.countdownLabel(),
      events: () => this.events,
    };
    this.overlay = new OverlayPrimitive(host);
    this.overlay.fmtTime = (t) => fmtDateTime(t, this.theme.timezone);
    this.createMainSeries();
    this.chart.subscribeCrosshairMove(this.onCrosshair);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange);
    this.resizeObs = new ResizeObserver(() => this.emitPanes());
    this.resizeObs.observe(container);
    // arrastar o separador entre painéis também reposiciona as etiquetas
    container.addEventListener('pointermove', this.onPaneDrag);
    container.addEventListener('pointerup', this.onPaneDrag);
    // o contador da vela anda de segundo a segundo
    this.countdownTimer = setInterval(() => {
      if (this.theme.appearance.countdown && this.cursor === null && this.bars.length) this.overlay.update();
    }, 1000);
  }

  // ------------------------------------------------------------------ tema

  /** Cores e opções de aparência já resolvidas (automáticos → cores do tema). */
  get look(): ResolvedAppearance {
    const t = this.theme;
    return resolveAppearance(t.appearance, t.dark, t.upColor, t.downColor);
  }

  private chartOptions(t: ChartTheme) {
    const a = resolveAppearance(t.appearance, t.dark, t.upColor, t.downColor);
    const tz = t.timezone;
    const crossLabel = t.dark ? '#363a45' : '#131722';
    return {
      autoSize: true,
      layout: {
        background: a.background2 ? { type: ColorType.VerticalGradient as const, topColor: a.background, bottomColor: a.background2 } : { type: ColorType.Solid as const, color: a.background },
        textColor: a.textColor,
        fontSize: a.fontSize,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
        attributionLogo: false,
        panes: { separatorColor: a.border, separatorHoverColor: 'rgba(41,98,255,0.3)', enableResize: true },
      },
      grid: {
        vertLines: { color: a.gridVert, visible: a.gridVertVisible },
        horzLines: { color: a.gridHorz, visible: a.gridHorzVisible },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: a.crosshair, labelBackgroundColor: crossLabel, style: CROSS_STYLE[a.crosshairStyle] },
        horzLine: { color: a.crosshair, labelBackgroundColor: crossLabel, style: CROSS_STYLE[a.crosshairStyle] },
      },
      rightPriceScale: { borderColor: a.border, mode: SCALE_MODE[a.scaleMode], scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: a.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 0.5,
        shiftVisibleRangeOnNewBar: true,
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const sec = time as number;
          switch (type) {
            case TickMarkType.Year:
              return fmtTick(sec, 'year', tz);
            case TickMarkType.Month:
              return fmtTick(sec, 'month', tz);
            case TickMarkType.DayOfMonth:
              return fmtTick(sec, 'day', tz);
            case TickMarkType.TimeWithSeconds:
              return fmtTick(sec, 'seconds', tz);
            default:
              return fmtTick(sec, 'time', tz);
          }
        },
      },
      localization: {
        locale: 'pt-PT',
        timeFormatter: (time: Time) => fmtDateTime(time as number, tz),
      },
      kineticScroll: { mouse: false, touch: true },
      handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: true },
    };
  }

  setTheme(t: ChartTheme) {
    const changed = JSON.stringify(t) !== JSON.stringify(this.theme);
    this.theme = t;
    if (!changed) return;
    this.chart.applyOptions(this.chartOptions(t));
    this.overlay.fmtTime = (tt) => fmtDateTime(tt, t.timezone);
    this.applyMainStyle();
    this.updateWatermark();
    this.rebuildIndicators();
    this.redraw();
  }

  // ------------------------------------------------------------------ série principal

  private mainOptions() {
    const a = this.look;
    const up = a.bodyUp;
    const down = a.bodyDown;
    const precision = this.symbol?.precision ?? 2;
    const priceFormat = { type: 'price' as const, precision, minMove: Math.pow(10, -precision) };
    const common = { priceFormat, priceLineVisible: a.priceLine, lastValueVisible: a.lastValueLabel };
    const clear = 'rgba(0,0,0,0)';
    switch (this.chartType) {
      case 'hollow':
        return { ...common, upColor: clear, downColor: down, borderVisible: true, borderUpColor: a.borderUp, borderDownColor: a.borderDown, wickVisible: a.showWick, wickUpColor: a.wickUp, wickDownColor: a.wickDown };
      case 'bars':
        return { ...common, upColor: up, downColor: down, thinBars: false };
      case 'line':
        return { ...common, color: a.lineColor, lineWidth: a.lineWidth };
      case 'area':
        return { ...common, lineColor: a.lineColor, topColor: withAlpha(a.lineColor, 0.35), bottomColor: withAlpha(a.lineColor, 0.02), lineWidth: a.lineWidth };
      case 'baseline':
        return {
          baseValue: { type: 'price' as const, price: this.bars[0]?.close ?? 0 },
          topLineColor: up,
          topFillColor1: withAlpha(up, 0.28),
          topFillColor2: withAlpha(up, 0.05),
          bottomLineColor: down,
          bottomFillColor1: withAlpha(down, 0.05),
          bottomFillColor2: withAlpha(down, 0.28),
          ...common,
        };
      case 'columns':
        return { ...common };
      default:
        return {
          ...common,
          upColor: a.showBody ? up : clear,
          downColor: a.showBody ? down : clear,
          borderVisible: a.showBorder || !a.showBody,
          borderUpColor: a.borderUp,
          borderDownColor: a.borderDown,
          wickVisible: a.showWick,
          wickUpColor: a.wickUp,
          wickDownColor: a.wickDown,
        };
    }
  }

  private createMainSeries() {
    const opts = this.mainOptions() as never;
    switch (this.chartType) {
      case 'bars':
        this.main = this.chart.addSeries(BarSeries, opts) as AnySeries;
        break;
      case 'line':
        this.main = this.chart.addSeries(LineSeries, opts) as AnySeries;
        break;
      case 'area':
        this.main = this.chart.addSeries(AreaSeries, opts) as AnySeries;
        break;
      case 'baseline':
        this.main = this.chart.addSeries(BaselineSeries, opts) as AnySeries;
        break;
      case 'columns':
        this.main = this.chart.addSeries(HistogramSeries, opts) as AnySeries;
        break;
      default:
        this.main = this.chart.addSeries(CandlestickSeries, opts) as AnySeries;
    }
    this.main.attachPrimitive(this.overlay);
    this.markersApi = createSeriesMarkers(this.main, []);
  }

  private applyMainStyle() {
    this.main.applyOptions(this.mainOptions() as never);
  }

  setChartType(type: ChartType) {
    if (type === this.chartType) return;
    this.chartType = type;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    this.main.detachPrimitive(this.overlay);
    this.markersApi?.detach();
    this.chart.removeSeries(this.main);
    this.createMainSeries();
    this.main.setData(this.toSeriesData(this.bars) as never);
    this.updateMarkers();
    if (range) this.chart.timeScale().setVisibleLogicalRange(range);
  }

  private toSeriesData(bars: readonly Bar[]): unknown[] {
    const t = (b: Bar) => b.time as UTCTimestamp;
    switch (this.chartType) {
      case 'heikin':
        return heikinAshi(bars).map((b) => ({ time: t(b), open: b.open, high: b.high, low: b.low, close: b.close }));
      case 'line':
      case 'area':
      case 'baseline':
        return bars.map((b) => ({ time: t(b), value: b.close }));
      case 'columns':
        return bars.map((b) => ({ time: t(b), value: b.close, color: b.close >= b.open ? this.look.bodyUp : this.look.bodyDown }));
      default:
        return bars.map((b) => ({ time: t(b), open: b.open, high: b.high, low: b.low, close: b.close }));
    }
  }

  // ------------------------------------------------------------------ coordenadas

  get tfSec(): number {
    return tfSeconds(this.tf);
  }

  timeToLogical(t: number): number | null {
    const times = this.times;
    const n = times.length;
    if (!n) return null;
    const sec = this.tfSec;
    if (t <= times[0]) return (t - times[0]) / sec;
    if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / sec;
    const i = upperBound(this.bars, t) - 1;
    const span = times[i + 1] - times[i];
    return i + Math.min(1, (t - times[i]) / Math.min(span, sec));
  }

  logicalToTime(l: number): number | null {
    const times = this.times;
    const n = times.length;
    if (!n) return null;
    const sec = this.tfSec;
    if (l <= 0) return Math.round(times[0] + l * sec);
    if (l >= n - 1) return Math.round(times[n - 1] + (l - (n - 1)) * sec);
    const i = Math.floor(l);
    const f = l - i;
    return Math.round(times[i] + f * Math.min(times[i + 1] - times[i], sec));
  }

  /** O lightweight-charts só converte índices inteiros: interpolamos as posições entre barras. */
  logicalToX(l: number): number | null {
    const ts = this.chart.timeScale();
    const i = Math.floor(l);
    const x0 = ts.logicalToCoordinate(i as Logical);
    if (x0 === null) return null;
    const f = l - i;
    if (f < 1e-9) return x0;
    const x1 = ts.logicalToCoordinate((i + 1) as Logical);
    return x1 === null ? x0 : x0 + (x1 - x0) * f;
  }

  timeToX(t: number): number | null {
    const l = this.timeToLogical(t);
    if (l === null) return null;
    return this.logicalToX(l);
  }

  xToLogical(x: number): number | null {
    const l = this.chart.timeScale().coordinateToLogical(x);
    return l === null ? null : (l as number);
  }

  priceToY(p: number): number | null {
    return this.main.priceToCoordinate(p);
  }

  yToPrice(y: number): number | null {
    const p = this.main.coordinateToPrice(y);
    return p === null ? null : (p as number);
  }

  fmtPrice = (p: number) => fmtPrice(p, this.symbol?.precision ?? 2);

  private vpCache: Viewport | null = null;
  viewport(): Viewport | null {
    if (!this.times.length) return null;
    if (!this.vpCache) {
      this.vpCache = {
        width: 0,
        height: 0,
        timeToX: (t) => this.timeToX(t),
        priceToY: (p) => this.priceToY(p),
        fromXY: (x, y) => {
          const l = this.xToLogical(x);
          const price = this.yToPrice(y);
          if (l === null || price === null) return null;
          const time = this.logicalToTime(l);
          return time === null ? null : { time, price };
        },
        fmtPrice: (p) => this.fmtPrice(p),
        barsBetween: (a, b) => (this.timeToLogical(b) ?? 0) - (this.timeToLogical(a) ?? 0),
        tfSec: this.tfSec,
        bars: this.bars,
        dark: this.theme.dark,
        cursor: this.cursor,
      };
    }
    const size = this.paneSize();
    return Object.assign(this.vpCache, { width: size.width, height: size.height, bars: this.bars, tfSec: this.tfSec, dark: this.theme.dark, cursor: this.cursor });
  }

  /** Etiqueta "mm:ss" até fechar a vela atual (só em tempo real; no replay o tempo está parado). */
  private countdownLabel(): { y: number; text: string; color: string } | null {
    const a = this.theme.appearance;
    if (!a.countdown || !a.lastValueLabel || this.cursor !== null || !this.bars.length) return null;
    const last = this.bars[this.bars.length - 1];
    const left = barEnd(last.time, this.tf) - Date.now() / 1000;
    // vela já devia ter fechado (mercado fechado ou sem dados novos)
    if (left <= 0 || left > tfSeconds(this.tf) * 1.01 + 86400 * 4) return null;
    const y = this.main.priceToCoordinate(last.close);
    if (y === null) return null;
    const look = this.look;
    return { y: y + a.fontSize + 9, text: fmtCountdown(left), color: last.close >= last.open ? look.bodyUp : look.bodyDown };
  }

  setEvents(list: ChartEvent[]) {
    this.events = list;
    this.redraw();
  }

  setDrawings(list: Drawing[], selectedId: string | null) {
    this.drawings = list;
    this.selectedId = selectedId;
    this.redraw();
  }

  setTrading(t: TradingOverlay | null) {
    this.trading = t ? { ...t, dragging: this.trading?.dragging ?? null } : null;
    this.redraw();
  }

  setAlerts(a: { price: number; label: string }[]) {
    this.alerts = a;
    this.redraw();
  }

  setCursorStyle(c: string) {
    this.container.style.cursor = c;
  }

  paneSize(): { width: number; height: number } {
    try {
      const s = this.chart.paneSize(0);
      return { width: s.width, height: s.height };
    } catch {
      return { width: this.chart.timeScale().width(), height: this.container.clientHeight };
    }
  }

  /** Elemento HTML do painel principal (para converter coordenadas do rato). */
  paneElement(): HTMLElement | null {
    return this.chart.panes()[0]?.getHTMLElement() ?? null;
  }

  redraw() {
    this.overlay.update();
  }

  // ------------------------------------------------------------------ carregar dados

  private setStatus(s: ChartStatus) {
    this.status = s;
    this.cb.onStatus(s);
  }

  /** Último carregamento (para quem precisa de esperar pelos dados, ex.: botões 1D/5D…). */
  lastLoad: Promise<void> = Promise.resolve();

  /** Muda de símbolo/timeframe (em replay mantém o cursor). */
  load(symbol: SymbolInfo, tf: string, cursor: number | null): Promise<void> {
    const p = this.loadInner(symbol, tf, cursor);
    this.lastLoad = p.catch(() => undefined);
    return p;
  }

  private async loadInner(symbol: SymbolInfo, tf: string, cursor: number | null) {
    const same = this.symbol?.id === symbol.id && this.tf === tf && this.cursor === cursor && this.bars.length > 0;
    if (same) return;
    const symbolChanged = this.symbol?.id !== symbol.id;
    this.symbol = symbol;
    this.tf = tf;
    this.vpCache = null;
    this.applyMainStyle();
    this.updateWatermark();
    if (cursor === null) await this.loadLive(symbolChanged);
    else {
      const gen = ++this.gen;
      this.replayBars = [];
      this.stopLive();
      try {
        await this.prepareReplay(cursor);
      } catch {
        return;
      }
      if (gen !== this.gen || this.destroyed) return;
      // o replay pode ter avançado entretanto
      const latest = this.cb.getCursor?.() ?? cursor;
      if (latest !== cursor && latest !== null) {
        try {
          await this.prepareReplay(latest);
        } catch {
          return;
        }
        if (gen !== this.gen || this.destroyed) return;
      }
      this.applyReplay(latest ?? cursor, true);
    }
  }

  private async loadLive(_symbolChanged: boolean) {
    const gen = ++this.gen;
    const sym = this.symbol!;
    const tf = this.tf;
    this.stopLive();
    this.cursor = null;
    this.replayBars = [];
    this.setStatus({ state: 'loading' });
    try {
      const res = await dataFeed().history(sym, tf, nowSec() + tfSeconds(tf), HISTORY_COUNT);
      if (gen !== this.gen || this.destroyed) return;
      this.startReached = res.startReached;
      this.setBars(res.bars, true);
      this.chart.timeScale().scrollToRealTime();
      this.setStatus(res.bars.length ? { state: 'ready' } : { state: 'error', message: 'Sem dados para este símbolo/timeframe.' });
      this.liveUnsub = dataFeed().subscribe(sym, tf, (bar) => this.onLiveBar(bar, gen));
    } catch (e) {
      if (gen !== this.gen) return;
      this.setStatus({ state: 'error', message: (e as Error).message || 'Falha ao carregar dados' });
    }
  }

  private stopLive() {
    this.liveUnsub?.();
    this.liveUnsub = null;
  }

  /** Volta ao modo em tempo real. */
  async exitReplay() {
    this.cursor = null;
    this.replayBars = [];
    if (this.symbol) await this.loadLive(false);
  }

  reload() {
    if (!this.symbol) return;
    const sym = this.symbol;
    this.bars = [];
    const c = this.cursor;
    this.cursor = null;
    void this.load(sym, this.tf, c);
  }

  private onLiveBar(bar: Bar, gen: number) {
    if (gen !== this.gen || this.cursor !== null) return;
    const n = this.bars.length;
    if (!n) return;
    const last = this.bars[n - 1];
    if (bar.time < last.time) return;
    if (bar.time === last.time) this.bars[n - 1] = bar;
    else this.bars.push(bar);
    this.times = this.bars.map((b) => b.time);
    const data = this.chartType === 'heikin' ? this.toSeriesData(this.bars.slice(-2)) : this.toSeriesData([bar]);
    this.main.update(data[data.length - 1] as never);
    this.scheduleIndicators(false);
    this.redraw();
    if (this.lastLegendIdx === null) this.emitLegend(null);
  }

  private setBars(bars: Bar[], reset: boolean) {
    this.bars = bars;
    this.times = bars.map((b) => b.time);
    this.main.setData(this.toSeriesData(bars) as never);
    if (this.chartType === 'baseline') this.applyMainStyle();
    if (reset) this.lastLegendIdx = null;
    this.updateIndicators(true);
    this.updateMarkers();
    this.cb.onBars?.(this.bars);
    this.emitLegend(null);
    this.redraw();
  }

  private onRange = (range: { from: number; to: number } | null) => {
    if (!range || this.loadingMore || this.startReached || !this.symbol || !this.bars.length) return;
    if (range.from > 30) return;
    void this.loadMore();
  };

  private async loadMore() {
    const sym = this.symbol!;
    const tf = this.tf;
    const gen = this.gen;
    this.loadingMore = true;
    try {
      const first = (this.cursor !== null ? this.replayBars[0] : this.bars[0])?.time;
      if (first === undefined) return;
      const res = await dataFeed().history(sym, tf, first, MORE_COUNT);
      if (gen !== this.gen || this.destroyed || this.symbol?.id !== sym.id || this.tf !== tf) return;
      this.startReached = res.startReached || res.bars.length === 0;
      const older = res.bars.filter((b) => b.time < first);
      if (!older.length) return;
      const ts = this.chart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (this.cursor !== null) {
        this.replayBars = mergeBars(older, this.replayBars);
        this.applyReplay(this.cursor, true, false);
      } else this.setBars(mergeBars(older, this.bars), false);
      if (range) ts.setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
    } catch {
      /* tenta outra vez no próximo scroll */
    } finally {
      this.loadingMore = false;
    }
  }

  // ------------------------------------------------------------------ replay

  /** Garante os dados (passado, futuro próximo e barra parcial) para o cursor. */
  async prepareReplay(cursor: number): Promise<void> {
    const sym = this.symbol;
    if (!sym) return;
    const feed = dataFeed();
    const tf = this.tf;
    const sec = tfSeconds(tf);
    this.stopLive();
    const bars = this.replayBars;
    const first = bars[0]?.time;
    const lastEnd = bars.length ? barEnd(bars[bars.length - 1].time, tf) : undefined;
    // cursor fora do bloco carregado: recomeça a cache local
    const outside = first === undefined || cursor < first || lastEnd === undefined || cursor > lastEnd + sec * 50;
    if (outside) {
      this.replayBars = [];
      this.startReached = false;
    }
    const tasks: Promise<unknown>[] = [];
    const before = lowerBound(this.replayBars, cursor);
    if (outside || (before < 300 && !this.startReached)) {
      if (outside && this.status.state !== 'loading') this.setStatus({ state: 'loading' });
      tasks.push(
        feed.history(sym, tf, cursor, HISTORY_COUNT).then((r) => {
          if (this.symbol?.id !== sym.id || this.tf !== tf) return;
          this.startReached = r.startReached;
          this.replayBars = mergeBars(r.bars, this.replayBars);
        }),
      );
    }
    // futuro próximo (para os passos seguintes)
    const loadedTo = this.replayBars.length ? barEnd(this.replayBars[this.replayBars.length - 1].time, tf) : 0;
    const now = nowSec();
    if (loadedTo < Math.min(cursor + sec * 60, now)) {
      tasks.push(
        feed.range(sym, tf, Math.max(cursor, loadedTo || cursor), Math.min(cursor + sec * 400, now + sec)).then((more) => {
          if (this.symbol?.id !== sym.id || this.tf !== tf) return;
          this.replayBars = mergeBars(this.replayBars, more);
        }),
      );
    }
    try {
      await Promise.all(tasks);
      const open = this.partialOpen(cursor);
      if (open !== null && open < cursor) await feed.preparePartial(sym, tf, open, cursor);
    } catch (e) {
      this.setStatus({ state: 'error', message: (e as Error).message });
      throw e;
    }
  }

  private partialOpen(cursor: number): number | null {
    const bars = this.replayBars;
    const tf = this.tf;
    // primeira barra que ainda não terminou no cursor
    let lo = 0;
    let hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (barEnd(bars[mid].time, tf) <= cursor) lo = mid + 1;
      else hi = mid;
    }
    if (lo < bars.length) return bars[lo].time < cursor ? bars[lo].time : null;
    const open = alignTime(cursor, tf);
    return open < cursor ? open : null;
  }

  /** Mostra o gráfico tal como estava no instante `cursor`. Síncrono. */
  applyReplay(cursor: number, reset = false, keepView = true) {
    if (!this.symbol) return;
    const prevCursor = this.cursor;
    this.cursor = cursor;
    const tf = this.tf;
    const bars = this.replayBars;
    let k = 0;
    let hi = bars.length;
    while (k < hi) {
      const mid = (k + hi) >>> 1;
      if (barEnd(bars[mid].time, tf) <= cursor) k = mid + 1;
      else hi = mid;
    }
    const visible = bars.slice(0, k);
    const open = this.partialOpen(cursor);
    if (open !== null) {
      const p = dataFeed().peekPartial(this.symbol, tf, open, cursor);
      if (p) visible.push(p);
    }
    const old = this.bars;
    const sameStart = old.length && visible.length && old[0].time === visible[0].time;
    const ts = this.chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!reset && sameStart && visible.length === old.length + 1 && old.length && visible[old.length - 1].time === old[old.length - 1].time) {
      // avançou uma barra: atualiza a anterior (que pode ter deixado de ser parcial) e acrescenta
      this.bars = visible;
      this.times = visible.map((b) => b.time);
      const data = this.toSeriesData(this.chartType === 'heikin' ? visible : visible.slice(-2));
      this.main.update(data[data.length - 2] as never, true);
      this.main.update(data[data.length - 1] as never);
      this.updateIndicators(false);
    } else if (!reset && sameStart && visible.length === old.length && old.length && visible[visible.length - 1].time === old[old.length - 1].time) {
      this.bars = visible;
      this.times = visible.map((b) => b.time);
      const data = this.toSeriesData(this.chartType === 'heikin' ? visible : visible.slice(-1));
      this.main.update(data[data.length - 1] as never);
      this.updateIndicators(false);
    } else {
      this.bars = visible;
      this.times = visible.map((b) => b.time);
      this.main.setData(this.toSeriesData(visible) as never);
      this.updateIndicators(true);
      if (reset || prevCursor === null) {
        if (!keepView || !range || prevCursor === null) ts.scrollToRealTime();
        else ts.setVisibleLogicalRange(range);
      }
    }
    this.vpCache = null;
    this.updateMarkers();
    this.cb.onBars?.(this.bars);
    if (this.status.state !== 'ready' && visible.length) this.setStatus({ state: 'ready' });
    else if (!visible.length) this.setStatus({ state: 'error', message: 'Sem dados antes desta data. Escolha outro ponto de partida.' });
    this.emitLegend(null);
    this.redraw();
  }

  // ------------------------------------------------------------------ indicadores

  setScriptResult(uid: string, r: ScriptIndicatorResult | null) {
    if (r) this.scriptResults.set(uid, r);
    else this.scriptResults.delete(uid);
    this.syncIndicatorViews();
  }

  private wantedList: IndicatorInstance[] = [];

  setIndicators(list: IndicatorInstance[]) {
    this.wantedList = list;
    this.syncIndicatorViews();
  }

  private syncIndicatorViews() {
    const list = this.wantedList;
    const keys = new Set(list.map((i) => i.uid));
    for (const [uid, view] of this.indicators) {
      const inst = list.find((i) => i.uid === uid);
      const key = inst ? JSON.stringify(inst) + (this.scriptResults.get(uid) ? JSON.stringify(this.scriptResults.get(uid)!.plots.map((p) => [p.title, p.color, p.style, p.overlay])) : '') : '';
      if (!keys.has(uid) || key !== view.key) {
        this.removeView(view);
        this.indicators.delete(uid);
      } else if (view.script) {
        // mesma estrutura: só os valores mudaram
        const r = this.scriptResults.get(uid);
        if (r) {
          view.script = r;
          view.error = r.error;
        }
      }
    }
    for (const inst of list) {
      if (!this.indicators.has(inst.uid)) this.indicators.set(inst.uid, this.createView(inst));
    }
    this.indicatorOrder = list.map((i) => i.uid);
    this.layoutPanes();
    this.updateIndicators(true);
    this.updateMarkers();
    this.emitLegend(this.lastLegendIdx);
  }

  private rebuildIndicators() {
    for (const v of this.indicators.values()) this.removeView(v);
    this.indicators.clear();
    this.syncIndicatorViews();
  }

  private removeView(v: IndicatorView) {
    for (const f of v.fills) {
      try {
        v.series.find((s) => s.key === f.a)?.s.detachPrimitive(f.fill);
      } catch {
        /* nada */
      }
    }
    for (const s of v.series) {
      try {
        this.chart.removeSeries(s.s);
      } catch {
        /* já removida */
      }
    }
    v.series = [];
  }

  private nextPaneIndex(): number {
    return this.chart.panes().length;
  }

  private createView(inst: IndicatorInstance): IndicatorView {
    const script = inst.type.startsWith('script:') ? this.scriptResults.get(inst.uid) : undefined;
    const def = script ? null : getIndicator(inst.type) ?? null;
    const view: IndicatorView = {
      inst,
      key: JSON.stringify(inst) + (script ? JSON.stringify(script.plots.map((p) => [p.title, p.color, p.style, p.overlay])) : ''),
      def,
      script,
      series: [],
      fills: [],
      lines: [],
      values: {},
      overlay: script ? script.overlay : def?.overlay ?? true,
      error: script?.error,
    };
    if (!def && !script) return view;
    const pane = view.overlay ? 0 : this.nextPaneIndex();
    const priceScaleId = def?.overlayScale === 'volume' ? 'volume' : view.overlay ? 'right' : 'right';
    const precision = def?.overlay || script?.overlay ? this.symbol?.precision ?? 2 : 2;
    const outputs = def
      ? def.outputs.map((o) => ({ key: o.key, label: o.label, style: o.style, color: inst.styles[o.key]?.color ?? o.color, width: inst.styles[o.key]?.width ?? o.width ?? 1, visible: inst.styles[o.key]?.visible ?? !o.hiddenByDefault, offset: o.offset?.(inst.params) ?? 0, sparse: !!o.sparse }))
      : script!.plots.map((p, i) => ({ key: `p${i}`, label: p.title, style: p.style, color: inst.styles[`p${i}`]?.color ?? p.color, width: inst.styles[`p${i}`]?.width ?? p.width, visible: inst.styles[`p${i}`]?.visible ?? true, offset: 0, sparse: false }));
    for (const o of outputs) {
      const common = {
        priceScaleId,
        lastValueVisible: !inst.hidden && o.visible && o.style !== 'dots',
        priceLineVisible: false,
        visible: !inst.hidden && o.visible,
        title: '',
        crosshairMarkerVisible: o.style !== 'histogram',
        priceFormat: def?.overlayScale === 'volume' ? { type: 'volume' as const } : { type: 'price' as const, precision, minMove: Math.pow(10, -precision) },
        ...(def?.scale && !view.overlay ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: def.scale!.min ?? 0, maxValue: def.scale!.max ?? 100 } }) } : {}),
      };
      let s: AnySeries;
      if (o.style === 'histogram') s = this.chart.addSeries(HistogramSeries, { ...common, color: o.color, base: 0 } as never, pane) as AnySeries;
      else if (o.style === 'area') s = this.chart.addSeries(AreaSeries, { ...common, lineColor: o.color, topColor: o.color.replace(/^#(..)(..)(..)$/, (_m, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},0.25)`), bottomColor: 'rgba(0,0,0,0)', lineWidth: o.width } as never, pane) as AnySeries;
      else
        s = this.chart.addSeries(
          LineSeries,
          {
            ...common,
            color: o.color,
            lineWidth: Math.max(1, Math.min(4, o.width)),
            lineType: o.style === 'step' ? LineType.WithSteps : LineType.Simple,
            lineVisible: o.style !== 'dots',
            pointMarkersVisible: o.style === 'dots',
            pointMarkersRadius: o.style === 'dots' ? 2 : undefined,
          } as never,
          pane,
        ) as AnySeries;
      view.series.push({ key: o.key, label: o.label, s, color: o.color, style: o.style, offset: o.offset, sparse: o.sparse });
    }
    if (def?.overlayScale === 'volume') {
      try {
        this.chart.priceScale('volume', 0).applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
      } catch {
        /* nada */
      }
    }
    const first = view.series[0]?.s;
    const levels = def?.levels ?? script?.hlines.map((h) => ({ value: h.value, color: h.color })) ?? [];
    if (first && !inst.hidden) {
      for (const lv of levels) {
        view.lines.push(first.createPriceLine({ price: lv.value, color: lv.color ?? '#787b86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' }));
      }
    }
    if (def?.fills && !inst.hidden) {
      for (const f of def.fills) {
        const a = view.series.find((x) => x.key === f.a);
        if (!a) continue;
        const fill = def.id === 'ichimoku' ? new BandFill('rgba(76,175,80,0.14)', 'rgba(242,54,69,0.14)') : new BandFill(f.color);
        a.s.attachPrimitive(fill);
        view.fills.push({ fill, a: f.a, b: f.b });
      }
    }
    return view;
  }

  private layoutPanes() {
    const panes = this.chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(Math.max(2, panes.length + 1));
      for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1);
    }
    this.emitPanes();
  }

  private onPaneDrag = (e: PointerEvent) => {
    if (e.type === 'pointerup' || e.buttons) this.emitPanes();
  };

  private paneRaf = 0;
  private paneKey = '';
  private observedPanes = new Set<Element>();

  /** Posição e altura reais de cada painel (medidas no ecrã), para a legenda acompanhar quando os painéis mudam. */
  private emitPanes() {
    if (this.paneRaf) return;
    this.paneRaf = requestAnimationFrame(() => {
      this.paneRaf = 0;
      if (this.destroyed) return;
      try {
        const panes = this.chart.panes();
        const base = this.container.getBoundingClientRect().top;
        const layout = panes.map((p) => {
          const el = p.getHTMLElement();
          if (el && !this.observedPanes.has(el)) {
            // quando um painel muda de altura (arrastar o separador, novo indicador…) volta a medir
            this.observedPanes.add(el);
            this.resizeObs?.observe(el);
          }
          return { top: el ? Math.round(el.getBoundingClientRect().top - base) : 0, height: p.getHeight() };
        });
        const key = JSON.stringify(layout);
        if (key === this.paneKey) return;
        this.paneKey = key;
        this.cb.onPanes(layout);
      } catch {
        /* gráfico removido */
      }
    });
  }

  private indTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleIndicators(full: boolean) {
    if (this.indTimer) return;
    this.indTimer = setTimeout(() => {
      this.indTimer = null;
      this.updateIndicators(full);
    }, 250);
  }

  private futureTime(i: number): number {
    const n = this.times.length;
    if (i < n) return this.times[Math.max(0, i)];
    return this.times[n - 1] + (i - (n - 1)) * this.tfSec;
  }

  private updateIndicators(full: boolean) {
    const bars = this.bars;
    if (!bars.length) return;
    for (const view of this.indicators.values()) {
      try {
        if (view.def) {
          const r = view.def.compute(bars, { ...Object.fromEntries(view.def.inputs.map((i) => [i.key, i.default])), ...view.inst.params } as Record<string, ParamValue>);
          view.values = r.values;
          view.colors = r.colors;
          (view as IndicatorView & { markers?: unknown }).markers = r.markers;
        } else if (view.script) {
          // resultados de scripts vêm já calculados (worker)
          view.values = Object.fromEntries(view.script.plots.map((p, i) => [`p${i}`, p.data]));
          view.colors = Object.fromEntries(view.script.plots.map((p, i) => [`p${i}`, p.colors ?? []]));
        }
        view.error = undefined;
      } catch (e) {
        view.error = (e as Error).message;
        continue;
      }
      const n = bars.length;
      for (const s of view.series) {
        const vals = view.values[s.key];
        if (!vals) continue;
        const colors = view.colors?.[s.key];
        const point = (i: number) => {
          const src = i - s.offset;
          const v = src >= 0 && src < vals.length ? vals[src] : NaN;
          const time = this.futureTime(i) as UTCTimestamp;
          if (!Number.isFinite(v)) return s.sparse ? null : { time };
          const c = src >= 0 ? colors?.[src] : undefined;
          return c ? { time, value: v, color: c } : { time, value: v };
        };
        const total = s.offset > 0 ? n + s.offset : n;
        const startIdx = s.offset < 0 ? 0 : 0;
        if (full || s.sparse || s.offset !== 0) {
          const data: unknown[] = [];
          for (let i = startIdx; i < total; i++) {
            const p = point(i);
            if (p) data.push(p);
          }
          s.s.setData(data as never);
        } else {
          const p = point(n - 1);
          if (p) {
            try {
              s.s.update(p as never);
            } catch {
              const data: unknown[] = [];
              for (let i = 0; i < total; i++) {
                const q = point(i);
                if (q) data.push(q);
              }
              s.s.setData(data as never);
            }
          }
        }
      }
      for (const f of view.fills) {
        const a = view.values[f.a];
        const b = view.values[f.b];
        const offA = view.series.find((x) => x.key === f.a)?.offset ?? 0;
        if (!a || !b) continue;
        f.fill.setPoints(a.map((v, i) => ({ i: i + offA, a: v, b: b[i] })));
      }
    }
    if (full) this.updateMarkers();
    else this.scheduleMarkers();
  }

  private markerTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleMarkers() {
    if (this.markerTimer) return;
    this.markerTimer = setTimeout(() => {
      this.markerTimer = null;
      this.updateMarkers();
    }, 120);
  }

  // ------------------------------------------------------------------ marcadores

  setExecMarkers(m: SeriesMarker<Time>[]) {
    this.extraMarkers.exec = m;
    this.updateMarkers();
  }

  setStrategyMarkers(m: SeriesMarker<Time>[]) {
    this.extraMarkers.strategy = m;
    this.updateMarkers();
  }

  /** Converte um instante qualquer para a abertura da barra correspondente no gráfico. */
  barTimeAt(t: number): number | null {
    if (!this.bars.length) return null;
    const i = upperBound(this.bars, t) - 1;
    if (i < 0) return null;
    return this.bars[i].time;
  }

  private updateMarkers() {
    if (!this.markersApi) return;
    const out: SeriesMarker<Time>[] = [];
    const n = this.bars.length;
    for (const view of this.indicators.values()) {
      if (view.inst.hidden) continue;
      const ms = (view as IndicatorView & { markers?: { index: number; position: 'above' | 'below'; shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square'; color: string; text?: string }[] }).markers;
      const shapes = view.script?.shapes ?? [];
      for (const m of [...(ms ?? []), ...shapes]) {
        if (m.index < 0 || m.index >= n) continue;
        out.push({ time: this.bars[m.index].time as UTCTimestamp, position: m.position === 'above' ? 'aboveBar' : 'belowBar', shape: m.shape, color: m.color, text: m.text });
      }
    }
    const last = this.bars[n - 1];
    const lastEnd = last ? (this.cursor ?? barEnd(last.time, this.tf)) : 0;
    for (const m of [...this.extraMarkers.strategy, ...this.extraMarkers.exec]) {
      const t = m.time as number;
      if (!last || t >= lastEnd) continue;
      const bt = this.barTimeAt(t);
      if (bt === null) continue;
      out.push({ ...m, time: bt as UTCTimestamp });
    }
    out.sort((a, b) => (a.time as number) - (b.time as number));
    this.markersApi.setMarkers(out);
  }

  // ------------------------------------------------------------------ marca de água

  private updateWatermark() {
    if (!this.symbol) return;
    const text = `${this.symbol.name}, ${tfShort(this.tf)}`;
    const color = this.look.watermarkColor;
    const opts = { horzAlign: 'center' as const, vertAlign: 'center' as const, lines: this.theme.watermark ? [{ text, color, fontSize: 56, fontStyle: '600' }, { text: this.symbol.description, color, fontSize: 18 }] : [] };
    try {
      if (!this.watermark) this.watermark = createTextWatermark(this.chart.panes()[0], opts);
      else this.watermark.applyOptions(opts);
    } catch {
      /* nada */
    }
  }

  // ------------------------------------------------------------------ legenda

  private onCrosshair = (p: MouseEventParams<Time>) => {
    if (p.logical === undefined || p.time === undefined) {
      this.lastLegendIdx = null;
    } else {
      const idx = Math.round(p.logical as number);
      this.lastLegendIdx = idx >= 0 && idx < this.bars.length ? idx : null;
    }
    if (!this.rafLegend) {
      this.rafLegend = requestAnimationFrame(() => {
        this.rafLegend = 0;
        this.emitLegend(this.lastLegendIdx);
      });
    }
    onCrosshairHook?.(this, p);
  };

  private emitLegend(idx: number | null) {
    const n = this.bars.length;
    const i = idx === null ? n - 1 : idx;
    const bar = i >= 0 && i < n ? this.bars[i] : null;
    const prevClose = i > 0 && i - 1 < n ? this.bars[i - 1].close : null;
    const indicators: LegendIndicator[] = [];
    for (const uid of this.indicatorOrder) {
      const v = this.indicators.get(uid);
      if (!v) continue;
      const label = v.def ? instanceLabel(v.def, v.inst.params) : v.script?.title ?? 'Script';
      const values: LegendValue[] = v.series.map((s) => {
        const arr = v.values[s.key];
        const src = i - s.offset;
        const val = arr && src >= 0 && src < arr.length ? arr[src] : NaN;
        const digits = v.overlay && v.def?.overlayScale !== 'volume' ? this.symbol?.precision ?? 2 : Math.abs(val) >= 1000 ? 0 : 2;
        return { label: s.label, color: v.colors?.[s.key]?.[src] ?? s.color, value: Number.isFinite(val) ? val.toFixed(digits) : '—' };
      });
      let pane = 0;
      try {
        pane = v.series[0]?.s.getPane().paneIndex() ?? 0;
      } catch {
        pane = 0;
      }
      indicators.push({ uid, label, values, hidden: !!v.inst.hidden, pane, error: v.error ?? v.script?.error });
    }
    this.cb.onLegend({ bar, prevClose, indicators });
  }

  // ------------------------------------------------------------------ outros

  // ---- linha de corte do replay (arrastar até ao ponto de partida)

  private setPickTime(t: number | null) {
    this.pickTime = t;
    usePick.setState({ chartId: t === null ? null : this.id, time: t });
    this.redraw();
  }

  /** Mostra a linha de corte (por omissão a 2/3 do ecrã) se ainda não existir. */
  initPick() {
    if (this.pickTime !== null || !this.bars.length) return;
    const r = this.chart.timeScale().getVisibleLogicalRange();
    const last = this.bars.length - 1;
    const l = r ? Math.min(last, Math.max(0, Math.round(r.from + (r.to - r.from) * 0.66))) : last;
    this.setPickTime(this.bars[l]?.time ?? null);
  }

  clearPick() {
    this.pickDragX = null;
    if (this.pickTime !== null) this.setPickTime(null);
  }

  /** X atual da linha (livre enquanto se arrasta). */
  pickX(): number | null {
    return this.pickDragX ?? (this.pickTime === null ? null : this.timeToX(this.pickTime));
  }

  /** Põe a linha debaixo do dedo. `free` = segue o dedo sem saltos; ao largar encaixa na barra mais próxima. */
  setPickAtX(x: number, free: boolean) {
    const l = this.xToLogical(x);
    if (l === null || !this.bars.length) return;
    const i = Math.max(0, Math.min(this.bars.length - 1, Math.round(l)));
    this.pickDragX = free ? x : null;
    this.setPickTime(this.bars[i].time);
  }

  /** Ajuste fino: avança/recua barras. */
  nudgePick(n: number) {
    if (this.pickTime === null || !this.bars.length) return;
    const cur = Math.max(0, Math.min(this.bars.length - 1, Math.round(this.timeToLogical(this.pickTime) ?? 0)));
    const i = Math.max(0, Math.min(this.bars.length - 1, cur + n));
    this.pickDragX = null;
    this.setPickTime(this.bars[i].time);
    // mantém a linha à vista
    const x = this.timeToX(this.bars[i].time);
    const w = this.paneSize().width;
    if (x !== null && (x < 40 || x > w - 40)) this.scrollToTime(this.bars[i].time);
  }

  /** Carrega histórico para trás até `t` (ou até ao início dos dados). */
  async ensureFrom(t: number, maxRounds = 40) {
    for (let i = 0; i < maxRounds; i++) {
      const first = (this.cursor !== null ? this.replayBars[0] : this.bars[0])?.time;
      if (first === undefined || first <= t || this.startReached || this.destroyed) return;
      if (this.loadingMore) {
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      await this.loadMore();
    }
  }

  /** Mostra do instante `from` até à última barra (botões 1D, 5D, 1M… como no TradingView). */
  async showRange(from: number) {
    await this.ensureFrom(from);
    if (!this.bars.length) return;
    const lf = Math.max(0, this.timeToLogical(from) ?? 0);
    const last = this.bars.length - 1;
    const width = Math.max(10, last - lf);
    this.chart.timeScale().setVisibleLogicalRange({ from: lf, to: last + Math.max(3, width * 0.05) });
    this.chart.priceScale('right').applyOptions({ autoScale: true });
  }

  /** Leva o gráfico até uma data (sem replay). */
  async goToTime(t: number) {
    const r = this.chart.timeScale().getVisibleLogicalRange();
    const span = r ? (r.to - r.from) * this.tfSec : 200 * this.tfSec;
    await this.ensureFrom(t - span);
    this.scrollToTime(t);
  }

  /** Zoom no tempo (fator < 1 aproxima), mantendo a margem direita. */
  zoom(factor: number) {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const w = Math.max(10, (r.to - r.from) * factor);
    ts.setVisibleLogicalRange({ from: r.to - w, to: r.to });
  }

  /** Desloca a vista uma fração da largura (negativo = para o passado). */
  scrollBy(fraction: number) {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const d = (r.to - r.from) * fraction;
    ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d });
  }

  /** Escala de preços automática. */
  autoScale() {
    this.chart.priceScale('right').applyOptions({ autoScale: true });
  }

  resetView() {
    this.chart.timeScale().resetTimeScale();
    this.chart.priceScale('right').applyOptions({ autoScale: true });
    this.chart.timeScale().scrollToRealTime();
  }

  scrollToTime(t: number) {
    const l = this.timeToLogical(t);
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (l === null || !r) return;
    const half = (r.to - r.from) / 2;
    this.chart.timeScale().setVisibleLogicalRange({ from: l - half, to: l + half });
  }

  screenshot(): HTMLCanvasElement {
    return this.chart.takeScreenshot(true, false);
  }

  setCrosshair(time: number | null, price: number | null) {
    if (time === null || !this.bars.length) {
      this.chart.clearCrosshairPosition();
      return;
    }
    const bt = this.barTimeAt(time);
    if (bt === null) {
      this.chart.clearCrosshairPosition();
      return;
    }
    const bar = this.bars[lowerBound(this.bars, bt)];
    this.chart.setCrosshairPosition(price ?? bar?.close ?? 0, bt as UTCTimestamp, this.main);
  }

  /** Último preço (no cursor, se em replay). */
  lastPrice(): number | undefined {
    return this.bars[this.bars.length - 1]?.close;
  }

  getStatus(): ChartStatus {
    return this.status;
  }

  destroy() {
    this.destroyed = true;
    this.gen++;
    this.stopLive();
    if (this.rafLegend) cancelAnimationFrame(this.rafLegend);
    if (this.indTimer) clearTimeout(this.indTimer);
    if (this.markerTimer) clearTimeout(this.markerTimer);
    this.resizeObs?.disconnect();
    this.container.removeEventListener('pointermove', this.onPaneDrag);
    this.container.removeEventListener('pointerup', this.onPaneDrag);
    if (this.paneRaf) cancelAnimationFrame(this.paneRaf);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    try {
      this.chart.remove();
    } catch {
      /* nada */
    }
  }
}

/** Gancho global para sincronizar a mira entre gráficos (definido pelo componente). */
export let onCrosshairHook: ((c: ChartController, p: MouseEventParams<Time>) => void) | null = null;
export function setCrosshairHook(fn: typeof onCrosshairHook) {
  onCrosshairHook = fn;
}
