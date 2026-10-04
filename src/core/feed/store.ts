import type { Bar, SymbolInfo } from '../types';
import { alignTime, tfSeconds, type Timeframe } from '../timeframes';
import { lowerBound, mergeBars, sanitize } from '../bars';
import { nowSec, type Provider } from './provider';

type Range = [number, number];

/**
 * Cache de barras de um símbolo num timeframe nativo do fornecedor.
 * Guarda os intervalos já descarregados e só pede o que falta.
 */
export class BarStore {
  bars: Bar[] = [];
  /** Intervalos [from, to) já cobertos, ordenados e sem sobreposição. */
  ranges: Range[] = [];
  /** Não há dados antes de `startTime`. */
  startTime: number | null = null;
  version = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly provider: Provider,
    readonly symbol: SymbolInfo,
    readonly tf: Timeframe,
  ) {
    const earliest = provider.earliest?.(symbol, tf);
    if (earliest !== undefined) this.startTime = alignTime(earliest, tf);
  }

  get tfSec(): number {
    return tfSeconds(this.tf);
  }

  /** Limite do que pode ser considerado "definitivo" (a barra atual ainda está a formar-se). */
  private coverCap(): number {
    return alignTime(nowSec(), this.tf);
  }

  get startReached(): boolean {
    return this.startTime !== null && this.ranges.length > 0 && this.ranges[0][0] <= this.startTime;
  }

  addRange(from: number, to: number) {
    to = Math.min(to, this.coverCap());
    if (to <= from) return;
    const out: Range[] = [];
    let merged: Range = [from, to];
    let placed = false;
    for (const r of this.ranges) {
      if (r[1] < merged[0]) out.push(r);
      else if (r[0] > merged[1]) {
        if (!placed) {
          out.push(merged);
          placed = true;
        }
        out.push(r);
      } else merged = [Math.min(r[0], merged[0]), Math.max(r[1], merged[1])];
    }
    if (!placed) out.push(merged);
    this.ranges = out;
  }

  isCovered(from: number, to: number): boolean {
    if (this.startTime !== null && to <= this.startTime) return true;
    if (this.startTime !== null && from < this.startTime) from = this.startTime;
    if (to <= from) return true;
    for (const r of this.ranges) if (r[0] <= from && r[1] >= to) return true;
    return false;
  }

  /** Intervalos em falta dentro de [from, to). */
  missing(from: number, to: number): Range[] {
    if (this.startTime !== null && from < this.startTime) from = this.startTime;
    if (to <= from) return [];
    const gaps: Range[] = [];
    let cur = from;
    for (const r of this.ranges) {
      if (r[1] <= cur) continue;
      if (r[0] >= to) break;
      if (r[0] > cur) gaps.push([cur, Math.min(r[0], to)]);
      cur = Math.max(cur, r[1]);
      if (cur >= to) break;
    }
    if (cur < to) gaps.push([cur, to]);
    return gaps;
  }

  insert(bars: Bar[]) {
    if (!bars.length) return;
    this.bars = mergeBars(this.bars, sanitize(bars));
    this.version++;
  }

  /** Atualização em tempo real (substitui ou acrescenta). */
  upsert(bar: Bar) {
    const n = this.bars.length;
    if (n && this.bars[n - 1].time === bar.time) this.bars[n - 1] = bar;
    else if (!n || bar.time > this.bars[n - 1].time) {
      this.bars.push(bar);
      // estende o último intervalo coberto para incluir as barras fechadas
      const last = this.ranges[this.ranges.length - 1];
      if (last && n && last[1] >= this.bars[n - 1].time) last[1] = Math.max(last[1], Math.min(bar.time, this.coverCap()));
    } else {
      const i = lowerBound(this.bars, bar.time);
      if (this.bars[i]?.time === bar.time) this.bars[i] = bar;
      else this.bars.splice(i, 0, bar);
    }
    this.version++;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Garante que [from, to) está carregado. */
  ensureRange(from: number, to: number): Promise<void> {
    return this.serial(async () => {
      const gaps = this.missing(from, to);
      const chunk = this.provider.maxPerRequest * this.tfSec;
      for (const [a, b] of gaps) {
        for (let s = a; s < b; s += chunk) {
          const e = Math.min(b, s + chunk);
          const bars = await this.provider.fetch(this.symbol, this.tf, { from: s, to: e, limit: this.provider.maxPerRequest });
          this.insert(bars);
          this.addRange(s, e);
        }
      }
    });
  }

  /** Garante pelo menos `count` barras com time < to (ou até ao início dos dados). */
  ensureBefore(to: number, count: number): Promise<void> {
    return this.serial(async () => {
      let end = to;
      let have = 0;
      const tail = this.ranges.find((r) => r[0] < to && r[1] >= Math.min(to, this.coverCap()));
      if (tail) {
        have = lowerBound(this.bars, to) - lowerBound(this.bars, tail[0]);
        end = tail[0];
        // a barra a formar-se (depois do limite) volta a ser pedida
        if (to > this.coverCap()) {
          const fresh = await this.provider.fetch(this.symbol, this.tf, { to, limit: 2 });
          this.insert(fresh);
        }
      }
      let guard = 0;
      while (have < count && guard++ < 200) {
        if (this.startTime !== null && end <= this.startTime) break;
        // salta blocos que já estão em cache
        const known = this.ranges.find((r) => r[0] < end && r[1] >= end);
        if (known) {
          have += lowerBound(this.bars, end) - lowerBound(this.bars, known[0]);
          end = known[0];
          continue;
        }
        const need = Math.min(count - have, this.provider.maxPerRequest);
        const bars = await this.provider.fetch(this.symbol, this.tf, { to: end, limit: need });
        if (!bars.length) {
          this.startTime = this.startTime === null ? end : Math.max(this.startTime, end);
          break;
        }
        this.insert(bars);
        this.addRange(bars[0].time, end);
        have += bars.length;
        end = bars[0].time;
      }
    });
  }

  slice(from: number, to: number): Bar[] {
    return this.bars.slice(lowerBound(this.bars, from), lowerBound(this.bars, to));
  }

  /** Últimas `count` barras antes de `to`. */
  lastBefore(to: number, count: number): Bar[] {
    const end = lowerBound(this.bars, to);
    return this.bars.slice(Math.max(0, end - count), end);
  }
}
