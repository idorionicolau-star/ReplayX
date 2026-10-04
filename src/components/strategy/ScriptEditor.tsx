'use client';
import { useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { completeFromList } from '@codemirror/autocomplete';
import { ChevronDown, Copy, FilePlus2, LineChart, Pencil, Play, Save, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStrategies } from '@/store/strategies';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { SCRIPT_TEMPLATES, type ScriptRunResult } from '@/core/strategy/script';
import { runStrategy, RunError } from '@/core/strategy/client';
import { getChart } from '@/chart/registry';
import { runTester } from './run';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Popover } from '@/components/ui/Popover';
import { MenuHeader, MenuItem, MenuList } from '@/components/ui/Menu';
import { Tabs } from '@/components/ui/Tabs';
import { toast } from '@/components/ui/Toast';
import { uid } from '@/lib/uid';
import { cn } from '@/components/ui/cn';

const COMPLETIONS = [
  ...['open', 'high', 'low', 'close', 'volume', 'time', 'hl2', 'hlc3', 'ohlc4', 'bar_count'].map((l) => ({ label: l, type: 'variable', info: 'Série de preços (array)' })),
  { label: 'indicator', type: 'function', info: "indicator('Nome', { overlay: true })" },
  { label: 'strategy', type: 'function', info: "strategy('Nome', { overlay: true })" },
  { label: 'plot', type: 'function', info: "plot(serie, { title, color, width, style: 'line'|'histogram'|'area'|'dots'|'step' })" },
  { label: 'plotshape', type: 'function', info: "plotshape(condicao, { location: 'above'|'below', color, text })" },
  { label: 'hline', type: 'function', info: 'hline(valor, { color })' },
  { label: 'onBar', type: 'function', info: 'onBar((i) => { … }) — lógica barra a barra' },
  { label: 'input.int', type: 'function', info: "input.int('Título', 14, { min, max })" },
  { label: 'input.float', type: 'function', info: "input.float('Título', 1.5, { step })" },
  { label: 'input.bool', type: 'function' },
  { label: 'input.source', type: 'function', info: "input.source('Fonte', 'close')" },
  { label: 'input.select', type: 'function', info: "input.select('Título', 'a', ['a','b'])" },
  { label: 'strategy.entry', type: 'function', info: "strategy.entry('Long', 'long', { sl, tp, slDist, tpDist, trail, qty, limit, stop })" },
  { label: 'strategy.close', type: 'function', info: "strategy.close('Long')" },
  { label: 'strategy.closeAll', type: 'function' },
  { label: 'strategy.exit', type: 'function', info: "strategy.exit('Long', { sl, tp, trail })" },
  { label: 'strategy.cancel', type: 'function' },
  { label: 'strategy.position', type: 'property', info: '{ size, side, avgPrice, openTrades, barsInTrade }' },
  { label: 'crossover', type: 'function', info: 'crossover(a, b, i) → true/false na barra i' },
  { label: 'crossunder', type: 'function', info: 'crossunder(a, b, i)' },
  { label: 'highest', type: 'function', info: 'highest(serie, n, i)' },
  { label: 'lowest', type: 'function', info: 'lowest(serie, n, i)' },
  { label: 'nz', type: 'function' },
  { label: 'na', type: 'function' },
  { label: 'log', type: 'function', info: 'log(…) — escreve na consola' },
  { label: 'indicatorValues', type: 'function', info: "indicatorValues('rsi', { length: 14 }) → { rsi: [...] }" },
  ...[
    'sma', 'ema', 'wma', 'hma', 'rma', 'dema', 'tema', 'vwma', 'stdev', 'highest', 'lowest', 'sum', 'change', 'roc', 'mom', 'rsi', 'macd', 'bb', 'atr', 'tr', 'stoch', 'stochRsi', 'cci', 'williamsR', 'dmi', 'adx', 'mfi', 'obv', 'cmf',
    'vwap', 'supertrend', 'psar', 'ichimoku', 'donchian', 'keltner', 'aroon', 'ao', 'trix', 'linreg', 'pivothigh', 'pivotlow', 'zigzag', 'crossover', 'crossunder', 'cross', 'rising', 'falling', 'barssince', 'valuewhen', 'offset',
  ].map((f) => ({ label: `ta.${f}`, type: 'function' })),
];

const HELP = `// ── Séries ─────────────────────────────
open, high, low, close, volume, time   // arrays
hl2, hlc3, ohlc4, bar_count

// ── Declaração ─────────────────────────
indicator('Nome', { overlay: true })   // ou false = painel próprio
strategy('Nome', { overlay: true })

// ── Parâmetros (editáveis no gráfico e no otimizador)
const n = input.int('Período', 14, { min: 2, max: 200 })
const k = input.float('Mult.', 2, { step: 0.1 })

// ── Indicadores (devolvem arrays)
ta.sma(close, 20)  ta.ema(close, 9)  ta.rsi(close, 14)
ta.macd(close, 12, 26, 9) → { macd, signal, hist }
ta.bb(close, 20, 2) → { basis, upper, lower }
ta.atr(14)  ta.stoch(14, 1, 3) → { k, d }
ta.supertrend(10, 3) → { line, dir }
ta.crossover(a, b) → array de true/false

// ── Desenhar
plot(serie, { title, color, width, style })
plotshape(cond, { location: 'below', color, text })
hline(70, { color: '#f23645' })

// ── Estratégia (barra a barra) ─────────
onBar((i) => {
  if (crossover(f, s, i)) strategy.entry('L', 'long', {
    slDist: atr[i] * 1.5,   // stop a partir da entrada
    tpDist: atr[i] * 3,     // alvo
  })
  if (strategy.position.side === 'long' && rsi[i] > 80)
    strategy.close('L')
})
// opções de entry: qty, sl, tp, slDist, tpDist,
//   trail, limit, stop
// As ordens executam na abertura da barra seguinte.`;

export function ScriptEditor() {
  const scripts = useStrategies((s) => s.scripts);
  const activeId = useStrategies((s) => s.activeScript);
  const saveScript = useStrategies((s) => s.saveScript);
  const dark = useSettings((s) => s.theme === 'dark');
  const active = scripts.find((s) => s.id === activeId) ?? scripts[0];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const code = active ? (drafts[active.id] ?? active.code) : '';
  const setCode = (v: string) => {
    if (active) setDrafts((d) => ({ ...d, [active.id]: v }));
  };
  const [lastCheck, setLastCheck] = useState<{ id: string; result: ScriptRunResult | null; error: { message: string; line?: number } | null } | null>(null);
  const result = lastCheck && lastCheck.id === active?.id ? lastCheck.result : null;
  const error = lastCheck && lastCheck.id === active?.id ? lastCheck.error : null;
  const [checking, setChecking] = useState(false);
  const [side, setSide] = useState<'console' | 'help'>('console');
  const newRef = useRef<HTMLButtonElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const dirty = active && code !== active.code;

  const extensions = useMemo(() => [javascript(), javascriptLanguage.data.of({ autocomplete: completeFromList(COMPLETIONS) })], []);

  const save = () => {
    if (!active) return;
    saveScript({ id: active.id, name: active.name, code });
    toast('Script guardado', { kind: 'success', duration: 1500 });
  };

  const check = async () => {
    const ws = useWorkspace.getState();
    const c = getChart(ws.charts[ws.active].id);
    const bars = c?.bars.slice(-2000) ?? [];
    if (!active) return;
    setChecking(true);
    try {
      const r = await runStrategy<ScriptRunResult>({ type: 'script', code, bars }, { timeoutMs: 8000 });
      setLastCheck({ id: active.id, result: r, error: null });
      setSide('console');
    } catch (e) {
      setLastCheck({ id: active.id, result: null, error: { message: (e as Error).message, line: e instanceof RunError ? e.line : undefined } });
    } finally {
      setChecking(false);
    }
  };

  const addToChart = () => {
    if (!active) return;
    save();
    const ws = useWorkspace.getState();
    const cfg = ws.charts[ws.active];
    ws.updateChart(ws.active, { indicators: [...cfg.indicators, { uid: uid('si'), type: `script:${active.id}`, params: {}, styles: {} }] });
    toast(`${active.name} adicionado ao gráfico`, { kind: 'success' });
  };

  const test = async () => {
    if (!active) return;
    save();
    useWorkspace.getState().setBottomTab('tester');
    await runTester({ kind: 'script', code }, active.name);
  };

  const isStrategy = /strategy\s*\(/.test(code);

  return (
    <div
      className="flex h-full flex-col"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
        <Select className="w-60" value={active?.id ?? ''} onChange={(e) => useStrategies.getState().setActiveScript(e.target.value)}>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {dirty && <span className="text-[11px] text-warn">● não guardado</span>}
        <Button ref={newRef} size="sm" variant="ghost" onClick={() => setNewOpen((o) => !o)}>
          <FilePlus2 size={14} /> Novo <ChevronDown size={12} />
        </Button>
        <Popover anchor={newRef} open={newOpen} onClose={() => setNewOpen(false)} placement="top-start">
          <MenuList className="w-[300px]">
            <MenuHeader>Começar a partir de</MenuHeader>
            <MenuItem
              label="Script vazio"
              onClick={() => {
                saveScript({ name: 'Novo indicador', code: "indicator('Novo indicador', { overlay: true });\n\nconst len = input.int('Período', 20);\nplot(ta.sma(close, len), { title: 'Média' });\n" });
                setNewOpen(false);
              }}
            />
            {SCRIPT_TEMPLATES.map((t) => (
              <MenuItem
                key={t.name}
                label={t.name}
                onClick={() => {
                  saveScript({ name: t.name, code: t.code });
                  setNewOpen(false);
                }}
              />
            ))}
          </MenuList>
        </Popover>
        <Button size="sm" variant="ghost" onClick={save} disabled={!dirty} title="Ctrl+S">
          <Save size={14} /> Guardar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!active) return;
            const name = prompt('Nome do script', active.name);
            if (name?.trim()) saveScript({ id: active.id, name: name.trim(), code });
          }}
        >
          <Pencil size={14} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => active && saveScript({ name: `${active.name} (cópia)`, code })}>
          <Copy size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="hover:text-down" onClick={() => active && confirm(`Apagar "${active.name}"?`) && useStrategies.getState().deleteScript(active.id)}>
          <Trash2 size={14} />
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => void check()} disabled={checking}>
          <CheckCircle2 size={14} /> Verificar
        </Button>
        {!isStrategy && (
          <Button size="sm" variant="primary" onClick={addToChart}>
            <LineChart size={14} /> Adicionar ao gráfico
          </Button>
        )}
        {isStrategy && (
          <>
            <Button size="sm" variant="outline" onClick={addToChart} title="Mostra os plots da estratégia como indicador">
              <LineChart size={14} /> No gráfico
            </Button>
            <Button size="sm" variant="primary" onClick={() => void test()}>
              <Play size={13} fill="currentColor" /> Testar estratégia
            </Button>
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden">
          <CodeMirror value={code} height="100%" theme={dark ? oneDark : 'light'} extensions={extensions} onChange={setCode} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true }} className="h-full" />
        </div>
        <div className="hidden w-[320px] shrink-0 flex-col border-l border-line md:flex">
          <div className="border-b border-line px-2 py-1">
            <Tabs
              size="sm"
              value={side}
              onChange={setSide}
              items={[
                { value: 'console', label: 'Consola' },
                { value: 'help', label: 'Ajuda da API' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5 font-mono text-[11.5px] leading-relaxed">
            {side === 'help' && <pre className="whitespace-pre-wrap text-muted">{HELP}</pre>}
            {side === 'console' && (
              <>
                {!result && !error && <div className="font-sans text-xs text-muted">Carregue em “Verificar” para correr o script nos dados do gráfico ativo.</div>}
                {error && (
                  <div className="flex gap-2 rounded bg-down/10 p-2 text-down">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {error.line ? `Linha ${error.line}: ` : ''}
                      {error.message}
                    </span>
                  </div>
                )}
                {result && (
                  <div className="flex flex-col gap-2">
                    <div className="text-up">✔ {result.meta.kind === 'strategy' ? 'Estratégia' : 'Indicador'} “{result.meta.title}” sem erros</div>
                    <div className="text-muted">
                      {result.plots.length} plot(s) · {result.shapes.length} marca(s) · {result.inputs.length} parâmetro(s)
                    </div>
                    {result.inputs.map((i) => (
                      <div key={i.title} className="text-muted">
                        • {i.title} = <span className="text-text">{String(i.value)}</span>
                      </div>
                    ))}
                    {result.logs.length > 0 && <div className="mt-1 text-muted">— log —</div>}
                    {result.logs.map((l, k) => (
                      <div key={k} className={cn('break-words')}>
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
