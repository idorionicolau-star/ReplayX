import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { chartInfo, enterAsGuest, waitBars } from './helpers';

/** Servidor Deriv simulado (mesmo protocolo do endpoint público). */
function derivServer(ws: WebSocketRoute, opts: { newApi: boolean }) {
  let price = 412345.67;
  ws.onMessage((raw) => {
    const msg = JSON.parse(String(raw));
    const reply = (o: Record<string, unknown>) => ws.send(JSON.stringify({ ...o, req_id: msg.req_id, echo_req: msg }));
    if (msg.ping) return reply({ msg_type: 'ping', ping: 'pong' });
    if (msg.forget) return reply({ msg_type: 'forget', forget: 1 });
    if (msg.active_symbols) {
      const row = opts.newApi
        ? { underlying_symbol: 'R_75', underlying_symbol_name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, exchange_is_open: 1, is_trading_suspended: 0 }
        : { symbol: 'R_75', display_name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', pip: 0.0001, exchange_is_open: 1, is_trading_suspended: 0 };
      return reply({ msg_type: 'active_symbols', active_symbols: [row] });
    }
    if (msg.ticks_history) {
      const gran = msg.granularity as number;
      const end = msg.end === 'latest' ? Math.floor(Date.now() / 1000) : (msg.end as number);
      const count = Math.min(msg.count as number, 5000);
      const last = Math.floor(end / gran) * gran;
      const start = msg.start ? Math.max(msg.start as number, last - (count - 1) * gran) : last - (count - 1) * gran;
      const candles = [];
      for (let t = Math.ceil(start / gran) * gran; t <= last; t += gran) {
        const o = 400000 + 5000 * Math.sin(t / 50000);
        const c = 400000 + 5000 * Math.sin((t + gran) / 50000);
        candles.push({ epoch: t, open: o.toFixed(4), high: (Math.max(o, c) + 50).toFixed(4), low: (Math.min(o, c) - 50).toFixed(4), close: c.toFixed(4) });
      }
      return reply({ msg_type: 'candles', candles, pip_size: 4 });
    }
    if (msg.ticks) {
      const sub = { id: 'sub-' + msg.ticks };
      reply({ msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: price, symbol: msg.ticks, pip_size: 4 }, subscription: sub });
      const timer = setInterval(() => {
        price += 10;
        // o endpoint novo envia os ticks seguintes só com o id da subscrição
        const base = { msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: price, symbol: msg.ticks }, subscription: sub };
        ws.send(JSON.stringify(opts.newApi ? base : { ...base, req_id: msg.req_id }));
      }, 500);
      ws.onClose(() => clearInterval(timer));
      return;
    }
    reply({ msg_type: 'error', error: { code: 'UnrecognisedRequest', message: 'Unrecognised request' } });
  });
}

async function blockBinance(page: Page) {
  await page.routeWebSocket(/binance/, (ws) => ws.close());
}

test('Deriv (endpoint novo): carrega o Volatility 75 e recebe ticks', async ({ page }) => {
  await blockBinance(page);
  await page.routeWebSocket(/derivws\.com|binaryws\.com/, (ws) => derivServer(ws, { newApi: true }));
  await enterAsGuest(page);
  await waitBars(page, 100);
  const info = await chartInfo(page);
  expect(info.symbol).toBe('DERIV:R_75');
  expect(info.tf).toBe('15m');
  expect(info.last.close).toBeGreaterThan(390000);
  // cotação ao vivo na lista
  await expect(page.getByTestId('watch-DERIV:R_75')).toContainText(/41\d[ ,.]?\d{3}/);
});

test('Deriv: recorre ao endpoint antigo quando o novo falha', async ({ page }) => {
  await blockBinance(page);
  await page.routeWebSocket(/api\.derivws\.com/, (ws) => ws.close({ code: 1011, reason: 'down' }));
  await page.routeWebSocket(/ws\.derivws\.com|ws\.binaryws\.com/, (ws) => derivServer(ws, { newApi: false }));
  await enterAsGuest(page);
  await waitBars(page, 100);
  expect((await chartInfo(page)).symbol).toBe('DERIV:R_75');
});

test('Binance: carrega velas de BTCUSDT pela API REST', async ({ page }) => {
  await page.routeWebSocket(/derivws\.com|binaryws\.com/, (ws) => derivServer(ws, { newApi: true }));
  await page.routeWebSocket(/binance/, () => undefined);
  await page.route(/binance\.(vision|com)\/api\/v3\/klines/, async (route) => {
    const u = new URL(route.request().url());
    const limit = Number(u.searchParams.get('limit'));
    const end = Number(u.searchParams.get('endTime'));
    const step = 15 * 60_000;
    const last = Math.floor(end / step) * step;
    const rows = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = last - i * step;
      const o = 60000 + 1000 * Math.sin(t / 3e7);
      const c = 60000 + 1000 * Math.sin((t + step) / 3e7);
      rows.push([t, o.toFixed(2), (Math.max(o, c) + 20).toFixed(2), (Math.min(o, c) - 20).toFixed(2), c.toFixed(2), '12.5', t + step - 1]);
    }
    await route.fulfill({ json: rows, headers: { 'access-control-allow-origin': '*' } });
  });
  await enterAsGuest(page);
  await page.click('[data-testid=symbol-button]');
  await page.fill('[data-testid=symbol-search-input]', 'BTCUSDT');
  await page.click('[data-testid="symbol-row-BINANCE:BTCUSDT"]');
  await expect.poll(async () => (await chartInfo(page)).symbol).toBe('BINANCE:BTCUSDT');
  await waitBars(page, 100);
  const info = await chartInfo(page);
  expect(info.last.close).toBeGreaterThan(58000);
  expect(info.last.close).toBeLessThan(62000);
});
