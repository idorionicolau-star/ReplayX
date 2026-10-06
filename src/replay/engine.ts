import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Bar, SymbolInfo } from '@/core/types';
import { alignTime, parseTf, tfSeconds, tfToString, type Timeframe } from '@/core/timeframes';
import { FINE_FIRST_BARS, fineAheadPlan } from './fineAhead';
import { barEnd, dataFeed } from '@/core/feed/datafeed';
import { nowSec } from '@/core/feed/provider';
import { resolveSymbol } from '@/core/symbols';
import { cloneAccount, newAccount, placeOrder, processBar, type Account, type Fill, type OrderType, type Side } from '@/core/trading/engine';
import { lowerBound } from '@/core/bars';
import { useTrading, specFor } from '@/store/trading';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { useAlerts } from '@/store/alerts';
import { uid } from '@/lib/uid';
import { isPro, openUpgrade, replayTfAllowed } from '@/lib/billing';
import { FREE_LIMITS, freeReplayTfOk } from '@/core/plans';

/**
 * Motor do Bar Replay.
 * Um único cursor de tempo (segundos UTC) partilhado por todos os gráficos:
 * tudo o que abriu antes do cursor é visível, o resto fica escondido.
 * Mudar de timeframe mantém o cursor — a barra atual aparece parcial, construída com dados mais finos.
 */

export interface ReplayChart {
  readonly symbol: SymbolInfo | null;
  readonly tf: string;
  prepareReplay(cursor: number): Promise<void>;
  applyReplay(cursor: number): void;
}

export interface ReplayState {
  active: boolean;
  selecting: boolean;
  cursor: number | null;
  start: number | null;
  playing: boolean;
  speedMs: number;
  /** Intervalo de atualização (null = timeframe do gráfico ativo). */
  stepTf: string | null;
  busy: boolean;
  ended: boolean;
  /** Último preço conhecido por símbolo, no cursor. */
  prices: Record<string, number>;
  pauseOnFill: boolean;
  error: string | null;
}

export const useReplay = create<ReplayState>()(
  persist(
    (): ReplayState => ({
      active: false,
      selecting: false,
      cursor: null,
      start: null,
      playing: false,
      speedMs: 1000,
      stepTf: null,
      busy: false,
      ended: false,
      prices: {},
      pauseOnFill: true,
      error: null,
    }),
    {
      name: 'rx-replay',
      version: 1,
      partialize: (s) => ({ active: s.active && !s.selecting, cursor: s.cursor, start: s.start, speedMs: s.speedMs, stepTf: s.stepTf, pauseOnFill: s.pauseOnFill }) as unknown as ReplayState,
    },
  ),
);

export const SPEEDS: { ms: number; label: string }[] = [
  { ms: 10000, label: '0.1x' },
  { ms: 3000, label: '0.3x' },
  { ms: 2000, label: '0.5x' },
  { ms: 1000, label: '1x' },
  { ms: 500, label: '2x' },
  { ms: 333, label: '3x' },
  { ms: 200, label: '5x' },
  { ms: 100, label: '10x' },
  { ms: 50, label: '20x' },
  { ms: 0, label: 'Máx.' },
];

const MAX_SNAPSHOTS = 2000;

class ReplayEngine {
  private charts = new Map<string, ReplayChart>();
  private snapshots: { cursor: number; account: Account; execCount: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stepping: Promise<void> | null = null;
  private listeners = new Set<(fills: Fill[]) => void>();
  private fineJobs = new Map<string, Promise<void>>();

  /** Timeframe fino com que as ordens são executadas num passo de `span` segundos (no máximo ~240 barras). */
  private fineTfFor(sym: SymbolInfo, span: number): Timeframe {
    // intervalos de segundos só servem de dado fino quando o próprio passo é curto: nos outros passos pesariam 5 a 60 vezes mais
    const natives = dataFeed()
      .provider(sym)
      .nativeTfs(sym)
      .filter((t) => t.unit !== 'W' && t.unit !== 'M' && (t.unit !== 's' || span <= 240));
    return natives.find((t) => span / tfSeconds(t) <= 240) ?? natives[natives.length - 1];
  }

  /**
   * Com ordens ou posições abertas, carrega os dados finos à frente do cursor em segundo plano.
   * Assim os passos seguintes só leem da memória e o replay não pára à espera da rede.
   */
  prefetchFine(cursor: number, span: number, ahead?: number) {
    if (!useSettings.getState().replayIntrabar) return;
    const acc = useTrading.getState().replay;
    const ids = new Set<string>([...acc.positions.map((p) => p.symbolId), ...acc.orders.map((o) => o.symbolId)]);
    const feed = dataFeed();
    for (const id of ids) {
      const sym = resolveSymbol(id);
      const f = this.fineTfFor(sym, span);
      const plan = fineAheadPlan({ cursor, barSec: tfSeconds(f), now: nowSec(), ahead, covered: (a, b) => feed.isCovered(sym, f, a, b) });
      if (!plan) continue;
      const key = `${id}|${tfToString(f)}`;
      if (this.fineJobs.has(key)) continue;
      const job = feed
        .range(sym, f, plan.from, plan.to)
        .then(() => undefined, () => undefined)
        .finally(() => this.fineJobs.delete(key));
      this.fineJobs.set(key, job);
    }
  }

  /** Comprimento típico de um passo (para escolher o timeframe fino ao abrir uma ordem). */
  stepSpan(): number {
    const d = this.driver();
    return d ? tfSeconds(parseTf(d.tf)) : 900;
  }

  register(id: string, chart: ReplayChart) {
    this.charts.set(id, chart);
  }

  unregister(id: string) {
    this.charts.delete(id);
  }

  onFills(cb: (fills: Fill[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private get state() {
    return useReplay.getState();
  }

  private activeChart(): ReplayChart | null {
    const ws = useWorkspace.getState();
    const cfg = ws.charts[ws.active];
    return (cfg && this.charts.get(cfg.id)) ?? this.charts.values().next().value ?? null;
  }

  /** Símbolo/timeframe que comandam o passo do replay. */
  private driver(): { sym: SymbolInfo; tf: string } | null {
    const ws = useWorkspace.getState();
    const cfg = ws.charts[ws.active] ?? ws.charts[0];
    if (!cfg) return null;
    return { sym: resolveSymbol(cfg.symbolId), tf: this.state.stepTf ?? cfg.tf };
  }

  /** Entrar em modo de seleção do ponto de partida. */
  enter() {
    this.pause();
    this.fitFreePlan();
    useReplay.setState({ active: true, selecting: true, ended: false, error: null });
  }

  /** Sai do replay (guarda a sessão no Diário se houve operações). */
  exit() {
    this.pause();
    const st = this.state;
    const acc = useTrading.getState().replay;
    if (st.active && st.cursor !== null && (acc.trades.length || acc.positions.length)) this.saveCurrent();
    this.snapshots = [];
    useReplay.setState({ active: false, selecting: false, cursor: null, start: null, ended: false, busy: false, error: null });
  }

  cancelSelection() {
    if (this.state.cursor === null) this.exit();
    else useReplay.setState({ selecting: false });
  }

  /** Começa (ou recomeça) o replay no instante dado. */
  async start(cursor: number, opts: { keepAccount?: boolean } = {}) {
    this.pause();
    this.fitFreePlan();
    const c = Math.min(cursor, nowSec());
    this.snapshots = [];
    if (!opts.keepAccount) {
      const initial = useSettings.getState().trading.initialBalance;
      useTrading.getState().resetAccount('replay', initial);
      useTrading.getState().setSessionId(uid('s'));
    }
    useReplay.setState({ active: true, selecting: false, start: c, ended: false, error: null });
    await this.moveTo(c);
  }

  /** Escolha com o rato: a barra clicada fica como a última visível. */
  async pickBar(time: number, tf: string) {
    await this.start(barEnd(time, tf));
  }

  async randomStart() {
    const d = this.driver();
    if (!d) return;
    const tf = parseTf(d.tf);
    const span = Math.min(3 * 365 * 86400, Math.max(400 * tfSeconds(tf), 30 * 86400));
    const now = nowSec();
    const t = alignTime(now - 300 * tfSeconds(tf) - Math.random() * span, tf);
    await this.start(t);
  }

  /** Coloca o cursor sem executar ordens (usado ao começar/retomar). */
  async moveTo(cursor: number) {
    useReplay.setState({ busy: true });
    try {
      await Promise.all(Array.from(this.charts.values()).map((c) => c.prepareReplay(cursor).catch(() => undefined)));
      useReplay.setState({ cursor });
      for (const c of this.charts.values()) c.applyReplay(cursor);
      await this.refreshPrices(cursor);
    } catch (e) {
      useReplay.setState({ error: (e as Error).message });
    } finally {
      useReplay.setState({ busy: false });
    }
  }

  /** Volta a aplicar o cursor atual (ex.: depois de um gráfico mudar de símbolo). */
  async refresh(chartId?: string) {
    const c = this.state.cursor;
    if (c === null || !this.state.active || this.state.selecting) return;
    const charts = chartId ? [this.charts.get(chartId)].filter(Boolean) as ReplayChart[] : Array.from(this.charts.values());
    await Promise.all(charts.map((ch) => ch.prepareReplay(c).catch(() => undefined)));
    if (this.state.cursor !== c) return;
    charts.forEach((ch) => ch.applyReplay(c));
  }

  /** Próximo cursor: fim da próxima barra do intervalo de atualização que ainda não foi revelada. */
  private async nextCursor(sym: SymbolInfo, tfStr: string, c0: number): Promise<number | null> {
    const feed = dataFeed();
    const tf = parseTf(tfStr);
    const sec = tfSeconds(tf);
    const now = nowSec();
    let from = alignTime(c0, tf);
    for (let attempt = 0; attempt < 12; attempt++) {
      const span = sec * 500 * Math.pow(2, attempt);
      const to = Math.min(from + span, now + sec);
      let bars: Bar[] | null = feed.peekRange(sym, tf, from, to);
      if (!bars) bars = await feed.range(sym, tf, from, to);
      for (const b of bars) {
        const end = barEnd(b.time, tf);
        if (end > c0) {
          // pré-carrega o bloco seguinte quando estivermos perto do fim
          const idx = lowerBound(bars, b.time);
          if (bars.length - idx < 60 && to < now) void feed.range(sym, tf, to, Math.min(to + span, now + sec)).catch(() => undefined);
          // a barra ainda a formar-se é o tempo real: fim do replay
          return end > now ? null : end;
        }
      }
      if (to >= now) return null;
      from = to;
    }
    return null;
  }

  async stepForward(): Promise<boolean> {
    if (this.stepping) {
      await this.stepping;
    }
    const st = this.state;
    if (!st.active || st.cursor === null || st.selecting) return false;
    const d = this.driver();
    if (!d) return false;
    let ok = false;
    const run = (async () => {
      useReplay.setState({ busy: true });
      try {
        const c0 = st.cursor as number;
        const c1 = await this.nextCursor(d.sym, d.tf, c0);
        if (c1 === null || c1 <= c0) {
          useReplay.setState({ ended: true, playing: false });
          return;
        }
        await Promise.all(Array.from(this.charts.values()).map((c) => c.prepareReplay(c1).catch(() => undefined)));
        const fills = await this.processTrading(c0, c1);
        if (this.state.cursor !== c0 || !this.state.active) return; // cancelado entretanto
        useReplay.setState({ cursor: c1, ended: false, error: null });
        for (const c of this.charts.values()) c.applyReplay(c1);
        await this.refreshPrices(c1);
        if (fills.length) {
          this.listeners.forEach((l) => l(fills));
          if (this.state.pauseOnFill && this.state.playing) this.pause();
        }
        ok = true;
      } catch (e) {
        useReplay.setState({ error: (e as Error).message, playing: false });
      } finally {
        useReplay.setState({ busy: false });
      }
    })();
    this.stepping = run;
    await run;
    this.stepping = null;
    return ok;
  }

  async stepBack(): Promise<void> {
    if (this.stepping) await this.stepping;
    const st = this.state;
    if (!st.active || st.cursor === null) return;
    this.pause();
    const snap = this.snapshots.pop();
    if (snap) {
      const tr = useTrading.getState();
      tr.setAccount('replay', snap.account);
      tr.setExecs('replay', tr.execs.replay.slice(0, snap.execCount));
      await this.moveTo(snap.cursor);
      return;
    }
    // sem histórico: recua uma barra antes do início (não há operações antes do início)
    const d = this.driver();
    if (!d) return;
    const tf = parseTf(d.tf);
    const sec = tfSeconds(tf);
    const feed = dataFeed();
    const c = st.cursor;
    const bars = await feed.range(d.sym, tf, c - sec * 200, c);
    const prev = [...bars].reverse().find((b) => b.time < c);
    if (!prev) return;
    const acc = useTrading.getState().replay;
    if (acc.trades.length || acc.positions.length) return;
    useReplay.setState({ start: prev.time });
    await this.moveTo(prev.time);
  }

  /** Dados finos para executar ordens dentro do passo. */
  private async processTrading(c0: number, c1: number): Promise<Fill[]> {
    const tr = useTrading.getState();
    const acc = tr.replay;
    const symbols = new Set<string>([...acc.positions.map((p) => p.symbolId), ...acc.orders.map((o) => o.symbolId)]);
    this.snapshots.push({ cursor: c0, account: cloneAccount(acc), execCount: tr.execs.replay.length });
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
    if (!symbols.size) return [];
    const next = cloneAccount(acc);
    const fills: Fill[] = [];
    const feed = dataFeed();
    const intrabar = useSettings.getState().replayIntrabar;
    for (const symbolId of symbols) {
      const sym = resolveSymbol(symbolId);
      const spec = specFor(sym);
      let path: Bar[] | null = null;
      if (intrabar) {
        // granularidade com no máximo ~240 barras por passo
        const span = c1 - c0;
        const f = this.fineTfFor(sym, span);
        path = feed.peekRange(sym, f, c0, c1);
        if (!path) {
          try {
            await feed.range(sym, f, c0, Math.min(c0 + Math.max(span, tfSeconds(f) * 500), nowSec() + tfSeconds(f)));
            path = feed.peekRange(sym, f, c0, c1);
          } catch {
            path = null;
          }
        }
        if (path) path = path.filter((b) => barEnd(b.time, f) <= c1);
      }
      if (!path) {
        const d = this.driver();
        const tf = d?.tf ?? '1m';
        const coarse = feed.peekRange(sym, tf, c0, c1) ?? (await feed.range(sym, tf, c0, c1).catch(() => [] as Bar[]));
        path = coarse.filter((b) => barEnd(b.time, tf) <= c1);
      }
      for (const b of path) fills.push(...processBar(next, symbolId, b, spec));
    }
    if (fills.length || next.positions.length) {
      tr.setAccount('replay', next);
      if (fills.length) tr.addExecs('replay', fills);
    }
    // repõe os dados finos à frente em segundo plano, antes de o próximo passo precisar deles
    this.prefetchFine(c1, c1 - c0);
    return fills;
  }

  /** Atualiza os preços no cursor (ex.: depois de mudar de símbolo). */
  async updatePrices() {
    const c = this.state.cursor;
    if (c !== null && this.state.active) await this.refreshPrices(c);
  }

  private async refreshPrices(cursor: number) {
    const feed = dataFeed();
    const acc = useTrading.getState().replay;
    const ws = useWorkspace.getState();
    const ids = new Set<string>([
      ...ws.charts.map((c) => c.symbolId),
      ...acc.positions.map((p) => p.symbolId),
      ...acc.orders.map((o) => o.symbolId),
      // os alertas também são vigiados durante o replay
      ...useAlerts.getState().alerts.filter((a) => a.active).map((a) => a.symbolId),
    ]);
    const prices: Record<string, number> = {};
    for (const id of ids) {
      const sym = resolveSymbol(id);
      const natives = feed.provider(sym).nativeTfs(sym).filter((t) => t.unit !== 'W' && t.unit !== 'M');
      for (const f of natives) {
        const bars = feed.peekRange(sym, f, cursor - tfSeconds(f) * 3, cursor);
        const done = bars?.filter((b) => barEnd(b.time, f) <= cursor);
        if (done && done.length) {
          prices[id] = done[done.length - 1].close;
          break;
        }
      }
      if (prices[id] === undefined) {
        try {
          // carrega com folga à frente: assim os passos seguintes leem da memória em vez de pedirem 2 barras à rede a cada passo
          const f0 = natives.find((t) => t.unit !== 's') ?? natives[0];
          const fs0 = tfSeconds(f0);
          await feed.range(sym, f0, cursor - fs0 * 3, Math.min(cursor + fs0 * 400, nowSec() + fs0)).catch(() => undefined);
          let last = feed.peekRange(sym, f0, cursor - fs0 * 3, cursor)?.filter((b) => barEnd(b.time, f0) <= cursor).pop();
          if (!last) {
            const h = await feed.history(sym, f0, cursor, 2);
            last = h.bars.filter((b) => barEnd(b.time, f0) <= cursor).pop();
          }
          if (last) prices[id] = last.close;
        } catch {
          /* sem preço */
        }
      }
    }
    useReplay.setState({ prices: { ...this.state.prices, ...prices } });
  }

  play() {
    const st = this.state;
    if (!st.active || st.cursor === null || st.selecting) return;
    if (st.playing) return;
    useReplay.setState({ playing: true, ended: false });
    const loop = async () => {
      if (!this.state.playing) return;
      const t0 = performance.now();
      const ok = await this.stepForward();
      if (!ok || !this.state.playing) {
        if (!ok) useReplay.setState({ playing: false });
        return;
      }
      const wait = Math.max(0, this.state.speedMs - (performance.now() - t0));
      this.timer = setTimeout(loop, wait || 16);
    };
    void loop();
  }

  pause() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.state.playing) useReplay.setState({ playing: false });
  }

  toggle() {
    if (this.state.playing) this.pause();
    else this.play();
  }

  setSpeed(ms: number) {
    useReplay.setState({ speedMs: ms });
  }

  /** No plano grátis o replay só usa intervalos de 15m ou mais: os gráficos abaixo disso passam para 15m. */
  private fitFreePlan() {
    if (isPro()) return;
    const ws = useWorkspace.getState();
    const low = ws.charts.map((c, i) => (freeReplayTfOk(c.tf) ? -1 : i)).filter((i) => i >= 0);
    for (const i of low) ws.updateChart(i, { tf: FREE_LIMITS.replayMinTf });
    if (this.state.stepTf && !freeReplayTfOk(this.state.stepTf)) useReplay.setState({ stepTf: null });
    if (low.length) openUpgrade('replayTf');
  }

  setStepTf(tf: string | null) {
    if (tf && !replayTfAllowed(tf)) {
      openUpgrade('replayTf');
      return;
    }
    useReplay.setState({ stepTf: tf });
  }

  /** Salta para uma data. Para a frente executa as ordens pelo caminho; para trás recomeça a sessão. */
  async jumpTo(target: number, opts: { restart?: boolean } = {}) {
    const st = this.state;
    if (!st.active || st.cursor === null) return this.start(target);
    this.pause();
    if (target <= st.cursor || opts.restart) {
      await this.start(target);
      return;
    }
    const acc = useTrading.getState().replay;
    if (acc.positions.length || acc.orders.length) {
      useReplay.setState({ busy: true });
      try {
        await this.processTrading(st.cursor, target);
      } finally {
        useReplay.setState({ busy: false });
      }
      this.snapshots = [];
    }
    await this.moveTo(target);
  }

  /** Ordem manual durante o replay (ao preço do cursor). */
  placeOrder(o: { symbolId: string; side: Side; type: OrderType; qty: number; price?: number; sl?: number; tp?: number; trail?: number }): { ok: boolean; message?: string } {
    const st = this.state;
    if (!st.active || st.cursor === null) return { ok: false, message: 'O replay não está ativo.' };
    const mid = st.prices[o.symbolId];
    if (mid === undefined) return { ok: false, message: 'Ainda sem preço para este símbolo.' };
    const tr = useTrading.getState();
    const acc = cloneAccount(tr.replay);
    const r = placeOrder(acc, o, mid, st.cursor, specFor(resolveSymbol(o.symbolId)));
    tr.setAccount('replay', acc);
    if (r.fill) {
      tr.addExecs('replay', [r.fill]);
      this.listeners.forEach((l) => l([r.fill!]));
    }
    return { ok: true };
  }

  /** Recomeça uma sessão guardada. */
  async resume(sessionId: string) {
    const s = useTrading.getState().sessions.find((x) => x.id === sessionId);
    if (!s) return;
    useTrading.getState().setAccount('replay', cloneAccount(s.account));
    useTrading.getState().setSessionId(s.id);
    const ws = useWorkspace.getState();
    ws.updateChart(ws.active, { symbolId: s.symbolId, tf: s.tf });
    this.snapshots = [];
    useReplay.setState({ active: true, selecting: false, start: s.start, ended: false });
    await this.moveTo(s.cursor);
  }

  /** Guarda a sessão atual. */
  saveCurrent(name?: string): string | null {
    const st = this.state;
    if (!st.active || st.cursor === null || st.start === null) return null;
    const ws = useWorkspace.getState();
    const cfg = ws.charts[ws.active];
    const tr = useTrading.getState();
    const id = tr.saveSession({
      id: tr.sessionId ?? undefined,
      name: name ?? `${resolveSymbol(cfg.symbolId).name} · ${new Date(st.start * 1000).toISOString().slice(0, 10)}`,
      symbolId: cfg.symbolId,
      tf: cfg.tf,
      start: st.start,
      cursor: st.cursor,
      account: tr.replay,
    });
    tr.setSessionId(id);
    return id;
  }

  newAccount() {
    return newAccount(useSettings.getState().trading.initialBalance);
  }
}

export const replay = new ReplayEngine();

// ao abrir uma ordem ou posição durante o replay, os dados finos começam a carregar logo
if (typeof window !== 'undefined') {
  let lastKey = '';
  useTrading.subscribe((s) => {
    const acc = s.replay;
    const key = [...acc.positions.map((p) => p.symbolId), ...acc.orders.map((o) => o.symbolId)].sort().join(',');
    if (key === lastKey) return;
    lastKey = key;
    const st = useReplay.getState();
    if (key && st.active && !st.selecting && st.cursor !== null) replay.prefetchFine(st.cursor, replay.stepSpan(), FINE_FIRST_BARS);
  });
}
