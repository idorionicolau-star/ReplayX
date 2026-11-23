import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { enterAsGuest, waitBars } from './helpers';

/** Servidor Deriv simulado que regista os pedidos de velas. */
function derivServer(ws: WebSocketRoute, log: { count: number; hasStart: boolean }[]) {
  let price = 412345.67;
  ws.onMessage((raw) => {
    const msg = JSON.parse(String(raw));
    const reply = (o: Record<string, unknown>) => ws.send(JSON.stringify({ ...o, req_id: msg.req_id, echo_req: msg }));
    if (msg.ping) return reply({ msg_type: 'ping', ping: 'pong' });
    if (msg.forget) return reply({ msg_type: 'forget', forget: 1 });
    if (msg.active_symbols) {
      return reply({ msg_type: 'active_symbols', active_symbols: [{ underlying_symbol: 'R_75', underlying_symbol_name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, exchange_is_open: 1, is_trading_suspended: 0 }] });
    }
    if (msg.ticks_history && msg.style === 'ticks') {
      const now = Math.floor(Date.now() / 1000);
      return reply({ msg_type: 'history', history: { times: [now], prices: [price.toFixed(4)] } });
    }
    if (msg.ticks_history) {
      const gran = msg.granularity as number;
      const end = msg.end === 'latest' ? Math.floor(Date.now() / 1000) : (msg.end as number);
      const count = Math.min(msg.count as number, 5000);
      log.push({ count: msg.count as number, hasStart: msg.start !== undefined });
      const last = Math.floor(end / gran) * gran;
      const start = msg.start ? Math.max(msg.start as number, last - (count - 1) * gran) : last - (count - 1) * gran;
      const candles = [];
      for (let t = Math.ceil(start / gran) * gran; t <= last; t += gran) {
        const o = 400000 + 5000 * Math.sin(t / 50000);
        candles.push({ epoch: t, open: o.toFixed(4), high: (o + 50).toFixed(4), low: (o - 50).toFixed(4), close: (o + 10).toFixed(4) });
      }
      return reply({ msg_type: 'candles', candles, pip_size: 4 });
    }
    if (msg.ticks) {
      const sub = { id: 'sub-' + msg.ticks };
      reply({ msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: price, symbol: msg.ticks, pip_size: 4 }, subscription: sub });
      const timer = setInterval(() => {
        price += 10;
        ws.send(JSON.stringify({ msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: price, symbol: msg.ticks }, subscription: sub }));
      }, 1000);
      ws.onClose(() => clearInterval(timer));
      return;
    }
    reply({ msg_type: 'error', error: { code: 'UnrecognisedRequest', message: 'Unrecognised request' } });
  });
}

async function mock(page: Page, log: { count: number; hasStart: boolean }[]) {
  await page.routeWebSocket(/binance/, (ws) => ws.close());
  await page.routeWebSocket(/derivws\.com|binaryws\.com/, (ws) => derivServer(ws, log));
}

test('cache das velas: ao reabrir a app não descarrega outra vez o histórico que já tem', async ({ page }) => {
  test.setTimeout(60_000);
  const first: { count: number; hasStart: boolean }[] = [];
  await mock(page, first);
  await enterAsGuest(page);
  await waitBars(page, 100);
  // o pedido grande do histórico (1500 velas) foi feito na 1.ª vez
  expect(first.some((r) => r.count >= 1000)).toBe(true);
  // dá tempo a guardar no dispositivo (guarda 3 s depois do último pedido)
  await page.waitForTimeout(4500);
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('rx-bars');
        req.onsuccess = () => {
          const t = req.result.transaction('meta', 'readonly');
          const c = t.objectStore('meta').count();
          c.onsuccess = () => resolve(c.result);
        };
        req.onerror = () => resolve(-1);
      }),
  );
  expect(stored).toBeGreaterThan(0);

  // "reabrir a app": nova página no mesmo contexto (o IndexedDB mantém-se)
  const page2 = await page.context().newPage();
  const second: { count: number; hasStart: boolean }[] = [];
  await mock(page2, second);
  await page2.goto('/terminal');
  await page2.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  await waitBars(page2, 100);
  expect(second.some((r) => r.count >= 1000)).toBe(false); // não pediu as 1500 velas de novo
  await page2.close();
});

test('"Limpar cache de dados" apaga também as velas guardadas', async ({ page }) => {
  test.setTimeout(60_000);
  const log: { count: number; hasStart: boolean }[] = [];
  await mock(page, log);
  await enterAsGuest(page);
  await waitBars(page, 100);
  await page.waitForTimeout(4500);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  await page.getByRole('dialog').getByText('Dados', { exact: true }).click();
  await page.getByRole('button', { name: 'Limpar cache de dados' }).click();
  await page.waitForTimeout(500);
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('rx-bars');
        req.onsuccess = () => {
          const t = req.result.transaction('meta', 'readonly');
          const c = t.objectStore('meta').count();
          c.onsuccess = () => resolve(c.result);
        };
        req.onerror = () => resolve(-1);
      }),
  );
  expect(stored).toBe(0);
});
