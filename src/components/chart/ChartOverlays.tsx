'use client';
import { useEffect, useRef, useState } from 'react';
import type { MouseEventParams, Time } from 'lightweight-charts';
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ChartController } from '@/chart/controller';
import { useUi } from '@/store/ui';
import { useReplay } from '@/replay/engine';
import { cn } from '@/components/ui/cn';

const btn = 'flex h-7 w-7 items-center justify-center rounded-md border border-line bg-elev/95 text-text shadow-sm hover:bg-hover';

/** Botões de navegação no fundo do gráfico (aparecem com o rato por cima), como no TradingView. */
export function ChartNav({ ctrl }: { ctrl: ChartController }) {
  // no replay a barra do replay fica em baixo: os botões sobem
  const replayOn = useReplay((s) => s.active);
  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 gap-1 opacity-0 transition-opacity group-hover/chart:pointer-events-auto group-hover/chart:opacity-100 [@media(pointer:coarse)]:hidden',
        replayOn ? 'bottom-24' : 'bottom-11',
      )}
      data-testid="chart-nav"
    >
      <button type="button" className={btn} title="Afastar" aria-label="Afastar" onClick={() => ctrl.zoom(1.25)}>
        <Minus size={14} />
      </button>
      <button type="button" className={btn} title="Aproximar" aria-label="Aproximar" onClick={() => ctrl.zoom(0.8)}>
        <Plus size={14} />
      </button>
      <button type="button" className={btn} title="Para trás" aria-label="Para trás" onClick={() => ctrl.scrollBy(-0.25)}>
        <ChevronLeft size={15} />
      </button>
      <button type="button" className={btn} title="Para a frente" aria-label="Para a frente" onClick={() => ctrl.scrollBy(0.25)}>
        <ChevronRight size={15} />
      </button>
      <button type="button" className={btn} title="Repor a vista (Alt+R)" aria-label="Repor a vista" onClick={() => ctrl.resetView()}>
        <RotateCcw size={13} />
      </button>
    </div>
  );
}

/** "+" junto à escala de preços, à altura da mira: menu rápido (alerta, ordem, linha) nesse preço. */
export function PriceAxisPlus({ ctrl, chart }: { ctrl: ChartController; chart: number }) {
  const [pos, setPos] = useState<{ y: number; price: number; x: number } | null>(null);
  const hovered = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMove = (p: MouseEventParams<Time>) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      const y = p.point?.y;
      const price = y === undefined ? null : ctrl.yToPrice(y);
      if (y === undefined || price === null || (p.paneIndex !== undefined && p.paneIndex !== 0)) {
        // deixa tempo para o rato chegar ao botão
        hideTimer.current = setTimeout(() => !hovered.current && setPos(null), 350);
        return;
      }
      setPos({ y, price, x: ctrl.paneSize().width });
    };
    ctrl.chart.subscribeCrosshairMove(onMove);
    return () => {
      ctrl.chart.unsubscribeCrosshairMove(onMove);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [ctrl]);

  if (!pos) return null;
  return (
    <button
      type="button"
      aria-label="Ações neste preço"
      title="Alerta, ordem ou linha neste preço"
      className="absolute z-20 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-elev text-text shadow-sm hover:border-accent hover:text-accent [@media(pointer:coarse)]:hidden"
      style={{ left: pos.x - 22, top: pos.y - 9 }}
      onMouseEnter={() => (hovered.current = true)}
      onMouseLeave={() => {
        hovered.current = false;
        hideTimer.current = setTimeout(() => setPos(null), 350);
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        useUi.getState().set({ contextMenu: { chart, x: r.left, y: r.bottom + 2, price: pos.price, time: null, drawingId: null } });
      }}
      data-testid="price-plus"
    >
      <Plus size={12} />
    </button>
  );
}

/**
 * "Ajustar à tela": aparece quando o gráfico ficou numa escala em que os dados não se veem (escala manual ou vista sem dados).
 * Um toque volta à escala certa sem mexer na posição no tempo.
 */
export function FitButton({ ctrl }: { ctrl: ChartController }) {
  const [need, setNeed] = useState(false);
  useEffect(() => {
    const check = () => setNeed(ctrl.needsFit());
    check();
    const t = setInterval(check, 500);
    ctrl.chart.timeScale().subscribeVisibleLogicalRangeChange(check);
    return () => {
      clearInterval(t);
      ctrl.chart.timeScale().unsubscribeVisibleLogicalRangeChange(check);
    };
  }, [ctrl]);
  if (!need) return null;
  return (
    <button
      type="button"
      onClick={() => {
        ctrl.fitView();
        setNeed(false);
      }}
      className="absolute bottom-[34px] left-2 z-20 flex h-9 items-center gap-1.5 rounded-full border border-line bg-elev/95 px-3 text-xs font-semibold text-accent shadow-pop active:bg-hover"
      title="Ajustar os dados à tela (sem mexer na posição)"
      data-testid="fit-view"
    >
      <Maximize2 size={14} /> Ajustar
    </button>
  );
}
