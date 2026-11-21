import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

/** Põe o íman no nível pedido, escolhe a linha de tendência e devolve se o íman prendeu quando se clica `dy` px acima do máximo de uma vela. */
async function snaps(page: import('@playwright/test').Page, magnet: string, dy: number): Promise<boolean> {
  await page.addInitScript((m) => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: m }, version: 3 })), magnet);
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=tool-trendline]');
  const target = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
    const i = c.bars.length - 30;
    const b = c.bars[i];
    return { x: c.timeToX(b.time), y: c.priceToY(b.high) };
  });
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  // o 1.º clique da linha passa pelo íman (e deixa a marca do ponto onde prendeu)
  await page.mouse.move(canvas.x + target.x, canvas.y + target.y - dy);
  await page.mouse.click(canvas.x + target.x, canvas.y + target.y - dy);
  await page.waitForTimeout(250);
  return page.evaluate(() => !![...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].snapMark);
}

test.describe('íman: níveis', () => {
  test('nível 1 (fraco) prende a 4 px do preço (controlo)', async ({ page }) => {
    expect(await snaps(page, 'weak', 4)).toBe(true);
  });
  test('nível 1 (fraco) não prende a 34 px do preço', async ({ page }) => {
    expect(await snaps(page, 'weak', 34)).toBe(false);
  });
  test('nível 3 (médio) prende a 34 px do preço', async ({ page }) => {
    expect(await snaps(page, 'medium', 34)).toBe(true);
  });
  test('nível 2 (leve) prende a 20 px do preço', async ({ page }) => {
    expect(await snaps(page, 'light', 20)).toBe(true);
  });
});
