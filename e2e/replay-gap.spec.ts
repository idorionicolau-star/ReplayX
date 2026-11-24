import { expect, test, type WebSocketRoute } from '@playwright/test';
import { enterAsGuest, waitBars } from './helpers';

function server(ws: WebSocketRoute) {
  let price = 412345.67;
  ws.onMessage((raw) => {
    const msg = JSON.parse(String(raw));
    const reply = (o: Record<string, unknown>) => ws.send(JSON.stringify({ ...o, req_id: msg.req_id, echo_req: msg }));
    if (msg.ping) return reply({ msg_type: 'ping', ping: 'pong' });
    if (msg.forget) return reply({ msg_type: 'forget', forget: 1 });
    if (msg.active_symbols) return reply({ msg_type: 'active_symbols', active_symbols: [{ underlying_symbol: 'R_75', underlying_symbol_name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', pip_size: 0.0001, exchange_is_open: 1, is_trading_suspended: 0 }] });
    if (msg.ticks_history && msg.style === 'ticks') return reply({ msg_type: 'history', history: { times: [Math.floor(Date.now() / 1000)], prices: [price.toFixed(4)] } });
    if (msg.ticks_history) {
      const gran = msg.granularity as number;
      const end = msg.end === 'latest' ? Math.floor(Date.now() / 1000) : (msg.end as number);
      const start = msg.start as number | undefined;
      const candles: unknown[] = [];
      const wk = (t: number) => { const d = new Date(t * 1000).getUTCDay(); return d !== 6 && d !== 0; };
      const last = Math.floor(end / gran) * gran;
      const want = Math.min(msg.count as number, 5000);
      // anda para trás a saltar fins de semana (sem velas)
      for (let t = last; candles.length < want && (start === undefined || t >= start); t -= gran) {
        if (!wk(t)) continue;
        const o = 400000 + 5000 * Math.sin(t / 50000);
        candles.unshift({ epoch: t, open: o.toFixed(4), high: (o + 50).toFixed(4), low: (o - 50).toFixed(4), close: (o + 10).toFixed(4) });
      }
      return reply({ msg_type: 'candles', candles, pip_size: 4 });
    }
    if (msg.ticks) { reply({ msg_type: 'tick', tick: { epoch: Math.floor(Date.now() / 1000), quote: price, symbol: msg.ticks, pip_size: 4 }, subscription: { id: 's' } }); return; }
    reply({ msg_type: 'error', error: { code: 'UnrecognisedRequest', message: 'x' } });
  });
}

test('replay: os desenhos à frente do cursor (e a caixa de posição) não saltam ao cruzar um fim de semana sem velas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.routeWebSocket(/binance/, (ws) => ws.close());
  await page.routeWebSocket(/derivws\.com|binaryws\.com/, (ws) => server(ws));
  await enterAsGuest(page);
  await waitBars(page, 100);
  // desenhos DEPOIS do fim de semana (segunda e terça), feitos ao vivo
  await page.evaluate(() => {
    const c = [...(window as any).__rxCharts.values()][0];
    let g = 0;
    for (let i = 1; i < c.bars.length; i++) if (c.bars[i].time - c.bars[i - 1].time > 86400) g = i;
    c.chart.timeScale().setVisibleLogicalRange({ from: g - 20, to: Math.min(c.bars.length + 5, g + 75) });
  });
  await page.waitForTimeout(400);
  await page.click('[data-testid=fav-tool-trendline]');
  const pts = await page.evaluate(() => {
    const c = [...(window as any).__rxCharts.values()][0];
    const b0 = c.bars;
    let g = 0; // o último fim de semana sem velas
    for (let i = 1; i < b0.length; i++) if (b0[i].time - b0[i - 1].time > 86400) g = i;
    const a = b0[g + 5], b = b0[Math.min(b0.length - 5, g + 45)];
    return { a: { x: c.timeToX(a.time), y: c.priceToY(a.high) }, b: { x: c.timeToX(b.time), y: c.priceToY(b.high) } };
  });
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(canvas.x + pts.a.x, canvas.y + pts.a.y);
  await page.mouse.move(canvas.x + pts.b.x, canvas.y + pts.b.y);
  await page.mouse.click(canvas.x + pts.b.x, canvas.y + pts.b.y);
  await page.waitForTimeout(300);
  await page.click('[data-testid=fav-tool-long]');
  await page.mouse.click(canvas.x + pts.b.x + 30, canvas.y + pts.b.y + 50);
  await page.waitForTimeout(300);
  // replay a partir de 6 velas antes do fim de semana
  const startT = await page.evaluate(() => { const c = [...(window as any).__rxCharts.values()][0]; const b = c.bars; let g = 0; for (let i = 1; i < b.length; i++) if (b[i].time - b[i - 1].time > 86400) g = i; return b[g - 6].time; });
  await page.evaluate(() => {
    const c = [...(window as any).__rxCharts.values()][0];
    let g = 0;
    for (let i = 1; i < c.bars.length; i++) if (c.bars[i].time - c.bars[i - 1].time > 86400) g = i;
    c.chart.timeScale().setVisibleLogicalRange({ from: g - 40, to: g + 40 });
  });
  await page.waitForTimeout(300);
  await page.click('[data-testid=replay-button]');
  const sx = await page.evaluate((t) => [...(window as any).__rxCharts.values()][0].timeToX(t), startT);
  await page.mouse.click(canvas.x + sx + 4, 450);
  await page.getByTestId('replay-bar').waitFor();
  await page.waitForTimeout(1500);
  const seen: { label: string; cursor: number; lg: number[][]; last: number }[] = [];
  const snap = async (label: string) => {
    const info = await page.evaluate(() => {
      const c = [...(window as any).__rxCharts.values()][0];
      return { cursor: c.cursor, n: c.bars.length, last: c.bars[c.bars.length - 1].time, lg: c.drawings.map((x: any) => x.points.map((p: any) => +c.timeToLogical(p.time).toFixed(1))) };
    });
    seen.push({ label, ...info });
  };
  await snap('start');
  for (let i = 1; i <= 9; i++) {
    await page.click('[data-testid=replay-forward]');
    await page.waitForTimeout(450);
    await snap('step' + i);
  }
  // o fim de semana foi cruzado dentro dos passos (a vela seguinte está a mais de 1 dia da anterior)
  const crossed = seen.some((x, i) => i > 0 && x.last - seen[i - 1].last > 86400);
  expect(crossed).toBe(true);
  // e, mesmo assim, os desenhos ficaram exatamente no mesmo sítio da linha do tempo
  for (const x of seen) expect(x.lg).toEqual(seen[0].lg);
});
