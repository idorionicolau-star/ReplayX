'use client';
import { useRef, useState } from 'react';
import { Bell, Copy, Ellipsis, Eye, Lock, LockOpen, Settings2, Trash2, Send, Minus, Type } from 'lucide-react';
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
import { submitOrder } from '@/trading/actions';
import { useTrading, specFor } from '@/store/trading';
import { tradingMode } from '@/trading/actions';
import { qtyForRisk } from '@/core/trading/engine';
import { resolveSymbol } from '@/core/symbols';
import { toast } from '@/components/ui/Toast';

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

  const toOrder = () => {
    if (!d.data) return;
    const sym = resolveSymbol(symbolId);
    const entry = d.points[0].price;
    const acc = useTrading.getState()[tradingMode()];
    const qty = qtyForRisk((acc.balance * d.data.riskPct) / 100, entry, d.data.stop, specFor(sym));
    const side = d.type === 'long' ? 'long' : 'short';
    const ok = submitOrder({ symbolId, side, type: 'limit', qty: +qty.toFixed(sym.contractSize && sym.contractSize >= 1000 ? 2 : 4), price: entry, sl: d.data.stop, tp: d.data.target });
    if (ok) toast('Ordem criada a partir da ferramenta de posição', { kind: 'success' });
  };

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
      {isPosition && (
        <IconButton size="sm" label="Criar ordem com esta posição" onClick={toOrder}>
          <Send size={15} />
        </IconButton>
      )}
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
