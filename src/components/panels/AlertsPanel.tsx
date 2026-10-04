'use client';
import { Bell, BellOff, Plus, Trash2 } from 'lucide-react';
import { useAlerts } from '@/store/alerts';
import { useWorkspace } from '@/store/workspace';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { resolveSymbol } from '@/core/symbols';
import { currentPrice } from '@/trading/actions';
import { Button } from '@/components/ui/Button';
import { fmtDateTime, fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const COND: Record<string, string> = { cross: 'cruza', crossUp: 'cruza para cima', crossDown: 'cruza para baixo' };

export function AlertsPanel() {
  const alerts = useAlerts((s) => s.alerts);
  const log = useAlerts((s) => s.log);
  const tz = useSettings((s) => s.timezone);
  const symbolId = useWorkspace((s) => s.charts[s.active]?.symbolId);
  const st = useAlerts.getState();
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="p-2">
        <Button
          size="sm"
          variant="primary"
          block
          onClick={() => {
            if (!symbolId) return;
            const p = currentPrice(symbolId);
            useUi.getState().set({ alertDraft: { symbolId, price: p ?? 0 } });
          }}
        >
          <Plus size={14} /> Novo alerta
        </Button>
        <div className="mt-1.5 text-[11px] text-muted">Também pode clicar com o botão direito no gráfico → “Adicionar alerta”. Os alertas funcionam em tempo real e durante o replay.</div>
      </div>
      {alerts.map((a) => {
        const s = resolveSymbol(a.symbolId);
        return (
          <div key={a.id} className="group flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
            <button type="button" aria-label="Ativar/desativar" onClick={() => st.update(a.id, { active: !a.active })} className={cn('rounded p-1', a.active ? 'text-warn' : 'text-faint')}>
              {a.active ? <Bell size={15} /> : <BellOff size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {s.name} {COND[a.condition]} {fmtPrice(a.price, s.precision)}
              </div>
              {a.message && <div className="truncate text-muted">{a.message}</div>}
              {a.triggeredAt && <div className="text-[11px] text-muted">Disparou {fmtDateTime(a.triggeredAt, tz)}</div>}
            </div>
            <button type="button" aria-label="Apagar" onClick={() => st.remove(a.id)} className="rounded p-1 text-muted hover:text-down">
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
