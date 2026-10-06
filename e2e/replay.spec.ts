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
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 7 * 900);
  // o teste precisa de uma vela de 1h a meio: se o cursor calhar numa hora certa, avança mais 15m
  if ((start.cursor! + 7 * 900) % 3600 === 0) {
    await page.click('[data-testid=replay-forward]');
    await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 8 * 900);
  }
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

test('a barra do replay arrasta-se e fica onde foi deixada (duplo clique repõe)', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  const bar = page.getByTestId('replay-bar');
  await expect(bar).toBeVisible();
  const b0 = (await bar.boundingBox())!;
  const g = (await page.getByTestId('replay-grip').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 40, g.y + g.height / 2 - 160, { steps: 6 });
  await page.mouse.up();
  const b1 = (await bar.boundingBox())!;
  expect(b0.y - b1.y).toBeGreaterThan(120);
  expect(b1.x - b0.x).toBeGreaterThan(20);
  // fica guardada
  await page.reload();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') || '{}').state?.replayBarPos);
  expect(saved).toBeTruthy();
  // duplo clique na pega repõe a posição
  const g2 = page.getByTestId('replay-grip');
  if (await g2.isVisible()) {
    await g2.dblclick();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') || '{}').state?.replayBarPos)).toBeNull();
  }
});

test('ordem no gráfico: SL à esquerda e TP à direita arrastáveis, lote com + e −, envio de ordem pendente', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await page.getByTestId('replay-order').click();
  const sl = page.getByTestId('ticket-sl');
  const tp = page.getByTestId('ticket-tp');
  const entry = page.getByTestId('ticket-entry');
  await expect(sl).toBeVisible();
  const [bs, bt, be] = [(await sl.boundingBox())!, (await tp.boundingBox())!, (await entry.boundingBox())!];
  expect(bs.x).toBeLessThan(be.x); // SL à esquerda
  expect(bt.x).toBeGreaterThan(be.x); // TP à direita
  expect(bs.y).toBeGreaterThan(be.y); // compra: SL abaixo
  expect(bt.y).toBeLessThan(be.y); // TP acima
  // arrastar o TP para cima aumenta o preço
  const price = async (id: string) => parseFloat(((await page.getByTestId(id).innerText()).match(/TP\s+([\d.]+)/) ?? (await page.getByTestId(id).innerText()).match(/SL\s+([\d.]+)/))![1]);
  const tp0 = await price('ticket-tp');
  await page.mouse.move(bt.x + bt.width / 2, bt.y + bt.height / 2);
  await page.mouse.down();
  await page.mouse.move(bt.x + bt.width / 2, bt.y + bt.height / 2 - 60, { steps: 6 });
  await page.mouse.up();
  expect(await price('ticket-tp')).toBeGreaterThan(tp0);
  // lote: + passa ao degrau seguinte
  const q0 = (await page.getByTestId('qty-value').first().innerText()).trim();
  await page.getByTestId('qty-plus').first().click();
  expect((await page.getByTestId('qty-value').first().innerText()).trim()).not.toBe(q0);
  // entrada mais abaixo do preço = compra limite pendente
  await page.mouse.move(be.x + be.width / 2, be.y + be.height / 2);
  await page.mouse.down();
  await page.mouse.move(be.x + be.width / 2, be.y + be.height / 2 + 70, { steps: 6 });
  await page.mouse.up();
  await expect(entry).toContainText('LIMITE');
  await page.getByTestId('ticket-send').click();
  await expect(page.getByText('Ordem pendente colocada')).toBeVisible();
  await expect(page.getByTestId('order-ticket')).toBeHidden();
});

test('lote pelo risco: afastar o stop reduz o lote e o painel mostra as regras do ativo', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await page.getByTestId('replay-order').click();
  const info = page.getByTestId('ticket-lot-info');
  await expect(info).toContainText('mín.');
  await expect(info).toContainText('passo');
  await page.getByTestId('ticket-mode-risk').click();
  const lot = async () => parseFloat(((await info.locator('b').first().innerText()) ?? '0').replace(',', '.'));
  const risk = async () => parseFloat((await info.locator('b').nth(1).innerText()).replace(/[^\d.,-]/g, '').replace(',', '.'));
  const l0 = await lot();
  const r0 = await risk();
  expect(l0).toBeGreaterThan(0);
  // arrastar o SL para mais longe da entrada: com o risco fixo o lote tem de baixar
  const sl = page.getByTestId('ticket-sl');
  const b = (await sl.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 90, { steps: 6 });
  await page.mouse.up();
  await expect.poll(lot).toBeLessThan(l0);
  // o risco em dinheiro mantém-se (≈ 1% da conta, arredondado para baixo ao passo do lote)
  const r1 = await risk();
  expect(r1).toBeLessThanOrEqual(r0 * 1.02);
  expect(r1).toBeGreaterThan(r0 * 0.5);
  // risco +: o lote sobe
  const l1 = await lot();
  await page.getByTestId('risk-plus').click();
  await expect.poll(lot).toBeGreaterThan(l1);
});

test('definições: regras de lote por tipo de mercado e ajuste do lote ao enviar', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  // lote guardado fora das regras (0,004) é ajustado ao mínimo do ativo (0,01) ao enviar
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rx-settings') || '{}');
    raw.state = { ...(raw.state ?? {}), trading: { ...(raw.state?.trading ?? {}), defaultQty: 0.004 } };
    localStorage.setItem('rx-settings', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await expect(page.getByTestId('qty-value').first()).toHaveText(/0[.,]01/);
  await page.getByTestId('replay-buy').click();
  await expect(page.getByText('Compra executada')).toBeVisible();
});
