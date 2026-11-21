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

test('íman: a ponta do desenho fica exatamente onde o anel laranja prendeu (mesma vela e mesmo preço)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'firm' }, version: 3 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=tool-trendline]');
  // procura duas velas seguidas em que a vela do cursor fica longe do preço da seguinte: o anel só pode estar na vizinha
  const t = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
    for (let i = c.bars.length - 80; i < c.bars.length - 3; i++) {
      const a = c.bars[i];
      const n = c.bars[i + 1];
      const ty = c.priceToY(n.high);
      const gap = Math.min(...[a.open, a.high, a.low, a.close].map((v: number) => Math.abs(c.priceToY(v) - ty)));
      if (gap > 14) return { x: c.timeToX(a.time), x2: c.timeToX(n.time), y: ty };
    }
    throw new Error('sem velas adequadas');
  });
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  const sp = t.x2 - t.x;
  const px = canvas.x + t.x + sp * 0.3;
  const py = canvas.y + t.y;
  await page.mouse.move(px, py);
  await page.mouse.click(px, py);
  await page.waitForTimeout(250);
  const mark = await page.evaluate(() => ({ ...[...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].snapMark }));
  await page.mouse.click(px + 120, py + 40); // 2.º ponto: fecha a linha
  await page.waitForTimeout(250);
  const r = await page.evaluate((mk) => {
    const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
    const d = c.drawings[c.drawings.length - 1];
    const p = d.points[0];
    return { px: c.timeToX(p.time), py: c.priceToY(p.price), mark: mk as { x: number; y: number } | null };
  }, mark);
  expect(r.mark?.x).toBeDefined();
  expect(Math.abs(r.px! - r.mark!.x)).toBeLessThan(0.6);
  expect(Math.abs(r.py! - r.mark!.y)).toBeLessThan(0.6);
});
