'use client';
import { Bell, BellOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAlerts } from '@/store/alerts';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { resolveSymbol } from '@/core/symbols';
import { describe, TRIGGER_LABEL } from '@/core/alerts';
import { tfShort } from '@/core/timeframes';
import { currentPrice } from '@/trading/actions';
import { Button } from '@/components/ui/Button';
import { fmtDateTime, fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

export function AlertsPanel() {
  const alerts = useAlerts((s) => s.alerts);
  const log = useAlerts((s) => s.log);
  const tz = useSettings((s) => s.timezone);
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const st = useAlerts.getState();
  const sorted = [...alerts].sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="p-2">
        <Button
          size="sm"
          variant="primary"
          block
          data-testid="new-alert"
          onClick={() => {
            if (!symbolId) return;
            useUi.getState().set({ alertDraft: { symbolId, price: currentPrice(symbolId) ?? undefined } });
          }}
        >
          <Plus size={14} /> Novo alerta
        </Button>
        <div className="mt-1.5 text-[11px] text-muted">
          Também pode criar a partir do gráfico (botão direito → “Adicionar alerta”), de um desenho (sino na barra do desenho) ou de um indicador (sino na legenda).
        </div>
      </div>
      {sorted.map((a) => {
        const s = resolveSymbol(a.symbolId);
        const text = describe(a, (v) => fmtPrice(v, s.precision), s.name);
        return (
          <div key={a.id} className="group flex items-start gap-2 border-b border-line px-3 py-2 text-xs" data-testid="alert-row">
            <button
              type="button"
              aria-label={a.active ? 'Parar alerta' : 'Reativar alerta'}
              title={a.active ? 'Parar' : 'Reativar'}
              onClick={() => st.update(a.id, { active: !a.active, stopped: a.active ? 'Parado' : undefined })}
              className={cn('mt-0.5 rounded p-1', a.active ? 'text-warn' : 'text-faint')}
            >
              {a.active ? <Bell size={15} /> : <BellOff size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              {a.name && <div className="truncate font-semibold">{a.name}</div>}
              <div className={cn('font-medium', !a.active && 'text-muted')}>{text}</div>
              <div className="text-[11px] text-muted">
                {TRIGGER_LABEL[a.trigger]} · {tfShort(a.tf)}
                {a.expiresAt ? ` · até ${fmtDateTime(a.expiresAt, tz)}` : ''}
              </div>
              {a.message && <div className="truncate text-muted">“{a.message}”</div>}
              <div className="text-[11px] text-muted">
                {!a.active && a.stopped ? `${a.stopped}. ` : ''}
                {a.triggeredAt ? `Disparou ${a.count ?? 1}× · última ${fmtDateTime(a.triggeredAt, tz)}` : a.active ? 'À espera' : ''}
              </div>
            </div>
            <button type="button" aria-label="Editar" title="Editar" onClick={() => useUi.getState().set({ alertDraft: { symbolId: a.symbolId, editId: a.id } })} className="rounded p-1 text-muted hover:text-text">
              <Pencil size={14} />
            </button>
            <button type="button" aria-label="Apagar" title="Apagar" onClick={() => st.remove(a.id)} className="rounded p-1 text-muted hover:text-down">
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      {!alerts.length && <div className="px-3 py-6 text-center text-xs text-muted">Sem alertas.</div>}
      {log.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 pt-4 pb-1">
            <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Registo</span>
            <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => st.clearLog()}>
              Limpar
            </button>
          </div>
          {log.slice(0, 50).map((l) => (
            <div key={l.id} className="border-b border-line px-3 py-1.5 text-xs">
              <div>{l.message}</div>
              <div className="text-[11px] text-muted">
                {fmtDateTime(l.time, tz)}
                {l.replay ? ' · replay' : ''}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
