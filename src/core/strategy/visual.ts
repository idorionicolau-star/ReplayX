import type { Bar } from '../types';
import { getIndicator, defaultParams, type ParamValue } from '../indicators/registry';
import * as ta from '../indicators/ta';
import type { Source } from '../indicators/ta';
import type { StrategyProgram } from './types';

/** Estratégias construídas visualmente com blocos "SE … ENTÃO …". */

export interface VOperand {
  kind: 'price' | 'indicator' | 'value';
  field?: Source;
  ref?: string;
  output?: string;
  /** Barras para trás (0 = barra atual). */
  offset?: number;
  value?: number;
}

export type VOp = 'crossAbove' | 'crossBelow' | 'gt' | 'lt' | 'gte' | 'lte' | 'rising' | 'falling';

export const OP_LABEL: Record<VOp, string> = {
  crossAbove: 'cruza para cima',
  crossBelow: 'cruza para baixo',
  gt: 'é maior que',
  lt: 'é menor que',
  gte: 'é maior ou igual a',
  lte: 'é menor ou igual a',
  rising: 'está a subir há',
  falling: 'está a descer há',
};

export interface VCondition {
  id: string;
  left: VOperand;
  op: VOp;
  right: VOperand;
  /** Número de barras para "a subir/descer há". */
  bars?: number;
}

export interface VGroup {
  id: string;
  conditions: VCondition[];
}

/** Grupos ligados por OU; condições dentro de um grupo ligadas por E. */
export interface VRules {
  groups: VGroup[];
}

export interface VIndicator {
  key: string;
  type: string;
  params: Record<string, ParamValue>;
}

export interface VisualStrategy {
  id: string;
  name: string;
  description?: string;
  indicators: VIndicator[];
  long: { enabled: boolean; entry: VRules; exit: VRules };
  short: { enabled: boolean; entry: VRules; exit: VRules };
  exitOnOpposite: boolean;
  stopLoss: { type: 'none' | 'percent' | 'atr' | 'points' | 'swing'; value: number; atrLen: number; lookback: number };
  takeProfit: { type: 'none' | 'percent' | 'atr' | 'points' | 'rr'; value: number };
  trailing: { type: 'none' | 'percent' | 'atr' | 'points'; value: number };
  maxBarsInTrade: number;
  session: { enabled: boolean; startHour: number; endHour: number; days: number[] };
  updatedAt?: number;
}

let uidCounter = 0;
export const vid = () => `v${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

export const ind = (ref: string, output: string, offset = 0): VOperand => ({ kind: 'indicator', ref, output, offset });
export const price = (field: Source = 'close', offset = 0): VOperand => ({ kind: 'price', field, offset });
export const val = (value: number): VOperand => ({ kind: 'value', value });

export function cond(left: VOperand, op: VOp, right: VOperand, bars?: number): VCondition {
  return { id: vid(), left, op, right, bars };
}

export function rules(...groups: VCondition[][]): VRules {
  return { groups: groups.map((c) => ({ id: vid(), conditions: c })) };
}

export function emptyStrategy(name = 'Nova estratégia'): VisualStrategy {
  return {
    id: vid(),
    name,
    indicators: [],
    long: { enabled: true, entry: rules([]), exit: rules() },
    short: { enabled: true, entry: rules([]), exit: rules() },
    exitOnOpposite: true,
    stopLoss: { type: 'atr', value: 1.5, atrLen: 14, lookback: 10 },
    takeProfit: { type: 'rr', value: 2 },
    trailing: { type: 'none', value: 2 },
    maxBarsInTrade: 0,
    session: { enabled: false, startHour: 7, endHour: 20, days: [1, 2, 3, 4, 5] },
  };
}

function withIndicators(s: VisualStrategy, list: [string, string, Record<string, ParamValue>?][]): VisualStrategy {
  s.indicators = list.map(([key, type, params]) => {
    const def = getIndicator(type);
    return { key, type, params: { ...(def ? defaultParams(def) : {}), ...(params ?? {}) } };
  });
  return s;
}

export function templates(): VisualStrategy[] {
  const a = withIndicators({ ...emptyStrategy('Cruzamento EMA 9/21') }, [
    ['A', 'ema', { length: 9 }],
    ['B', 'ema', { length: 21 }],
  ]);
  a.description = 'Compra quando a EMA rápida cruza acima da lenta; vende no cruzamento inverso.';
  a.long.entry = rules([cond(ind('A', 'ma'), 'crossAbove', ind('B', 'ma'))]);
  a.short.entry = rules([cond(ind('A', 'ma'), 'crossBelow', ind('B', 'ma'))]);

  const b = withIndicators({ ...emptyStrategy('RSI reversão 30/70') }, [
    ['A', 'rsi', { length: 14 }],
    ['B', 'ema', { length: 200 }],
  ]);
  b.description = 'Compra quando o RSI sai da sobrevenda acima da EMA 200; vende ao sair da sobrecompra abaixo dela.';
  b.long.entry = rules([cond(ind('A', 'rsi'), 'crossAbove', val(30)), cond(price('close'), 'gt', ind('B', 'ma'))]);
  b.short.entry = rules([cond(ind('A', 'rsi'), 'crossBelow', val(70)), cond(price('close'), 'lt', ind('B', 'ma'))]);
  b.stopLoss = { type: 'atr', value: 2, atrLen: 14, lookback: 10 };
  b.takeProfit = { type: 'rr', value: 1.5 };

  const c = withIndicators({ ...emptyStrategy('Rompimento Donchian (Turtle)') }, [['A', 'donchian', { length: 20 }]]);
  c.description = 'Entra no rompimento do máximo/mínimo de 20 barras, com trailing stop de ATR.';
  c.long.entry = rules([cond(price('close'), 'gt', ind('A', 'upper', 1))]);
  c.short.entry = rules([cond(price('close'), 'lt', ind('A', 'lower', 1))]);
  c.stopLoss = { type: 'atr', value: 2, atrLen: 20, lookback: 10 };
  c.takeProfit = { type: 'none', value: 2 };
  c.trailing = { type: 'atr', value: 3 };

  const d = withIndicators({ ...emptyStrategy('Bollinger reversão à média') }, [['A', 'bb', { length: 20, mult: 2 }]]);
  d.description = 'Compra quando o preço volta para dentro da banda inferior; sai na média.';
  d.long.entry = rules([cond(price('close'), 'crossAbove', ind('A', 'lower'))]);
  d.long.exit = rules([cond(price('close'), 'gte', ind('A', 'basis'))]);
  d.short.entry = rules([cond(price('close'), 'crossBelow', ind('A', 'upper'))]);
  d.short.exit = rules([cond(price('close'), 'lte', ind('A', 'basis'))]);
  d.exitOnOpposite = true;
  d.takeProfit = { type: 'none', value: 2 };

  const e = withIndicators({ ...emptyStrategy('MACD com filtro de tendência') }, [
    ['A', 'macd', {}],
    ['B', 'ema', { length: 200 }],
  ]);
  e.description = 'Cruzamentos do MACD apenas a favor da EMA 200.';
  e.long.entry = rules([cond(ind('A', 'macd'), 'crossAbove', ind('A', 'signal')), cond(price('close'), 'gt', ind('B', 'ma'))]);
  e.short.entry = rules([cond(ind('A', 'macd'), 'crossBelow', ind('A', 'signal')), cond(price('close'), 'lt', ind('B', 'ma'))]);

  const f = withIndicators({ ...emptyStrategy('Supertrend') }, [['A', 'supertrend', { length: 10, mult: 3 }]]);
  f.description = 'Segue a tendência: compra quando o preço passa acima do Supertrend.';
  f.long.entry = rules([cond(price('close'), 'crossAbove', ind('A', 'line'))]);
  f.short.entry = rules([cond(price('close'), 'crossBelow', ind('A', 'line'))]);
  f.stopLoss = { type: 'none', value: 1.5, atrLen: 14, lookback: 10 };
  f.takeProfit = { type: 'none', value: 2 };

  return [a, b, c, d, e, f];
}

// ---------------- avaliação ----------------

interface Compiled {
  series: (o: VOperand) => number[];
  atr: number[];
}

function prepare(s: VisualStrategy, bars: readonly Bar[]): Compiled {
  const cache = new Map<string, Record<string, number[]>>();
  for (const vi of s.indicators) {
    const def = getIndicator(vi.type);
    if (!def) continue;
    const params = { ...defaultParams(def), ...vi.params };
    cache.set(vi.key, def.compute(bars, params).values);
  }
  const priceCache = new Map<string, number[]>();
  const n = bars.length;
  return {
    atr: ta.atr(bars, Math.max(1, s.stopLoss.atrLen || 14)),
    series(o: VOperand): number[] {
      if (o.kind === 'value') return new Array(n).fill(o.value ?? 0);
      if (o.kind === 'price') {
        const f = o.field ?? 'close';
        let arr = priceCache.get(f);
        if (!arr) {
          arr = ta.source(bars, f);
          priceCache.set(f, arr);
        }
        return arr;
      }
      const vals = cache.get(o.ref ?? '');
      const arr = vals?.[o.output ?? ''] ?? Object.values(vals ?? {})[0];
      return arr ?? new Array(n).fill(NaN);
    },
  };
}

function at(arr: number[], i: number, offset = 0): number {
  const k = i - offset;
  return k >= 0 && k < arr.length ? arr[k] : NaN;
}

export function evalCondition(c: VCondition, i: number, comp: Compiled): boolean {
  const L = comp.series(c.left);
  const R = comp.series(c.right);
  const lo = c.left.offset ?? 0;
  const ro = c.right.offset ?? 0;
  const l = at(L, i, lo);
  const r = at(R, i, ro);
  switch (c.op) {
    case 'crossAbove': {
      const lp = at(L, i - 1, lo);
      const rp = at(R, i - 1, ro);
      return l > r && lp <= rp;
    }
    case 'crossBelow': {
      const lp = at(L, i - 1, lo);
      const rp = at(R, i - 1, ro);
      return l < r && lp >= rp;
    }
    case 'gt':
      return l > r;
    case 'lt':
      return l < r;
    case 'gte':
      return l >= r;
    case 'lte':
      return l <= r;
    case 'rising':
    case 'falling': {
      const k = Math.max(1, c.bars ?? 1);
      for (let j = 0; j < k; j++) {
        const a = at(L, i - j, lo);
        const b = at(L, i - j - 1, lo);
        if (!(c.op === 'rising' ? a > b : a < b)) return false;
      }
      return true;
    }
  }
}

export function evalRules(r: VRules, i: number, comp: Compiled): boolean {
  for (const g of r.groups) {
    if (!g.conditions.length) continue;
    if (g.conditions.every((c) => evalCondition(c, i, comp))) return true;
  }
  return false;
}

export function compileVisual(s: VisualStrategy, bars: readonly Bar[]): StrategyProgram {
  const comp = prepare(s, bars);
  const closes = bars.map((b) => b.close);
  const lows = bars.map((b) => b.low);
  const highs = bars.map((b) => b.high);
  const hasRules = (r: VRules) => r.groups.some((g) => g.conditions.length);

  const stopFor = (side: 'long' | 'short', i: number): { slDist?: number; sl?: number } => {
    const sl = s.stopLoss;
    const c = closes[i];
    switch (sl.type) {
      case 'percent':
        return { slDist: (c * sl.value) / 100 };
      case 'atr':
        return Number.isFinite(comp.atr[i]) ? { slDist: comp.atr[i] * sl.value } : {};
      case 'points':
        return { slDist: sl.value };
      case 'swing': {
        const lb = Math.max(1, Math.floor(sl.lookback || 10));
        let ext = side === 'long' ? Infinity : -Infinity;
        for (let j = Math.max(0, i - lb + 1); j <= i; j++) ext = side === 'long' ? Math.min(ext, lows[j]) : Math.max(ext, highs[j]);
        return Number.isFinite(ext) ? { sl: ext } : {};
      }
      default:
        return {};
    }
  };

  const targetFor = (i: number, stop: { slDist?: number; sl?: number }): { tpDist?: number } => {
    const tp = s.takeProfit;
    const c = closes[i];
    switch (tp.type) {
      case 'percent':
        return { tpDist: (c * tp.value) / 100 };
      case 'atr':
        return Number.isFinite(comp.atr[i]) ? { tpDist: comp.atr[i] * tp.value } : {};
      case 'points':
        return { tpDist: tp.value };
      case 'rr': {
        const dist = stop.slDist ?? (stop.sl !== undefined ? Math.abs(c - stop.sl) : undefined);
        return dist ? { tpDist: dist * tp.value } : {};
      }
      default:
        return {};
    }
  };

  const trailFor = (i: number): number | undefined => {
    const t = s.trailing;
    if (t.type === 'percent') return (closes[i] * t.value) / 100;
    if (t.type === 'atr') return Number.isFinite(comp.atr[i]) ? comp.atr[i] * t.value : undefined;
    if (t.type === 'points') return t.value;
    return undefined;
  };

  const sessionOk = (i: number) => {
    if (!s.session.enabled) return true;
    const d = new Date(bars[i].time * 1000);
    const h = d.getUTCHours();
    const inHours = s.session.startHour <= s.session.endHour ? h >= s.session.startHour && h < s.session.endHour : h >= s.session.startHour || h < s.session.endHour;
    return inHours && s.session.days.includes(d.getUTCDay());
  };

  return {
    name: s.name,
    onBar(i, api) {
      const pos = api.position;
      const longSig = s.long.enabled && evalRules(s.long.entry, i, comp);
      const shortSig = s.short.enabled && evalRules(s.short.entry, i, comp);
      if (pos.side === 'long') {
        const oppositeRaw = s.exitOnOpposite && evalRules(s.short.entry, i, comp);
        if ((hasRules(s.long.exit) && evalRules(s.long.exit, i, comp)) || (oppositeRaw && !shortSig) || (s.maxBarsInTrade > 0 && pos.barsInTrade >= s.maxBarsInTrade)) {
          api.close();
          return;
        }
      } else if (pos.side === 'short') {
        const oppositeRaw = s.exitOnOpposite && evalRules(s.long.entry, i, comp);
        if ((hasRules(s.short.exit) && evalRules(s.short.exit, i, comp)) || (oppositeRaw && !longSig) || (s.maxBarsInTrade > 0 && pos.barsInTrade >= s.maxBarsInTrade)) {
          api.close();
          return;
        }
      }
      if (!sessionOk(i)) return;
      if (longSig && pos.side !== 'long') {
        const stop = stopFor('long', i);
        api.entry('Long', 'long', { ...stop, ...targetFor(i, stop), trail: trailFor(i) });
      } else if (shortSig && pos.side !== 'short') {
        const stop = stopFor('short', i);
        api.entry('Short', 'short', { ...stop, ...targetFor(i, stop), trail: trailFor(i) });
      }
    },
  };
}

// ---------------- parâmetros otimizáveis ----------------

export interface ParamSpec {
  path: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer: boolean;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj);
  const keys = path.split('.');
  let o = copy as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
  return copy;
}

function operandLabel(o: VOperand, s: VisualStrategy): string {
  if (o.kind === 'value') return String(o.value);
  if (o.kind === 'price') return o.field ?? 'close';
  const vi = s.indicators.find((x) => x.key === o.ref);
  const def = vi ? getIndicator(vi.type) : undefined;
  return `${o.ref}:${def?.short ?? vi?.type ?? '?'}.${o.output}`;
}

export function listParams(s: VisualStrategy): ParamSpec[] {
  const out: ParamSpec[] = [];
  s.indicators.forEach((vi, k) => {
    const def = getIndicator(vi.type);
    def?.inputs.forEach((inp) => {
      if (inp.type !== 'int' && inp.type !== 'float') return;
      const v = Number(vi.params[inp.key] ?? inp.default);
      const integer = inp.type === 'int';
      out.push({
        path: `indicators.${k}.params.${inp.key}`,
        label: `${vi.key} ${def.short} · ${inp.label}`,
        value: v,
        min: integer ? Math.max(inp.min ?? 1, Math.round(v / 2)) : Math.max(inp.min ?? 0, +(v / 2).toFixed(3)),
        max: integer ? Math.min(inp.max ?? 500, Math.round(v * 2)) : +(v * 2).toFixed(3),
        step: integer ? Math.max(1, Math.round(v / 10)) : inp.step ?? 0.1,
        integer,
      });
    });
  });
  if (s.stopLoss.type !== 'none' && s.stopLoss.type !== 'swing')
    out.push({ path: 'stopLoss.value', label: 'Stop loss', value: s.stopLoss.value, min: +(s.stopLoss.value / 2).toFixed(3), max: +(s.stopLoss.value * 2).toFixed(3), step: s.stopLoss.type === 'points' ? Math.max(0.0001, +(s.stopLoss.value / 10).toPrecision(2)) : 0.25, integer: false });
  if (s.stopLoss.type === 'swing') out.push({ path: 'stopLoss.lookback', label: 'Stop: barras do swing', value: s.stopLoss.lookback, min: 3, max: 40, step: 1, integer: true });
  if (s.takeProfit.type !== 'none')
    out.push({ path: 'takeProfit.value', label: 'Take profit', value: s.takeProfit.value, min: +(s.takeProfit.value / 2).toFixed(3), max: +(s.takeProfit.value * 2).toFixed(3), step: 0.25, integer: false });
  if (s.trailing.type !== 'none')
    out.push({ path: 'trailing.value', label: 'Trailing stop', value: s.trailing.value, min: +(s.trailing.value / 2).toFixed(3), max: +(s.trailing.value * 2).toFixed(3), step: 0.25, integer: false });
  if (s.maxBarsInTrade > 0) out.push({ path: 'maxBarsInTrade', label: 'Máx. barras na operação', value: s.maxBarsInTrade, min: Math.max(1, Math.round(s.maxBarsInTrade / 2)), max: s.maxBarsInTrade * 2, step: 1, integer: true });
  (['long', 'short'] as const).forEach((side) =>
    (['entry', 'exit'] as const).forEach((kind) =>
      s[side][kind].groups.forEach((g, gi) =>
        g.conditions.forEach((c, ci) => {
          (['left', 'right'] as const).forEach((lr) => {
            const o = c[lr];
            if (o.kind !== 'value' || o.value === undefined) return;
            const v = o.value;
            out.push({
              path: `${side}.${kind}.groups.${gi}.conditions.${ci}.${lr}.value`,
              label: `${side === 'long' ? 'Compra' : 'Venda'} ${kind === 'entry' ? 'entrada' : 'saída'}: ${operandLabel(c.left, s)} ${OP_LABEL[c.op]} ${v}`,
              value: v,
              min: v === 0 ? -10 : +(v * 0.7).toFixed(4),
              max: v === 0 ? 10 : +(v * 1.3).toFixed(4),
              step: Math.abs(v) >= 10 ? 1 : 0.1,
              integer: Number.isInteger(v) && Math.abs(v) >= 10,
            });
          });
        }),
      ),
    ),
  );
  return out;
}

// ---------------- exportar para script ----------------

export function toScript(s: VisualStrategy): string {
  const lines: string[] = [];
  lines.push(`// Gerado a partir da estratégia visual "${s.name}"`);
  lines.push(`strategy(${JSON.stringify(s.name)}, { overlay: true });`, '');
  const varName = (o: VOperand): string => {
    if (o.kind === 'value') return String(o.value);
    if (o.kind === 'price') return o.field ?? 'close';
    return `${o.ref}_${o.output}`;
  };
  const used = new Set<string>();
  const collect = (r: VRules) => r.groups.forEach((g) => g.conditions.forEach((c) => [c.left, c.right].forEach((o) => o.kind === 'indicator' && used.add(`${o.ref}|${o.output}`))));
  collect(s.long.entry);
  collect(s.long.exit);
  collect(s.short.entry);
  collect(s.short.exit);
  for (const vi of s.indicators) {
    const def = getIndicator(vi.type);
    if (!def) continue;
    lines.push(`const ${vi.key} = indicatorValues(${JSON.stringify(vi.type)}, ${JSON.stringify(vi.params)});`);
    for (const o of def.outputs) if (used.has(`${vi.key}|${o.key}`)) lines.push(`const ${vi.key}_${o.key} = ${vi.key}.${o.key};`);
  }
  lines.push(`const atr = ta.atr(${s.stopLoss.atrLen || 14});`, '');
  const at = (o: VOperand, back = 0) => {
    const off = (o.offset ?? 0) + back;
    if (o.kind === 'value') return String(o.value);
    return `${varName(o)}[i${off ? ` - ${off}` : ''}]`;
  };
  const condJs = (c: VCondition): string => {
    switch (c.op) {
      case 'crossAbove':
        return `(${at(c.left)} > ${at(c.right)} && ${at(c.left, 1)} <= ${at(c.right, 1)})`;
      case 'crossBelow':
        return `(${at(c.left)} < ${at(c.right)} && ${at(c.left, 1)} >= ${at(c.right, 1)})`;
      case 'gt':
        return `${at(c.left)} > ${at(c.right)}`;
      case 'lt':
        return `${at(c.left)} < ${at(c.right)}`;
      case 'gte':
        return `${at(c.left)} >= ${at(c.right)}`;
      case 'lte':
        return `${at(c.left)} <= ${at(c.right)}`;
      case 'rising':
      case 'falling': {
        const k = Math.max(1, c.bars ?? 1);
        const parts = Array.from({ length: k }, (_, j) => `${at(c.left, j)} ${c.op === 'rising' ? '>' : '<'} ${at(c.left, j + 1)}`);
        return `(${parts.join(' && ')})`;
      }
    }
  };
  const rulesJs = (r: VRules) => {
    const gs = r.groups.filter((g) => g.conditions.length).map((g) => `(${g.conditions.map(condJs).join(' && ')})`);
    return gs.length ? gs.join(' || ') : 'false';
  };
  const slJs = (side: 'long' | 'short') => {
    switch (s.stopLoss.type) {
      case 'percent':
        return `slDist: close[i] * ${s.stopLoss.value / 100}`;
      case 'atr':
        return `slDist: atr[i] * ${s.stopLoss.value}`;
      case 'points':
        return `slDist: ${s.stopLoss.value}`;
      case 'swing':
        return `sl: ${side === 'long' ? 'lowest(low' : 'highest(high'}, ${s.stopLoss.lookback}, i)`;
      default:
        return '';
    }
  };
  const tpJs = () => {
    switch (s.takeProfit.type) {
      case 'percent':
        return `tpDist: close[i] * ${s.takeProfit.value / 100}`;
      case 'atr':
        return `tpDist: atr[i] * ${s.takeProfit.value}`;
      case 'points':
        return `tpDist: ${s.takeProfit.value}`;
      case 'rr':
        return s.stopLoss.type === 'none' ? '' : s.stopLoss.type === 'swing' ? '' : `tpDist: (${slJs('long').split(': ')[1]}) * ${s.takeProfit.value}`;
      default:
        return '';
    }
  };
  const opts = (side: 'long' | 'short') => {
    const parts = [slJs(side), tpJs()].filter(Boolean);
    if (s.trailing.type === 'atr') parts.push(`trail: atr[i] * ${s.trailing.value}`);
    if (s.trailing.type === 'percent') parts.push(`trail: close[i] * ${s.trailing.value / 100}`);
    if (s.trailing.type === 'points') parts.push(`trail: ${s.trailing.value}`);
    return parts.length ? `, { ${parts.join(', ')} }` : '';
  };
  lines.push('onBar((i) => {');
  lines.push('  const pos = strategy.position;');
  if (s.long.enabled) lines.push(`  const longSignal = ${rulesJs(s.long.entry)};`);
  else lines.push('  const longSignal = false;');
  if (s.short.enabled) lines.push(`  const shortSignal = ${rulesJs(s.short.entry)};`);
  else lines.push('  const shortSignal = false;');
  lines.push(`  if (pos.side === 'long' && (${rulesJs(s.long.exit)})) { strategy.close(); return; }`);
  lines.push(`  if (pos.side === 'short' && (${rulesJs(s.short.exit)})) { strategy.close(); return; }`);
  if (s.maxBarsInTrade > 0) lines.push(`  if (pos.side && pos.barsInTrade >= ${s.maxBarsInTrade}) { strategy.close(); return; }`);
  lines.push(`  if (longSignal && pos.side !== 'long') strategy.entry('Long', 'long'${opts('long')});`);
  lines.push(`  else if (shortSignal && pos.side !== 'short') strategy.entry('Short', 'short'${opts('short')});`);
  lines.push('});');
  return lines.join('\n');
}

export function describeOperand(o: VOperand, s: VisualStrategy): string {
  const base = operandLabel(o, s);
  return o.offset ? `${base}[${o.offset}]` : base;
}

/** Valores de um indicador embutido (usado também pelos scripts). */
export function indicatorValues(bars: readonly Bar[], type: string, params: Record<string, ParamValue>): Record<string, number[]> {
  const def = getIndicator(type);
  if (!def) throw new Error(`Indicador desconhecido: ${type}`);
  return def.compute(bars, { ...defaultParams(def), ...params }).values;
}
