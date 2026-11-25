import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

type Pt = { time: number; price: number };
const drawing = (page: Page) =>
  page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { drawings: { points: Pt[] }[]; timeToLogical: (t: number) => number | null }> }).__rxCharts.values()][0];
    const d = c.drawings[c.drawings.length - 1];
    return d ? d.points.map((p) => ({ l: Math.round(c.timeToLogical(p.time) ?? NaN), price: p.price })) : null;
  });

test('setas movem o desenho selecionado (← → uma barra, ↑ ↓ no preço, Shift 10×) e Ctrl+Z desfaz', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 100);
  await page.click('[data-testid=fav-tool-trendline]');
  const box = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.35);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35);
  await page.waitForTimeout(300);
  const p0 = (await drawing(page))!;
  expect(p0).toHaveLength(2);
  // seleciona o desenho clicando no meio da linha
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.425);
  await page.waitForTimeout(200);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await drawing(page))![0].l).toBe(p0[0].l + 1);
  expect((await drawing(page))![1].l).toBe(p0[1].l + 1);

  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await drawing(page))![0].l).toBe(p0[0].l - 9);

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await drawing(page))![0].price).toBeGreaterThan(p0[0].price);
  const up = (await drawing(page))!;
  expect(up[1].price - p0[1].price).toBeCloseTo(up[0].price - p0[0].price, 6);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await drawing(page))![0].price).toBeLessThan(p0[0].price);

  // Ctrl+Z desfaz um toque de cada vez
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await drawing(page))![0].price).toBeCloseTo(p0[0].price, 6);

  // sem desenho selecionado as setas não mexem em nada
  await page.keyboard.press('Escape');
  const before = await drawing(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  expect(await drawing(page)).toEqual(before);
});
