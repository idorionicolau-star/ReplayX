'use client';
import { useEffect } from 'react';
import { useAlerts, type Alert } from '@/store/alerts';
import { useDrawings } from '@/store/drawings';
import { useSettings } from '@/store/settings';
import { useReplay } from '@/replay/engine';
import { dataFeed, barEnd } from '@/core/feed/datafeed';
import { resolveSymbol } from '@/core/symbols';
import { alignTime, tfShort } from '@/core/timeframes';
import { upperBound } from '@/core/bars';
import type { Bar } from '@/core/types';
import {
  allowedByTrigger,
  check,
  CHANNEL_CONDITIONS,
  describe,
  drawingValue,
  fillMessage,
  indicatorValue,
  needsBars,
  type Sample,
  type TimeToPos,
} from '@/core/alerts';
import { allCharts } from '@/chart/registry';
import { toast } from '@/components/ui/Toast';
import { playSound } from '@/lib/sound';
import { notifyDevice } from '@/lib/notify';
import { fmtDateTime, fmtPrice } from '@/lib/format';

/** Barras usadas no cálculo dos indicadores (chega para estabilizar médias e osciladores). */
const CALC_BARS = 1000;
const LEVEL_CONDITIONS = new Set(['greater', 'less', 'inside', 'outside']);

const keyOf = (symbolId: string, tf: string) => `${symbolId}|${tf}`;

/** Gráfico aberto com este símbolo (e intervalo, se dado). */
function chartWith(symbolId: string, tf?: string) {
  for (const [, c] of allCharts()) if (c.symbol?.id === symbolId && (!tf || c.tf === tf) && c.bars.length) return c;
  return undefined;
}

/** Posição no tempo como no gráfico (índice de barra), para as linhas ficarem iguais ao que se vê. */
function posFor(symbolId: string): TimeToPos {
  const c = chartWith(symbolId);
  return c ? (t) => c.timeToLogical(t) : (t) => t;
}

class Monitor {
  /** Última amostra de cada alerta (para detetar cruzamentos). */
  private samples = new Map<string, Sample>();
  /** Última barra fechada avaliada (frequência "no fecho"). */
  private closed = new Map<string, number>();
  /** Barras em tempo real por símbolo|intervalo. */
  private live = new Map<string, { bars: Bar[]; unsub: () => void }>();
  /** Barras do replay carregadas quando nenhum gráfico mostra o símbolo/intervalo. */
  private replayBars = new Map<string, { cursor: number; bars: Bar[] }>();
  private quotes = new Map<string, () => void>();
  private busy = Promise.resolve();

  reset() {
    this.samples.clear();
    this.closed.clear();
  }

  dispose() {
    this.quotes.forEach((u) => u());
    this.live.forEach((s) => s.unsub());
    this.quotes.clear();
    this.live.clear();
  }

  /** Mantém as subscrições de preços e de barras de acordo com os alertas ativos. */
  sync() {
    const all = useAlerts.getState().alerts;
    const active = all.filter((a) => a.active);
    const symbols = new Set(active.map((a) => a.symbolId));
    for (const [id, u] of this.quotes) if (!symbols.has(id)) (u(), this.quotes.delete(id));
    for (const id of symbols) {
      if (this.quotes.has(id)) continue;
      this.quotes.set(
        id,
        dataFeed().subscribeQuote(resolveSymbol(id), (q) => {
          const r = useReplay.getState();
          if (r.active && !r.selecting) return;
          this.run(() => this.evaluateSymbol(id, q.price, q.time, false));
        }),
      );
    }
    const series = new Set(active.filter(needsBars).map((a) => keyOf(a.symbolId, a.tf)));
    for (const [k, s] of this.live) if (!series.has(k)) (s.unsub(), this.live.delete(k));
    for (const k of series) if (!this.live.has(k)) this.startSeries(k);
    // alertas que deixaram de existir ou foram editados começam de novo
    const ids = new Set(active.map((a) => a.id));
    for (const id of this.samples.keys()) if (!ids.has(id)) this.samples.delete(id);
  }

  /** Esquece o estado de um alerta (ex.: depois de editado). */
  forget(id: string) {
    this.samples.delete(id);
    this.closed.delete(id);
  }

  private startSeries(k: string) {
    const [symbolId, tf] = k.split('|');
    const sym = resolveSymbol(symbolId);
    const entry = { bars: [] as Bar[], unsub: () => undefined as void };
    this.live.set(k, entry);
    const now = Math.floor(Date.now() / 1000);
    dataFeed()
      .history(sym, tf, now + 60, 400)
      .then((h) => {
        if (this.live.get(k) !== entry) return;
        entry.bars = h.bars.slice();
        entry.unsub = dataFeed().subscribe(sym, tf, (b) => {
          const last = entry.bars[entry.bars.length - 1];
          if (last && last.time === b.time) entry.bars[entry.bars.length - 1] = b;
          else if (!last || b.time > last.time) entry.bars.push(b);
          if (entry.bars.length > 2000) entry.bars.splice(0, entry.bars.length - 2000);
        });
      })
      .catch(() => undefined);
  }

  /** Barras do símbolo/intervalo no instante (em replay só até ao cursor). */
  private async barsFor(a: Alert, replay: boolean, now: number): Promise<Bar[] | null> {
    const c = chartWith(a.symbolId, a.tf);
    if (c) return c.bars;
    const k = keyOf(a.symbolId, a.tf);
    if (!replay) return this.live.get(k)?.bars ?? null;
    const cached = this.replayBars.get(k);
    if (cached && cached.cursor === now) return cached.bars;
    try {
      const h = await dataFeed().history(resolveSymbol(a.symbolId), a.tf, now, 400);
      const bars = h.bars.filter((b) => barEnd(b.time, a.tf) <= now);
      this.replayBars.set(k, { cursor: now, bars });
      return bars;
    } catch {
      return null;
    }
  }

  private run(job: () => Promise<void>) {
    this.busy = this.busy.then(job).catch(() => undefined);
  }

  /** Novo passo do replay. */
  onReplay(cursor: number, prices: Record<string, number>) {
    this.run(async () => {
      const ids = new Set(useAlerts.getState().alerts.filter((a) => a.active).map((a) => a.symbolId));
      for (const id of ids) {
        const p = prices[id];
        if (p !== undefined) await this.evaluateSymbol(id, p, cursor, true);
      }
    });
  }

  private async evaluateSymbol(symbolId: string, price: number, now: number, replay: boolean) {
    for (const a of useAlerts.getState().alerts) {
      if (!a.active || a.symbolId !== symbolId) continue;
      try {
        await this.evaluate(a, price, now, replay);
      } catch {
        /* um alerta com problemas não para os outros */
      }
    }
  }

  private drawingFor(a: Alert) {
    if (a.target.kind !== 'drawing') return undefined;
    const id = a.target.drawingId;
    return (useDrawings.getState().bySymbol[a.symbolId] ?? []).find((d) => d.id === id);
  }

  /** Amostra (fonte e alvo) com o preço `price` no instante `now`, nas barras até `idx`. */
  private sample(a: Alert, price: number, now: number, bars: readonly Bar[] | null, idx?: number): Sample | null {
    const end = (idx ?? (bars ? bars.length - 1 : 0)) + 1;
    const slice = bars ? bars.slice(Math.max(0, end - CALC_BARS), end) : null;
    let l: number | undefined;
    if (a.source.kind === 'price') l = price;
    else if (slice) l = indicatorValue(a.source, slice);
    if (l === undefined) return null;
    const t = a.target;
    switch (t.kind) {
      case 'value':
        return { l, r: t.value };
      case 'range':
        return { l, lo: t.low, hi: t.high };
      case 'price':
        return { l, r: price };
      case 'indicator': {
        const r = slice ? indicatorValue(t, slice) : undefined;
        return r === undefined ? null : { l, r };
      }
      case 'drawing': {
        const d = this.drawingFor(a);
        if (!d) return null;
        const v = drawingValue(d, now, posFor(a.symbolId));
        return v ? { l, ...v } : null;
      }
    }
  }

  private async evaluate(a: Alert, price: number, now: number, replay: boolean) {
    if (a.expiresAt && !replay && now > a.expiresAt) {
      useAlerts.getState().update(a.id, { active: false, stopped: 'Expirou' });
      return;
    }
    if (a.target.kind === 'drawing' && !this.drawingFor(a)) {
      useAlerts.getState().update(a.id, { active: false, stopped: 'O desenho foi apagado' });
      return;
    }
    const bars = needsBars(a) ? await this.barsFor(a, replay, now) : null;
    if (needsBars(a) && (!bars || bars.length < 2)) return;

    if (a.trigger === 'perBarClose' && bars) {
      // última barra fechada no instante `now`
      let k = upperBound(bars, now) - 1;
      while (k >= 0 && barEnd(bars[k].time, a.tf) > now) k--;
      if (k < 1) return;
      const barTime = bars[k].time;
      const seen = this.closed.get(a.id);
      this.closed.set(a.id, barTime);
      if (seen === undefined || seen === barTime) return;
      const tEnd = barEnd(barTime, a.tf);
      const prev = this.sample(a, bars[k - 1].close, barEnd(bars[k - 1].time, a.tf), bars, k - 1);
      const cur = this.sample(a, bars[k].close, tEnd, bars, k);
      if (!cur || !check(a.condition, prev ?? undefined, cur)) return;
      if (!allowedByTrigger(a, barTime)) return;
      this.fire(a, cur, bars[k].close, tEnd, barTime, replay);
      return;
    }

    const cur = this.sample(a, price, now, bars);
    if (!cur) return;
    const prev = this.samples.get(a.id);
    this.samples.set(a.id, cur);
    if (!check(a.condition, prev, cur)) return;
    const bar = alignTime(now, a.tf);
    // condições de nível ("maior que", "dentro"…) com "sempre": no máximo uma vez por barra
    const gate = a.trigger === 'every' && LEVEL_CONDITIONS.has(a.condition) ? { ...a, trigger: 'perBar' as const } : a;
    if (!allowedByTrigger(gate, bar)) return;
    this.fire(a, cur, price, now, bar, replay);
  }

  private fire(a: Alert, s: Sample, price: number, time: number, bar: number, replay: boolean) {
    const st = useAlerts.getState();
    const fresh = st.alerts.find((x) => x.id === a.id);
    if (!fresh?.active) return;
    const sym = resolveSymbol(a.symbolId);
    const fmt = (v: number) => fmtPrice(v, sym.precision);
    const tz = useSettings.getState().timezone;
    const valueStr = CHANNEL_CONDITIONS.includes(a.condition) || s.r === undefined ? fmt(s.l) : fmt(s.r);
    const body = a.message
      ? fillMessage(a.message, { ticker: sym.name, close: fmt(price), value: valueStr, time: fmtDateTime(time, tz), interval: tfShort(a.tf) })
      : `${describe(a, fmt, sym.name)} · preço ${fmt(price)}`;
    const title = a.name || `Alerta: ${sym.name}`;
    st.logTrigger({ alertId: a.id, symbolId: a.symbolId, price, time, message: `${title} — ${body}`, replay });
    st.update(a.id, {
      triggeredAt: time,
      lastBar: bar,
      count: (fresh.count ?? 0) + 1,
      active: a.trigger !== 'once',
      stopped: a.trigger === 'once' ? 'Disparou (só uma vez)' : undefined,
    });
    if (a.notify.popup) st.pushPopup({ alertId: a.id, title, body, time, replay });
    else toast(`⏰ ${title}`, { kind: 'warning', body, duration: 8000 });
    if (a.notify.sound) playSound('alert');
    if (a.notify.push && !replay) void notifyDevice(`⏰ ${title}`, body, a.id);
  }
}

/** Vigia os alertas: em tempo real pelas cotações, no replay a cada passo. */
export function useAlertMonitor() {
  useEffect(() => {
    const m = new Monitor();
    m.sync();
    const u1 = useAlerts.subscribe((s, p) => {
      if (s.alerts === p.alerts) return;
      // um alerta editado (condição, alvo…) recomeça sem memória
      const before = new Map(p.alerts.map((a) => [a.id, a]));
      for (const a of s.alerts) {
        const old = before.get(a.id);
        if (old && (old.condition !== a.condition || old.target !== a.target || old.source !== a.source || old.tf !== a.tf || (!old.active && a.active))) m.forget(a.id);
      }
      m.sync();
    });
    let checked = 0;
    const u2 = useReplay.subscribe((s, p) => {
      // entrar/sair do replay muda a origem dos preços: começa de novo
      if (s.active !== p.active || s.selecting !== p.selecting) {
        m.reset();
        checked = 0;
      }
      if (!s.active || s.selecting || s.cursor === null) return;
      if (p.cursor !== null && s.cursor < p.cursor) {
        m.reset();
        checked = s.cursor;
        return;
      }
      if (s.prices === p.prices || s.cursor <= checked) return;
      checked = s.cursor;
      m.onReplay(s.cursor, s.prices);
    });
    return () => {
      u1();
      u2();
      m.dispose();
    };
  }, []);
}
