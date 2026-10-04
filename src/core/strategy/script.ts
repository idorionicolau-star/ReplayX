import type { Bar } from '../types';
import * as T from '../indicators/ta';
import type { Series, Source } from '../indicators/ta';
import { runBacktest } from './backtester';
import { indicatorValues } from './visual';
import type { BacktestInput, BacktestResult, PlotOutput, ShapeOutput, StrategyApi, StrategyProgram } from './types';
import type { PlotStyle, ParamValue } from '../indicators/registry';

/**
 * Scripts em JavaScript ao estilo Pine Script.
 * As séries (close, ta.ema(...)) são arrays; a lógica de estratégia corre em onBar(i).
 */

export interface ScriptInput {
  title: string;
  type: 'int' | 'float' | 'bool' | 'source' | 'select';
  default: ParamValue;
  value: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ScriptMeta {
  title: string;
  kind: 'indicator' | 'strategy';
  overlay: boolean;
}

export interface ScriptRunResult {
  meta: ScriptMeta;
  inputs: ScriptInput[];
  plots: PlotOutput[];
  shapes: ShapeOutput[];
  hlines: { value: number; title: string; color: string }[];
  logs: string[];
  backtest?: BacktestResult;
}

export class ScriptError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message);
    this.name = 'ScriptError';
  }
}

const PRELUDE_LINES = 3;

function lineFromStack(e: unknown): number | undefined {
  const stack = String((e as Error)?.stack ?? '');
  const m = /<anonymous>:(\d+):\d+/.exec(stack) ?? /eval.*?:(\d+):\d+/.exec(stack);
  if (!m) return undefined;
  const line = parseInt(m[1], 10) - PRELUDE_LINES;
  return line > 0 ? line : undefined;
}

interface Compiled {
  result: ScriptRunResult;
  onBar: ((i: number) => void) | null;
  setApi: (api: StrategyApi | null) => void;
}

function compile(code: string, bars: readonly Bar[], overrides: Record<string, ParamValue> = {}): Compiled {
  const n = bars.length;
  const meta: ScriptMeta = { title: 'Script', kind: 'indicator', overlay: true };
  const inputs: ScriptInput[] = [];
  const plots: PlotOutput[] = [];
  const shapes: ShapeOutput[] = [];
  const hlines: ScriptRunResult['hlines'] = [];
  const logs: string[] = [];
  let onBarFn: ((i: number) => void) | null = null;
  let api: StrategyApi | null = null;

  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? 0);
  const time = bars.map((b) => b.time);
  const hl2 = T.source(bars, 'hl2');
  const hlc3 = T.source(bars, 'hlc3');
  const ohlc4 = T.source(bars, 'ohlc4');

  const S = (x: Series | number | boolean[]): Series =>
    typeof x === 'number' ? new Array(n).fill(x) : (x as (number | boolean)[]).map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));

  const register = (type: ScriptInput['type'], title: string, def: ParamValue, o: Partial<ScriptInput> = {}): ParamValue => {
    const existing = inputs.find((x) => x.title === title);
    const value = overrides[title] ?? existing?.value ?? def;
    if (!existing) inputs.push({ title, type, default: def, value, min: o.min, max: o.max, step: o.step, options: o.options });
    return value;
  };

  const input = {
    int: (title: string, def: number, o: { min?: number; max?: number; step?: number } = {}) => Math.round(Number(register('int', title, def, o))),
    float: (title: string, def: number, o: { min?: number; max?: number; step?: number } = {}) => Number(register('float', title, def, o)),
    bool: (title: string, def: boolean) => Boolean(register('bool', title, def)),
    source: (title: string, def: Source = 'close') => T.source(bars, String(register('source', title, def, { options: T.SOURCES })) as Source),
    select: (title: string, def: string, options: string[]) => String(register('select', title, def, { options })),
  };

  const ta = {
    sma: (s: Series, l: number) => T.sma(S(s), l),
    ema: (s: Series, l: number) => T.ema(S(s), l),
    wma: (s: Series, l: number) => T.wma(S(s), l),
    hma: (s: Series, l: number) => T.hma(S(s), l),
    rma: (s: Series, l: number) => T.rma(S(s), l),
    dema: (s: Series, l: number) => T.dema(S(s), l),
    tema: (s: Series, l: number) => T.tema(S(s), l),
    vwma: (s: Series, l: number) => T.vwma(S(s), volume, l),
    stdev: (s: Series, l: number) => T.stdev(S(s), l),
    highest: (s: Series, l: number) => T.highest(S(s), l),
    lowest: (s: Series, l: number) => T.lowest(S(s), l),
    sum: (s: Series, l: number) => T.sum(S(s), l),
    change: (s: Series, l = 1) => T.change(S(s), l),
    roc: (s: Series, l: number) => T.roc(S(s), l),
    mom: (s: Series, l: number) => T.mom(S(s), l),
    rsi: (s: Series, l = 14) => T.rsi(S(s), l),
    macd: (s: Series, f = 12, sl = 26, sig = 9) => T.macd(S(s), f, sl, sig),
    bb: (s: Series, l = 20, m = 2) => T.bollinger(S(s), l, m),
    atr: (l = 14) => T.atr(bars, l),
    tr: () => T.tr(bars),
    stoch: (k = 14, smooth = 1, d = 3) => T.stoch(bars, k, smooth, d),
    stochRsi: (s: Series, r = 14, st = 14, k = 3, d = 3) => T.stochRsi(S(s), r, st, k, d),
    cci: (l = 20) => T.cci(bars, l),
    williamsR: (l = 14) => T.williamsR(bars, l),
    dmi: (l = 14, smooth = 14) => T.dmi(bars, l, smooth),
    adx: (l = 14, smooth = 14) => T.dmi(bars, l, smooth).adx,
    mfi: (l = 14) => T.mfi(bars, l),
    obv: () => T.obv(bars),
    cmf: (l = 20) => T.cmf(bars, l),
    vwap: (anchor: 'D' | 'W' | 'M' = 'D') => T.vwap(bars, anchor).vwap,
    supertrend: (p = 10, m = 3) => T.supertrend(bars, p, m),
    psar: (a = 0.02, inc = 0.02, max = 0.2) => T.psar(bars, a, inc, max),
    ichimoku: (c = 9, b = 26, s = 52) => T.ichimoku(bars, c, b, s),
    donchian: (l = 20) => T.donchian(bars, l),
    keltner: (l = 20, m = 2, a = 10) => T.keltner(bars, l, m, a),
    aroon: (l = 14) => T.aroon(bars, l),
    ao: () => T.awesome(bars),
    trix: (s: Series, l = 18) => T.trix(S(s), l),
    linreg: (s: Series, l: number, off = 0) => T.linreg(S(s), l, off),
    pivothigh: (s: Series, l: number, r: number) => T.pivotHigh(S(s), l, r),
    pivotlow: (s: Series, l: number, r: number) => T.pivotLow(S(s), l, r),
    zigzag: (dev = 5) => T.zigzag(bars, dev),
    crossover: (a: Series, b: Series | number) => T.crossover(S(a), typeof b === 'number' ? b : S(b)),
    crossunder: (a: Series, b: Series | number) => T.crossunder(S(a), typeof b === 'number' ? b : S(b)),
    cross: (a: Series, b: Series | number) => {
      const up = T.crossover(S(a), typeof b === 'number' ? b : S(b));
      const dn = T.crossunder(S(a), typeof b === 'number' ? b : S(b));
      return up.map((v, i) => v || dn[i]);
    },
    rising: (s: Series, l = 1) => T.rising(S(s), l),
    falling: (s: Series, l = 1) => T.falling(S(s), l),
    barssince: (c: boolean[]) => T.barsSince(c),
    valuewhen: (c: boolean[], s: Series, k = 0) => T.valueWhen(c, S(s), k),
    offset: (s: Series, k: number) => T.offset(S(s), k),
  };

  const plot = (series: Series | number | boolean[], o: { title?: string; color?: string; width?: number; style?: PlotStyle; overlay?: boolean; colors?: (string | undefined)[] } | string = {}, color?: string) => {
    const opts = typeof o === 'string' ? { title: o, color } : o;
    plots.push({
      title: opts.title ?? `Plot ${plots.length + 1}`,
      color: opts.color ?? ['#2962ff', '#ff6d00', '#9c27b0', '#089981', '#f23645'][plots.length % 5],
      width: opts.width ?? 2,
      style: opts.style ?? 'line',
      overlay: opts.overlay ?? meta.overlay,
      data: S(series),
      colors: opts.colors,
    });
  };

  const plotshape = (cond: boolean[] | Series, o: { location?: 'above' | 'below'; shape?: ShapeOutput['shape']; color?: string; text?: string } = {}) => {
    S(cond as Series).forEach((v, i) => {
      if (v && Number.isFinite(v))
        shapes.push({ index: i, position: o.location ?? 'below', shape: o.shape ?? (o.location === 'above' ? 'arrowDown' : 'arrowUp'), color: o.color ?? '#2962ff', text: o.text });
    });
  };

  const hline = (value: number, o: { title?: string; color?: string } = {}) => hlines.push({ value, title: o.title ?? String(value), color: o.color ?? '#787b86' });

  const declare = (kind: ScriptMeta['kind']) => (title: string, o: { overlay?: boolean } = {}) => {
    meta.kind = kind;
    meta.title = title;
    if (o.overlay !== undefined) meta.overlay = o.overlay;
  };

  const needApi = () => {
    if (!api) throw new ScriptError('As ordens só podem ser usadas dentro de onBar(i => …)');
    return api;
  };
  const strategyFn = declare('strategy') as ((title: string, o?: { overlay?: boolean }) => void) & Record<string, unknown>;
  Object.assign(strategyFn, {
    entry: (id: string, side: 'long' | 'short', o?: Record<string, unknown>) => needApi().entry(id, side, o),
    exit: (id: string, o: Record<string, number>) => needApi().exit(id, o),
    close: (id?: string, c?: string) => needApi().close(id, c),
    closeAll: (c?: string) => needApi().closeAll(c),
    cancel: (id: string) => needApi().cancel(id),
  });
  Object.defineProperty(strategyFn, 'position', { get: () => needApi().position });
  Object.defineProperty(strategyFn, 'equity', { get: () => needApi().equity });
  Object.defineProperty(strategyFn, 'balance', { get: () => needApi().balance });

  const at = (s: Series, i: number) => (i >= 0 && i < s.length ? s[i] : NaN);
  const env: Record<string, unknown> = {
    open,
    high,
    low,
    close,
    volume,
    time,
    hl2,
    hlc3,
    ohlc4,
    bar_count: n,
    input,
    ta,
    plot,
    plotshape,
    hline,
    strategy: strategyFn,
    indicator: declare('indicator'),
    onBar: (fn: (i: number) => void) => {
      onBarFn = fn;
    },
    nz: (v: number, d = 0) => (Number.isFinite(v) ? v : d),
    na: (v: number) => !Number.isFinite(v),
    log: (...args: unknown[]) => {
      if (logs.length < 500) logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    },
    indicatorValues: (type: string, params: Record<string, ParamValue> = {}) => indicatorValues(bars, type, params),
    highest: (s: Series, len: number, i: number) => Math.max(...Array.from({ length: len }, (_, k) => at(s, i - k)).filter(Number.isFinite)),
    lowest: (s: Series, len: number, i: number) => Math.min(...Array.from({ length: len }, (_, k) => at(s, i - k)).filter(Number.isFinite)),
    crossover: (a: Series, b: Series | number, i: number) => {
      const bi = typeof b === 'number' ? b : at(b, i);
      const bp = typeof b === 'number' ? b : at(b, i - 1);
      return at(a, i) > bi && at(a, i - 1) <= bp;
    },
    crossunder: (a: Series, b: Series | number, i: number) => {
      const bi = typeof b === 'number' ? b : at(b, i);
      const bp = typeof b === 'number' ? b : at(b, i - 1);
      return at(a, i) < bi && at(a, i - 1) >= bp;
    },
  };

  const names = Object.keys(env);
  let fn: (...args: unknown[]) => unknown;
  try {
    // 3 linhas de prelúdio: cabeçalho da função + "use strict"
    fn = new Function(...names, `"use strict";\n${code}`) as (...args: unknown[]) => unknown;
  } catch (e) {
    throw new ScriptError(`Erro de sintaxe: ${(e as Error).message}`, lineFromStack(e));
  }
  try {
    fn(...names.map((k) => env[k]));
  } catch (e) {
    if (e instanceof ScriptError) throw e;
    throw new ScriptError((e as Error)?.message ?? String(e), lineFromStack(e));
  }

  return {
    result: { meta, inputs, plots, shapes, hlines, logs },
    onBar: onBarFn,
    setApi: (a) => {
      api = a;
    },
  };
}

/** Corre um script (indicador ou estratégia). Se for estratégia e houver dados de backtest, corre o backtest. */
export function runScript(
  code: string,
  bars: readonly Bar[],
  opts: { overrides?: Record<string, ParamValue>; backtest?: Omit<BacktestInput, 'bars'> } = {},
): ScriptRunResult {
  const c = compile(code, bars, opts.overrides);
  if (c.result.meta.kind === 'strategy' && opts.backtest && c.onBar) {
    const program = scriptProgram(c);
    try {
      c.result.backtest = runBacktest(program, { ...opts.backtest, bars: bars as Bar[] });
    } catch (e) {
      if (e instanceof ScriptError) throw e;
      throw new ScriptError((e as Error)?.message ?? String(e), lineFromStack(e));
    }
  }
  return c.result;
}

function scriptProgram(c: Compiled): StrategyProgram {
  const onBar = c.onBar!;
  return {
    name: c.result.meta.title,
    onBar(i, api) {
      c.setApi(api);
      onBar(i);
    },
  };
}

/** Programa de estratégia a partir de um script (para o otimizador). */
export function scriptToProgram(code: string, bars: readonly Bar[], overrides?: Record<string, ParamValue>): { program: StrategyProgram | null; result: ScriptRunResult } {
  const c = compile(code, bars, overrides);
  return { program: c.onBar ? scriptProgram(c) : null, result: c.result };
}

export const SCRIPT_TEMPLATES: { name: string; code: string }[] = [
  {
    name: 'Estratégia: cruzamento EMA + filtro RSI',
    code: `// Estratégia de exemplo: compra no cruzamento de médias com RSI acima de 50.
strategy('Cruzamento EMA + RSI', { overlay: true });

const rapida = input.int('EMA rápida', 9, { min: 2, max: 100 });
const lenta = input.int('EMA lenta', 21, { min: 5, max: 300 });
const rsiLen = input.int('RSI', 14);
const atrMult = input.float('Stop (x ATR)', 1.5, { min: 0.5, max: 5, step: 0.25 });
const rr = input.float('Alvo (R)', 2, { min: 0.5, max: 6, step: 0.25 });

const f = ta.ema(close, rapida);
const s = ta.ema(close, lenta);
const rsi = ta.rsi(close, rsiLen);
const atr = ta.atr(14);

plot(f, { title: 'EMA rápida', color: '#2962ff' });
plot(s, { title: 'EMA lenta', color: '#ff6d00' });

onBar((i) => {
  const stop = atr[i] * atrMult;
  if (crossover(f, s, i) && rsi[i] > 50) {
    strategy.entry('Long', 'long', { slDist: stop, tpDist: stop * rr });
  }
  if (crossunder(f, s, i) && rsi[i] < 50) {
    strategy.entry('Short', 'short', { slDist: stop, tpDist: stop * rr });
  }
});
`,
  },
  {
    name: 'Estratégia: rompimento com trailing stop',
    code: `// Rompimento do máximo/mínimo de N barras com trailing stop de ATR.
strategy('Rompimento + trailing', { overlay: true });

const n = input.int('Barras do canal', 20, { min: 5, max: 200 });
const trailMult = input.float('Trailing (x ATR)', 3, { min: 1, max: 8, step: 0.5 });

const hh = ta.highest(high, n);
const ll = ta.lowest(low, n);
const atr = ta.atr(14);

plot(hh, { title: 'Máximo', color: '#089981', width: 1 });
plot(ll, { title: 'Mínimo', color: '#f23645', width: 1 });

onBar((i) => {
  if (close[i] > hh[i - 1]) strategy.entry('Long', 'long', { trail: atr[i] * trailMult });
  if (close[i] < ll[i - 1]) strategy.entry('Short', 'short', { trail: atr[i] * trailMult });
});
`,
  },
  {
    name: 'Indicador: bandas de médias e sinais',
    code: `// Indicador personalizado: canal de médias com setas de cruzamento.
indicator('Canal de médias', { overlay: true });

const len = input.int('Período', 34);
const mult = input.float('Largura (x ATR)', 1.5, { step: 0.1 });

const base = ta.ema(hlc3, len);
const atr = ta.atr(len);
const sup = base.map((v, i) => v + atr[i] * mult);
const inf = base.map((v, i) => v - atr[i] * mult);

plot(base, { title: 'Base', color: '#ff9800' });
plot(sup, { title: 'Superior', color: '#2962ff', width: 1 });
plot(inf, { title: 'Inferior', color: '#2962ff', width: 1 });

plotshape(ta.crossover(close, sup), { location: 'below', color: '#089981', text: 'Força' });
plotshape(ta.crossunder(close, inf), { location: 'above', color: '#f23645', text: 'Fraqueza' });
`,
  },
  {
    name: 'Indicador: RSI com divergências simples',
    code: `// Oscilador num painel separado.
indicator('RSI personalizado', { overlay: false });

const len = input.int('Período', 14);
const r = ta.rsi(close, len);
const media = ta.sma(r, 9);

plot(r, { title: 'RSI', color: '#7e57c2' });
plot(media, { title: 'Média', color: '#ffeb3b', width: 1 });
hline(70, { color: '#f23645' });
hline(30, { color: '#089981' });
`,
  },
];
