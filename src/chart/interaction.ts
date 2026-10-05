import type { PricePoint } from '@/core/types';
import type { ChartController } from './controller';
import type { Drawing, DrawingStyle, ToolId } from './drawings/types';
import { setHitTolerance, toolDef, type ToolDef } from './drawings/tools';
import { Loupe } from './loupe';
import { EVENT_BOTTOM, type TradeRegion } from './overlay';
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
  /** Encaixar linhas de 15 em 15° (também com Shift). */
  angleSnap(): boolean;
  /** Lupa ao desenhar com o dedo. */
  loupe(): boolean;
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
  | { kind: 'trade'; region: TradeRegion; startY: number; moved: boolean; price: number }
  | { kind: 'pick' };

const DRAG_THRESHOLD = 4;
/** Ferramentas de linha: o 2.º ponto pode encaixar no ângulo e mostra os graus. */
const LINE_TOOLS = new Set<ToolId>(['trendline', 'ray', 'extended', 'infoline', 'arrowline', 'channel', 'path']);
const ANGLE_STEP = Math.PI / 12; // 15°
/** Desenho copiado com Ctrl+C (partilhado por todos os gráficos). */
let clipboard: Drawing | null = null;

export class Interaction {
  private mode: Mode = { kind: 'idle' };
  private capturing = false;
  private disposed = false;
  /** O último toque foi com o dedo (tolerâncias maiores, lupa). */
  private touch = false;
  private mods = { shift: false, ctrl: false };
  private readonly loupe: Loupe;

  constructor(
    private readonly c: ChartController,
    private readonly cb: InteractionCallbacks,
  ) {
    const el = c.container;
    this.loupe = new Loupe(el);
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onPinchDown, true);
    window.addEventListener('pointermove', this.onPinchMove);
    window.addEventListener('pointerup', this.onPinchUp);
    window.addEventListener('pointercancel', this.onPinchUp);
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
    this.stopEdge();
    window.removeEventListener('pointerup', this.onPickTap);
    this.loupe.dispose();
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
    window.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('pointerdown', this.onPinchDown);
    window.removeEventListener('pointermove', this.onPinchMove);
    window.removeEventListener('pointerup', this.onPinchUp);
    window.removeEventListener('pointercancel', this.onPinchUp);
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

  /** Ponto (tempo, preço) com encaixe nas barras e íman opcional. Ctrl = íman agressivo (como no TradingView). */
  private toPoint(x: number, y: number, snapTime = true): PricePoint | null {
    const l = this.c.xToLogical(x);
    let price = this.c.yToPrice(y);
    this.c.snapMark = null;
    if (l === null || price === null) return null;
    const li = snapTime ? Math.round(l) : l;
    let time = this.c.logicalToTime(li);
    if (time === null) return null;
    const aggressive = this.mods.ctrl;
    const magnet = aggressive ? 'strong' : this.cb.magnet();
    if (magnet !== 'off') {
      // candidatos: OHLC das barras vizinhas (e, com Ctrl, pontos de outros desenhos)
      const cands: { time: number; price: number }[] = [];
      const reach = aggressive ? 2 : 0;
      const centre = Math.round(l);
      for (let i = centre - reach; i <= centre + reach; i++) {
        const bar = this.c.bars[i];
        if (!bar) continue;
        for (const v of [bar.open, bar.high, bar.low, bar.close]) cands.push({ time: bar.time, price: v });
      }
      if (aggressive) {
        for (const d of this.c.drawings) {
          if (d.hidden || d.id === this.c.selectedId) continue;
          for (const q of d.points) cands.push(q);
        }
      }
      let best: { time: number; price: number; x: number; y: number } | null = null;
      let bestDist = Infinity;
      for (const cand of cands) {
        const cx = this.c.timeToX(cand.time);
        const cy = this.c.priceToY(cand.price);
        if (cx === null || cy === null) continue;
        const dist = Math.hypot(cx - x, cy - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = { ...cand, x: cx, y: cy };
        }
      }
      // íman fraco: só perto; forte: sempre à barra do cursor; Ctrl: alcance largo, apanha pontos de outros desenhos
      const reachPx = aggressive ? 40 : magnet === 'strong' ? Infinity : 14;
      if (best && bestDist <= reachPx) {
        price = best.price;
        if (aggressive) time = best.time;
        this.c.snapMark = { x: best.x, y: best.y };
      } else if (magnet === 'strong' && !aggressive) {
        const bar = this.c.bars[centre];
        if (bar) {
          let bd = Infinity;
          for (const v of [bar.open, bar.high, bar.low, bar.close]) {
            const cy = this.c.priceToY(v);
            if (cy !== null && Math.abs(cy - y) < bd) {
              bd = Math.abs(cy - y);
              price = v;
            }
          }
        }
      }
    }
    return { time, price };
  }

  /** Ponto do 2.º extremo de uma linha, encaixado em múltiplos de 15° a partir de `anchor` (Shift ou botão). */
  private anglePoint(anchor: PricePoint, x: number, y: number): PricePoint | null {
    const ax = this.c.timeToX(anchor.time);
    const ay = this.c.priceToY(anchor.price);
    if (ax === null || ay === null) return this.toPoint(x, y);
    const ang = Math.round(Math.atan2(y - ay, x - ax) / ANGLE_STEP) * ANGLE_STEP;
    if (Math.abs(Math.cos(ang)) < 1e-6) {
      // vertical: mesmo instante
      const price = this.c.yToPrice(y);
      return price === null ? null : { time: anchor.time, price };
    }
    const base = this.toPointRaw(x, y);
    if (!base) return null;
    const bx = this.c.timeToX(base.time);
    if (bx === null) return base;
    const price = this.c.yToPrice(ay + Math.tan(ang) * (bx - ax));
    return price === null ? null : { time: base.time, price };
  }

  /** Ponto sem íman (encaixe só no tempo). */
  private toPointRaw(x: number, y: number): PricePoint | null {
    const l = this.c.xToLogical(x);
    const price = this.c.yToPrice(y);
    if (l === null || price === null) return null;
    const time = this.c.logicalToTime(Math.round(l));
    return time === null ? null : { time, price };
  }

  private snapAngle(): boolean {
    return this.mods.shift || this.cb.angleSnap();
  }

  /** Graus da linha anchor→pt no ecrã (para cima = positivo). */
  private showAngle(anchor: PricePoint, pt: PricePoint, x: number, y: number) {
    const ax = this.c.timeToX(anchor.time);
    const ay = this.c.priceToY(anchor.price);
    const bx = this.c.timeToX(pt.time);
    const by = this.c.priceToY(pt.price);
    if (ax === null || ay === null || bx === null || by === null || (ax === bx && ay === by)) {
      this.c.hint = null;
      return;
    }
    const deg = (-Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    this.c.hint = { x, y, text: `${deg.toFixed(1)}°${this.snapAngle() ? ' ⊾' : ''}` };
  }

  /** Ponto para o extremo que está a ser posicionado numa linha (com encaixe de ângulo se ativo). */
  private linePoint(type: ToolId, anchor: PricePoint | undefined, x: number, y: number, screen: { x: number; y: number }): PricePoint | null {
    const pt = anchor && LINE_TOOLS.has(type) && this.snapAngle() ? this.anglePoint(anchor, x, y) : this.toPoint(x, y);
    if (pt && anchor && LINE_TOOLS.has(type)) this.showAngle(anchor, pt, screen.x, screen.y);
    return pt;
  }

  private updateLoupe(e: { clientX: number; clientY: number }) {
    if (this.touch && this.cb.loupe()) this.loupe.show(e.clientX, e.clientY);
  }

  private trackMods(e: { shiftKey: boolean; ctrlKey: boolean; metaKey?: boolean }) {
    this.mods = { shift: e.shiftKey, ctrl: e.ctrlKey || !!e.metaKey };
  }

  private setScroll(enabled: boolean) {
    // a pinça (zoom com dois dedos) é tratada aqui, mais rápida e progressiva que a da biblioteca
    this.c.chart.applyOptions({ handleScroll: enabled, handleScale: enabled ? { mouseWheel: true, pinch: false, axisPressedMouseMove: true } : false });
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
      const r = this.touch ? 22 : 8;
      const h = def?.handles(sel, vp).find((hh) => Math.hypot(hh.x - x, hh.y - y) <= r);
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

  private hitEvent(x: number, y: number) {
    const ey = this.c.paneSize().height - EVENT_BOTTOM;
    if (Math.abs(y - ey) > 10) return null;
    for (const e of this.c.events) {
      const ex = this.c.timeToX(e.time);
      if (ex !== null && Math.abs(ex - x) <= 9) return e;
    }
    return null;
  }

  private hitTrade(x: number, y: number): TradeRegion | null {
    const pad = this.touch ? 8 : 0;
    for (const r of this.c.overlay.regions) {
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return r;
    }
    return null;
  }

  // ---------------------------------------------------------------- eventos

  // ---------------------------------------------------------------- linha de corte do replay (dedo)

  private tap: { x: number; y: number; t: number } | null = null;
  private edgeDir = 0;
  private edgeX = 0;
  private edgeTimer: ReturnType<typeof setInterval> | null = null;

  private stopEdge() {
    if (this.edgeTimer) clearInterval(this.edgeTimer);
    this.edgeTimer = null;
    this.edgeDir = 0;
  }

  private onPickTap = (e: PointerEvent) => {
    const t = this.tap;
    this.tap = null;
    if (!t || !this.cb.replaySelecting() || this.touches.size > 1) return;
    const p = this.local(e);
    if (Math.hypot(p.x - t.x, p.y - t.y) < 10 && performance.now() - t.t < 450 && p.inside) this.c.setPickAtX(p.x, false);
  };

  // ---------------------------------------------------------------- zoom com dois dedos

  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; cx: number; range: { from: number; to: number } | null } | null = null;

  private pinchState() {
    const [a, b] = [...this.touches.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 };
  }

  private onPinchDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // rede de segurança: um dedo sozinho com tudo parado tem de poder mover o gráfico
    if (this.touches.size === 1 && this.mode.kind === 'idle' && !this.cb.replaySelecting()) this.setScroll(true);
    if (this.touches.size !== 2) return;
    // segundo dedo: deixa de desenhar/arrastar e passa a fazer zoom
    this.cancel();
    if (this.mode.kind !== 'idle') {
      this.mode = { kind: 'idle' };
      this.endDrag();
    }
    this.loupe.hide();
    this.c.hint = null;
    this.setScroll(false);
    this.capturing = true;
    // a biblioteca só aplica o intervalo no quadro seguinte: guardamos o nosso para não perder incrementos entre toques
    this.pinch = { ...this.pinchState(), range: this.c.chart.timeScale().getVisibleLogicalRange() };
  };

  private onPinchMove = (e: PointerEvent) => {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.pinch || this.touches.size < 2) return;
    const now = this.pinchState();
    const ratio = now.dist / Math.max(1, this.pinch.dist);
    // progressivo: quanto mais depressa se abrem/fecham os dedos, maior o ganho
    const gain = 1.6 + Math.min(1.2, Math.abs(Math.log(ratio)) * 25);
    const factor = Math.pow(ratio, gain);
    const ts = this.c.chart.timeScale();
    const r = this.pinch.range;
    const rect = (this.c.paneElement() ?? this.c.container).getBoundingClientRect();
    const width = this.c.paneSize().width;
    let range = r;
    if (r && width > 0 && Number.isFinite(factor) && factor > 0) {
      const frac = Math.min(1, Math.max(0, (this.pinch.cx - rect.left) / width));
      const oldW = r.to - r.from;
      const anchor = r.from + frac * oldW;
      const newW = Math.min(50000, Math.max(5, oldW / factor));
      // os dois dedos a andar juntos também deslocam o gráfico
      const shift = ((this.pinch.cx - now.cx) / width) * newW;
      const from = anchor - frac * newW + shift;
      range = { from, to: from + newW };
      ts.setVisibleLogicalRange(range);
    }
    this.pinch = { ...now, range };
  };

  private onPinchUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size >= 2) return;
    // a pinça acaba quando sobra menos de dois dedos; o movimento só volta quando já não há nenhum dedo
    // (antes só voltava se o último dedo saísse a meio de uma pinça: com os dedos a sair um de cada vez ficava preso)
    this.pinch = null;
    if (this.touches.size === 0 && this.mode.kind === 'idle') {
      this.capturing = false;
      this.setScroll(true);
    }
  };

  private onDown = (e: PointerEvent) => {
    if (this.disposed) return;
    // com dois dedos é zoom (tratado em onPinchDown)
    if (e.pointerType === 'touch' && this.touches.size >= 2) {
      this.consume(e);
      return;
    }
    this.capturing = false;
    focus.chartId = this.c.id;
    this.cb.onActivate();
    if (e.button !== 0) return;
    this.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    setHitTolerance(this.touch ? 16 : 6);
    this.trackMods(e);
    const p = this.local(e);
    if (!p.inside) return;

    if (this.cb.replaySelecting() && e.pointerType !== 'mouse') {
      // dedo: arrasta-se a linha de corte até ao ponto de partida e confirma-se no botão (sem salto de "clicar e começar")
      if (this.c.pickTime === null) this.c.initPick();
      const lx = this.c.pickX();
      if (lx !== null && Math.abs(p.x - lx) <= 44) {
        this.consume(e);
        this.mode = { kind: 'pick' };
        this.c.setPickAtX(p.x, true);
        this.beginDrag();
        this.updateLoupe(e);
        return;
      }
      // toque curto noutro sítio leva a linha para lá; arrastar fora da linha desloca o gráfico
      this.tap = { x: p.x, y: p.y, t: performance.now() };
      window.addEventListener('pointerup', this.onPickTap, { once: true });
      return;
    }
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
      this.updateLoupe(e);
      return;
    }

    const tool = this.cb.tool();
    const def = tool === 'cross' || tool === 'cursor' ? undefined : toolDef(tool);
    if (def) {
      // com uma ferramenta ativa, tocar no desenho que está selecionado (pegas ou corpo) edita-o em vez de criar outro
      const own = this.hitDrawing(p.x, p.y);
      if (own && own.d.id === this.c.selectedId) {
        this.consume(e);
        if (own.d.locked || this.cb.globalLocked()) return;
        const start = this.toPoint(p.x, p.y, false);
        if (!start) return;
        this.mode = { kind: 'drag', id: own.d.id, handle: own.handle, start, orig: own.d, moved: false };
        this.beginDrag();
        if (own.handle !== null) this.updateLoupe(e);
        return;
      }
      this.consume(e);
      this.startCreation(def, p.x, p.y);
      if (this.mode.kind !== 'idle') this.updateLoupe(e);
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
      this.updateLoupe(e);
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
      if (hit.handle !== null) this.updateLoupe(e);
      return;
    }
    if (this.c.selectedId) this.cb.select(null);
  };

  private beginDrag() {
    this.setScroll(false);
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onUp);
    // o navegador pode interromper o toque (ex.: assume um gesto): tratar como se tivesse largado
    window.addEventListener('pointercancel', this.onUp);
  }

  private endDrag() {
    this.loupe.hide();
    this.c.hint = null;
    this.c.snapMark = null;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.setScroll(true);
    this.capturing = false;
  }

  private newDrawing(def: ToolDef, pt: PricePoint): Drawing {
    // o texto e a visibilidade são de cada desenho: nunca passam do último para o próximo
    const { text: _t, visibleOn: _v, ...last } = this.cb.lastStyle(def.id);
    void _t;
    void _v;
    const style: DrawingStyle = { ...def.style, ...last };
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
    const d = m.drawing;
    const pt = this.linePoint(d.type, d.points[d.points.length - 2], x, y, { x, y });
    if (!pt) return;
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
    this.c.hint = null;
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
    // no dedo a ferramenta volta sempre ao cursor depois de criar (senão o toque seguinte, para arrastar ou
    // editar, criava outro objeto); o "modo contínuo" só vale com o rato
    if (this.touch || !this.cb.stayInDrawing()) this.cb.setTool('cross');
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
    this.trackMods(e);
    if (m.kind !== 'idle' && e.buttons) this.updateLoupe(e);
    if (m.kind === 'create') {
      if (e.buttons && Math.hypot(p.x - m.downAt.x, p.y - m.downAt.y) > DRAG_THRESHOLD) m.moved = true;
      const pts = m.drawing.points;
      const pt = this.linePoint(m.drawing.type, pts[pts.length - 2], p.x, p.y, p);
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
      const def0 = toolDef(m.orig.type);
      // extremo de uma linha simples: o outro extremo é a âncora do ângulo
      const anchor = m.handle !== null && m.handle < 2 && !def0?.drag && m.orig.points.length >= 2 && LINE_TOOLS.has(m.orig.type) ? m.orig.points[1 - m.handle] : undefined;
      const pt = anchor ? this.linePoint(m.orig.type, anchor, p.x, p.y, p) : this.toPoint(p.x, p.y, m.handle !== null);
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
    } else if (m.kind === 'pick') {
      this.c.setPickAtX(p.x, true);
      // perto das margens o gráfico desloca-se sozinho, para chegar mais longe
      const w = this.c.paneSize().width;
      this.edgeDir = p.x < 48 ? -1 : p.x > w - 48 ? 1 : 0;
      this.edgeX = p.x;
      if (this.edgeDir !== 0 && !this.edgeTimer) {
        this.edgeTimer = setInterval(() => {
          if (!this.edgeDir) return;
          this.c.scrollBy(this.edgeDir * 0.012);
          this.c.setPickAtX(this.edgeX, true);
        }, 16);
      }
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
    this.loupe.hide();
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
    if (m.kind === 'pick') {
      this.stopEdge();
      this.mode = { kind: 'idle' };
      this.endDrag();
      this.c.setPickAtX(p.x, false); // ao largar, encaixa na barra mais próxima
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
    if (this.cb.replaySelecting() && e.pointerType === 'mouse') {
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
    // evento económico debaixo do rato: mostra o que é
    const ev = this.hitEvent(p.x, p.y);
    const evHint = ev ? { x: Math.min(p.x, this.c.paneSize().width - 260), y: p.y - 18, text: ev.label } : null;
    if (evHint || this.c.hint?.text.startsWith('⚡')) {
      this.c.hint = evHint;
      this.c.redraw();
    }
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
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && this.c.selectedId) {
      const d = this.c.drawings.find((x) => x.id === this.c.selectedId);
      if (d) clipboard = structuredClone(d);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && clipboard) {
      // cola um pouco ao lado (3 barras) para se ver que é outro
      e.preventDefault();
      const shift = this.c.tfSec * 3;
      const copy: Drawing = { ...structuredClone(clipboard), id: uid('d'), createdAt: Date.now(), locked: false, points: clipboard.points.map((p) => ({ ...p, time: p.time + shift })) };
      clipboard = copy;
      this.cb.addDrawing(copy);
      this.cb.select(copy.id);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.c.selectedId) {
      const d = this.c.drawings.find((x) => x.id === this.c.selectedId);
      if (d && !d.locked) {
        e.preventDefault();
        this.cb.removeDrawing(d.id);
      }
    }
  };
}
