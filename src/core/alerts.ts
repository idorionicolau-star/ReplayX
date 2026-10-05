/**
 * Alertas ao estilo TradingView (parte pura, testável).
 * Um alerta compara uma FONTE (preço ou um indicador) com um ALVO (valor, intervalo de valores, desenho,
 * indicador ou o preço) através de uma CONDIÇÃO, e dispara com uma FREQUÊNCIA.
 */
import type { Bar, PricePoint } from './types';
import type { ParamValue } from './indicators/registry';
import { getIndicator } from './indicators/registry';

export interface IndicatorRef {
  type: string;
  params: Record<string, ParamValue>;
  output: string;
  /** Texto para mostrar, ex.: "RSI 14 · RSI". */
  label: string;
}

export type AlertSource = { kind: 'price' } | ({ kind: 'indicator' } & IndicatorRef);

export type AlertTarget =
  | { kind: 'value'; value: number }
  | { kind: 'range'; low: number; high: number }
  | { kind: 'drawing'; drawingId: string; label: string }
  | ({ kind: 'indicator' } & IndicatorRef)
  | { kind: 'price' };

export type AlertCondition = 'cross' | 'crossUp' | 'crossDown' | 'greater' | 'less' | 'enter' | 'exit' | 'inside' | 'outside';
export type AlertTrigger = 'once' | 'perBar' | 'perBarClose' | 'every';

export interface AlertNotify {
  /** Janela no ecrã até ser fechada. */
  popup: boolean;
  sound: boolean;
  /** Notificação do sistema / telemóvel. */
  push: boolean;
}

export interface Alert {
  id: string;
  name: string;
  symbolId: string;
  /** Intervalo usado pelos indicadores e pela frequência "por barra". */
  tf: string;
  source: AlertSource;
  condition: AlertCondition;
  target: AlertTarget;
  trigger: AlertTrigger;
  /** Fim da validade (segundos) ou null. */
  expiresAt: number | null;
  message: string;
  notify: AlertNotify;
  active: boolean;
  createdAt: number;
  triggeredAt?: number;
  /** Vezes que disparou. */
  count?: number;
  /** Barra (início, s) em que disparou pela última vez — para "uma vez por barra". */
  lastBar?: number;
  /** Porque parou (expirou, desenho apagado…). */
  stopped?: string;
}

export const CONDITION_LABEL: Record<AlertCondition, string> = {
  cross: 'Cruza',
  crossUp: 'Cruza para cima',
  crossDown: 'Cruza para baixo',
  greater: 'Maior que',
  less: 'Menor que',
  enter: 'Entra no canal',
  exit: 'Sai do canal',
  inside: 'Dentro do canal',
  outside: 'Fora do canal',
};

export const TRIGGER_LABEL: Record<AlertTrigger, string> = {
  once: 'Só uma vez',
  perBar: 'Uma vez por barra',
  perBarClose: 'Uma vez por barra, no fecho',
  every: 'Sempre que acontecer',
};

export const LINE_CONDITIONS: AlertCondition[] = ['cross', 'crossUp', 'crossDown', 'greater', 'less'];
export const CHANNEL_CONDITIONS: AlertCondition[] = ['enter', 'exit', 'inside', 'outside'];

/** Desenhos que servem de alvo: linhas (um valor) e canais/retângulos (dois valores). */
export const LINE_DRAWINGS = new Set(['trendline', 'ray', 'extended', 'infoline', 'arrowline', 'hline', 'hray']);
export const CHANNEL_DRAWINGS = new Set(['channel', 'rect']);

export function isChannelTarget(t: AlertTarget, drawingType?: string): boolean {
  return t.kind === 'range' || (t.kind === 'drawing' && !!drawingType && CHANNEL_DRAWINGS.has(drawingType));
}

export const DEFAULT_NOTIFY: AlertNotify = { popup: true, sound: true, push: true };

/** Valores num instante: `l` (fonte) e `r` (alvo de uma linha) ou `lo`/`hi` (canal). */
export interface Sample {
  l: number;
  r?: number;
  lo?: number;
  hi?: number;
}

/** A condição cumpre-se entre a amostra anterior e a atual? */
export function check(cond: AlertCondition, prev: Sample | undefined, now: Sample): boolean {
  if (!Number.isFinite(now.l)) return false;
  if (CHANNEL_CONDITIONS.includes(cond)) {
    if (now.lo === undefined || now.hi === undefined) return false;
    const lo = Math.min(now.lo, now.hi);
    const hi = Math.max(now.lo, now.hi);
    const inNow = now.l >= lo && now.l <= hi;
    if (cond === 'inside') return inNow;
    if (cond === 'outside') return !inNow;
    if (!prev || prev.lo === undefined || prev.hi === undefined || !Number.isFinite(prev.l)) return false;
    const inPrev = prev.l >= Math.min(prev.lo, prev.hi) && prev.l <= Math.max(prev.lo, prev.hi);
    return cond === 'enter' ? !inPrev && inNow : inPrev && !inNow;
  }
  if (now.r === undefined || !Number.isFinite(now.r)) return false;
  if (cond === 'greater') return now.l > now.r;
  if (cond === 'less') return now.l < now.r;
  if (!prev || prev.r === undefined || !Number.isFinite(prev.l) || !Number.isFinite(prev.r)) return false;
  // cruzar = a diferença muda de sinal (o alvo também se pode mexer: linha inclinada, média…)
  const d0 = prev.l - prev.r;
  const d1 = now.l - now.r;
  const up = d0 < 0 && d1 >= 0;
  const down = d0 > 0 && d1 <= 0;
  if (cond === 'crossUp') return up;
  if (cond === 'crossDown') return down;
  return up || down;
}

/** Pode disparar agora, dada a frequência? `bar` = início da barra atual (s). */
export function allowedByTrigger(a: Pick<Alert, 'trigger' | 'lastBar'>, bar: number): boolean {
  if (a.trigger === 'perBar' || a.trigger === 'perBarClose') return a.lastBar !== bar;
  return true;
}

/** Desenho mínimo para calcular o seu valor. */
export interface DrawingLike {
  type: string;
  points: PricePoint[];
  style: { extendLeft?: boolean; extendRight?: boolean };
}

/** Converte tempo em posição (índice de barra); por omissão o próprio tempo. */
export type TimeToPos = (t: number) => number | null;

function lineAt(a: PricePoint, b: PricePoint, t: number, pos: TimeToPos, left: boolean, right: boolean): number | undefined {
  const pa = pos(a.time);
  const pb = pos(b.time);
  const pt = pos(t);
  if (pa === null || pb === null || pt === null) return undefined;
  const lo = Math.min(pa, pb);
  const hi = Math.max(pa, pb);
  if ((pt < lo && !left) || (pt > hi && !right)) return undefined;
  if (pa === pb) return undefined;
  return a.price + ((b.price - a.price) * (pt - pa)) / (pb - pa);
}

/** Valor de um desenho no instante `t`: linha → `r`; canal/retângulo → `lo`/`hi`. undefined = fora do alcance. */
export function drawingValue(d: DrawingLike, t: number, pos: TimeToPos = (x) => x): { r?: number; lo?: number; hi?: number } | undefined {
  const [a, b, c] = d.points;
  if (!a) return undefined;
  switch (d.type) {
    case 'hline':
      return { r: a.price };
    case 'hray':
      return t >= a.time ? { r: a.price } : undefined;
    case 'trendline':
    case 'infoline':
    case 'arrowline':
    case 'ray':
    case 'extended': {
      if (!b) return undefined;
      // a direção do raio é a de a→b
      const forward = b.time >= a.time;
      const left = d.type === 'extended' || !!d.style.extendLeft || (d.type === 'ray' && !forward);
      const right = d.type === 'extended' || !!d.style.extendRight || (d.type === 'ray' && forward);
      const r = lineAt(a, b, t, pos, left, right);
      return r === undefined ? undefined : { r };
    }
    case 'channel': {
      if (!b || !c) return undefined;
      const left = !!d.style.extendLeft;
      const right = !!d.style.extendRight;
      const base = lineAt(a, b, t, pos, left, right);
      const atC = lineAt(a, b, c.time, pos, true, true);
      if (base === undefined || atC === undefined) return undefined;
      const off = c.price - atC;
      return { lo: Math.min(base, base + off), hi: Math.max(base, base + off) };
    }
    case 'rect': {
      if (!b) return undefined;
      const t0 = Math.min(a.time, b.time);
      const t1 = Math.max(a.time, b.time);
      if (t < t0 || (t > t1 && !d.style.extendRight)) return undefined;
      return { lo: Math.min(a.price, b.price), hi: Math.max(a.price, b.price) };
    }
    default:
      return undefined;
  }
}

/** Valor de um indicador na barra `index` (por omissão a última). */
export function indicatorValue(ref: IndicatorRef, bars: readonly Bar[], index = bars.length - 1): number | undefined {
  const def = getIndicator(ref.type);
  if (!def || index < 0 || index >= bars.length) return undefined;
  try {
    const res = def.compute(bars.slice(0, index + 1), ref.params);
    const s = res.values[ref.output];
    const v = s?.[index];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Precisa de barras (indicador ou fecho de barra)? */
export function needsBars(a: Pick<Alert, 'source' | 'target' | 'trigger'>): boolean {
  return a.source.kind === 'indicator' || a.target.kind === 'indicator' || a.trigger === 'perBarClose';
}

/** Descrição curta: "EURUSD Cruza para cima 1.0850". */
export function describe(a: Alert, fmt: (v: number) => string, symbolName: string, drawingLabel?: string): string {
  const src = a.source.kind === 'price' ? symbolName : `${a.source.label} (${symbolName})`;
  let tgt: string;
  switch (a.target.kind) {
    case 'value':
      tgt = fmt(a.target.value);
      break;
    case 'range':
      tgt = `${fmt(a.target.low)} – ${fmt(a.target.high)}`;
      break;
    case 'drawing':
      tgt = drawingLabel ?? a.target.label;
      break;
    case 'indicator':
      tgt = a.target.label;
      break;
    default:
      tgt = 'Preço';
  }
  return `${src} ${CONDITION_LABEL[a.condition].toLowerCase()} ${tgt}`;
}

/** Substitui {{ticker}}, {{close}}, {{value}}, {{time}}, {{interval}} na mensagem. */
export function fillMessage(tpl: string, v: { ticker: string; close: string; value: string; time: string; interval: string }): string {
  return tpl.replace(/\{\{\s*(ticker|close|value|time|interval)\s*\}\}/gi, (_, k: string) => v[k.toLowerCase() as keyof typeof v]);
}

/** Alertas da versão 1 (só preço) → modelo atual. */
export function migrateV1(old: { id: string; symbolId: string; price: number; condition: string; message: string; active: boolean; once: boolean; createdAt: number; triggeredAt?: number }): Alert {
  const cond = (['cross', 'crossUp', 'crossDown'].includes(old.condition) ? old.condition : 'cross') as AlertCondition;
  return {
    id: old.id,
    name: '',
    symbolId: old.symbolId,
    tf: '1m',
    source: { kind: 'price' },
    condition: cond,
    target: { kind: 'value', value: old.price },
    trigger: old.once ? 'once' : 'every',
    expiresAt: null,
    message: old.message ?? '',
    notify: { ...DEFAULT_NOTIFY },
    active: old.active,
    createdAt: old.createdAt,
    triggeredAt: old.triggeredAt,
  };
}
