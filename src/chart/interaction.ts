import type { PricePoint } from '@/core/types';
import type { ChartController } from './controller';
import type { Drawing, DrawingStyle, ToolId } from './drawings/types';
import { toolDef, type ToolDef } from './drawings/tools';
import type { TradeRegion } from './overlay';
import { focus } from './bus';
import { uid } from '@/lib/uid';
import type { Magnet } from '@/store/settings';

export type TradeAction =
  | { type: 'close-position'; id: string }
  | { type: 'cancel-order'; id: string }
  | { type: 'modify-position'; id: string; sl?: number | null; tp?: number | null }
  | { type: 'modify-order'; id: string; price: number };

export interface InteractionCallbacks {
  tool(): ToolId;
  setTool(t: ToolId): void;
  magnet(): Magnet;
  stayInDrawing(): boolean;
  globalLocked(): boolean;
  lastStyle(tool: ToolId): Partial<DrawingStyle>;
  addDrawing(d: Drawing): void;
  patchDrawing(id: string, patch: Partial<Drawing>): void;
  checkpoint(): void;
  commit(): void;
  select(id: string | null): void;
  removeDrawing(id: string): void;
  replaySelecting(): boolean;
  onReplayPick(time: number): void;
  onTrade(a: TradeAction): void;
  onContextMenu(e: { clientX: number; clientY: number; price: number | null; time: number | null; drawingId: string | null }): void;
  onEditDrawing(id: string): void;
  onActivate(): void;
  accountSize(): number;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'create'; def: ToolDef; drawing: Drawing; downAt: { x: number; y: number }; moved: boolean }
  | { kind: 'brush'; drawing: Drawing; last: { x: number; y: number } }
  | { kind: 'drag'; id: string; handle: number | null; start: PricePoint; orig: Drawing; moved: boolean }
  | { kind: 'trade'; region: TradeRegion; startY: number; moved: boolean; price: number };

const DRAG_THRESHOLD = 4;

export class Interaction {
  private mode: Mode = { kind: 'idle' };
  private capturing = false;
  private disposed = false;

  constructor(
    private readonly c: ChartController,
    private readonly cb: InteractionCallbacks,
  ) {
    const el = c.container;
    el.addEventListener('pointerdown', this.onDown, true);
    el.addEventListener('mousedown', this.block, true);
    el.addEventListener('touchstart', this.block, { capture: true, passive: false });
    el.addEventListener('pointermove', this.onHover);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('dblclick', this.onDblClick, true);
    el.addEventListener('contextmenu', this.onContext, true);
    window.addEventListener('keydown', this.onKey);
  }

  dispose() {
    this.disposed = true;
    const el = this.c.container;
    el.removeEventListener('pointerdown', this.onDown, true);
    el.removeEventListener('mousedown', this.block, true);
    el.removeEventListener('touchstart', this.block, true);
    el.removeEventListener('pointermove', this.onHover);
    el.removeEventListener('pointerleave', this.onLeave);
    el.removeEventListener('dblclick', this.onDblClick, true);
    el.removeEventListener('contextmenu', this.onContext, true);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onUp);
  }

  get busy(): boolean {
    return this.mode.kind !== 'idle';
  }

  // ---------------------------------------------------------------- utilitários

  private local(e: { clientX: number; clientY: number }): { x: number; y: number; inside: boolean } {
    const pane = this.c.paneElement();
    const rect = (pane ?? this.c.container).getBoundingClientRect();
    const size = this.c.paneSize();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, inside: x >= 0 && y >= 0 && x <= size.width && y <= size.height };
  }

  /** Ponto (tempo, preço) com encaixe nas barras e íman opcional. */
  private toPoint(x: number, y: number, snapTime = true): PricePoint | null {
    const l = this.c.xToLogical(x);
    let price = this.c.yToPrice(y);
    if (l === null || price === null) return null;
    const li = snapTime ? Math.round(l) : l;
    const time = this.c.logicalToTime(li);
    if (time === null) return null;
    const magnet = this.cb.magnet();
    if (magnet !== 'off') {
      const bar = this.c.bars[Math.round(l)];
      if (bar) {
        const candidates = [bar.open, bar.high, bar.low, bar.close];
        let best = price;
        let bestDist = Infinity;
        for (const cand of candidates) {
          const cy = this.c.priceToY(cand);
          if (cy === null) continue;
          const dist = Math.abs(cy - y);
          if (dist < bestDist) {
            bestDist = dist;
            best = cand;
          }
        }
        if (magnet === 'strong' || bestDist < 14) price = best;
      }
    }
    return { time, price };
  }

  private setScroll(enabled: boolean) {
    this.c.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
  }

  private setCursor(cursor: string) {
    this.c.container.style.cursor = cursor;
  }

  private consume(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.capturing = true;
  }

  private block = (e: Event) => {
    if (this.capturing) {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  };

  private hitDrawing(x: number, y: number): { d: Drawing; handle: number | null } | null {
    const vp = this.c.viewport();
    if (!vp) return null;
    const sel = this.c.drawings.find((d) => d.id === this.c.selectedId);
    if (sel && !sel.hidden) {
      const def = toolDef(sel.type);
      const h = def?.handles(sel, vp).find((hh) => Math.hypot(hh.x - x, hh.y - y) <= 8);
      if (h) return { d: sel, handle: h.id };
    }
    for (let i = this.c.drawings.length - 1; i >= 0; i--) {
      const d = this.c.drawings[i];
      if (d.hidden) continue;
      const def = toolDef(d.type);
      try {
        if (def?.hit(d, vp, { x, y })) return { d, handle: null };
      } catch {
        /* ignora */
      }
    }
    return null;
  }

  private hitTrade(x: number, y: number): TradeRegion | null {
    for (const r of this.c.overlay.regions) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // ---------------------------------------------------------------- eventos

  private onDown = (e: PointerEvent) => {
    if (this.disposed) return;
    this.capturing = false;
    focus.chartId = this.c.id;
    this.cb.onActivate();
    if (e.button !== 0) return;
    const p = this.local(e);
    if (!p.inside) return;

    if (this.cb.replaySelecting()) {
      const l = this.c.xToLogical(p.x);
      if (l === null) return;
      const idx = Math.max(0, Math.min(this.c.bars.length - 1, Math.round(l)));
      const bar = this.c.bars[idx];
      if (bar) this.cb.onReplayPick(bar.time);
      this.consume(e);
      return;
    }

    const m = this.mode;
    if (m.kind === 'create') {
      this.consume(e);
      m.downAt = { x: p.x, y: p.y };
      m.moved = false;
      this.addCreationPoint(p.x, p.y);
      return;
    }

    const tool = this.cb.tool();
    const def = tool === 'cross' || tool === 'cursor' ? undefined : toolDef(tool);
    if (def) {
      this.consume(e);
      this.startCreation(def, p.x, p.y);
      return;
    }

    const tr = this.hitTrade(p.x, p.y);
    if (tr) {
      this.consume(e);
      if (tr.kind === 'close') {
        if (tr.target.type === 'order') this.cb.onTrade({ type: 'cancel-order', id: tr.target.id });
        else if (tr.target.field === 'entry') this.cb.onTrade({ type: 'close-position', id: tr.target.id });
        else this.cb.onTrade({ type: 'modify-position', id: tr.target.id, [tr.target.field]: null });
        return;
      }
      const price = this.c.yToPrice(p.y) ?? 0;
      this.mode = { kind: 'trade', region: tr, startY: p.y, moved: false, price };
      this.beginDrag();
      return;
    }

    const hit = this.hitDrawing(p.x, p.y);
    if (hit) {
      this.consume(e);
      this.cb.select(hit.d.id);
      if (hit.d.locked || this.cb.globalLocked()) return;
      const start = this.toPoint(p.x, p.y, false);
      if (!start) return;
      this.mode = { kind: 'drag', id: hit.d.id, handle: hit.handle, start, orig: hit.d, moved: false };
      this.beginDrag();
      return;
    }
    if (this.c.selectedId) this.cb.select(null);
  };

  private beginDrag() {
    this.setScroll(false);
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onUp);
  }

  private endDrag() {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onUp);
    this.setScroll(true);
    this.capturing = false;
  }

  private newDrawing(def: ToolDef, pt: PricePoint): Drawing {
    const style: DrawingStyle = { ...def.style, ...this.cb.lastStyle(def.id) };
    if (def.style.levels && !style.levels) style.levels = def.style.levels;
    return { id: uid('d'), type: def.id, points: [pt], style, createdAt: Date.now() };
  }

  private startCreation(def: ToolDef, x: number, y: number) {
    const pt = this.toPoint(x, y);
    if (!pt) return;
    if (def.points === 0) {
      const d = this.newDrawing(def, pt);
      this.c.preview = d;
      this.mode = { kind: 'brush', drawing: d, last: { x, y } };
      this.beginDrag();
      return;
    }
    if (def.points === 1) {
      let d = this.newDrawing(def, pt);
      const vp = this.c.viewport();
      if (def.init && vp) d = def.init({ ...d, data: d.data ?? { stop: 0, target: 0, riskPct: 1, account: this.cb.accountSize() } }, vp);
      this.finish(d);
      return;
    }
    const d = this.newDrawing(def, pt);
    d.points = [pt, { ...pt }];
    this.c.preview = d;
    this.mode = { kind: 'create', def, drawing: d, downAt: { x, y }, moved: false };
    this.c.redraw();
    // permite também criar arrastando
    this.beginDrag();
  }

  private addCreationPoint(x: number, y: number) {
    const m = this.mode;
    if (m.kind !== 'create') return;
    const pt = this.toPoint(x, y);
    if (!pt) return;
    const d = m.drawing;
    d.points[d.points.length - 1] = pt;
    const need = m.def.points;
    if (need > 0 && d.points.length >= need) {
      this.finish(d);
      return;
    }
    d.points.push({ ...pt });
    this.c.redraw();
  }

  private finish(d: Drawing) {
    this.c.preview = null;
    this.mode = { kind: 'idle' };
    this.endDrag();
    // remove pontos repetidos (duplo clique no caminho)
    if (d.type === 'path') {
      d.points = d.points.filter((p, i) => i === 0 || p.time !== d.points[i - 1].time || p.price !== d.points[i - 1].price);
      if (d.points.length < 2) {
        this.c.redraw();
        return;
      }
    }
    this.cb.addDrawing(d);
    this.cb.select(d.id);
    if (!this.cb.stayInDrawing()) this.cb.setTool('cross');
    if (d.type === 'text' || d.type === 'note') this.cb.onEditDrawing(d.id);
    this.c.redraw();
  }

  cancel() {
    if (this.mode.kind === 'create' || this.mode.kind === 'brush') {
      this.c.preview = null;
      this.mode = { kind: 'idle' };
      this.endDrag();
      this.c.redraw();
      return true;
    }
    return false;
  }

  private onDragMove = (e: PointerEvent) => {
    const p = this.local(e);
    const m = this.mode;
    if (m.kind === 'create') {
      if (e.buttons && Math.hypot(p.x - m.downAt.x, p.y - m.downAt.y) > DRAG_THRESHOLD) m.moved = true;
      const pt = this.toPoint(p.x, p.y);
      if (!pt) return;
      m.drawing.points[m.drawing.points.length - 1] = pt;
      this.c.redraw();
    } else if (m.kind === 'brush') {
      if (Math.hypot(p.x - m.last.x, p.y - m.last.y) < 3) return;
      const pt = this.toPoint(p.x, p.y, false);
      if (!pt) return;
      m.drawing.points.push(pt);
      m.last = { x: p.x, y: p.y };
      this.c.redraw();
    } else if (m.kind === 'drag') {
      const pt = this.toPoint(p.x, p.y, m.handle !== null);
      if (!pt) return;
      if (!m.moved) {
        m.moved = true;
        this.cb.checkpoint();
      }
      const def = toolDef(m.orig.type);
      const vp = this.c.viewport();
      if (!def || !vp) return;
      let patch: Partial<Drawing>;
      if (m.handle !== null) {
        if (def.drag) patch = def.drag(m.orig, m.handle, pt, vp);
        else {
          const pts = m.orig.points.slice();
          pts[m.handle] = pt;
          patch = { points: pts };
        }
      } else {
        // mover o desenho inteiro (em barras inteiras no tempo)
        const l0 = this.c.timeToLogical(m.start.time) ?? 0;
        const lNow = this.c.xToLogical(p.x) ?? l0;
        const dl = Math.round(lNow - l0);
        const price = this.c.yToPrice(p.y) ?? m.start.price;
        const dp = price - m.start.price;
        const shift = (q: PricePoint): PricePoint => {
          const lq = this.c.timeToLogical(q.time) ?? 0;
          return { time: this.c.logicalToTime(lq + dl) ?? q.time, price: q.price + dp };
        };
        patch = { points: m.orig.points.map(shift) };
        if (m.orig.data) patch.data = { ...m.orig.data, stop: m.orig.data.stop + dp, target: m.orig.data.target + dp };
      }
      this.cb.patchDrawing(m.id, patch);
    } else if (m.kind === 'trade') {
      if (Math.abs(p.y - m.startY) > DRAG_THRESHOLD) m.moved = true;
      const price = this.c.yToPrice(p.y);
      if (price === null || !this.c.trading) return;
      m.price = price;
      this.c.trading.dragging = { id: m.region.target.id, field: m.region.target.field, price };
      this.setCursor('ns-resize');
      this.c.redraw();
    }
  };

  private onUp = (e: PointerEvent) => {
    const m = this.mode;
    const p = this.local(e);
    if (m.kind === 'create') {
      // arrastar para criar: largar conta como um clique
      if (m.moved) {
        m.moved = false;
        m.downAt = { x: p.x, y: p.y };
        this.addCreationPoint(p.x, p.y);
      }
      return;
    }
    if (m.kind === 'brush') {
      if (m.drawing.points.length > 1) this.finish(m.drawing);
      else this.cancel();
      return;
    }
    if (m.kind === 'drag') {
      this.mode = { kind: 'idle' };
      this.endDrag();
      if (m.moved) this.cb.commit();
      return;
    }
    if (m.kind === 'trade') {
      this.mode = { kind: 'idle' };
      this.endDrag();
      if (this.c.trading) this.c.trading.dragging = null;
      this.setCursor('');
      if (m.moved) {
        const t = m.region.target;
        if (t.type === 'order') this.cb.onTrade({ type: 'modify-order', id: t.id, price: m.price });
        else if (t.field === 'entry') {
          const pos = this.c.trading?.positions.find((x) => x.id === t.id);
          if (pos) {
            const isTp = pos.side === 'long' ? m.price > pos.entryPrice : m.price < pos.entryPrice;
            this.cb.onTrade({ type: 'modify-position', id: t.id, [isTp ? 'tp' : 'sl']: m.price });
          }
        } else this.cb.onTrade({ type: 'modify-position', id: t.id, [t.field]: m.price });
      }
      this.c.redraw();
    }
  };

  private onHover = (e: PointerEvent) => {
    if (this.mode.kind !== 'idle' || e.buttons) {
      if (this.mode.kind === 'create') this.onDragMove(e);
      return;
    }
    const p = this.local(e);
    if (this.cb.replaySelecting()) {
      this.c.replayPickX = p.inside ? p.x : null;
      this.setCursor(p.inside ? 'crosshair' : '');
      this.c.redraw();
      return;
    }
    if (this.c.replayPickX !== null) {
      this.c.replayPickX = null;
      this.c.redraw();
    }
    if (!p.inside) return;
    const tool = this.cb.tool();
    if (tool !== 'cross' && tool !== 'cursor') {
      this.setCursor('crosshair');
      return;
    }
    const tr = this.hitTrade(p.x, p.y);
    if (tr) {
      this.setCursor(tr.kind === 'close' ? 'pointer' : 'ns-resize');
      return;
    }
    const hit = this.hitDrawing(p.x, p.y);
    const hid = hit?.d.id ?? null;
    if (hid !== this.c.hoveredId) {
      this.c.hoveredId = hid;
      this.c.redraw();
    }
    this.setCursor(hit ? (hit.handle !== null ? 'move' : 'pointer') : tool === 'cursor' ? 'default' : '');
  };

  private onLeave = () => {
    if (this.c.replayPickX !== null) {
      this.c.replayPickX = null;
      this.c.redraw();
    }
    if (this.c.hoveredId) {
      this.c.hoveredId = null;
      this.c.redraw();
    }
  };

  private onDblClick = (e: MouseEvent) => {
    const m = this.mode;
    if (m.kind === 'create' && m.def.points === -1) {
      e.preventDefault();
      e.stopPropagation();
      m.drawing.points.pop();
      this.finish(m.drawing);
      return;
    }
    const p = this.local(e);
    if (!p.inside) return;
    const hit = this.hitDrawing(p.x, p.y);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      this.cb.onEditDrawing(hit.d.id);
    }
  };

  private onContext = (e: MouseEvent) => {
    e.preventDefault();
    if (this.cancel()) return;
    const p = this.local(e);
    const hit = p.inside ? this.hitDrawing(p.x, p.y) : null;
    if (hit) this.cb.select(hit.d.id);
    const pt = p.inside ? this.toPoint(p.x, p.y, true) : null;
    this.cb.onContextMenu({ clientX: e.clientX, clientY: e.clientY, price: pt?.price ?? null, time: pt?.time ?? null, drawingId: hit?.d.id ?? null });
  };

  private onKey = (e: KeyboardEvent) => {
    if (focus.chartId !== this.c.id) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.closest('.cm-editor'))) return;
    if (e.key === 'Escape') {
      if (this.cancel()) return;
      if (this.c.selectedId) this.cb.select(null);
      if (this.cb.tool() !== 'cross') this.cb.setTool('cross');
    } else if (e.key === 'Enter' && this.mode.kind === 'create' && this.mode.def.points === -1) {
      this.finish(this.mode.drawing);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.c.selectedId) {
      const d = this.c.drawings.find((x) => x.id === this.c.selectedId);
      if (d && !d.locked) {
        e.preventDefault();
        this.cb.removeDrawing(d.id);
      }
    }
  };
}
