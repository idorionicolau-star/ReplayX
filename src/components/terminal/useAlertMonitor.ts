'use client';
import { useEffect } from 'react';
import { crossed, useAlerts } from '@/store/alerts';
import { useReplay } from '@/replay/engine';
import { dataFeed } from '@/core/feed/datafeed';
import { resolveSymbol } from '@/core/symbols';
import { toast } from '@/components/ui/Toast';
import { playSound } from '@/lib/sound';
import { fmtPrice } from '@/lib/format';

function fire(alertId: string, price: number, time: number, replayMode: boolean) {
  const st = useAlerts.getState();
  const a = st.alerts.find((x) => x.id === alertId);
  if (!a) return;
  const sym = resolveSymbol(a.symbolId);
  const msg = a.message || `${sym.name} cruzou ${fmtPrice(a.price, sym.precision)}`;
  st.logTrigger({ alertId, symbolId: a.symbolId, price, time, message: msg, replay: replayMode });
  st.update(alertId, { triggeredAt: time, active: a.once ? false : true });
  toast(`⏰ ${msg}`, { kind: 'warning', duration: 8000 });
  playSound('alert');
  if (!replayMode && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('ReplayX — alerta', { body: msg });
    } catch {
      /* nada */
    }
  }
}

/** Vigia os alertas de preço: em tempo real pelas cotações, no replay a cada passo. */
export function useAlertMonitor() {
  useEffect(() => {
    const last: Record<string, number> = {};
    const subs = new Map<string, () => void>();
    const sync = () => {
      const wanted = new Set(useAlerts.getState().alerts.filter((a) => a.active).map((a) => a.symbolId));
      for (const [id, u] of subs) if (!wanted.has(id)) (u(), subs.delete(id));
      for (const id of wanted) {
        if (subs.has(id)) continue;
        subs.set(
          id,
          dataFeed().subscribeQuote(resolveSymbol(id), (q) => {
            const r = useReplay.getState();
            if (r.active && !r.selecting) return;
            const prev = last[id];
            last[id] = q.price;
            if (prev === undefined) return;
            for (const a of useAlerts.getState().alerts) if (a.symbolId === id && crossed(a, prev, q.price)) fire(a.id, q.price, q.time, false);
          }),
        );
      }
    };
    sync();
    const u1 = useAlerts.subscribe(sync);
    let checked = 0;
    const u2 = useReplay.subscribe((s, p) => {
      if (!s.active || s.selecting || s.cursor === null) return;
      if (p.cursor !== null && s.cursor < p.cursor) {
        checked = s.cursor;
        return;
      }
      if (s.prices === p.prices || s.cursor <= checked) return;
      checked = s.cursor;
      for (const a of useAlerts.getState().alerts) {
        const prev = p.prices[a.symbolId];
        const now = s.prices[a.symbolId];
        if (prev !== undefined && now !== undefined && crossed(a, prev, now)) fire(a.id, now, s.cursor, true);
      }
    });
    return () => {
      u1();
      u2();
      subs.forEach((u) => u());
    };
  }, []);
}
