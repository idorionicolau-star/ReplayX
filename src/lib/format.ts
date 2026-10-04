/** Formatação em português (pt-PT / Moçambique). */

export function fmtPrice(v: number | undefined | null, precision = 2): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(Math.max(0, Math.min(10, precision)));
}

const money = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function fmtMoney(v: number | undefined | null, currency = 'USD'): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const s = money.format(Math.abs(v));
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'MZN' ? 'MT ' : `${currency} `;
  return `${v < 0 ? '-' : ''}${sym}${s}`;
}

export function fmtSigned(v: number | undefined | null, digits = 2, suffix = ''): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}${suffix}`;
}

export function fmtPct(v: number | undefined | null, digits = 2): string {
  return fmtSigned(v, digits, '%');
}

const compact = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 2 });
export function fmtCompact(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return compact.format(v);
}

export function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null) return '—';
  if (v === Infinity) return '∞';
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Fuso horário escolhido nas definições ('local' = do navegador). */
export function tzName(tz: string): string | undefined {
  return tz === 'local' ? undefined : tz;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, opts: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const k = `${tz}|${key}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('pt-PT', { ...opts, timeZone: tzName(tz), hourCycle: 'h23' });
    fmtCache.set(k, f);
  }
  return f;
}

export function fmtDateTime(sec: number, tz = 'local', withSeconds = false): string {
  if (!Number.isFinite(sec)) return '—';
  return dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }, withSeconds ? 'dts' : 'dt').format(new Date(sec * 1000));
}

export function fmtDate(sec: number, tz = 'local'): string {
  if (!Number.isFinite(sec)) return '—';
  return dtf(tz, { year: 'numeric', month: 'short', day: '2-digit' }, 'd').format(new Date(sec * 1000));
}

export function fmtTime(sec: number, tz = 'local'): string {
  return dtf(tz, { hour: '2-digit', minute: '2-digit' }, 't').format(new Date(sec * 1000));
}

export function fmtTick(sec: number, kind: 'year' | 'month' | 'day' | 'time' | 'seconds', tz = 'local'): string {
  const d = new Date(sec * 1000);
  switch (kind) {
    case 'year':
      return dtf(tz, { year: 'numeric' }, 'y').format(d);
    case 'month':
      return dtf(tz, { month: 'short' }, 'm').format(d).replace('.', '');
    case 'day':
      return dtf(tz, { day: 'numeric' }, 'dd').format(d);
    case 'seconds':
      return dtf(tz, { hour: '2-digit', minute: '2-digit', second: '2-digit' }, 's').format(d);
    default:
      return dtf(tz, { hour: '2-digit', minute: '2-digit' }, 't').format(d);
  }
}

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Data/hora para <input type="datetime-local"> no fuso escolhido. */
export function toInputDateTime(sec: number, tz = 'local'): string {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }, 'input').formatToParts(new Date(sec * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Converte o valor de <input type="datetime-local"> (no fuso escolhido) para segundos UTC. */
export function fromInputDateTime(value: string, tz = 'local'): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (tz === 'local') return new Date(y, mo - 1, d, h, mi).getTime() / 1000;
  // descobre o desvio do fuso nesse instante
  const guess = Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const shown = toInputDateTime(guess, tz);
  const [y2, mo2, d2, h2, mi2] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(shown)!.slice(1).map(Number);
  const offset = (Date.UTC(y2, mo2 - 1, d2, h2, mi2) - Date.UTC(y, mo - 1, d, h, mi)) / 1000;
  return guess - offset;
}
