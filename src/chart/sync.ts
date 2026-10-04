import { setCrosshairHook, type ChartController } from './controller';
import { useWorkspace } from '@/store/workspace';
import { allCharts } from './registry';

let installed = false;
let syncing = false;

/** Sincroniza a mira entre gráficos do mesmo layout. */
export function setCrosshairHookOnce() {
  if (installed) return;
  installed = true;
  setCrosshairHook((c: ChartController, p) => {
    if (syncing) return;
    const ws = useWorkspace.getState();
    if (!ws.sync.crosshair || ws.charts.length < 2) return;
    const time = p.time === undefined ? null : (p.time as number);
    const price = p.point ? c.yToPrice(p.point.y) : null;
    syncing = true;
    try {
      for (const [, other] of allCharts()) {
        if (other === c) continue;
        other.setCrosshair(time, other.symbol?.id === c.symbol?.id ? price : null);
      }
    } finally {
      syncing = false;
    }
  });
}

