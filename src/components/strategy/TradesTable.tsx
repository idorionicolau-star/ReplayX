'use client';
import type { Trade } from '@/core/trading/engine';
import { resolveSymbol } from '@/core/symbols';
import { useSettings } from '@/store/settings';
import { fmtDateTime, fmtDuration, fmtMoney, fmtPrice } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const REASON: Record<string, string> = { sl: 'Stop', tp: 'Alvo', manual: 'Manual', signal: 'Sinal', reverse: 'Inversão', trail: 'Trailing', time: 'Tempo', end: 'Fim do teste' };

export function TradesTable({ trades, onPick, editable, onNote, max = 500 }: { trades: Trade[]; onPick?: (t: Trade) => void; editable?: boolean; onNote?: (id: string, notes: string) => void; max?: number }) {
  const tz = useSettings((s) => s.timezone);
  const rows = [...trades].sort((a, b) => b.exitTime - a.exitTime).slice(0, max);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="sticky top-0 bg-panel text-[11px] text-muted">
          <tr className="border-b border-line text-left">
            <th className="px-2 py-1.5 font-medium">#</th>
            <th className="px-2 py-1.5 font-medium">Tipo</th>
            <th className="px-2 py-1.5 font-medium">Símbolo</th>
            <th className="px-2 py-1.5 font-medium">Entrada</th>
            <th className="px-2 py-1.5 font-medium">Saída</th>
            <th className="px-2 py-1.5 text-right font-medium">Qtd</th>
            <th className="px-2 py-1.5 text-right font-medium">Lucro</th>
            <th className="px-2 py-1.5 text-right font-medium">R</th>
            <th className="px-2 py-1.5 font-medium">Duração</th>
            <th className="px-2 py-1.5 font-medium">Motivo</th>
            {editable && <th className="px-2 py-1.5 font-medium">Notas</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const s = resolveSymbol(t.symbolId);
            return (
              <tr key={t.id} onClick={() => onPick?.(t)} className={cn('border-b border-line', onPick && 'cursor-pointer hover:bg-hover')}>
                <td className="px-2 py-1.5 text-muted tnum">{trades.length - i}</td>
                <td className={cn('px-2 py-1.5 font-semibold', t.side === 'long' ? 'text-up' : 'text-down')}>{t.side === 'long' ? 'Compra' : 'Venda'}</td>
                <td className="px-2 py-1.5">{s.name}</td>
                <td className="px-2 py-1.5 tnum">
                  <div>{fmtPrice(t.entryPrice, s.precision)}</div>
                  <div className="text-[10px] text-muted">{fmtDateTime(t.entryTime, tz)}</div>
                </td>
                <td className="px-2 py-1.5 tnum">
                  <div>{fmtPrice(t.exitPrice, s.precision)}</div>
                  <div className="text-[10px] text-muted">{fmtDateTime(t.exitTime, tz)}</div>
                </td>
                <td className="px-2 py-1.5 text-right tnum">{+t.qty.toFixed(4)}</td>
                <td className={cn('px-2 py-1.5 text-right font-semibold tnum', t.pnl >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(t.pnl)}</td>
                <td className="px-2 py-1.5 text-right tnum">{t.r === undefined ? '—' : `${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}`}</td>
                <td className="px-2 py-1.5 text-muted">{fmtDuration(t.exitTime - t.entryTime)}</td>
                <td className="px-2 py-1.5 text-muted">{REASON[t.exitReason] ?? t.exitReason}</td>
                {editable && (
                  <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      defaultValue={t.notes ?? ''}
                      placeholder="Porque entrei? O que aprendi?"
                      onBlur={(e) => onNote?.(t.id, e.target.value)}
                      className="h-7 w-56 rounded border border-transparent bg-transparent px-1.5 text-xs outline-none hover:border-line focus:border-accent"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!trades.length && <div className="py-8 text-center text-xs text-muted">Sem operações.</div>}
    </div>
  );
}
