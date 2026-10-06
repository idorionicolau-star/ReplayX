'use client';
import { useRef, useState } from 'react';
import { ArrowUpDown, Bell, Copy, Ellipsis, Eye, Lock, LockOpen, Settings2, Trash2, Send, Minus, Type } from 'lucide-react';
import { TemplateMenu } from './TemplateMenu';
import { AngleMenu } from './AngleMenu';
import type { ChartController } from '@/chart/controller';
import { CHANNEL_DRAWINGS, LINE_DRAWINGS } from '@/core/alerts';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { toolDef } from '@/chart/drawings/tools';
import type { Drawing, DrawingStyle } from '@/chart/drawings/types';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Popover } from '@/components/ui/Popover';
import { MenuItem, MenuList } from '@/components/ui/Menu';
import { IconButton } from '@/components/ui/Button';
import { uid } from '@/lib/uid';
import { useSettings } from '@/store/settings';
import { flipPosition, positionSizing, sendPosition } from '@/trading/position';
import { useLotRule } from '@/trading/lotRule';
import { QtyStepper } from '@/components/ui/QtyStepper';
import { PctStepper } from '@/components/ui/PctStepper';
import { cn } from '@/components/ui/cn';

const DASH_ICONS = ['—', '- -', '···'];
const TEXT_TOOLS = new Set(['trendline', 'ray', 'extended', 'hline', 'hray', 'vline', 'rect', 'channel', 'arrowline', 'infoline', 'arrowup', 'arrowdown']);

export function DrawingToolbarFloat({ symbolId, ctrl }: { symbolId: string; ctrl: ChartController }) {
  const sel = useDrawings((s) => (s.selected?.symbolId === symbolId ? s.selected.id : null));
  const d = useDrawings((s) => (sel ? s.bySymbol[symbolId]?.find((x) => x.id === sel) : undefined));
  const widthRef = useRef<HTMLButtonElement>(null);
  const [widthOpen, setWidthOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  if (!d) return null;
  const def = toolDef(d.type);
  const st = useDrawings.getState();
  const setStyle = (patch: Partial<DrawingStyle>) => {
    st.update(symbolId, d.id, { style: { ...d.style, ...patch } });
    st.rememberStyle(d.type, patch);
  };
  const clone = () => {
    const shift = (d.points[1]?.time ?? d.points[0].time) - d.points[0].time || 0;
    const copy: Drawing = { ...structuredClone(d), id: uid('d'), createdAt: Date.now(), points: d.points.map((p) => ({ ...p, time: p.time + Math.abs(shift) * 0.25 })) };
    st.add(symbolId, copy);
    st.select({ symbolId, id: copy.id });
  };
  const isPosition = d.type === 'long' || d.type === 'short';
  const textTool = d.type === 'text' || d.type === 'note';
  const hasFill = d.style.fill !== undefined && d.type !== 'fib' && d.type !== 'fibext' && !isPosition;

  return (
    <div data-testid="drawing-float" className="absolute top-12 left-1/2 z-20 flex max-w-[calc(100%-16px)] overflow-x-auto -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-elev p-1 shadow-pop" onPointerDown={(e) => e.stopPropagation()}>
      <TemplateMenu symbolId={symbolId} d={d} compact />
      {!isPosition && <ColorPicker value={d.style.color} onChange={(c) => setStyle({ color: c })} label="Cor da linha" />}
      {hasFill && <ColorPicker value={d.style.fill || 'rgba(41,98,255,0.15)'} onChange={(c) => setStyle({ fill: c })} withAlpha label="Preenchimento" />}
      {textTool && <ColorPicker value={d.style.textColor ?? d.style.color} onChange={(c) => setStyle({ textColor: c })} label="Cor do texto" />}
      {!isPosition && !textTool && (
        <>
          <button ref={widthRef} type="button" title="Espessura" onClick={() => setWidthOpen((o) => !o)} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs hover:bg-hover">
            <Minus size={14} strokeWidth={d.style.width + 1} /> {d.style.width}px
          </button>
          <Popover anchor={widthRef} open={widthOpen} onClose={() => setWidthOpen(false)} className="p-1">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setStyle({ width: w });
                  setWidthOpen(false);
                }}
                className="flex h-8 w-28 items-center gap-2 rounded px-2 text-xs hover:bg-hover"
              >
                <span className="block w-12 rounded bg-text" style={{ height: w }} /> {w}px
              </button>
            ))}
          </Popover>
          <button type="button" title="Estilo da linha" onClick={() => setStyle({ dash: ((d.style.dash + 1) % 3) as 0 | 1 | 2 })} className="h-7 rounded-md px-2 font-mono text-xs hover:bg-hover">
            {DASH_ICONS[d.style.dash]}
          </button>
        </>
      )}
      {isPosition && d.data && <PositionControls symbolId={symbolId} d={d} />}
      {(LINE_DRAWINGS.has(d.type) || CHANNEL_DRAWINGS.has(d.type)) && (
        <IconButton size="sm" label="Adicionar alerta neste desenho" onClick={() => useUi.getState().set({ alertDraft: { symbolId, drawingId: d.id } })}>
          <Bell size={15} />
        </IconButton>
      )}
      {TEXT_TOOLS.has(d.type) && (
        <IconButton size="sm" label="Texto na linha" active={!!d.style.text} onClick={() => useUi.getState().set({ drawingSettings: { symbolId, id: d.id, tab: 'text' } })}>
          <Type size={15} />
        </IconButton>
      )}
      <AngleMenu symbolId={symbolId} d={d} ctrl={ctrl} />
      <IconButton ref={moreRef} size="sm" label="Mais opções" active={moreOpen} onClick={() => setMoreOpen((o) => !o)} data-testid="drawing-more">
        <Ellipsis size={16} />
      </IconButton>
      <Popover anchor={moreRef} open={moreOpen} onClose={() => setMoreOpen(false)} placement="bottom-end">
        <MenuList className="w-[210px]">
          <MenuItem icon={<Settings2 size={15} />} label="Definições…" onClick={() => (setMoreOpen(false), useUi.getState().set({ drawingSettings: { symbolId, id: d.id } }))} />
          <MenuItem icon={d.locked ? <Lock size={15} /> : <LockOpen size={15} />} label={d.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => (setMoreOpen(false), st.update(symbolId, d.id, { locked: !d.locked }))} />
          <MenuItem icon={<Eye size={15} />} label="Ocultar" onClick={() => (setMoreOpen(false), st.update(symbolId, d.id, { hidden: true }))} />
          <MenuItem icon={<Copy size={15} />} label="Clonar" onClick={() => (setMoreOpen(false), clone())} />
        </MenuList>
      </Popover>
      <IconButton size="sm" label="Remover (Delete)" onClick={() => st.remove(symbolId, d.id)} className="hover:text-down">
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

/** Posição longa/curta: inverter direção, calcular o lote (manual ou pelo risco e pelo stop) e enviar a ordem. */
function PositionControls({ symbolId, d }: { symbolId: string; d: Drawing }) {
  const rule = useLotRule(symbolId);
  const setTrading = useSettings((s) => s.setTrading);
  const defaultQty = useSettings((s) => s.trading.defaultQty);
  const defaultSizing = useSettings((s) => s.trading.sizing);
  const data = d.data!;
  const sizing = data.sizing ?? defaultSizing;
  const sz = positionSizing(symbolId, d);
  const long = d.type === 'long';
  const patch = (p: Partial<typeof data>) => useDrawings.getState().update(symbolId, d.id, { data: { ...data, ...p } });
  const seg = 'h-7 px-2 text-[11px] font-semibold';
  return (
    <>
      <IconButton size="sm" label={long ? 'Compra: tocar para inverter para venda' : 'Venda: tocar para inverter para compra'} onClick={() => flipPosition(symbolId, d)} data-testid="position-flip" className={long ? 'text-up' : 'text-down'}>
        <ArrowUpDown size={15} />
      </IconButton>
      <div className="flex overflow-hidden rounded-md border border-line" title="Como calcular o lote">
        <button type="button" onClick={() => (patch({ sizing: 'qty', qty: sz?.qty ?? defaultQty }), setTrading({ sizing: 'qty' }))} className={cn(seg, sizing === 'qty' ? 'bg-accent text-white' : 'hover:bg-hover')} data-testid="position-mode-lot">
          Lote
        </button>
        <button type="button" onClick={() => (patch({ sizing: 'risk' }), setTrading({ sizing: 'risk' }))} className={cn(seg, sizing === 'risk' ? 'bg-accent text-white' : 'hover:bg-hover')} data-testid="position-mode-risk">
          Risco
        </button>
      </div>
      {sizing === 'qty' ? (
        <QtyStepper value={sz?.qty ?? defaultQty} rule={rule} onChange={(v) => (patch({ qty: v }), setTrading({ defaultQty: v }))} className="scale-90" />
      ) : (
        <PctStepper value={data.riskPct} onChange={(v) => (patch({ riskPct: v }), setTrading({ defaultRiskPct: v }))} />
      )}
      {sz && (
        <span className="px-1 text-[11px] whitespace-nowrap text-muted tnum" data-testid="position-info" title={`Mínimo ${rule.min} · passo ${rule.step} · máximo ${rule.max}`}>
          Lote <b className="text-text">{sz.qtyText}</b> · risco <b className={sz.minExceeds ? 'text-warn' : 'text-text'}>{sz.risk.toFixed(2)}</b> ({sz.riskPct.toFixed(2)}%)
        </span>
      )}
      <button
        type="button"
        onClick={() => sendPosition(symbolId, d)}
        className={cn('flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold whitespace-nowrap text-white hover:brightness-110', long ? 'bg-up' : 'bg-down')}
        title={sz ? `${sz.label}: envia a ordem com este stop e alvo` : 'Enviar ordem'}
        data-testid="position-send"
      >
        <Send size={13} /> {sz && sz.kind !== 'market' ? `Enviar ${sz.kind === 'limit' ? 'limite' : 'stop'}` : 'Enviar'}
      </button>
    </>
  );
}
