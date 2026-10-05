import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { Drawing } from './drawings/types';
import { labelBox, toolDef, type Viewport } from './drawings/tools';
import type { Order, Position } from '@/core/trading/engine';

export interface TradeRegion {
  kind: 'close' | 'line';
  target: { type: 'position' | 'order'; id: string; field: 'entry' | 'sl' | 'tp' | 'price' };
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TradingOverlay {
  positions: Position[];
  orders: Order[];
  pnl: (p: Position) => number;
  fmtMoney: (v: number) => string;
  /** Lucro/prejuízo potencial se o preço chegar a `price`. */
  pnlAt: (p: Position, price: number) => number;
  /** Linha a ser arrastada (preço provisório). */
  dragging?: { id: string; field: string; price: number } | null;
}

/** Evento do calendário económico mostrado no fundo do gráfico. */
export interface ChartEvent {
  time: number;
  impact: 'high' | 'medium' | 'low';
  label: string;
}

export interface OverlayHost {
  viewport(): Viewport | null;
  drawings(): Drawing[];
  selectedId(): string | null;
  hoveredId(): string | null;
  preview(): Drawing | null;
  trading(): TradingOverlay | null;
  /** Linha de corte do replay. `label` e `handle` só no modo de arrastar (telemóvel). */
  replayPick(): { x: number; label?: string; handle?: boolean } | null;
  alerts(): { price: number; label: string }[];
  dark(): boolean;
  /** Etiqueta temporária junto ao dedo/rato (ex.: ângulo da linha). */
  hint(): { x: number; y: number; text: string } | null;
  /** Círculo no ponto onde o íman prendeu. */
  snapMark(): { x: number; y: number } | null;
  /** Ecrã tátil: pegas maiores. */
  coarse(): boolean;
  /** Tempo até fechar a vela (debaixo da etiqueta do último preço). */
  countdown(): { y: number; text: string; color: string } | null;
  /** Eventos económicos (⚡) junto ao eixo do tempo. */
  events(): ChartEvent[];
}

class AxisLabel implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly c: number,
    private readonly t: string,
    private readonly bg: string,
    private readonly fg = '#ffffff',
  ) {}
  coordinate() {
    return this.c;
  }
  text() {
    return this.t;
  }
  textColor() {
    return this.fg;
  }
  backColor() {
    return this.bg;
  }
  visible() {
    return true;
  }
  tickVisible() {
    return true;
  }
}

/** Distância (px) dos eventos ao fundo do painel. */
export const EVENT_BOTTOM = 12;

const FONT = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';

class OverlayRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly owner: OverlayPrimitive) {}

  draw(target: CanvasRenderingTarget2D) {
    const host = this.owner.host;
    const vp = host.viewport();
    if (!vp) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const view: Viewport = { ...vp, width: mediaSize.width, height: mediaSize.height };
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, mediaSize.width, mediaSize.height);
      ctx.clip();

      const selected = host.selectedId();
      const hovered = host.hoveredId();
      for (const d of host.drawings()) {
        if (d.hidden) continue;
        const def = toolDef(d.type);
        if (!def) continue;
        ctx.save();
        try {
          def.render(ctx, d, view, d.id === selected || d.id === hovered);
        } catch {
          /* desenho inválido: ignora */
        }
        ctx.restore();
      }
      const pv = host.preview();
      if (pv) {
        const def = toolDef(pv.type);
        ctx.save();
        try {
          def?.render(ctx, pv, view, true);
        } catch {
          /* ignora */
        }
        ctx.restore();
      }
      const sel = host.drawings().find((d) => d.id === selected) ?? (pv ?? null);
      if (sel) {
        const def = toolDef(sel.type);
        const hs = def?.handles(sel, view) ?? [];
        ctx.save();
        for (const h of hs) {
          ctx.beginPath();
          ctx.arc(h.x, h.y, host.coarse() ? 7.5 : 5, 0, Math.PI * 2);
          ctx.fillStyle = host.dark() ? '#131722' : '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#2962ff';
          ctx.setLineDash([]);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const a of host.alerts()) {
        const y = view.priceToY(a.price);
        if (y === null) continue;
        ctx.save();
        ctx.strokeStyle = '#ff9800';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(mediaSize.width, y);
        ctx.stroke();
        labelBox(ctx, [`⏰ ${a.label}`], mediaSize.width - 6, y, { bg: '#ff9800', fg: '#fff', align: 'right', font: FONT, pad: 4 });
        ctx.restore();
      }

      this.owner.regions = this.drawTrading(ctx, view);

      // eventos económicos: círculos com ⚡ no fundo do gráfico
      const evs = host.events();
      if (evs.length) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const y = mediaSize.height - EVENT_BOTTOM;
        for (const e of evs) {
          const x = view.timeToX(e.time);
          if (x === null || x < -10 || x > mediaSize.width + 10) continue;
          const color = e.impact === 'high' ? '#f23645' : e.impact === 'medium' ? '#ff9800' : '#9598a1';
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fillStyle = host.dark() ? '#1e222d' : '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillText('⚡', x, y + 0.5);
        }
        ctx.restore();
      }

      const snap = host.snapMark();
      if (snap) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(snap.x, snap.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      const hint = host.hint();
      if (hint) {
        ctx.save();
        labelBox(ctx, [hint.text], hint.x + 14, hint.y - 14, { bg: host.dark() ? '#363a45' : '#131722', fg: '#fff', align: 'left', font: FONT, pad: 4, radius: 3 });
        ctx.restore();
      }

      const pick = host.replayPick();
      if (pick) {
        ctx.save();
        ctx.fillStyle = host.dark() ? 'rgba(41,98,255,0.10)' : 'rgba(41,98,255,0.08)';
        ctx.fillRect(pick.x, 0, mediaSize.width - pick.x, mediaSize.height);
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pick.x, 0);
        ctx.lineTo(pick.x, mediaSize.height);
        ctx.stroke();
        if (pick.label) {
          // data da barra escolhida, do lado onde cabe
          const right = pick.x < mediaSize.width - 190;
          labelBox(ctx, [`✂ ${pick.label}`], right ? pick.x + 8 : pick.x - 8, 18, { bg: '#2962ff', fg: '#fff', align: right ? 'left' : 'right', valign: 'top', font: FONT });
        } else labelBox(ctx, ['✂ Clique para começar o replay aqui'], pick.x + 8, 18, { bg: '#2962ff', fg: '#fff', align: 'left', valign: 'top', font: FONT });
        if (pick.handle) {
          // pega para arrastar, a meio da altura
          const cy = mediaSize.height / 2;
          ctx.beginPath();
          ctx.arc(pick.x, cy, 17, 0, Math.PI * 2);
          ctx.fillStyle = '#2962ff';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = '700 15px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('↔', pick.x, cy + 1);
        }
        ctx.restore();
      }
      ctx.restore();
    });
  }

  private drawTrading(ctx: CanvasRenderingContext2D, vp: Viewport): TradeRegion[] {
    const t = this.owner.host.trading();
    if (!t) return [];
    const regions: TradeRegion[] = [];
    const drag = t.dragging;
    const lineAt = (price: number, color: string, dash: number[], labelParts: string[], closable: boolean, target: TradeRegion['target'], labelBg: string) => {
      const y = vp.priceToY(price);
      if (y === null) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vp.width, y);
      ctx.stroke();
      const box = labelBox(ctx, labelParts, 8, y, { bg: labelBg, fg: '#ffffff', align: 'left', font: FONT, pad: 5, radius: 3 });
      regions.push({ kind: 'line', target, x: 0, y: y - 5, w: vp.width, h: 10 });
      regions.push({ kind: 'line', target, x: box.x, y: box.y, w: box.w, h: box.h });
      if (closable) {
        const cx = box.x + box.w + 2;
        ctx.fillStyle = labelBg;
        ctx.beginPath();
        ctx.roundRect(cx, box.y, box.h, box.h, 3);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        const m = 5;
        ctx.beginPath();
        ctx.moveTo(cx + m, box.y + m);
        ctx.lineTo(cx + box.h - m, box.y + box.h - m);
        ctx.moveTo(cx + box.h - m, box.y + m);
        ctx.lineTo(cx + m, box.y + box.h - m);
        ctx.stroke();
        regions.unshift({ kind: 'close', target, x: cx, y: box.y, w: box.h, h: box.h });
      }
      ctx.restore();
    };

    for (const p of t.positions) {
      const long = p.side === 'long';
      const pnl = t.pnl(p);
      const qty = p.qty >= 100 ? p.qty.toFixed(0) : +p.qty.toFixed(4);
      lineAt(p.entryPrice, long ? '#2962ff' : '#f23645', [], [`${long ? 'COMPRA' : 'VENDA'} ${qty}  ${t.fmtMoney(pnl)}`], true, { type: 'position', id: p.id, field: 'entry' }, pnl >= 0 ? '#089981' : '#f23645');
      const sl = drag?.id === p.id && drag.field === 'sl' ? drag.price : p.sl;
      const tp = drag?.id === p.id && drag.field === 'tp' ? drag.price : p.tp;
      if (sl !== undefined) lineAt(sl, '#f23645', [5, 4], [`SL ${vp.fmtPrice(sl)}  ${t.fmtMoney(t.pnlAt(p, sl))}`], true, { type: 'position', id: p.id, field: 'sl' }, '#f23645');
      if (tp !== undefined) lineAt(tp, '#089981', [5, 4], [`TP ${vp.fmtPrice(tp)}  ${t.fmtMoney(t.pnlAt(p, tp))}`], true, { type: 'position', id: p.id, field: 'tp' }, '#089981');
      if (drag?.id === p.id && drag.field === 'entry') {
        // a arrastar a partir da entrada: pré-visualiza o novo SL/TP
        const isTp = long ? drag.price > p.entryPrice : drag.price < p.entryPrice;
        lineAt(drag.price, isTp ? '#089981' : '#f23645', [2, 3], [`${isTp ? 'TP' : 'SL'} ${vp.fmtPrice(drag.price)}  ${t.fmtMoney(t.pnlAt(p, drag.price))}`], false, { type: 'position', id: p.id, field: isTp ? 'tp' : 'sl' }, isTp ? '#089981' : '#f23645');
      }
    }
    for (const o of t.orders) {
      const price = drag?.id === o.id && drag.field === 'price' ? drag.price : o.price;
      const long = o.side === 'long';
      const kind = `${long ? 'COMPRA' : 'VENDA'} ${o.type === 'limit' ? 'LIMITE' : 'STOP'}`;
      lineAt(price, long ? '#2962ff' : '#f23645', [2, 3], [`${kind} ${o.qty >= 100 ? o.qty.toFixed(0) : +o.qty.toFixed(4)} @ ${vp.fmtPrice(price)}`], true, { type: 'order', id: o.id, field: 'price' }, long ? '#2962ff' : '#e65100');
      if (o.sl !== undefined) {
        const y = vp.priceToY(o.sl);
        if (y !== null) {
          ctx.save();
          ctx.strokeStyle = 'rgba(242,54,69,0.6)';
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(vp.width, y);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (o.tp !== undefined) {
        const y = vp.priceToY(o.tp);
        if (y !== null) {
          ctx.save();
          ctx.strokeStyle = 'rgba(8,153,129,0.6)';
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(vp.width, y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    return regions;
  }
}

class OverlayPaneView implements IPrimitivePaneView {
  private readonly r: OverlayRenderer;
  constructor(owner: OverlayPrimitive) {
    this.r = new OverlayRenderer(owner);
  }
  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
  renderer() {
    return this.r;
  }
}

/** Primitive único por gráfico: desenhos, ordens, alertas e seleção do replay. */
export class OverlayPrimitive implements ISeriesPrimitive<Time> {
  regions: TradeRegion[] = [];
  private view: OverlayPaneView;
  private requestUpdate: (() => void) | null = null;

  constructor(readonly host: OverlayHost) {
    this.view = new OverlayPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.requestUpdate = null;
  }

  update() {
    this.requestUpdate?.();
  }

  paneViews() {
    return [this.view];
  }

  priceAxisViews(): ISeriesPrimitiveAxisView[] {
    const vp = this.host.viewport();
    if (!vp) return [];
    const out: ISeriesPrimitiveAxisView[] = [];
    const add = (price: number, bg: string) => {
      const y = vp.priceToY(price);
      if (y !== null) out.push(new AxisLabel(y, vp.fmtPrice(price), bg));
    };
    for (const d of this.host.drawings()) {
      if (d.hidden) continue;
      if ((d.type === 'hline' || d.type === 'hray') && d.style.showLabel !== false) add(d.points[0].price, d.style.color);
    }
    const selId = this.host.selectedId();
    const sel = this.host.drawings().find((d) => d.id === selId) ?? this.host.preview();
    if (sel) toolDef(sel.type)?.axis?.(sel).prices.forEach((p) => add(p, '#2962ff'));
    const t = this.host.trading();
    if (t) {
      for (const p of t.positions) {
        add(p.entryPrice, p.side === 'long' ? '#2962ff' : '#f23645');
        if (p.sl !== undefined) add(p.sl, '#f23645');
        if (p.tp !== undefined) add(p.tp, '#089981');
      }
      for (const o of t.orders) add(o.price, o.side === 'long' ? '#2962ff' : '#e65100');
      if (t.dragging) add(t.dragging.price, '#787b86');
    }
    for (const a of this.host.alerts()) add(a.price, '#ff9800');
    const cd = this.host.countdown();
    if (cd) out.push(new AxisLabel(cd.y, cd.text, cd.color));
    return out;
  }

  timeAxisViews(): ISeriesPrimitiveAxisView[] {
    const vp = this.host.viewport();
    if (!vp) return [];
    const out: ISeriesPrimitiveAxisView[] = [];
    const selId = this.host.selectedId();
    const fmt = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
    for (const d of this.host.drawings()) {
      if (d.type !== 'vline' || d.hidden) continue;
      const x = vp.timeToX(d.points[0].time);
      if (x !== null) out.push(new AxisLabel(x, this.owner_fmtTime(d.points[0].time) ?? fmt(d.points[0].time), d.style.color));
    }
    const sel = this.host.drawings().find((d) => d.id === selId);
    if (sel && sel.type !== 'vline') {
      toolDef(sel.type)
        ?.axis?.(sel)
        .times.forEach((t) => {
          const x = vp.timeToX(t);
          if (x !== null) out.push(new AxisLabel(x, this.owner_fmtTime(t) ?? fmt(t), '#2962ff'));
        });
    }
    return out;
  }

  /** Formatação da hora no fuso escolhido (definida pelo controlador). */
  fmtTime: ((t: number) => string) | null = null;
  private owner_fmtTime(t: number) {
    return this.fmtTime?.(t);
  }
}
