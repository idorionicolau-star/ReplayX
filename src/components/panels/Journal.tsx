'use client';
import { useMemo, useState } from 'react';
import { Download, Play, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { useTrading } from '@/store/trading';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { replay, useReplay } from '@/replay/engine';
import { computeStats, equityCurve, breakdown } from '@/core/trading/stats';
import { resolveSymbol } from '@/core/symbols';
import { getChart } from '@/chart/registry';
import { KeyStats, FullStats } from '@/components/strategy/StatsGrid';
import { EquityChart } from '@/components/strategy/EquityChart';
import { TradesTable } from '@/components/strategy/TradesTable';
import { Tabs, Segmented } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Empty } from '@/components/ui/Empty';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { tfShort } from '@/core/timeframes';
import { cn } from '@/components/ui/cn';
import type { Trade } from '@/core/trading/engine';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function exportCsv(trades: Trade[], name: string) {
  const head = ['id', 'simbolo', 'tipo', 'quantidade', 'entrada', 'hora_entrada', 'saida', 'hora_saida', 'lucro', 'r', 'motivo', 'notas'];
  const rows = trades.map((t) => [
    t.id,
    resolveSymbol(t.symbolId).name,
    t.side === 'long' ? 'compra' : 'venda',
    t.qty,
    t.entryPrice,
    new Date(t.entryTime * 1000).toISOString(),
    t.exitPrice,
    new Date(t.exitTime * 1000).toISOString(),
    t.pnl.toFixed(2),
    t.r?.toFixed(3) ?? '',
    t.exitReason,
    (t.notes ?? '').replace(/"/g, '""'),
  ]);
  const csv = [head, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Journal() {
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  const [modeSel, setModeSel] = useState<'auto' | 'replay' | 'live'>('auto');
  const mode = modeSel === 'auto' ? (replayOn ? 'replay' : 'live') : modeSel;
  const acc = useTrading((s) => s[mode]);
  const sessions = useTrading((s) => s.sessions);
  const sessionId = useTrading((s) => s.sessionId);
  const updateTrade = useTrading((s) => s.updateTrade);
  const tz = useSettings((s) => s.timezone);
  const [tab, setTab] = useState<'overview' | 'trades' | 'sessions' | 'analysis'>('overview');
  const stats = useMemo(() => computeStats(acc.trades, acc.initial), [acc.trades, acc.initial]);
  const curve = useMemo(() => equityCurve(acc.trades, acc.initial), [acc.trades, acc.initial]);
  const bd = useMemo(() => breakdown(acc.trades), [acc.trades]);

  const goTo = (t: Trade) => {
    const ws = useWorkspace.getState();
    const cfg = ws.charts[ws.active];
    if (cfg.symbolId !== t.symbolId) ws.setSymbol(t.symbolId);
    setTimeout(() => getChart(cfg.id)?.scrollToTime(t.entryTime), 300);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: 'Resumo' },
            { value: 'trades', label: `Operações (${acc.trades.length})` },
            { value: 'sessions', label: `Sessões de replay (${sessions.length})` },
            { value: 'analysis', label: 'Análise' },
          ]}
        />
        <div className="flex-1" />
        <Segmented
          value={modeSel}
          onChange={setModeSel}
          items={[
            { value: 'auto', label: 'Atual' },
            { value: 'replay', label: 'Replay' },
            { value: 'live', label: 'Tempo real' },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={() => exportCsv(acc.trades, `replayx-${mode}-${new Date().toISOString().slice(0, 10)}`)} disabled={!acc.trades.length}>
          <Download size={14} /> CSV
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'overview' &&
          (acc.trades.length ? (
            <div className="flex flex-col gap-3">
              <KeyStats s={stats} />
              <div className="rounded-lg border border-line p-2">
                <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-muted">
                  <span>Curva de capital ({mode === 'replay' ? 'sessão de replay' : 'conta demo'})</span>
                  <span>Saldo {fmtMoney(acc.balance)}</span>
                </div>
                <EquityChart points={curve} initial={acc.initial} height={170} />
              </div>
            </div>
          ) : (
            <Empty title={mode === 'replay' ? 'Ainda sem operações nesta sessão de replay' : 'Ainda sem operações na conta demo'}>
              Abra o Replay, escolha um ponto de partida e use os botões Comprar/Vender (ou o painel Negociar). As estatísticas aparecem aqui.
            </Empty>
          ))}
        {tab === 'trades' && <TradesTable trades={acc.trades} onPick={goTo} editable onNote={(id, notes) => updateTrade(mode, id, { notes })} />}
        {tab === 'sessions' && (
          <div className="flex flex-col gap-2">
            {replayOn && (
              <Button size="sm" variant="primary" className="self-start" onClick={() => replay.saveCurrent()}>
                Guardar a sessão atual
              </Button>
            )}
            {sessions.map((s) => {
              const st = computeStats(s.account.trades, s.account.initial);
              return (
                <div key={s.id} className={cn('flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-xs', s.id === sessionId ? 'border-accent' : 'border-line')}>
                  <div className="min-w-[180px] flex-1">
                    <div className="text-[13px] font-semibold">{s.name}</div>
                    <div className="text-muted">
                      {resolveSymbol(s.symbolId).name} · {tfShort(s.tf)} · {fmtDate(s.start, tz)} → {fmtDateTime(s.cursor, tz)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn('font-semibold tnum', st.netProfit >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(st.netProfit)}</div>
                    <div className="text-muted">
                      {st.trades} op. · {st.winRate.toFixed(0)}% acerto
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="primary" onClick={() => void replay.resume(s.id)}>
                      <Play size={13} /> Continuar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Recomeçar do início desta sessão"
                      onClick={() => {
                        const ws = useWorkspace.getState();
                        ws.updateChart(ws.active, { symbolId: s.symbolId, tf: s.tf });
                        void replay.start(s.start);
                      }}
                    >
                      <RotateCcw size={13} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const name = prompt('Nome da sessão', s.name);
                        if (name?.trim()) useTrading.getState().renameSession(s.id, name.trim());
                      }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" className="hover:text-down" onClick={() => confirm(`Apagar "${s.name}"?`) && useTrading.getState().deleteSession(s.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              );
            })}
            {!sessions.length && <Empty title="Sem sessões guardadas">Durante o replay use o botão de guardar (💾) na barra do replay. Ao sair do replay a sessão também é guardada automaticamente.</Empty>}
          </div>
        )}
        {tab === 'analysis' &&
          (acc.trades.length ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div>
                <FullStats s={stats} />
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-muted uppercase">Por dia da semana (UTC)</div>
                  {bd.byDay.map((d, i) =>
                    d.trades ? (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                        <span className="w-8 text-muted">{DAYS[i]}</span>
                        <div className="h-3 flex-1 overflow-hidden rounded bg-hover">
                          <div className={cn('h-full', d.pnl >= 0 ? 'bg-up' : 'bg-down')} style={{ width: `${Math.min(100, (Math.abs(d.pnl) / Math.max(...bd.byDay.map((x) => Math.abs(x.pnl)), 1)) * 100)}%` }} />
                        </div>
                        <span className={cn('w-20 text-right tnum', d.pnl >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(d.pnl)}</span>
                        <span className="w-16 text-right text-muted">
                          {d.trades} · {((d.wins / d.trades) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : null,
                  )}
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold text-muted uppercase">Por hora de entrada (UTC)</div>
                  <div className="flex h-24 items-end gap-[2px]">
                    {bd.byHour.map((h, i) => {
                      const max = Math.max(...bd.byHour.map((x) => Math.abs(x.pnl)), 1);
                      return (
                        <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${i}h: ${h.trades} op., ${fmtMoney(h.pnl)}`}>
                          <div className={cn('w-full rounded-t-sm', h.pnl >= 0 ? 'bg-up' : 'bg-down', !h.trades && 'bg-transparent')} style={{ height: `${(Math.abs(h.pnl) / max) * 100}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted">
                    <span>0h</span>
                    <span>6h</span>
                    <span>12h</span>
                    <span>18h</span>
                    <span>23h</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Empty title="Sem dados para analisar" />
          ))}
      </div>
    </div>
  );
}
