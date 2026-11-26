import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { enterAsGuest, waitBars } from './helpers';

/** Deriv simulada. As ligações com índice < `deadBefore` ficam "meio mortas": abertas, mas sem responder (como depois de o telemóvel adormecer). */
const sim = { price: 400100, conns: 0, deadBefore: 0 };

function server(ws: WebSocketRoute) {
  const me = sim.conns++;
  ws.onMessage((raw) => {
    if (me < sim.deadBefore) return;
    const msg = JSON.parse(String(raw));
    const reply = (o: Record<string, unknown>) => ws.send(JSON.stringify({ ...o, req_id: msg.req_id, echo_req: msg }));
    if (msg.ping) return reply({ msg_type: 'ping', ping: 'pong' });
    if (msg.forget) return reply({ msg_type: 'forget', forget: 1 });
    if (msg.active_symbols) return reply({ msg_type: 'active_symbols', active_symbols: [{ underlying_symbol: 'R_75', underlying_symbol_name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, exchange_is_open: 1, is_trading_suspended: 0 }] });
    if (msg.ticks_history && msg.style === 'ticks') return reply({ msg_type: 'history', history: { times: [Math.floor(Date.now() / 1000)], prices: [sim.price.toFixed(4)] } });
    if (msg.ticks_history) {
      const gran = msg.granularity as number;
      const end = msg.end === 'latest' ? Math.floor(Date.now() / 1000) : (msg.end as number);
      const start = msg.start as number | undefined;
      const now = Math.floor(Date.now() / 1000);
      const last = Math.floor(Math.min(end, now) / gran) * gran;
      const want = Math.min(msg.count as number, 5000);
      const candles: unknown[] = [];
      for (let t = last; candles.length < want && (start === undefined || t >= start); t -= gran) {
        // a vela atual fecha no preço de agora
        const c = t === Math.floor(now / gran) * gran ? sim.price : 400000 + 50 * Math.sin(t / 5000);
        candles.unshift({ epoch: t, open: c.toFixed(4), high: (c + 5).toFixed(4), low: (c - 5).toFixed(4), close: c.toFixed(4) });
      }
      return reply({ msg_type: 'candles', candles, pip_size: 4 });
    }
    if (msg.ticks) return reply({ msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: sim.price, symbol: msg.ticks, pip_size: 4 }, subscription: { id: `s${me}` } });
    reply({ msg_type: 'error', error: { code: 'UnrecognisedRequest', message: 'x' } });
  });
}

const lastClose = (page: Page) =>
  page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { bars: { close: number }[] }> }).__rxCharts.values()][0];
    return c.bars[c.bars.length - 1].close;
  });

/** Ecrã bloqueado: a página fica escondida e (como no telemóvel) os temporizadores não correm, por isso a pausa do tempo real nunca acontece. */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
    if (h) {
      const c = [...(window as unknown as { __rxCharts: Map<string, { pauseTimer: ReturnType<typeof setTimeout> | null }> }).__rxCharts.values()][0];
      if (c.pauseTimer) clearTimeout(c.pauseTimer);
      c.pauseTimer = null;
    }
  }, hidden);
}

test('depois do standby (ligação meio morta e temporizadores congelados) o gráfico volta a mostrar o preço atual sozinho', async ({ page }) => {
  sim.price = 400100;
  sim.conns = 0;
  sim.deadBefore = 0;
  await page.routeWebSocket(/binance/, (ws) => ws.close());
  await page.routeWebSocket(/derivws\.com|binaryws\.com/, (ws) => server(ws));
  await enterAsGuest(page);
  await waitBars(page, 100);
  await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { pauseAfterMs?: number }> }).__rxCharts.values()][0];
    c.pauseAfterMs = 1500;
  });
  await expect.poll(() => lastClose(page)).toBeCloseTo(400100, 2);

  // standby: a ligação morre sem fechar e o preço muda entretanto
  await setHidden(page, true);
  sim.deadBefore = sim.conns;
  sim.price = 400777;
  await page.waitForTimeout(3500);
  const connsBefore = sim.conns;
  await setHidden(page, false);

  // sem mexer em nada: liga outra vez e o gráfico apanha o preço atual
  await expect.poll(() => sim.conns, { timeout: 20_000 }).toBeGreaterThan(connsBefore);
  await expect.poll(() => lastClose(page), { timeout: 20_000 }).toBeCloseTo(400777, 2);
});
