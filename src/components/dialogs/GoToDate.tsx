'use client';
import { useWorkspace } from '@/store/workspace';
import { getChart } from '@/chart/registry';
import { useState } from 'react';
import { useUi } from '@/store/ui';
import { useSettings } from '@/store/settings';
import { useTrading } from '@/store/trading';
import { replay, useReplay } from '@/replay/engine';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { fromInputDateTime, toInputDateTime } from '@/lib/format';
import { nowSec } from '@/core/feed/provider';

const QUICK: { label: string; sec: number }[] = [
  { label: '1 dia atrás', sec: 86400 },
  { label: '1 semana', sec: 7 * 86400 },
  { label: '1 mês', sec: 30 * 86400 },
  { label: '3 meses', sec: 91 * 86400 },
  { label: '6 meses', sec: 182 * 86400 },
  { label: '1 ano', sec: 365 * 86400 },
  { label: '2 anos', sec: 730 * 86400 },
  { label: '5 anos', sec: 5 * 365 * 86400 },
];

export function GoToDate() {
  const open = useUi((s) => s.gotoDate);
  if (!open) return null;
  return <GoToDateForm />;
}

function GoToDateForm() {
  const tz = useSettings((s) => s.timezone);
  const st = useReplay();
  const [value, setValue] = useState(() => toInputDateTime(useReplay.getState().cursor ?? nowSec() - 30 * 86400, tz));
  const close = () => useUi.getState().set({ gotoDate: false });

  const go = async (t: number) => {
    if (!Number.isFinite(t)) return;
    const target = Math.min(t, nowSec() - 60);
    const acc = useTrading.getState().replay;
    if (st.active && st.cursor !== null && !st.selecting && target < st.cursor && (acc.trades.length || acc.positions.length)) {
      if (!confirm('Voltar atrás recomeça a sessão de replay (as operações atuais são guardadas no Diário). Continuar?')) return;
      replay.saveCurrent();
    }
    close();
    if (st.active && st.cursor !== null && !st.selecting) await replay.jumpTo(target);
    else await replay.start(target);
  };
  return (
    <Dialog
      open
      onClose={close}
      title="Ir para data"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          {!(st.active && st.cursor !== null && !st.selecting) && (
            <Button
              variant="outline"
              data-testid="goto-show"
              onClick={() => {
                const t = fromInputDateTime(value, tz);
                if (!Number.isFinite(t)) return;
                close();
                const ws = useWorkspace.getState();
                const id = ws.charts[ws.active]?.id;
                if (id) void getChart(id)?.goToTime(Math.min(t, nowSec()));
              }}
            >
              Mostrar no gráfico
            </Button>
          )}
          <Button variant="primary" onClick={() => void go(fromInputDateTime(value, tz))} data-testid="goto-confirm">
            {st.active && st.cursor !== null && !st.selecting ? 'Saltar' : 'Começar replay'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-10" data-testid="goto-input" />
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK.map((q) => (
            <Button key={q.label} size="sm" variant="subtle" onClick={() => setValue(toInputDateTime(nowSec() - q.sec, tz))}>
              {q.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted">Para a frente, as ordens abertas são executadas pelo caminho. Para trás, a sessão recomeça.</p>
      </div>
    </Dialog>
  );
}
