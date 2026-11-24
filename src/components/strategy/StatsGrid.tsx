'use client';
import type { Stats } from '@/core/trading/stats';
import { fmtDuration, fmtMoney, fmtNum } from '@/lib/format';
import { cn } from '@/components/ui/cn';
import { tr } from '@/i18n';

export function KeyStats({ s }: { s: Stats }) {
  const items: { label: string; value: string; tone?: 'up' | 'down' | null }[] = [
    { label: tr('Lucro líquido'), value: `${fmtMoney(s.netProfit)} (${s.netProfitPct >= 0 ? '+' : ''}${s.netProfitPct.toFixed(2)}%)`, tone: s.netProfit >= 0 ? 'up' : 'down' },
    { label: tr('Operações'), value: String(s.trades) },
    { label: tr('Taxa de acerto'), value: `${s.winRate.toFixed(1)}%` },
    { label: tr('Fator de lucro'), value: fmtNum(s.profitFactor, 2), tone: s.profitFactor >= 1 ? 'up' : 'down' },
    { label: tr('Drawdown máx.'), value: `${fmtMoney(-s.maxDrawdown)} (${s.maxDrawdownPct.toFixed(2)}%)`, tone: 'down' },
    { label: tr('Média por operação'), value: fmtMoney(s.avgTrade), tone: s.avgTrade >= 0 ? 'up' : 'down' },
    { label: tr('R médio'), value: s.avgR === null ? '—' : `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R` },
    { label: 'Sharpe', value: fmtNum(s.sharpe, 2) },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
      {items.map((i) => (
        <div key={i.label} className="bg-panel px-3 py-2">
          <div className="text-[11px] text-muted">{i.label}</div>
          <div className={cn('mt-0.5 text-[13px] font-semibold tnum', i.tone === 'up' && 'text-up', i.tone === 'down' && 'text-down')}>{i.value}</div>
        </div>
      ))}
    </div>
  );
}

export function FullStats({ s }: { s: Stats }) {
  const rows: [string, string][] = [
    [tr('Lucro líquido'), `${fmtMoney(s.netProfit)} (${s.netProfitPct.toFixed(2)}%)`],
    [tr('Lucro bruto'), fmtMoney(s.grossProfit)],
    [tr('Prejuízo bruto'), fmtMoney(-s.grossLoss)],
    [tr('Comissões'), fmtMoney(-s.commission)],
    [tr('Saldo final'), fmtMoney(s.finalBalance)],
    [tr('Operações'), tr('{0} ({1} ganhas / {2} perdidas)', s.trades, s.wins, s.losses)],
    [tr('Taxa de acerto'), `${s.winRate.toFixed(2)}%`],
    [tr('Fator de lucro'), fmtNum(s.profitFactor, 2)],
    [tr('Ganho médio'), fmtMoney(s.avgWin)],
    [tr('Perda média'), fmtMoney(-s.avgLoss)],
    [tr('Rácio ganho/perda'), fmtNum(s.payoff, 2)],
    [tr('Maior ganho'), fmtMoney(s.largestWin)],
    [tr('Maior perda'), fmtMoney(s.largestLoss)],
    [tr('Expectativa por operação'), fmtMoney(s.expectancy)],
    [tr('R total / médio'), s.totalR === null ? '—' : `${s.totalR.toFixed(2)}R / ${(s.avgR ?? 0).toFixed(2)}R`],
    [tr('Drawdown máximo'), `${fmtMoney(-s.maxDrawdown)} (${s.maxDrawdownPct.toFixed(2)}%)`],
    [tr('Fator de recuperação'), fmtNum(s.recoveryFactor, 2)],
    ['Sharpe / Sortino', `${fmtNum(s.sharpe, 2)} / ${fmtNum(s.sortino, 2)}`],
    [tr('Máx. ganhos seguidos'), String(s.maxConsecWins)],
    [tr('Máx. perdas seguidas'), String(s.maxConsecLosses)],
    [tr('Duração média'), fmtDuration(s.avgDurationSec)],
    [tr('Compras'), tr('{0} ({1}% acerto)', s.longTrades, s.longWinRate.toFixed(1))],
    [tr('Vendas'), tr('{0} ({1}% acerto)', s.shortTrades, s.shortWinRate.toFixed(1))],
  ];
  return (
    <div className="grid gap-x-8 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-line py-1.5 text-xs">
          <span className="text-muted">{k}</span>
          <span className="font-medium tnum">{v}</span>
        </div>
      ))}
    </div>
  );
}
