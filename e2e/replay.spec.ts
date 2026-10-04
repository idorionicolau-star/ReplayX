import { expect, test } from '@playwright/test';
import { chartInfo, chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('bar replay: começar, avançar, trocar de timeframe e negociar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=right-tab-watchlist]');

  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  const start = await chartInfo(page);
  expect(start.cursor).not.toBeNull();
  expect(start.tf).toBe('15m');

  for (let i = 0; i < 4; i++) await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 4 * 900);

  await page.click('[data-testid=replay-buy]');
  await expect(page.getByText('Compra executada')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  const c15 = (await chartInfo(page)).cursor!;

  // troca para 1h a meio do replay: o cursor mantém-se e a vela de 1h fica parcial
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('1h');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c15);
  // espera que as velas de 1h estejam carregadas
  await expect.poll(async () => (await chartInfo(page)).last.time % 3600).toBe(0);
  const h = await chartInfo(page);
  expect(h.last.time).toBeLessThan(c15);
  expect(h.last.time + 3600).toBeGreaterThanOrEqual(c15);

  // avançar no 1h completa a vela
  await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(h.last.time + 3600);
  const done = await chartInfo(page);
  expect(done.last.time).toBe(h.last.time);
  expect(done.last.high).toBeGreaterThanOrEqual(h.last.high);
  expect(done.last.low).toBeLessThanOrEqual(h.last.low);

  // recuar volta ao ponto anterior
  await page.click('[data-testid=replay-back]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c15);

  // fecha a posição pelo painel e confirma no diário
  await page.click('[data-testid=right-tab-trade]');
  await page.getByText('Fechar', { exact: true }).click();
  await page.click('[data-testid=bottom-tab-journal]');
  await expect(page.getByText(/Operações \(1\)/)).toBeVisible();

  await page.click('[data-testid=replay-exit]');
  await expect(page.getByTestId('replay-bar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('desenhos sobrevivem à troca de timeframe', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  await page.click('[data-testid=right-tab-watchlist]');
  await page.click('[data-testid=tool-trendline]');
  await page.mouse.click(400, 600);
  await page.mouse.click(800, 300);
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('1h');
  const xs = await page.evaluate(() => {
    const charts = (window as unknown as { __rxCharts: Map<string, { drawings: { points: { time: number }[] }[]; timeToX(t: number): number | null }> }).__rxCharts;
    const c = [...charts.values()][0];
    return c.drawings[0].points.map((p) => c.timeToX(p.time));
  });
  expect(xs[0]).toBeGreaterThan(0);
  expect(xs[1]).toBeGreaterThan(xs[0]!);
});
