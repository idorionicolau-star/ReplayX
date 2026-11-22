'use client';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, X } from 'lucide-react';
import type { ChartController } from '@/chart/controller';
import { computeBacktest, type BtStats } from '@/core/backtest';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const signed = (v: number, d = 2) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
const EMPTY: never[] = [];

/** Curva do R acumulado (SVG simples), com a linha do zero. */
function Curve({ curve }: { curve: number[] }) {
  const W = 260;
  const H = 80;
  const lo = Math.min(0, ...curve);
  const hi = Math.max(0, ...curve);
  const span = hi - lo || 1;
  const x = (i: number) => (curve.length > 1 ? (i / (curve.length - 1)) * W : 0);
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
  const pts = curve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = curve[curve.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label="Curva de R acumulado" data-testid="bt-curve">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity=".25" strokeDasharray="3 3" />
      {curve.length > 1 && <polyline points={pts} fill="none" stroke={up ? '#089981' : '#f23645'} strokeWidth="1.6" strokeLinejoin="round" />}
    </svg>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-md bg-hover/60 px-2 py-1.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={cn('text-[13px] font-semibold tnum', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</div>
    </div>
  );
}

/**
 * Contador do backtest pelas caixas de posição: um selo discreto (taxa de acerto, R total, trades) que abre um cartão
 * com o resumo, a curva de R e os últimos trades. Atualiza-se sozinho quando as caixas ou as velas mudam (também no replay).
 */
export function BacktestChip({ symbolId, ctrl }: { symbolId: string; ctrl: ChartController }) {
  const enabled = useSettings((s) => s.backtestChip);
  const tz = useSettings((s) => s.timezone);
  const drawings = useDrawings((s) => s.bySymbol[symbolId] ?? EMPTY);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  useEffect(() => {
    const id = setInterval(() => {
      const b = ctrl.bars;
      const l = b[b.length - 1];
      const k = `${b.length}:${l?.time}:${l?.close}:${l?.high}:${l?.low}`;
      setKey((p) => (p === k ? p : k));
    }, 500);
    return () => clearInterval(id);
  }, [ctrl]);
  const stats: BtStats = useMemo(() => computeBacktest(drawings, ctrl.bars), [drawings, ctrl, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled || stats.boxes === 0) return null;
  const closed = stats.trades.length;
  const tone = stats.totalR > 0 ? 'text-up' : stats.totalR < 0 ? 'text-down' : 'text-muted';
  return (
    <div className="absolute top-2 right-[76px] z-20" onPointerDown={(e) => e.stopPropagation()} data-testid="backtest">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Resultado das caixas de posição (backtest): toque para ver o resumo e a curva"
        className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-elev/90 px-2.5 text-[11px] font-semibold shadow-sm active:bg-hover"
        data-testid="backtest-chip"
      >
        <BarChart3 size={13} className="text-muted" />
        {closed ? (
          <>
            <span className="tnum">{Math.round((stats.hitRate ?? 0) * 100)}%</span>
            <span className={cn('tnum', tone)}>{signed(stats.totalR, 1)}R</span>
            <span className="text-muted tnum">{closed}</span>
          </>
        ) : (
          <span className="text-muted">{stats.boxes} {stats.boxes === 1 ? 'caixa' : 'caixas'}</span>
        )}
      </button>
      {open && (
        <div className="absolute top-9 right-0 max-h-[70vh] w-[300px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-line bg-elev p-3 shadow-pop" data-testid="backtest-panel">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold">Backtest das caixas de posição</span>
            <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-hover hover:text-text">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Kpi label="Trades" value={`${closed}  (${stats.wins}G / ${stats.losses}P)`} />
            <Kpi label="Acerto" value={stats.hitRate === null ? '—' : `${(stats.hitRate * 100).toFixed(1)}%`} tone={stats.hitRate === null ? undefined : stats.hitRate >= 0.5 ? 'up' : 'down'} />
            <Kpi label="R total" value={closed ? `${signed(stats.totalR)}R` : '—'} tone={stats.totalR > 0 ? 'up' : stats.totalR < 0 ? 'down' : undefined} />
            <Kpi label="R médio" value={stats.avgR === null ? '—' : `${signed(stats.avgR)}R`} tone={stats.avgR === null ? undefined : stats.avgR > 0 ? 'up' : 'down'} />
            <Kpi label="Fator de lucro" value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)} />
            <Kpi label="Drawdown" value={closed ? `${stats.maxDrawdownR.toFixed(2)}R` : '—'} />
            <Kpi label="Perdas seguidas" value={closed ? String(stats.maxLossStreak) : '—'} />
            <Kpi label="À espera" value={String(stats.pending)} />
            <Kpi label="Sem entrada" value={String(stats.missed)} />
          </div>
          {stats.open > 0 && <div className="mt-1.5 text-[11px] text-muted">{stats.open} {stats.open === 1 ? 'caixa aberta' : 'caixas abertas'} (entrou, ainda sem alvo nem stop).</div>}
          <div className="mt-2 text-[11px] text-muted">R acumulado</div>
          <Curve curve={stats.curve} />
          {closed > 0 && (
            <>
              <div className="mt-1 mb-1 text-[11px] text-muted">Últimos trades</div>
              <ul className="space-y-0.5 text-[12px]" data-testid="backtest-trades">
                {stats.trades
                  .slice(-8)
                  .reverse()
                  .map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded px-1.5 py-0.5 hover:bg-hover">
                      <span className="text-muted tnum">{fmtDateTime(t.endTime, tz)}</span>
                      <span>{t.long ? 'Longa' : 'Curta'}</span>
                      <span className={cn('font-semibold tnum', t.win ? 'text-up' : 'text-down')}>{signed(t.r)}R</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[10px] leading-snug text-faint">Conta só as caixas em que o preço tocou na entrada e depois chegou ao alvo (+RR) ou ao stop (−1R); se a mesma vela toca nos dois, conta o stop. Vale para este símbolo e para as velas até à margem direita de cada caixa.</p>
        </div>
      )}
    </div>
  );
}
