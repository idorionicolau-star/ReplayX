'use client';
import { BellRing, X } from 'lucide-react';
import { useAlerts } from '@/store/alerts';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { fmtDateTime } from '@/lib/format';

/** Janelas de alerta (como no TradingView): ficam no ecrã até serem fechadas. */
export function AlertPopups() {
  const popups = useAlerts((s) => s.popups);
  const tz = useSettings((s) => s.timezone);
  if (!popups.length) return null;
  const st = useAlerts.getState();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[65] flex flex-col items-center gap-2 px-3" data-testid="alert-popups">
      {popups.map((p) => (
        <div key={p.id} role="alertdialog" className="pointer-events-auto w-full max-w-[420px] rounded-xl border border-warn/50 bg-elev p-3 shadow-pop animate-pop">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn">
              <BellRing size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{p.title}</div>
              <div className="mt-0.5 text-[13px] break-words text-muted">{p.body}</div>
              <div className="mt-1 text-[11px] text-faint">
                {fmtDateTime(p.time, tz)}
                {p.replay ? ' · replay' : ''}
              </div>
            </div>
            <button type="button" aria-label="Fechar" onClick={() => st.closePopup(p.id)} className="rounded-md p-1 text-muted hover:bg-hover hover:text-text">
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="h-7 rounded-md px-3 text-xs text-muted hover:bg-hover"
              onClick={() => {
                st.closePopup(p.id);
                useUi.getState().set({ alertDraft: { symbolId: useAlerts.getState().alerts.find((a) => a.id === p.alertId)?.symbolId ?? '', editId: p.alertId } });
              }}
            >
              Editar alerta
            </button>
            {popups.length > 1 && (
              <button type="button" className="h-7 rounded-md px-3 text-xs text-muted hover:bg-hover" onClick={() => st.closeAllPopups()}>
                Fechar todos
              </button>
            )}
            <button type="button" className="h-7 rounded-md bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover" onClick={() => st.closePopup(p.id)}>
              OK
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
