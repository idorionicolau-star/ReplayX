import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

/** Linha entre dois pontos (posição da vela e preço), por exemplo uma oscilação ou o nível de um BOS. */
export interface DrawLine {
  i1: number;
  p1: number;
  i2: number;
  p2: number;
  color: string;
  width?: number;
  dash?: boolean;
}

/** Etiqueta junto de um ponto. */
export interface DrawText {
  i: number;
  p: number;
  text: string;
  color: string;
  /** Tamanho da letra em px (por omissão 11). */
  size?: number;
  /** Onde fica em relação ao ponto (por omissão por cima). */
  pos?: 'above' | 'below' | 'center';
  bold?: boolean;
  /** Encosta a etiqueta à margem direita do gráfico (a altura vem do preço), para nunca ser cortada pelo eixo. */
  edge?: 'right';
}

/** Cartão com linhas de texto num canto do gráfico (resumo do que o indicador lê). */
export interface DrawPanel {
  lines: { text: string; color?: string }[];
  corner?: 'tl' | 'tr' | 'bl' | 'br';
}

export interface DrawData {
  lines: DrawLine[];
  texts: DrawText[];
  panel?: DrawPanel;
}

/**
 * Camada de desenho de um indicador: linhas, etiquetas e um cartão, posicionados pela vela e pelo preço,
 * por isso acompanham o zoom e o arrastar do gráfico.
 */
export class SegmentLayer implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private data: DrawData | null = null;

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

  set(data: DrawData | null) {
    this.data = data;
    this.requestUpdate?.();
  }

  paneViews(): IPrimitivePaneView[] {
    return [
      {
        zOrder: () => 'top',
        renderer: (): IPrimitivePaneRenderer => ({ draw: (target: CanvasRenderingTarget2D) => this.draw(target) }),
      },
    ];
  }

  private draw(target: CanvasRenderingTarget2D) {
    const chart = this.chart;
    const series = this.series;
    const d = this.data;
    if (!chart || !series || !d) return;
    const ts = chart.timeScale();
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const x = (i: number) => ts.logicalToCoordinate(i as Logical);
      const y = (p: number) => series.priceToCoordinate(p);
      ctx.save();
      ctx.lineCap = 'round';
      for (const l of d.lines) {
        const x1 = x(l.i1);
        const x2 = x(l.i2);
        const y1 = y(l.p1);
        const y2 = y(l.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        if ((x1 < -50 && x2 < -50) || (x1 > mediaSize.width + 50 && x2 > mediaSize.width + 50)) continue;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width ?? 1;
        ctx.setLineDash(l.dash ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const t of d.texts) {
        const size = t.size ?? 11;
        ctx.font = `${t.bold === false ? 500 : 700} ${size}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(t.text).width;
        const cx = t.edge === 'right' ? mediaSize.width - 8 - w / 2 : x(t.i);
        const cy = y(t.p);
        if (cx === null || cy === null || cx < -40 || cx > mediaSize.width + 40) continue;
        const gap = size * 0.9;
        const ty = t.pos === 'below' ? cy + gap : t.pos === 'center' ? cy : cy - gap;
        ctx.fillStyle = 'rgba(10,12,20,0.55)';
        const r = 3;
        const bx = cx - w / 2 - 3;
        const by = ty - size / 2 - 2;
        const bw = w + 6;
        const bh = size + 4;
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
        ctx.arcTo(bx, by + bh, bx, by, r);
        ctx.arcTo(bx, by, bx + bw, by, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, cx, ty + 0.5);
      }
      if (d.panel?.lines.length) {
        const size = mediaSize.width < 520 ? 10 : 12;
        ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const lh = size + 6;
        const pad = 8;
        const widest = Math.max(...d.panel.lines.map((l) => ctx.measureText(l.text).width));
        const w = widest + pad * 2;
        const h = d.panel.lines.length * lh + pad;
        const corner = d.panel.corner ?? 'bl';
        const px = corner === 'tr' || corner === 'br' ? mediaSize.width - w - 8 : 8;
        const py = corner === 'bl' || corner === 'br' ? mediaSize.height - h - 8 : corner === 'tr' ? 8 : 52;
        ctx.fillStyle = 'rgba(12,14,24,0.78)';
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(px, py, w, h, 8);
        ctx.fill();
        ctx.stroke();
        d.panel.lines.forEach((l, k) => {
          ctx.fillStyle = l.color ?? '#d1d4dc';
          ctx.fillText(l.text, px + pad, py + pad / 2 + lh * k + lh / 2);
        });
      }
      ctx.restore();
    });
  }
}
