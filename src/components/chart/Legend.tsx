'use client';
import { memo, useRef, useState } from 'react';
import { Bell, Eye, EyeOff, Settings2, Trash2, X } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import type { ChartController, ChartStatus, CrosshairInfo, LegendIndicator } from '@/chart/controller';
import type { SymbolInfo } from '@/core/types';
import { PROVIDER_LABEL } from '@/core/symbols';
import { tfShort } from '@/core/timeframes';
import { useWorkspace } from '@/store/workspace';
import { useUi } from '@/store/ui';
import { useReplay } from '@/replay/engine';
import { fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';
import { AssetIcon } from './AssetIcon';

function IndicatorRow({ ind, index }: { ind: LegendIndicator; index: number }) {
  const update = useWorkspace((s) => s.updateIndicator);
  const remove = useWorkspace((s) => s.removeIndicator);
  const nameRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  return (
    <div className="group pointer-events-auto flex h-[22px] w-fit max-w-full items-center gap-1.5 rounded px-1 hover:bg-elev/90">
      {/* tocar no nome abre as ações (no telemóvel não há "passar o rato") */}
      <button ref={nameRef} type="button" aria-label={`Opções de ${ind.label}`} onClick={() => setMenu((o) => !o)} className={cn('truncate text-left', ind.hidden ? 'text-faint' : 'text-text')} data-testid="indicator-name">
        {ind.label}
      </button>
      <Popover anchor={nameRef} open={menu} onClose={() => setMenu(false)} placement="bottom-start">
        <MenuList className="w-[220px]">
          <MenuItem icon={ind.hidden ? <Eye size={15} /> : <EyeOff size={15} />} label={ind.hidden ? 'Mostrar' : 'Ocultar'} onClick={act(() => update(ind.uid, { hidden: !ind.hidden }, index))} />
          <MenuItem icon={<Settings2 size={15} />} label="Definições…" onClick={act(() => useUi.getState().set({ indicatorSettings: { chart: index, uid: ind.uid } }))} />
          <MenuItem
            icon={<Bell size={15} />}
            label="Adicionar alerta…"
            onClick={act(() => {
              const c = useWorkspace.getState().charts[index];
              if (c) useUi.getState().set({ alertDraft: { symbolId: c.symbolId, indicatorUid: ind.uid } });
            })}
          />
          <MenuItem icon={<Trash2 size={15} />} label="Remover indicador" danger onClick={act(() => remove(ind.uid, index))} />
        </MenuList>
      </Popover>
      {ind.error ? (
        <span className="text-down" title={ind.error}>
          erro
        </span>
      ) : (
        !ind.hidden &&
        ind.values.map((v, i) => (
          <span key={i} className="tnum" style={{ color: v.color }}>
            {v.value}
          </span>
        ))
      )}
      <span className="hidden items-center gap-0.5 group-hover:flex">
        <button type="button" aria-label="Mostrar/ocultar" className="rounded p-0.5 text-muted hover:bg-hover hover:text-text" onClick={() => update(ind.uid, { hidden: !ind.hidden }, index)}>
          {ind.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          type="button"
          aria-label="Adicionar alerta"
          title="Adicionar alerta"
          className="rounded p-0.5 text-muted hover:bg-hover hover:text-text"
          onClick={() => {
            const c = useWorkspace.getState().charts[index];
            if (c) useUi.getState().set({ alertDraft: { symbolId: c.symbolId, indicatorUid: ind.uid } });
          }}
        >
          <Bell size={13} />
        </button>
        <button type="button" aria-label="Definições" className="rounded p-0.5 text-muted hover:bg-hover hover:text-text" onClick={() => useUi.getState().set({ indicatorSettings: { chart: index, uid: ind.uid } })}>
          <Settings2 size={13} />
        </button>
        <button type="button" aria-label="Remover" className="rounded p-0.5 text-muted hover:bg-hover hover:text-down" onClick={() => remove(ind.uid, index)}>
          <X size={13} />
        </button>
      </span>
    </div>
  );
}

function LegendImpl({ index, symbol, tf, info, panes, ctrl, status }: { index: number; symbol: SymbolInfo; tf: string; info: CrosshairInfo | null; panes: { top: number; height: number }[]; ctrl: ChartController | null; status: ChartStatus }) {
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  const bar = info?.bar;
  const prec = symbol.precision;
  const change = bar && info?.prevClose ? bar.close - info.prevClose : bar ? bar.close - bar.open : 0;
  const base = info?.prevClose ?? bar?.open ?? 0;
  const pct = base ? (change / base) * 100 : 0;
  const color = change >= 0 ? 'text-up' : 'text-down';
  const inds = info?.indicators ?? [];
  const main = inds.filter((i) => i.pane === 0);
  const tops = panes.map((p) => p.top);
  void ctrl;

  return (
    <>
      <div className="pointer-events-none absolute top-1.5 left-2 z-10 flex max-w-[calc(100%-80px)] flex-col gap-0.5 text-xs select-none">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-1.5 rounded px-1 py-0.5 font-semibold hover:bg-elev/90"
            onClick={() => useUi.getState().openSymbolSearch('', index)}
            title={symbol.description}
          >
            <AssetIcon symbol={symbol} size={16} />
            <span className="text-[13px]">{symbol.name}</span>
            <span className="text-muted">·</span>
            <span>{tfShort(tf)}</span>
            <span className="text-muted">·</span>
            <span className="font-normal text-muted">{PROVIDER_LABEL[symbol.provider]}</span>
          </button>
          {status.state === 'ready' && (
            <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10px] font-semibold', replayOn ? 'bg-accent/15 text-accent' : 'bg-up/15 text-up')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', replayOn ? 'bg-accent' : 'animate-pulse-soft bg-up')} />
              {replayOn ? 'REPLAY' : 'AO VIVO'}
            </span>
          )}
          {bar && (
            <span className="flex flex-wrap items-center gap-x-2 tnum">
              <span>
                <span className="text-muted">A</span> <span className={color}>{fmtPrice(bar.open, prec)}</span>
              </span>
              <span>
                <span className="text-muted">M</span> <span className={color}>{fmtPrice(bar.high, prec)}</span>
              </span>
              <span>
                <span className="text-muted">m</span> <span className={color}>{fmtPrice(bar.low, prec)}</span>
              </span>
              <span>
                <span className="text-muted">F</span> <span className={color}>{fmtPrice(bar.close, prec)}</span>
              </span>
              <span className={color}>
                {change >= 0 ? '+' : ''}
                {fmtPrice(change, prec)} ({pct >= 0 ? '+' : ''}
                {pct.toFixed(2)}%)
              </span>
              {bar.volume !== undefined && symbol.hasVolume && (
                <span>
                  <span className="text-muted">Vol</span> {bar.volume >= 1e6 ? `${(bar.volume / 1e6).toFixed(2)}M` : bar.volume >= 1e3 ? `${(bar.volume / 1e3).toFixed(2)}K` : bar.volume.toFixed(2)}
                </span>
              )}
            </span>
          )}
        </div>
        {main.map((ind) => (
          <IndicatorRow key={ind.uid} ind={ind} index={index} />
        ))}
      </div>
      {panes.slice(1).map((_, k) => {
        const paneIdx = k + 1;
        const rows = inds.filter((i) => i.pane === paneIdx);
        if (!rows.length) return null;
        return (
          <div key={paneIdx} className="pointer-events-none absolute left-2 z-10 flex flex-col text-xs" style={{ top: tops[paneIdx] + 3 }}>
            {rows.map((ind) => (
              <IndicatorRow key={ind.uid} ind={ind} index={index} />
            ))}
          </div>
        );
      })}
    </>
  );
}

export const Legend = memo(LegendImpl);
