'use client';
import { Eye, EyeOff, Lock, LockOpen, Trash2, Settings2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { useDrawings } from '@/store/drawings';
import { useUi } from '@/store/ui';
import { toolDef } from '@/chart/drawings/tools';
import { getIndicator, instanceLabel } from '@/core/indicators/registry';
import { useStrategies } from '@/store/strategies';
import { resolveSymbol } from '@/core/symbols';
import { TOOL_ICONS } from '@/components/terminal/DrawingToolbar';
import { cn } from '@/components/ui/cn';

const EMPTY: never[] = [];

export function ObjectTree() {
  const active = useWorkspace((s) => s.active);
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const update = useWorkspace((s) => s.updateIndicator);
  const remove = useWorkspace((s) => s.removeIndicator);
  const drawings = useDrawings((s) => (cfg ? s.bySymbol[cfg.symbolId] : undefined)) ?? EMPTY;
  const selected = useDrawings((s) => s.selected?.id);
  const scripts = useStrategies((s) => s.scripts);
  if (!cfg) return null;
  const st = useDrawings.getState();
  const sym = resolveSymbol(cfg.symbolId);
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Indicadores ({cfg.indicators.length})</div>
      {cfg.indicators.map((i) => {
        const def = getIndicator(i.type);
        const label = def ? instanceLabel(def, i.params) : scripts.find((s) => `script:${s.id}` === i.type)?.name ?? 'Script';
        return (
          <div key={i.uid} className="group flex h-8 items-center gap-2 px-3 text-[13px] hover:bg-hover">
            <span className={cn('flex-1 truncate', i.hidden && 'text-faint')}>{label}</span>
            <button type="button" aria-label="Definições" className="hidden rounded p-1 text-muted group-hover:block hover:text-text" onClick={() => useUi.getState().set({ indicatorSettings: { chart: active, uid: i.uid } })}>
              <Settings2 size={14} />
            </button>
            <button type="button" aria-label="Mostrar/ocultar" className="rounded p-1 text-muted hover:text-text" onClick={() => update(i.uid, { hidden: !i.hidden })}>
              {i.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button type="button" aria-label="Remover" className="rounded p-1 text-muted hover:text-down" onClick={() => remove(i.uid)}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      {!cfg.indicators.length && <div className="px-3 py-2 text-xs text-muted">Nenhum indicador.</div>}
      <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
        Desenhos em {sym.name} ({drawings.length})
      </div>
      {[...drawings].reverse().map((d) => {
        const Icon = TOOL_ICONS[d.type];
        return (
          <div
            key={d.id}
            onClick={() => st.select({ symbolId: cfg.symbolId, id: d.id })}
            className={cn('group flex h-8 cursor-pointer items-center gap-2 px-3 text-[13px]', selected === d.id ? 'bg-accent-soft' : 'hover:bg-hover')}
          >
            {Icon && <Icon size={15} className="shrink-0 text-muted" />}
            <span className={cn('flex-1 truncate', d.hidden && 'text-faint')}>
              {toolDef(d.type)?.label}
              {d.style.text ? ` · ${d.style.text.slice(0, 20)}` : ''}
            </span>
            <button type="button" aria-label="Definições" className="hidden rounded p-1 text-muted group-hover:block hover:text-text" onClick={(e) => (e.stopPropagation(), useUi.getState().set({ drawingSettings: { symbolId: cfg.symbolId, id: d.id } }))}>
              <Settings2 size={14} />
            </button>
            <button type="button" aria-label="Bloquear" className="rounded p-1 text-muted hover:text-text" onClick={(e) => (e.stopPropagation(), st.update(cfg.symbolId, d.id, { locked: !d.locked }))}>
              {d.locked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
            <button type="button" aria-label="Mostrar/ocultar" className="rounded p-1 text-muted hover:text-text" onClick={(e) => (e.stopPropagation(), st.update(cfg.symbolId, d.id, { hidden: !d.hidden }))}>
              {d.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button type="button" aria-label="Remover" className="rounded p-1 text-muted hover:text-down" onClick={(e) => (e.stopPropagation(), st.remove(cfg.symbolId, d.id))}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      {!drawings.length && <div className="px-3 py-2 text-xs text-muted">Ainda sem desenhos neste símbolo. Os desenhos aparecem em todos os timeframes.</div>}
    </div>
  );
}
