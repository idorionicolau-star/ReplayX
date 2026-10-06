/**
 * Timeframes ao estilo TradingView: "1m", "15m", "4h", "1D", "1W", "1M".
 * Todas as contas são feitas em segundos UTC.
 */
export type TfUnit = 's' | 'm' | 'h' | 'D' | 'W' | 'M';

export interface Timeframe {
  n: number;
  unit: TfUnit;
}

export const SECOND = 1;
export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;
export const WEEK = 7 * DAY;
/** 1970-01-05 foi segunda-feira: as semanas começam à segunda (como no TradingView). */
const WEEK_ORIGIN = 4 * DAY;

const UNIT_SECONDS: Record<Exclude<TfUnit, 'M'>, number> = {
  s: SECOND,
  m: MINUTE,
  h: HOUR,
  D: DAY,
  W: WEEK,
};

export const STANDARD_TFS = [
  '1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m',
  '1h', '2h', '3h', '4h', '6h', '8h', '12h',
  '1D', '1W', '1M',
] as const;

/** Intervalos em segundos (só em fontes que os têm: ver `DataFeed.supports`). */
export const SECOND_TFS = ['1s', '5s', '15s', '30s'] as const;

export const DEFAULT_FAVORITE_TFS = ['1m', '5m', '15m', '1h', '4h', '1D'];

export function parseTf(s: string): Timeframe {
  const m = /^(\d+)?\s*(s|m|h|D|W|M|d|w)$/.exec(s.trim());
  if (!m) throw new Error(`Timeframe inválido: ${s}`);
  const n = m[1] ? parseInt(m[1], 10) : 1;
  let unit = m[2] as TfUnit | 'd' | 'w';
  if (unit === 'd') unit = 'D';
  if (unit === 'w') unit = 'W';
  if (n <= 0) throw new Error(`Timeframe inválido: ${s}`);
  return { n, unit: unit as TfUnit };
}

export function isValidTf(s: string): boolean {
  try {
    parseTf(s);
    return true;
  } catch {
    return false;
  }
}

export function tfToString(tf: Timeframe): string {
  return `${tf.n}${tf.unit}`;
}

/** Normaliza (ex.: "60m" → "1h", "24h" → "1D"). */
export function normalizeTf(s: string): string {
  const tf = parseTf(s);
  if (tf.unit === 's' && tf.n % 60 === 0) return normalizeTf(`${tf.n / 60}m`);
  if (tf.unit === 'm' && tf.n % 60 === 0) return normalizeTf(`${tf.n / 60}h`);
  if (tf.unit === 'h' && tf.n % 24 === 0) return `${tf.n / 24}D`;
  return tfToString(tf);
}

export function isCalendarTf(tf: Timeframe): boolean {
  return tf.unit === 'M';
}

/** Duração aproximada em segundos (meses = 30 dias). Para alinhamento usa alignTime/nextBarTime. */
export function tfSeconds(tf: Timeframe | string): number {
  const t = typeof tf === 'string' ? parseTf(tf) : tf;
  if (t.unit === 'M') return t.n * 30 * DAY;
  return t.n * UNIT_SECONDS[t.unit];
}

function monthIndex(t: number): number {
  const d = new Date(t * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function monthIndexToTime(idx: number): number {
  const y = Math.floor(idx / 12);
  const m = idx - y * 12;
  return Date.UTC(y, m, 1) / 1000;
}

/** Abertura da barra do timeframe que contém o instante `t`. */
export function alignTime(t: number, tf: Timeframe | string): number {
  const x = typeof tf === 'string' ? parseTf(tf) : tf;
  if (x.unit === 'M') {
    const idx = monthIndex(t);
    return monthIndexToTime(Math.floor(idx / x.n) * x.n);
  }
  const d = x.n * UNIT_SECONDS[x.unit];
  if (x.unit === 'W') {
    return Math.floor((t - WEEK_ORIGIN) / d) * d + WEEK_ORIGIN;
  }
  return Math.floor(t / d) * d;
}

/** Abertura da barra seguinte (= fecho da barra que abre em `barTime`). */
export function nextBarTime(barTime: number, tf: Timeframe | string): number {
  const x = typeof tf === 'string' ? parseTf(tf) : tf;
  if (x.unit === 'M') {
    const idx = monthIndex(barTime);
    return monthIndexToTime(Math.floor(idx / x.n) * x.n + x.n);
  }
  return alignTime(barTime, x) + x.n * UNIT_SECONDS[x.unit];
}

/** Abertura da barra anterior. */
export function prevBarTime(barTime: number, tf: Timeframe | string): number {
  const x = typeof tf === 'string' ? parseTf(tf) : tf;
  if (x.unit === 'M') {
    const idx = monthIndex(barTime);
    return monthIndexToTime(Math.floor(idx / x.n) * x.n - x.n);
  }
  return alignTime(barTime, x) - x.n * UNIT_SECONDS[x.unit];
}

/** `small` encaixa um número inteiro de vezes em `big` e com alinhamento compatível. */
export function divides(small: Timeframe, big: Timeframe): boolean {
  if (small.unit === 'M') return big.unit === 'M' && big.n % small.n === 0;
  const s = tfSeconds(small);
  // meses e semanas abrem à meia-noite UTC: só servem fontes alinhadas ao dia
  if (big.unit === 'M') {
    if (small.unit === 'W') return false;
    return small.unit === 'D' ? small.n === 1 : DAY % s === 0;
  }
  if (big.unit === 'W') {
    if (small.unit === 'W') return big.n % small.n === 0;
    return small.unit === 'D' ? small.n === 1 : DAY % s === 0;
  }
  if (small.unit === 'W') return false;
  return tfSeconds(big) % s === 0;
}

export function compareTf(a: Timeframe | string, b: Timeframe | string): number {
  return tfSeconds(a) - tfSeconds(b);
}

export function tfLabel(s: string): string {
  const tf = parseTf(s);
  const plural = tf.n > 1;
  switch (tf.unit) {
    case 's':
      return `${tf.n} segundo${plural ? 's' : ''}`;
    case 'm':
      return `${tf.n} minuto${plural ? 's' : ''}`;
    case 'h':
      return `${tf.n} hora${plural ? 's' : ''}`;
    case 'D':
      return `${tf.n} dia${plural ? 's' : ''}`;
    case 'W':
      return `${tf.n} semana${plural ? 's' : ''}`;
    case 'M':
      return `${tf.n} ${plural ? 'meses' : 'mês'}`;
  }
}

/** Rótulo curto do botão: "1m", "4h", "D", "W", "M". */
export function tfShort(s: string): string {
  const tf = parseTf(s);
  if ((tf.unit === 'D' || tf.unit === 'W' || tf.unit === 'M') && tf.n === 1) return tf.unit;
  return `${tf.n}${tf.unit}`;
}

/** Quantas barras do timeframe `tf` cabem (aprox.) num período `seconds`. */
export function barsIn(seconds: number, tf: Timeframe | string): number {
  return Math.ceil(seconds / tfSeconds(tf));
}
