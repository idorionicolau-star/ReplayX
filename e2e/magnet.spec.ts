import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

/** Põe o íman no nível pedido, escolhe a linha de tendência e devolve se o íman prendeu quando se clica `dy` px acima do máximo de uma vela. */
async function snaps(page: import('@playwright/test').Page, magnet: string, dy: number, ctrl = false): Promise<boolean> {
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
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.move(canvas.x + target.x, canvas.y + target.y - dy);
  await page.mouse.click(canvas.x + target.x, canvas.y + target.y - dy);
  await page.waitForTimeout(250);
  if (ctrl) await page.keyboard.up('Control');
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
  test('Ctrl com o íman ligado desliga-o (livre) enquanto está premido', async ({ page }) => {
    expect(await snaps(page, 'medium', 20, true)).toBe(false);
  });
  test('Ctrl com o íman desligado liga-o enquanto está premido', async ({ page }) => {
    expect(await snaps(page, 'off', 20, true)).toBe(true);
  });
  test('sem Ctrl e com o íman desligado não prende (controlo)', async ({ page }) => {
    expect(await snaps(page, 'off', 20, false)).toBe(false);
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

test.describe('íman de preço (Alt / automático)', () => {
  async function dropHline(page: import('@playwright/test').Page, alt: boolean, settings: Record<string, unknown>, dy = 7) {
    await page.addInitScript((st) => localStorage.setItem('rx-settings', JSON.stringify({ state: st, version: 3 })), { magnet: 'off', ...settings });
    await enterAsGuest(page);
    await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
    await waitBars(page, 300);
    await page.click('[data-testid=fav-tool-hline]');
    const t = await page.evaluate((off) => {
      const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
      const i = c.bars.length - 40;
      const hi = c.bars[i].high;
      // cursor 7 px abaixo do máximo e muito à direita da vela (espaço vazio)
      // dy > 0: px abaixo do máximo de uma vela; dy < 0: px acima do pavio mais alto à vista (sem nenhum pavio por perto)
      const r = c.chart.timeScale().getVisibleLogicalRange();
      const topY = Math.min(...c.bars.slice(Math.max(0, Math.floor(r.from)), Math.ceil(r.to) + 1).map((b: { high: number }) => c.priceToY(b.high)));
      return { hi, x: c.timeToX(c.bars[c.bars.length - 1].time) + 60, y: off >= 0 ? c.priceToY(hi) + off : topY + off };
    }, dy);
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(canvas.x + t.x, canvas.y + t.y);
    await page.mouse.click(canvas.x + t.x, canvas.y + t.y);
    await page.waitForTimeout(250);
    if (alt) await page.keyboard.up('Alt');
    const drawn = await page.evaluate((cursorY) => {
      const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
      const price = c.drawings[c.drawings.length - 1].points[0].price as number;
      const r = c.chart.timeScale().getVisibleLogicalRange();
      const vis = c.bars.slice(Math.max(0, Math.floor(r.from)), Math.ceil(r.to) + 1);
      const wicks: number[] = vis.flatMap((b: { high: number; low: number }) => [b.high, b.low]);
      const isWick = wicks.some((w) => Math.abs(w - price) < 1e-9);
      // é o pavio mais próximo do cursor na vertical (nenhum outro fica mais perto)
      const dist = (p: number) => Math.abs(c.priceToY(p) - cursorY);
      const nearest = wicks.every((w) => dist(price) <= dist(w) + 1e-6);
      return { price, isWick, nearest };
    }, t.y);
    return { hi: t.hi, ...drawn };
  }
  test('sem Alt e sem automático: a linha fica onde clicas', async ({ page }) => {
    const r = await dropHline(page, false, {});
    expect(r.isWick).toBe(false);
  });
  test('com Alt: a linha horizontal prende ao pavio, mesmo no espaço vazio à direita', async ({ page }) => {
    const r = await dropHline(page, true, {});
    expect(r.isWick).toBe(true);
    expect(r.nearest).toBe(true);
  });
  test('nível 1 (curto): prende perto do pavio', async ({ page }) => {
    const near = await dropHline(page, false, { priceSnapLevel: 1 }, 7);
    expect(near.isWick).toBe(true);
  });
  test('nível 1 (curto) não prende a 30 px do pavio mais próximo', async ({ page }) => {
    const far = await dropHline(page, false, { priceSnapLevel: 1 }, -30);
    expect(far.isWick).toBe(false);
  });
  test('nível 2 (médio) prende a 30 px do pavio mais próximo', async ({ page }) => {
    const mid = await dropHline(page, false, { priceSnapLevel: 2 }, -30);
    expect(mid.isWick).toBe(true);
  });
  test('nível 3 (longo) prende mesmo muito longe do pavio', async ({ page }) => {
    const long = await dropHline(page, false, { priceSnapLevel: 3 }, 150);
    expect(long.isWick).toBe(true);
  });
  test('automático ligado: prende sem tecla (ferramenta de preço)', async ({ page }) => {
    const r = await dropHline(page, false, { priceSnapLevel: 2 });
    expect(r.isWick).toBe(true);
    expect(r.nearest).toBe(true);
  });
});

test('íman: antes do 1.º clique, Ctrl mostra já onde prende (e a marca sai ao largar a tecla, sem mexer o rato)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'off' }, version: 3 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-hline]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  const mark = () => page.evaluate(() => !![...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].snapMark);
  await page.mouse.move(canvas.x + 300, canvas.y + 200);
  await page.waitForTimeout(150);
  expect(await mark()).toBe(false); // íman desligado: nada
  await page.keyboard.down('Control');
  await page.waitForTimeout(200);
  expect(await mark()).toBe(true); // Ctrl: já mostra o ponto onde prende, sem mexer o rato
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  expect(await mark()).toBe(false);
});
