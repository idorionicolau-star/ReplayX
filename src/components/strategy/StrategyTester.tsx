'use client';
import { useMemo, useRef, useState } from 'react';
import { Play, Settings2, EyeOff, Eye, AlertTriangle } from 'lucide-react';
import { useStrategies } from '@/store/strategies';
import { useWorkspace } from '@/store/workspace';
import { useReplay } from '@/replay/engine';
import { resolveSymbol } from '@/core/symbols';
import { tfShort } from '@/core/timeframes';
import { KeyStats, FullStats } from './StatsGrid';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { currentRef, runTester } from './run';
import { Tabs, Segmented } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { NumberInput, Row, Select } from '@/components/ui/Field';
import { Popover } from '@/components/ui/Popover';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { getChart } from '@/chart/registry';
import { fmtDate, fmtMoney } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { cn } from '@/components/ui/cn';

export function BacktestSettingsForm() {
  const settings = useStrategies((s) => s.settings);
  const setSettings = useStrategies((s) => s.setSettings);
  const barsToTest = useStrategies((s) => s.barsToTest);
  return (
    <div className="w-[300px] divide-y divide-line p-3">
      <Row label="Capital inicial">
        <NumberInput className="w-28" value={settings.initialCapital} min={100} step={1000} onChange={(v) => v !== undefined && setSettings({ initialCapital: v })} />
      </Row>
      <Row label="Tamanho">
        <Select className="w-28" value={settings.sizing.mode} onChange={(e) => setSettings({ sizing: { ...settings.sizing, mode: e.target.value as 'fixed' | 'equityPct' | 'riskPct' } })}>
          <option value="riskPct">% de risco</option>
          <option value="equityPct">% do capital</option>
          <option value="fixed">Lotes fixos</option>
        </Select>
        <NumberInput className="w-20" value={settings.sizing.value} min={0.0001} step={settings.sizing.mode === 'fixed' ? 0.01 : 0.5} onChange={(v) => v !== undefined && setSettings({ sizing: { ...settings.sizing, value: v } })} />
      </Row>
      <Row label="Pirâmide (entradas no mesmo lado)">
        <NumberInput className="w-20" value={settings.pyramiding} min={1} max={10} step={1} onChange={(v) => v !== undefined && setSettings({ pyramiding: Math.round(v) })} />
      </Row>
      <Row label="Barras a testar">
        <Select className="w-28" value={String(barsToTest)} onChange={(e) => useStrategies.getState().set({ barsToTest: Number(e.target.value) })}>
          {[500, 1000, 2000, 5000, 10000, 20000, 40000].map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString('pt-PT')}
            </option>
          ))}
        </Select>
      </Row>
      <p className="pt-2 text-[11px] text-muted">Spread, deslizamento e comissões vêm das Definições → Negociação. As ordens executam na abertura da barra seguinte ao sinal.</p>
    </div>
  );
}

export function StrategyTester() {
  const st = useStrategies();
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const replayOn = useReplay((s) => s.active && !s.selecting && s.cursor !== null);
  const tz = useSettings((s) => s.timezone);
  const [kind, setKind] = useState<'visual' | 'script'>('visual');
  const [tab, setTab] = useState<'overview' | 'perf' | 'trades'>('overview');
  const setRef = useRef<HTMLButtonElement>(null);
  const [setOpen, setSetOpen] = useState(false);
  const strategyScripts = st.scripts.filter((s) => /strategy\s*\(/.test(s.code));
  const r = st.tester;
  const buyHold = useMemo(() => {
    if (!r) return undefined;
    const pts = r.result.equity;
    if (pts.length < 2) return undefined;
    const init = st.settings.initialCapital;
    return [pts[0], pts[pts.length - 1]].map((p, i) => ({ time: p.time, value: i === 0 ? init : init * (1 + r.result.buyHoldPct / 100) }));
  }, [r, st.settings.initialCapital]);
  const shown = st.applied && cfg && st.applied.chartId === cfg.id;

  const run = () => {
    const cur = currentRef(kind);
    if (cur) void runTester(cur.ref, cur.label);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <Segmented
          value={kind}
          onChange={setKind}
          items={[
            { value: 'visual', label: 'Visual' },
            { value: 'script', label: 'Script' },
          ]}
        />
        {kind === 'visual' ? (
          <Select className="w-52" value={st.activeVisual ?? ''} onChange={(e) => st.setActiveVisual(e.target.value)}>
            {st.visuals.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        ) : (
          <Select className="w-52" value={st.activeScript ?? ''} onChange={(e) => st.setActiveScript(e.target.value)}>
            {strategyScripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        <Button size="sm" variant="primary" onClick={run} disabled={!!st.running} data-testid="tester-run">
          {st.running?.kind === 'backtest' ? <Spinner size={13} /> : <Play size={13} fill="currentColor" />}
          Testar em {cfg ? `${resolveSymbol(cfg.symbolId).name} ${tfShort(cfg.tf)}` : ''}
        </Button>
        <Button ref={setRef} size="sm" variant="ghost" onClick={() => setSetOpen((o) => !o)}>
          <Settings2 size={14} /> Propriedades
        </Button>
        <Popover anchor={setRef} open={setOpen} onClose={() => setSetOpen(false)} placement="top-start">
          <BacktestSettingsForm />
        </Popover>
        {r && (
          <Button size="sm" variant="ghost" onClick={() => st.setApplied(shown ? null : { ref: currentRef(kind)!.ref, chartId: cfg!.id, label: r.label })}>
            {shown ? <EyeOff size={14} /> : <Eye size={14} />} {shown ? 'Ocultar no gráfico' : 'Mostrar no gráfico'}
          </Button>
        )}
        <div className="flex-1" />
        {replayOn && <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] text-accent">Replay: testa só até ao cursor</span>}
        {st.running && <span className="text-[11px] text-muted">{st.running.info}</span>}
      </div>
      {st.error && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md bg-down/10 px-3 py-2 text-xs text-down">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {st.error}
        </div>
      )}
      {!r ? (
        <Empty title="Teste uma estratégia no gráfico ativo">Escolha uma estratégia visual (blocos) ou um script de estratégia e carregue em “Testar”. O resultado mostra estatísticas, curva de capital e todas as operações — e as entradas/saídas aparecem no gráfico.</Empty>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pt-2">
            <Tabs
              size="sm"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'overview', label: 'Visão geral' },
                { value: 'perf', label: 'Desempenho' },
                { value: 'trades', label: `Operações (${r.result.trades.length})` },
              ]}
            />
            <span className="hidden text-[11px] text-muted md:block">
              {r.label} · {r.result.bars.toLocaleString('pt-PT')} barras · {fmtDate(r.result.from, tz)} → {fmtDate(r.result.to, tz)}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'overview' && (
              <div className="flex flex-col gap-3">
                <KeyStats s={r.result.stats} />
                <div className="rounded-lg border border-line p-2">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted">
                    <span>Curva de capital</span>
                    <span>
                      Comprar e manter: <span className={cn('font-semibold', r.result.buyHoldPct >= 0 ? 'text-up' : 'text-down')}>{r.result.buyHoldPct.toFixed(2)}%</span> · Estratégia:{' '}
                      <span className={cn('font-semibold', r.result.stats.netProfit >= 0 ? 'text-up' : 'text-down')}>{r.result.stats.netProfitPct.toFixed(2)}%</span> · Final {fmtMoney(r.result.stats.finalBalance)}
                    </span>
                  </div>
                  <EquityChart points={r.result.equity} initial={st.settings.initialCapital} compare={buyHold} height={190} />
                </div>
              </div>
            )}
            {tab === 'perf' && <FullStats s={r.result.stats} />}
            {tab === 'trades' && (
              <TradesTable
                trades={r.result.trades}
                onPick={(t) => {
                  if (cfg) getChart(cfg.id)?.scrollToTime(t.entryTime);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
