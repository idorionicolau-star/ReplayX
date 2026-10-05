'use client';
import { useMemo } from 'react';
import { Minus, Bell, Copy, Eye, Lock, LockOpen, RefreshCcw, Rewind, Settings2, Trash2, ArrowUpToLine, ArrowDownToLine, CopyPlus, Layers, ListPlus } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { resolveSymbol } from '@/core/symbols';
import { getChart } from '@/chart/registry';
import { replay, useReplay } from '@/replay/engine';
import { barEnd } from '@/core/feed/datafeed';
import { currentPrice, submitOrder } from '@/trading/actions';
import { openOrderTicket } from '@/trading/ticket';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList, MenuSeparator } from '@/components/ui/Menu';
import { fmtPrice } from '@/lib/format';
import { uid } from '@/lib/uid';
import { CHANNEL_DRAWINGS, LINE_DRAWINGS } from '@/core/alerts';
import { toolDef } from '@/chart/drawings/tools';

/** Linha horizontal num preço (menu do gráfico e "+" da escala). */
function addHLine(symbolId: string, chartId: string, price: number) {
  const def = toolDef('hline');
  if (!def) return;
  const st = useDrawings.getState();
  const t = getChart(chartId)?.bars.at(-1)?.time ?? Math.floor(Date.now() / 1000);
  st.add(symbolId, { id: uid('d'), type: 'hline', points: [{ time: t, price }], style: { ...def.style, ...(st.lastStyle.hline ?? {}) }, createdAt: Date.now() });
}

export function ChartContextMenu() {
  const menu = useUi((s) => s.contextMenu);
  const cfg = useWorkspace((s) => (menu ? s.charts[menu.chart] : undefined));
  const qty = useSettings((s) => s.trading.defaultQty);
  const replayActive = useReplay((s) => s.active && !s.selecting);
  const anchor = useMemo(() => (menu ? { x: menu.x, y: menu.y } : null), [menu]);
  if (!menu || !cfg) return null;
  const close = () => useUi.getState().set({ contextMenu: null });
  const sym = resolveSymbol(cfg.symbolId);
  const st = useDrawings.getState();
  const d = menu.drawingId ? st.bySymbol[cfg.symbolId]?.find((x) => x.id === menu.drawingId) : undefined;
  const price = menu.price;
  const last = currentPrice(cfg.symbolId);
  const act = (fn: () => void) => () => {
    fn();
    close();
  };
  const cloneDrawing = () => {
    if (!d) return;
    st.add(cfg.symbolId, { ...structuredClone(d), id: uid('d'), createdAt: d.createdAt + 1 });
    close();
  };

  return (
    <Popover anchor={anchor} open onClose={close}>
      <MenuList className="w-[260px]">
        {d ? (
          <>
            <MenuItem icon={<Settings2 size={15} />} label="Definições…" onClick={act(() => useUi.getState().set({ drawingSettings: { symbolId: cfg.symbolId, id: d.id } }))} />
            {(LINE_DRAWINGS.has(d.type) || CHANNEL_DRAWINGS.has(d.type)) && (
              <MenuItem icon={<Bell size={15} />} label="Adicionar alerta neste desenho" onClick={act(() => useUi.getState().set({ alertDraft: { symbolId: cfg.symbolId, drawingId: d.id } }))} />
            )}
            <MenuItem icon={<CopyPlus size={15} />} label="Clonar" onClick={cloneDrawing} />
            <MenuItem icon={d.locked ? <LockOpen size={15} /> : <Lock size={15} />} label={d.locked ? 'Desbloquear' : 'Bloquear'} onClick={act(() => st.update(cfg.symbolId, d.id, { locked: !d.locked }))} />
            <MenuItem icon={<Eye size={15} />} label="Ocultar" onClick={act(() => st.update(cfg.symbolId, d.id, { hidden: true }))} />
            <MenuItem icon={<Layers size={15} />} label="Trazer para a frente" onClick={act(() => st.bringToFront(cfg.symbolId, d.id))} />
            <MenuSeparator />
            <MenuItem icon={<Trash2 size={15} />} label="Remover" danger hint="Del" onClick={act(() => st.remove(cfg.symbolId, d.id))} />
          </>
        ) : (
          <>
            {price !== null && last !== undefined && (
              <>
                <MenuItem icon={<ListPlus size={15} />} label="Ordem com SL e TP aqui…" onClick={act(() => openOrderTicket(cfg.symbolId, { price }))} />
                <MenuItem
                  icon={<ArrowUpToLine size={15} className="text-up" />}
                  label={`Comprar ${price < last ? 'limite' : 'stop'} ${qty} @ ${fmtPrice(price, sym.precision)}`}
                  onClick={act(() => submitOrder({ symbolId: cfg.symbolId, side: 'long', type: price < last ? 'limit' : 'stop', qty, price }))}
                />
                <MenuItem
                  icon={<ArrowDownToLine size={15} className="text-down" />}
                  label={`Vender ${price > last ? 'limite' : 'stop'} ${qty} @ ${fmtPrice(price, sym.precision)}`}
                  onClick={act(() => submitOrder({ symbolId: cfg.symbolId, side: 'short', type: price > last ? 'limit' : 'stop', qty, price }))}
                />
                <MenuSeparator />
              </>
            )}
            {price !== null && (
              <MenuItem
                icon={<Minus size={15} />}
                label={`Linha horizontal em ${fmtPrice(price, sym.precision)}`}
                onClick={act(() => addHLine(cfg.symbolId, cfg.id, price))}
              />
            )}
            {price !== null && (
              <MenuItem icon={<Bell size={15} />} label={`Adicionar alerta em ${fmtPrice(price, sym.precision)}`} onClick={act(() => useUi.getState().set({ alertDraft: { symbolId: cfg.symbolId, price } }))} />
            )}
            {menu.time !== null && (
              <MenuItem
                icon={<Rewind size={15} />}
                label={replayActive ? 'Recomeçar replay nesta barra' : 'Começar replay nesta barra'}
                onClick={act(() => {
                  const c = getChart(cfg.id);
                  const t = c?.barTimeAt(menu.time!) ?? menu.time!;
                  void replay.start(barEnd(t, cfg.tf));
                })}
              />
            )}
            {price !== null && (
              <MenuItem icon={<Copy size={15} />} label={`Copiar preço ${fmtPrice(price, sym.precision)}`} onClick={act(() => void navigator.clipboard?.writeText(fmtPrice(price, sym.precision)))} />
            )}
            <MenuSeparator />
            <MenuItem icon={<RefreshCcw size={15} />} label="Repor vista do gráfico" hint="Alt+R" onClick={act(() => getChart(cfg.id)?.resetView())} />
            <MenuItem
              icon={<Trash2 size={15} />}
              label="Remover desenhos deste símbolo"
              danger
              onClick={act(() => {
                if (confirm('Remover todos os desenhos? (Ctrl+Z desfaz)')) st.clear(cfg.symbolId);
              })}
            />
            <MenuItem icon={<Settings2 size={15} />} label="Definições do gráfico…" onClick={act(() => useUi.getState().set({ settings: true }))} />
          </>
        )}
      </MenuList>
    </Popover>
  );
}
