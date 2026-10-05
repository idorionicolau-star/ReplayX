'use client';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Play, Layers3, Check, Info, AlertTriangle, StopCircle } from 'lucide-react';
import { useStrategies } from '@/store/strategies';
import { useWorkspace } from '@/store/workspace';
import { listParams, setPath, type VisualStrategy } from '@/core/strategy/visual';
import { OBJECTIVE_LABEL, gridSize, type Objective, type OptimizeRange } from '@/core/strategy/optimizer';
import type { OptimizeResult, StrategyRef, WalkForwardResult, BatchRow, Dataset } from '@/core/strategy/runner';
import { runStrategy } from '@/core/strategy/client';
import { requirePro } from '@/lib/billing';
import type { ScriptRunResult } from '@/core/strategy/script';
import type { monteCarlo } from '@/core/trading/stats';
import { getChart } from '@/chart/registry';
import { resolveSymbol } from '@/core/symbols';
import { STANDARD_TFS, tfShort } from '@/core/timeframes';
import { loadDataset } from './run';
import { KeyStats } from './StatsGrid';
import { Button } from '@/components/ui/Button';
import { Checkbox, NumberInput, Select, Switch } from '@/components/ui/Field';
import { Segmented, Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { Empty } from '@/components/ui/Empty';
import { toast } from '@/components/ui/Toast';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { useSettings } from '@/store/settings';
import { cn } from '@/components/ui/cn';

interface RangeRow extends OptimizeRange {
  enabled: boolean;
  label: string;
}

function applyScriptParams(code: string, params: Record<string, number>): string {
  let out = code;
  for (const [title, v] of Object.entries(params)) {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(input\\.(?:int|float)\\(\\s*['"\`]${esc}['"\`]\\s*,\\s*)(-?[\\d.]+)`), `$1${v}`);
  }
  return out;
}

export function Optimizer() {
  const st = useStrategies();
  const cfg = useWorkspace((s) => s.charts[s.active]);
  const watchlists = useWorkspace((s) => s.watchlists);
  const activeList = useWorkspace((s) => s.activeWatchlist);
  const tz = useSettings((s) => s.timezone);
  const [kind, setKind] = useState<'visual' | 'script'>('visual');
  const [rangesById, setRangesById] = useState<Record<string, RangeRow[]>>({});
  const [method, setMethod] = useState<'grid' | 'random' | 'genetic'>('genetic');
  const [objective, setObjective] = useState<Objective>('netProfitDD');
  const [minTrades, setMinTrades] = useState(20);
  const [maxRuns, setMaxRuns] = useState(300);
  const [folds, setFolds] = useState(4);
  const [isPct, setIsPct] = useState(70);
  const [anchored, setAnchored] = useState(false);
  const [view, setView] = useState<'optimize' | 'walkforward' | 'multi'>('optimize');
  const [multiSyms, setMultiSyms] = useState<string[]>([]);
  const [multiTf, setMultiTf] = useState<string>('');
  const [abort, setAbort] = useState<AbortController | null>(null);

  const visual = st.visuals.find((v) => v.id === st.activeVisual) ?? st.visuals[0];
  const strategyScripts = st.scripts.filter((s) => /strategy\s*\(/.test(s.code));
  const script = strategyScripts.find((s) => s.id === st.activeScript) ?? strategyScripts[0];

  // parâmetros otimizáveis (guardados por estratégia)
  const rkey = kind === 'visual' ? `v:${visual?.id}:${visual?.updatedAt ?? 0}` : `s:${script?.id}:${script?.updatedAt ?? 0}`;
  const visualDefaults = useMemo(
    () => (kind === 'visual' && visual ? listParams(visual).map((p, i) => ({ key: p.path, label: p.label, min: p.min, max: p.max, step: p.step, integer: p.integer, enabled: i < 3 })) : null),
    [kind, visual],
  );
  const ranges: RangeRow[] = rangesById[rkey] ?? visualDefaults ?? [];
  const setRanges = (r: RangeRow[]) => setRangesById((m) => ({ ...m, [rkey]: r }));

  useEffect(() => {
    if (kind !== 'script' || !script || rangesById[rkey]) return;
    const c = cfg ? getChart(cfg.id) : undefined;
    let alive = true;
    runStrategy<ScriptRunResult>({ type: 'script', code: script.code, bars: c?.bars.slice(-300) ?? [] }, { timeoutMs: 5000 })
      .then((r) => {
        if (!alive) return;
        const rows = r.inputs
          .filter((i) => i.type === 'int' || i.type === 'float')
          .map((i, k) => {
            const v = Number(i.default);
            const integer = i.type === 'int';
            return {
              key: i.title,
              label: i.title,
              min: i.min ?? (integer ? Math.max(1, Math.round(v / 2)) : +(v / 2).toFixed(3)),
              max: i.max !== undefined ? Math.min(i.max, integer ? Math.round(v * 2) : v * 2) : integer ? Math.round(v * 2) : +(v * 2).toFixed(3),
              step: i.step ?? (integer ? Math.max(1, Math.round(v / 10)) : 0.1),
              integer,
              enabled: k < 3,
            };
          });
        setRangesById((m) => ({ ...m, [rkey]: rows }));
      })
      .catch(() => alive && setRangesById((m) => ({ ...m, [rkey]: [] })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rkey]);

  const ref: StrategyRef | null = kind === 'visual' ? (visual ? { kind: 'visual', strategy: visual } : null) : script ? { kind: 'script', code: script.code } : null;
  const label = kind === 'visual' ? visual?.name : script?.name;
  const enabled = ranges.filter((r) => r.enabled);
  const combos = useMemo(() => gridSize(enabled), [enabled]);
  const running = st.running;

  const config = () => ({ method, ranges: enabled.map(({ key, min, max, step, integer }) => ({ key, min, max, step, integer })), objective, minTrades, maxRuns, seed: 7 });

  const progress = (kindName: string) => (done: number, total: number, info?: string) => useStrategies.getState().set({ running: { kind: kindName, done, total, info } });

  const runOptimize = async () => {
    if (!requirePro('optimizer')) return;
    if (!ref) return;
    const ctrl = new AbortController();
    setAbort(ctrl);
    st.set({ running: { kind: 'optimize', done: 0, total: maxRuns, info: 'A carregar dados…' }, error: null });
    try {
      const data = await loadDataset(st.barsToTest);
      const r = await runStrategy<OptimizeResult>({ type: 'optimize', strategy: ref, data, settings: st.settings, config: config() }, { onProgress: progress('optimize'), signal: ctrl.signal });
      st.set({ optimization: { ...r, label: `${label} — ${data.label}`, keys: enabled.map((e) => ({ key: e.key, label: e.label })) }, running: null });
    } catch (e) {
      st.set({ running: null, error: (e as Error).message });
    } finally {
      setAbort(null);
    }
  };

  const runWalkForward = async () => {
    if (!requirePro('optimizer')) return;
    if (!ref) return;
    const ctrl = new AbortController();
    setAbort(ctrl);
    st.set({ running: { kind: 'walkforward', done: 0, total: folds, info: 'A carregar dados…' }, error: null });
    try {
      const data = await loadDataset(st.barsToTest);
      const r = await runStrategy<WalkForwardResult>(
        { type: 'walkforward', strategy: ref, data, settings: st.settings, config: config(), wf: { folds, inSamplePct: isPct, anchored } },
        { onProgress: progress('walkforward'), signal: ctrl.signal },
      );
      st.set({ walkforward: { ...r, label: `${label} — ${data.label}` }, running: null });
    } catch (e) {
      st.set({ running: null, error: (e as Error).message });
    } finally {
      setAbort(null);
    }
  };

  const runMulti = async () => {
    if (!requirePro('optimizer')) return;
    if (!ref || !multiSyms.length) return;
    const ctrl = new AbortController();
    setAbort(ctrl);
    const tf = multiTf || cfg?.tf || '1h';
    st.set({ running: { kind: 'multi', done: 0, total: multiSyms.length, info: 'A carregar dados…' }, error: null });
    try {
      const datasets: Dataset[] = [];
      const failed: BatchRow[] = [];
      for (let k = 0; k < multiSyms.length; k++) {
        if (ctrl.signal.aborted) throw new Error('Cancelado');
        const id = multiSyms[k];
        st.set({ running: { kind: 'multi', done: k, total: multiSyms.length, info: `A carregar ${resolveSymbol(id).name}…` } });
        try {
          datasets.push(await loadDataset(st.barsToTest, id, tf));
        } catch (e) {
          failed.push({ label: `${resolveSymbol(id).name} · ${tfShort(tf)}`, symbolId: id, stats: null, error: (e as Error).message, bars: 0 });
        }
      }
      const r = await runStrategy<{ rows: BatchRow[]; monteCarlo?: ReturnType<typeof monteCarlo> }>({ type: 'batch', strategy: ref, datasets, settings: st.settings }, { onProgress: progress('multi'), signal: ctrl.signal });
      st.set({ batch: { rows: [...r.rows, ...failed], monteCarlo: r.monteCarlo, label: `${label} · ${tfShort(tf)}` }, running: null });
    } catch (e) {
      st.set({ running: null, error: (e as Error).message });
    } finally {
      setAbort(null);
    }
  };

  const applyParams = (params: Record<string, number>) => {
    if (kind === 'visual' && visual) {
      let v: VisualStrategy = visual;
      for (const [k, val] of Object.entries(params)) v = setPath(v, k, val);
      st.saveVisual(v);
    } else if (script) {
      st.saveScript({ id: script.id, name: script.name, code: applyScriptParams(script.code, params) });
    }
    toast('Parâmetros aplicados à estratégia', { kind: 'success', body: 'Teste-a no Testador para ver o resultado completo.' });
  };

  const watchSymbols = watchlists.find((w) => w.id === activeList)?.symbols ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex shrink-0 flex-col gap-3 overflow-y-auto border-b border-line p-3 lg:w-[400px] lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2">
          <Segmented
            value={kind}
            onChange={setKind}
            items={[
              { value: 'visual', label: 'Visual' },
              { value: 'script', label: 'Script' },
            ]}
          />
          {kind === 'visual' ? (
            <Select className="flex-1" value={visual?.id ?? ''} onChange={(e) => st.setActiveVisual(e.target.value)}>
              {st.visuals.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          ) : (
            <Select className="flex-1" value={script?.id ?? ''} onChange={(e) => st.setActiveScript(e.target.value)}>
              {strategyScripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Tabs
          size="sm"
          value={view}
          onChange={setView}
          items={[
            { value: 'optimize', label: 'Aprender parâmetros' },
            { value: 'walkforward', label: 'Walk-forward' },
            { value: 'multi', label: 'Vários ativos' },
          ]}
        />
        {view !== 'multi' && (
          <div className="rounded-lg border border-line">
            <div className="border-b border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted">Parâmetros a otimizar</div>
            <div className="max-h-56 overflow-y-auto p-1.5">
              {ranges.map((r, i) => (
                <div key={r.key} className="flex items-center gap-1.5 py-1 text-xs">
                  <Checkbox checked={r.enabled} onChange={(v) => setRanges(ranges.map((x, k) => (k === i ? { ...x, enabled: v } : x)))} />
                  <span className="min-w-0 flex-1 truncate" title={r.label}>
                    {r.label}
                  </span>
                  <NumberInput className="w-14 [&_input]:h-6 [&_input]:px-1 [&_input]:text-[11px]" value={r.min} step={r.step} onChange={(v) => v !== undefined && setRanges(ranges.map((x, k) => (k === i ? { ...x, min: v } : x)))} />
                  <NumberInput className="w-14 [&_input]:h-6 [&_input]:px-1 [&_input]:text-[11px]" value={r.max} step={r.step} onChange={(v) => v !== undefined && setRanges(ranges.map((x, k) => (k === i ? { ...x, max: v } : x)))} />
                  <NumberInput className="w-12 [&_input]:h-6 [&_input]:px-1 [&_input]:text-[11px]" value={r.step} step={r.integer ? 1 : 0.05} min={r.integer ? 1 : 0.0001} onChange={(v) => v !== undefined && setRanges(ranges.map((x, k) => (k === i ? { ...x, step: v } : x)))} />
                </div>
              ))}
              {!ranges.length && <div className="p-3 text-center text-xs text-muted">Esta estratégia não tem parâmetros numéricos.</div>}
            </div>
            <div className="flex justify-between border-t border-line px-2.5 py-1 text-[10px] text-muted">
              <span>mín · máx · passo</span>
              <span>{combos.toLocaleString('pt-PT')} combinações</span>
            </div>
          </div>
        )}
        {view !== 'multi' && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1 text-muted">
              Método
              <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="genetic">Genético (aprende)</option>
                <option value="grid">Grelha completa</option>
                <option value="random">Aleatório</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-muted">
              Objetivo
              <Select value={objective} onChange={(e) => setObjective(e.target.value as Objective)}>
                {(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((o) => (
                  <option key={o} value={o}>
                    {OBJECTIVE_LABEL[o]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-muted">
              Mín. operações
              <NumberInput value={minTrades} min={1} step={5} onChange={(v) => v !== undefined && setMinTrades(Math.round(v))} />
            </label>
            <label className="flex flex-col gap-1 text-muted">
              Máx. testes
              <NumberInput value={maxRuns} min={10} max={5000} step={50} onChange={(v) => v !== undefined && setMaxRuns(Math.round(v))} />
            </label>
          </div>
        )}
        {view === 'walkforward' && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-1 text-muted">
              Janelas
              <NumberInput value={folds} min={2} max={12} step={1} onChange={(v) => v !== undefined && setFolds(Math.round(v))} />
            </label>
            <label className="flex flex-col gap-1 text-muted">
              % para aprender
              <NumberInput value={isPct} min={50} max={90} step={5} onChange={(v) => v !== undefined && setIsPct(Math.round(v))} />
            </label>
            <Switch checked={anchored} onChange={setAnchored} label={<span className="text-muted">Ancorado (janela cresce)</span>} />
          </div>
        )}
        {view === 'multi' && (
          <div className="flex flex-col gap-2 text-xs">
            <label className="flex items-center justify-between gap-2 text-muted">
              Intervalo
              <Select className="w-32" value={multiTf} onChange={(e) => setMultiTf(e.target.value)}>
                <option value="">Igual ao gráfico ({cfg ? tfShort(cfg.tf) : ''})</option>
                {STANDARD_TFS.map((t) => (
                  <option key={t} value={t}>
                    {tfShort(t)}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-center justify-between">
              <span className="text-muted">Ativos ({multiSyms.length})</span>
              <span className="flex gap-2">
                <button type="button" className="text-accent hover:underline" onClick={() => setMultiSyms(watchSymbols)}>
                  Toda a lista
                </button>
                <button type="button" className="text-muted hover:underline" onClick={() => setMultiSyms([])}>
                  Limpar
                </button>
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-line p-1.5">
              {watchSymbols.map((id) => (
                <div key={id} className="py-0.5">
                  <Checkbox checked={multiSyms.includes(id)} onChange={(v) => setMultiSyms(v ? [...multiSyms, id] : multiSyms.filter((x) => x !== id))} label={`${resolveSymbol(id).name} · ${resolveSymbol(id).description}`} />
                </div>
              ))}
            </div>
            <div className="text-[11px] text-muted">Usa a lista de observação ativa. Testar em vários mercados mostra se a estratégia é robusta ou só funciona num.</div>
          </div>
        )}
        <div className="flex gap-2">
          {view === 'optimize' && (
            <Button variant="primary" block onClick={() => void runOptimize()} disabled={!!running || !enabled.length}>
              <Sparkles size={15} /> Aprender ({Math.min(maxRuns, method === 'grid' ? combos : maxRuns)} testes)
            </Button>
          )}
          {view === 'walkforward' && (
            <Button variant="primary" block onClick={() => void runWalkForward()} disabled={!!running || !enabled.length}>
              <Play size={14} /> Correr walk-forward
            </Button>
          )}
          {view === 'multi' && (
            <Button variant="primary" block onClick={() => void runMulti()} disabled={!!running || !multiSyms.length}>
              <Layers3 size={15} /> Testar em {multiSyms.length} ativo(s)
            </Button>
          )}
          {abort && (
            <Button variant="outline" onClick={() => abort.abort()}>
              <StopCircle size={15} />
            </Button>
          )}
        </div>
        {running && running.kind !== 'backtest' && (
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>{running.info ?? 'A trabalhar…'}</span>
              <span className="tnum">
                {running.done}/{running.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-hover">
              <div className="h-full bg-accent transition-all" style={{ width: `${running.total ? (running.done / running.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        {st.error && (
          <div className="flex gap-2 rounded-md bg-down/10 p-2 text-xs text-down">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {st.error}
          </div>
        )}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
        {view === 'optimize' && (
          <>
            {!st.optimization && !running && (
              <Empty icon={<Sparkles size={28} />} title="Deixe o ReplayX aprender os melhores parâmetros">
                Escolha os parâmetros e intervalos. O algoritmo genético combina e “evolui” as melhores configurações. Depois valide no walk-forward para evitar sobre-otimização.
              </Empty>
            )}
            {running?.kind === 'optimize' && !st.optimization && (
              <div className="flex justify-center py-10">
                <Spinner className="text-accent" />
              </div>
            )}
            {st.optimization && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{st.optimization.label}</span>
                  {st.optimization.bestParams && (
                    <Button size="sm" variant="primary" onClick={() => applyParams(st.optimization!.bestParams!)}>
                      <Check size={14} /> Aplicar os melhores
                    </Button>
                  )}
                </div>
                {st.optimization.best && <KeyStats s={st.optimization.best.stats} />}
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-sunken text-[11px] text-muted">
                      <tr className="text-left">
                        <th className="px-2 py-1.5">#</th>
                        {st.optimization.keys.map((k) => (
                          <th key={k.key} className="px-2 py-1.5" title={k.label}>
                            {k.label.length > 18 ? `${k.label.slice(0, 18)}…` : k.label}
                          </th>
                        ))}
                        <th className="px-2 py-1.5 text-right">Lucro</th>
                        <th className="px-2 py-1.5 text-right">F. lucro</th>
                        <th className="px-2 py-1.5 text-right">Acerto</th>
                        <th className="px-2 py-1.5 text-right">Op.</th>
                        <th className="px-2 py-1.5 text-right">DD máx.</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {st.optimization.candidates.map((c, i) => (
                        <tr key={i} className={cn('border-t border-line', i === 0 && 'bg-accent-soft/50')}>
                          <td className="px-2 py-1 text-muted">{i + 1}</td>
                          {st.optimization!.keys.map((k) => (
                            <td key={k.key} className="px-2 py-1 tnum">
                              {c.params[k.key]}
                            </td>
                          ))}
                          <td className={cn('px-2 py-1 text-right font-semibold tnum', c.stats.netProfit >= 0 ? 'text-up' : 'text-down')}>{fmtMoney(c.stats.netProfit)}</td>
                          <td className="px-2 py-1 text-right tnum">{fmtNum(c.stats.profitFactor, 2)}</td>
                          <td className="px-2 py-1 text-right tnum">{c.stats.winRate.toFixed(1)}%</td>
                          <td className="px-2 py-1 text-right tnum">{c.stats.trades}</td>
                          <td className="px-2 py-1 text-right text-down tnum">{c.stats.maxDrawdownPct.toFixed(1)}%</td>
                          <td className="px-2 py-1 text-right">
                            <button type="button" className="text-accent hover:underline" onClick={() => applyParams(c.params)}>
                              Aplicar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {view === 'walkforward' && (
          <>
            {!st.walkforward && (
              <Empty icon={<Info size={26} />} title="Walk-forward: aprende num período, testa no seguinte">
                Os dados são divididos em janelas. Em cada uma, os parâmetros são otimizados na primeira parte (amostra) e testados na parte seguinte, que o otimizador nunca viu. É a forma mais honesta de saber se a
                estratégia funciona no futuro.
              </Empty>
            )}
            {st.walkforward && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-semibold">{st.walkforward.label}</span>
                  <span className={cn('rounded px-2 py-0.5 font-semibold', st.walkforward.efficiency >= 50 ? 'bg-up/15 text-up' : st.walkforward.efficiency > 0 ? 'bg-warn/15 text-warn' : 'bg-down/15 text-down')}>
                    Eficiência {st.walkforward.efficiency.toFixed(0)}%
                  </span>
                  <span className="text-muted">
                    {st.walkforward.efficiency >= 50 ? 'Robusta: mantém boa parte do desempenho fora da amostra.' : st.walkforward.efficiency > 0 ? 'Aceitável, mas perde força fora da amostra.' : 'Provável sobre-otimização: não se mantém fora da amostra.'}
                  </span>
                </div>
                {st.walkforward.oos && <KeyStats s={st.walkforward.oos.stats} />}
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="bg-sunken text-[11px] text-muted">
                      <tr className="text-left">
                        <th className="px-2 py-1.5">Janela</th>
                        <th className="px-2 py-1.5">Aprendizagem</th>
                        <th className="px-2 py-1.5">Parâmetros</th>
                        <th className="px-2 py-1.5 text-right">Lucro (amostra)</th>
                        <th className="px-2 py-1.5">Teste</th>
                        <th className="px-2 py-1.5 text-right">Lucro (teste)</th>
                        <th className="px-2 py-1.5 text-right">Op.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.walkforward.folds.map((f) => (
                        <tr key={f.index} className="border-t border-line">
                          <td className="px-2 py-1">{f.index + 1}</td>
                          <td className="px-2 py-1 text-muted">
                            {fmtDate(f.isFrom, tz)} – {fmtDate(f.isTo, tz)}
                          </td>
                          <td className="px-2 py-1 tnum">{f.best ? Object.values(f.best.params).join(' · ') : '—'}</td>
                          <td className={cn('px-2 py-1 text-right tnum', (f.best?.stats.netProfit ?? 0) >= 0 ? 'text-up' : 'text-down')}>{f.best ? fmtMoney(f.best.stats.netProfit) : '—'}</td>
                          <td className="px-2 py-1 text-muted">
                            {fmtDate(f.oosFrom, tz)} – {fmtDate(f.oosTo, tz)}
                          </td>
                          <td className={cn('px-2 py-1 text-right font-semibold tnum', (f.oos?.netProfit ?? 0) >= 0 ? 'text-up' : 'text-down')}>{f.oos ? fmtMoney(f.oos.netProfit) : '—'}</td>
                          <td className="px-2 py-1 text-right tnum">{f.oos?.trades ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {view === 'multi' && (
          <>
            {!st.batch && (
              <Empty icon={<Layers3 size={26} />} title="Teste a mesma estratégia em vários mercados">
                Selecione os ativos à esquerda. O resultado inclui uma simulação de Monte Carlo (baralha a ordem das operações) para estimar o pior drawdown provável.
              </Empty>
            )}
            {st.batch && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold">{st.batch.label}</span>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[620px] text-xs">
                    <thead className="bg-sunken text-[11px] text-muted">
                      <tr className="text-left">
                        <th className="px-2 py-1.5">Ativo</th>
                        <th className="px-2 py-1.5 text-right">Lucro</th>
                        <th className="px-2 py-1.5 text-right">F. lucro</th>
                        <th className="px-2 py-1.5 text-right">Acerto</th>
                        <th className="px-2 py-1.5 text-right">Op.</th>
                        <th className="px-2 py-1.5 text-right">DD máx.</th>
                        <th className="px-2 py-1.5 text-right">Comprar e manter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...st.batch.rows]
                        .sort((a, b) => (b.stats?.netProfitPct ?? -1e9) - (a.stats?.netProfitPct ?? -1e9))
                        .map((r) => (
                          <tr key={r.label} className="border-t border-line">
                            <td className="px-2 py-1 font-medium">{r.label}</td>
                            {r.stats ? (
                              <>
                                <td className={cn('px-2 py-1 text-right font-semibold tnum', r.stats.netProfit >= 0 ? 'text-up' : 'text-down')}>{r.stats.netProfitPct.toFixed(2)}%</td>
                                <td className="px-2 py-1 text-right tnum">{fmtNum(r.stats.profitFactor, 2)}</td>
                                <td className="px-2 py-1 text-right tnum">{r.stats.winRate.toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right tnum">{r.stats.trades}</td>
                                <td className="px-2 py-1 text-right text-down tnum">{r.stats.maxDrawdownPct.toFixed(1)}%</td>
                                <td className="px-2 py-1 text-right text-muted tnum">{r.buyHoldPct?.toFixed(2)}%</td>
                              </>
                            ) : (
                              <td colSpan={6} className="px-2 py-1 text-down">
                                {r.error}
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {st.batch.monteCarlo && (
                  <div className="rounded-lg border border-line p-3 text-xs">
                    <div className="mb-2 font-semibold">Monte Carlo ({st.batch.monteCarlo.runs} simulações, todas as operações juntas)</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <div className="text-muted">Drawdown mediano</div>
                        <div className="font-semibold text-down tnum">{st.batch.monteCarlo.ddMedian.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-muted">Drawdown 95%</div>
                        <div className="font-semibold text-down tnum">{st.batch.monteCarlo.dd95.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-muted">Capital final (5% pior)</div>
                        <div className="font-semibold tnum">{fmtMoney(st.batch.monteCarlo.finalP5)}</div>
                      </div>
                      <div>
                        <div className="text-muted">Risco de perder 50%</div>
                        <div className={cn('font-semibold tnum', st.batch.monteCarlo.ruinPct > 5 ? 'text-down' : 'text-up')}>{st.batch.monteCarlo.ruinPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
