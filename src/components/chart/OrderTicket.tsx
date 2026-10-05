'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, Send, X } from 'lucide-react';
import type { ChartController } from '@/chart/controller';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { useTrading, specFor } from '@/store/trading';
import { useReplay } from '@/replay/engine';
import { resolveSymbol, pipSize } from '@/core/symbols';
import { pnlFor, type Side } from '@/core/trading/engine';
import { clampLevels, fmtLot, mirror, orderKind } from '@/core/trading/ticket';
import { currentPrice, submitOrder } from '@/trading/actions';
import { closeOrderTicket } from '@/trading/ticket';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { fmtMoney, fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

type Field = 'entry' | 'sl' | 'tp';
type Geo = { w: number; h: number; ye: number | null; ys: number | null; yt: number | null; cur: number | undefined };

const KIND_LABEL = { market: 'MERCADO', limit: 'LIMITE', stop: 'STOP' } as const;

function hint(side: Side, kind: keyof typeof KIND_LABEL): string {
  if (kind === 'market') return 'A mercado: executa já ao preço atual. Arraste a linha da entrada para escolher outro preço.';
  const up = side === 'long' ? kind === 'stop' : kind === 'limit';
  const name = `${side === 'long' ? 'Compra' : 'Venda'} ${kind === 'limit' ? 'limite' : 'stop'}`;
  return `${name}: fica à espera e só executa quando o preço ${up ? 'SUBIR' : 'DESCER'} até à entrada${kind === 'stop' ? ' (rompimento)' : ' (preço melhor)'}.`;
}

/**
 * Ordem no gráfico: a linha da entrada arrasta-se (e leva o SL e o TP atrás), o SL fica à esquerda e o TP à direita,
 * cada um com a sua pega arrastável e o ganho/perda em dinheiro. Em baixo: lote, compra/venda e enviar.
 */
export function OrderTicket({ ctrl, symbolId }: { ctrl: ChartController; symbolId: string }) {
  const ticket = useUi((s) => s.orderTicket);
  if (!ticket || ticket.symbolId !== symbolId) return null;
  return <TicketInner ctrl={ctrl} symbolId={symbolId} />;
}

function TicketInner({ ctrl, symbolId }: { ctrl: ChartController; symbolId: string }) {
  const t = useUi((s) => s.orderTicket)!;
  const qty = useSettings((s) => s.trading.defaultQty);
  const confirmOrders = useSettings((s) => s.trading.confirmOrders);
  const setTrading = useSettings((s) => s.setTrading);
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  useTrading((s) => s.replay.balance);
  const sym = useMemo(() => resolveSymbol(symbolId), [symbolId]);
  const spec = specFor(sym);
  const pip = pipSize(sym);
  const [geo, setGeo] = useState<Geo>({ w: 0, h: 0, ye: null, ys: null, yt: null, cur: undefined });
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });

  // posições dos elementos: o preço→y muda quando o gráfico se desloca ou muda de escala, por isso lê-se a cada quadro
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const size = ctrl.paneSize();
      const k = tRef.current;
      const next: Geo = { w: size.width, h: size.height, ye: ctrl.priceToY(k.price), ys: ctrl.priceToY(k.sl), yt: ctrl.priceToY(k.tp), cur: currentPrice(symbolId) };
      setGeo((g) => (g.w === next.w && g.h === next.h && g.ye === next.ye && g.ys === next.ys && g.yt === next.yt && g.cur === next.cur ? g : next));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ctrl, symbolId]);

  const round = (p: number) => +p.toFixed(sym.precision);
  const patch = (p: Partial<typeof t>) => useUi.setState((s) => (s.orderTicket ? { orderTicket: { ...s.orderTicket, ...p } } : {}));

  const startDrag = (field: Field, yNow: number | null, e: React.PointerEvent) => {
    if (yNow === null) return;
    e.preventDefault();
    e.stopPropagation();
    const pane = (ctrl.paneElement() ?? ctrl.container).getBoundingClientRect();
    const grab = e.clientY - pane.top - yNow; // a pega não salta para debaixo do dedo
    const base = tRef.current;
    const move = (ev: PointerEvent) => {
      const raw = ctrl.yToPrice(ev.clientY - pane.top - grab);
      if (raw === null) return;
      const p = round(raw);
      const cur = tRef.current;
      if (field === 'entry') {
        const d = p - base.price;
        patch({ price: p, sl: round(base.sl + d), tp: round(base.tp + d) });
      } else {
        const next = clampLevels(cur.side, cur.price, field === 'sl' ? p : cur.sl, field === 'tp' ? p : cur.tp, pip);
        patch({ sl: round(next.sl), tp: round(next.tp) });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const flip = (side: Side) => {
    if (side === t.side) return;
    patch({ side, sl: round(mirror(t.price, t.sl)), tp: round(mirror(t.price, t.tp)) });
  };

  const cur = geo.cur;
  const kind = cur === undefined ? 'market' : orderKind(t.side, t.price, cur, pip * 0.5);
  const risk = Math.abs(pnlFor(t.side, qty, t.price, t.sl, spec));
  const reward = Math.abs(pnlFor(t.side, qty, t.price, t.tp, spec));
  const rr = risk > 0 ? reward / risk : 0;
  const long = t.side === 'long';

  const send = () => {
    if (confirmOrders && !confirm(`${long ? 'Comprar' : 'Vender'} ${fmtLot(qty)} ${sym.name} (${KIND_LABEL[kind].toLowerCase()})?`)) return;
    const ok = submitOrder({ symbolId, side: t.side, type: kind, qty, price: kind === 'market' ? undefined : t.price, sl: t.sl, tp: t.tp });
    if (ok) closeOrderTicket();
  };

  const tab = 'pointer-events-auto absolute flex h-[30px] touch-none cursor-ns-resize items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-white shadow-pop no-select';
  const entryColor = long ? 'bg-accent' : 'bg-down';
  const line = (y: number | null, cls: string) => (y === null ? null : <div className={cn('absolute right-0 left-0 h-0', cls)} style={{ top: y }} />);
  const zone = (a: number | null, b: number | null, cls: string) => (a === null || b === null ? null : <div className={cn('absolute right-0 left-0', cls)} style={{ top: Math.min(a, b), height: Math.abs(a - b) }} />);

  return (
    <div className="pointer-events-none absolute top-0 left-0 z-[26]" style={{ width: geo.w, height: geo.h }} data-testid="order-ticket">
      {zone(geo.ye, geo.ys, 'bg-down/10')}
      {zone(geo.ye, geo.yt, 'bg-up/10')}
      {line(geo.ys, 'border-t border-dashed border-down')}
      {line(geo.yt, 'border-t border-dashed border-up')}
      {line(geo.ye, cn('border-t-2', long ? 'border-accent' : 'border-down'))}

      {/* SL à esquerda */}
      {geo.ys !== null && (
        <div className={cn(tab, 'bg-down')} style={{ left: 6, top: geo.ys - 15 }} onPointerDown={(e) => startDrag('sl', geo.ys, e)} data-testid="ticket-sl" title="Arraste para mover o stop loss">
          <GripVertical size={13} className="opacity-70" />
          <span>SL {fmtPrice(t.sl, sym.precision)}</span>
          <span className="rounded bg-black/20 px-1 tnum">−{fmtMoney(risk)}</span>
        </div>
      )}
      {/* TP à direita */}
      {geo.yt !== null && (
        <div className={cn(tab, 'bg-up')} style={{ right: 6, top: geo.yt - 15 }} onPointerDown={(e) => startDrag('tp', geo.yt, e)} data-testid="ticket-tp" title="Arraste para mover o take profit">
          <span className="rounded bg-black/20 px-1 tnum">+{fmtMoney(reward)}</span>
          <span>TP {fmtPrice(t.tp, sym.precision)}</span>
          <GripVertical size={13} className="opacity-70" />
        </div>
      )}
      {/* entrada */}
      {geo.ye !== null && (
        <div className={cn(tab, entryColor)} style={{ left: '50%', top: geo.ye - 15, transform: 'translateX(-50%)' }} onPointerDown={(e) => startDrag('entry', geo.ye, e)} data-testid="ticket-entry" title="Arraste para mover a entrada (leva o SL e o TP)">
          <GripVertical size={13} className="opacity-70" />
          <span>
            {long ? 'COMPRA' : 'VENDA'} {KIND_LABEL[kind]}
          </span>
          <span className="tnum">{fmtPrice(t.price, sym.precision)}</span>
        </div>
      )}

      {/* controlos */}
      <div className={cn('pointer-events-auto absolute left-1/2 flex w-[min(440px,calc(100%-12px))] -translate-x-1/2 flex-col gap-1.5 rounded-xl border border-line bg-elev/97 p-2 shadow-pop no-select', replayOn ? 'bottom-[92px]' : 'bottom-[52px]')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-[12px] font-semibold">
            <button type="button" onClick={() => flip('long')} className={cn('h-8 px-3', long ? 'bg-up text-white' : 'hover:bg-hover')} data-testid="ticket-buy">
              Compra
            </button>
            <button type="button" onClick={() => flip('short')} className={cn('h-8 px-3', !long ? 'bg-down text-white' : 'hover:bg-hover')} data-testid="ticket-sell">
              Venda
            </button>
          </div>
          <QtyStepper value={qty} onChange={(v) => setTrading({ defaultQty: v })} />
          <div className="flex items-center gap-1">
            <button type="button" onClick={send} className={cn('flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold text-white hover:brightness-110', long ? 'bg-up' : 'bg-down')} data-testid="ticket-send">
              <Send size={13} /> Enviar
            </button>
            <button type="button" aria-label="Cancelar ordem" onClick={closeOrderTicket} className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-text" data-testid="ticket-close">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] leading-snug text-muted">
          <span>{hint(t.side, kind)}</span>
          <span className="shrink-0 font-semibold tnum text-text">R:R 1:{rr.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
