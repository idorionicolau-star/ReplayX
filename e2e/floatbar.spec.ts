import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

async function drawLine(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((st) => localStorage.setItem('rx-settings', JSON.stringify({ state: st, version: 3 })), { magnet: 'off', ...settings });
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-trendline]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  const a = { x: canvas.x + 250, y: canvas.y + 380 };
  const b = { x: canvas.x + 520, y: canvas.y + 330 };
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(300);
  const box = (await page.getByTestId('drawing-float').boundingBox())!;
  return { box, b, canvas };
}

test('barra do desenho: por omissão abre junto ao rato, no último clique', async ({ page }) => {
  const { box, b, canvas } = await drawLine(page, {});
  await expect(page.getByTestId('drawing-float')).toHaveAttribute('data-near-mouse', 'true');
  // fica perto do clique (acima à direita) e dentro do gráfico
  expect(Math.abs(box.x - b.x)).toBeLessThan(60);
  expect(b.y - (box.y + box.height)).toBeLessThan(40);
  expect(b.y - (box.y + box.height)).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width);
});

test('barra do desenho: desligada nas definições fica no topo, ao centro, como antes', async ({ page }) => {
  const { box, canvas } = await drawLine(page, { floatNearMouse: false });
  await expect(page.getByTestId('drawing-float')).not.toHaveAttribute('data-near-mouse', 'true');
  expect(Math.abs(box.x + box.width / 2 - (canvas.x + canvas.width / 2))).toBeLessThan(40);
  expect(box.y - canvas.y).toBeLessThan(70);
});

test('barra do desenho: perto do canto não sai do gráfico', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'off' }, version: 3 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-hline]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width - 30, canvas.y + 20); // canto superior direito do gráfico
  await page.waitForTimeout(300);
  const box = (await page.getByTestId('drawing-float').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(canvas.y);
});
