import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

export interface GradientLook {
  enabled: boolean;
  up: string;
  up2: string;
  down: string;
  down2: string;
}

interface Body {
  open: number;
  close: number;
}

/** Largura do corpo da vela como o lightweight-charts a calcula (para o gradiente coincidir com a vela). */
export function candleBodyWidth(barSpacing: number, pr: number): number {
  let w: number;
  if (barSpacing >= 2.5 && barSpacing <= 4) w = Math.floor(3 * pr);
  else {
    const coeff = 1 - (0.2 * Math.atan(Math.max(4, barSpacing) - 4)) / (Math.PI * 0.5);
    w = Math.max(Math.floor(pr), Math.min(Math.floor(barSpacing * coeff * pr), Math.floor(barSpacing * pr)));
  }
  const wick = Math.max(1, Math.floor(pr));
  if (w >= 2 && w % 2 !== wick % 2) w--;
  return w;
}

/**
 * Pinta o corpo das velas com um gradiente (de cima para baixo). A vela nativa fica com o corpo transparente,
 * por isso o gradiente vê-se por baixo do contorno e do pavio que o gráfico continua a desenhar.
 */
export class GradientCandles implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private look: GradientLook = { enabled: false, up: '#26a69a', up2: '#0b5f56', down: '#ef5350', down2: '#8f1d1a' };

  constructor(private bodies: () => readonly Body[]) {}

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

  setLook(look: GradientLook) {
    this.look = look;
    this.requestUpdate?.();
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      {
        zOrder: () => 'bottom',
        renderer: (): IPrimitivePaneRenderer => ({ draw: (target: CanvasRenderingTarget2D) => this.draw(target) }),
      },
    ];
  }

  private draw(target: CanvasRenderingTarget2D) {
    const chart = this.chart;
    const series = this.series;
    const look = this.look;
    if (!chart || !series || !look.enabled) return;
    const ts = chart.timeScale();
    const range = ts.getVisibleLogicalRange();
    const bars = this.bodies();
    if (!range || !bars.length) return;
    const spacing = ts.options().barSpacing;
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      const w = candleBodyWidth(spacing, hr);
      const from = Math.max(0, Math.floor(range.from) - 1);
      const to = Math.min(bars.length - 1, Math.ceil(range.to) + 1);
      for (let i = from; i <= to; i++) {
        const b = bars[i];
        const xm = ts.logicalToCoordinate(i as Logical);
        const y1 = series.priceToCoordinate(b.open);
        const y2 = series.priceToCoordinate(b.close);
        if (xm === null || y1 === null || y2 === null) continue;
        const xc = Math.round(xm * hr);
        const left = xc - Math.floor(w / 2);
        if (left > bitmapSize.width || left + w < 0) continue;
        const top = Math.round(Math.min(y1, y2) * vr);
        const h = Math.max(1, Math.round(Math.abs(y2 - y1) * vr));
        const upBar = b.close >= b.open;
        const g = ctx.createLinearGradient(0, top, 0, top + h);
        g.addColorStop(0, upBar ? look.up : look.down);
        g.addColorStop(1, upBar ? look.up2 : look.down2);
        ctx.fillStyle = g;
        ctx.fillRect(left, top, w, h);
      }
    });
  }
}
