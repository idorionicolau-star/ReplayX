import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

/** Preenche a área entre duas linhas de um indicador (Bollinger, nuvem de Ichimoku…). */
export class BandFill implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  /** Índice lógico (posição da barra), valor de cima e de baixo. */
  points: { i: number; a: number; b: number }[] = [];

  constructor(
    public color: string,
    /** Cores diferentes quando a > b e quando a < b (nuvem). */
    public colorDown?: string,
  ) {}

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.requestUpdate = p.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setPoints(points: { i: number; a: number; b: number }[]) {
    this.points = points;
    this.requestUpdate?.();
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      {
        zOrder: () => 'bottom',
        renderer: (): IPrimitivePaneRenderer => ({
          draw: () => undefined,
          drawBackground: (target: CanvasRenderingTarget2D) => this.draw(target),
        }),
      },
    ];
  }

  private draw(target: CanvasRenderingTarget2D) {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series || !this.points.length) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const from = Math.floor(range.from) - 2;
    const to = Math.ceil(range.to) + 2;
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      let seg: { x: number; ya: number; yb: number; up: boolean }[] = [];
      const flush = () => {
        if (seg.length < 2) {
          seg = [];
          return;
        }
        // divide por cor quando as linhas se cruzam
        let start = 0;
        for (let k = 1; k <= seg.length; k++) {
          if (k === seg.length || seg[k].up !== seg[start].up) {
            const part = seg.slice(start, Math.min(seg.length, k + 1));
            if (part.length >= 2) {
              ctx.fillStyle = part[0].up || !this.colorDown ? this.color : this.colorDown;
              ctx.beginPath();
              ctx.moveTo(part[0].x, part[0].ya);
              for (const p of part) ctx.lineTo(p.x, p.ya);
              for (let j = part.length - 1; j >= 0; j--) ctx.lineTo(part[j].x, part[j].yb);
              ctx.closePath();
              ctx.fill();
            }
            start = k;
          }
        }
        seg = [];
      };
      for (const p of this.points) {
        if (p.i < from || p.i > to) continue;
        if (!Number.isFinite(p.a) || !Number.isFinite(p.b)) {
          flush();
          continue;
        }
        const x = ts.logicalToCoordinate(p.i as Logical);
        const ya = series.priceToCoordinate(p.a);
        const yb = series.priceToCoordinate(p.b);
        if (x === null || ya === null || yb === null) {
          flush();
          continue;
        }
        seg.push({ x, ya, yb, up: p.a >= p.b });
      }
      flush();
    });
  }
}
