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

test.describe('íman de preço (pivôs do ZigZag)', () => {
  type Mode = 'near-pivot' | 'far-from-all' | 'plain-wick' | 'free';
  /** Põe uma linha horizontal com o cursor num sítio escolhido e devolve se o preço ficou num pivô. */
  async function dropHline(page: import('@playwright/test').Page, alt: boolean, settings: Record<string, unknown>, mode: Mode, off = 8, tool: 'hline' | 'fib' = 'hline') {
    await page.addInitScript((st) => localStorage.setItem('rx-settings', JSON.stringify({ state: st, version: 3 })), { magnet: 'off', ...settings });
    await enterAsGuest(page);
    await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
    await waitBars(page, 300);
    await page.click(`[data-testid=fav-tool-${tool}]`);
    const t = await page.evaluate(
      ({ mode, off }) => {
        const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
        const H = c.paneSize().height;
        const r = c.chart.timeScale().getVisibleLogicalRange();
        const vis = c.bars.slice(Math.max(0, Math.floor(r.from)), Math.ceil(r.to) + 1);
        const pivots: { price: number }[] = c.snapPivots();
        const pivotYs: number[] = pivots.map((p) => c.priceToY(p.price));
        const x = c.timeToX(c.bars[c.bars.length - 1].time) + 60;
        let y: number;
        let plainPrice = 0;
        if (mode === 'near-pivot') y = pivotYs[0] + off;
        else if (mode === 'far-from-all') {
          // acima do pavio mais alto à vista: nenhum pivô por perto
          y = Math.min(...vis.map((b: { high: number }) => c.priceToY(b.high))) - off;
        } else if (mode === 'plain-wick') {
          // um máximo que NÃO é pivô: o cursor fica exatamente nele
          const pv = new Set(pivots.map((p) => p.price));
          const b = vis.find((b: { high: number }) => !pv.has(b.high) && c.priceToY(b.high) > 30 && c.priceToY(b.high) < H - 30);
          plainPrice = b.high;
          y = c.priceToY(b.high);
        } else y = pivotYs[0] + off;
        return { x, y: Math.max(12, Math.min(H - 12, y)), plainPrice };
      },
      { mode, off },
    );
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(canvas.x + t.x, canvas.y + t.y);
    await page.mouse.click(canvas.x + t.x, canvas.y + t.y);
    await page.waitForTimeout(250);
    const dots = await page.evaluate(() => ([...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].pivotDots ?? []).length);
    if (tool === 'fib') {
      // 2.º ponto do Fibonacci: noutro sítio, para fechar o desenho
      await page.mouse.move(canvas.x + t.x - 200, canvas.y + 200);
      await page.mouse.click(canvas.x + t.x - 200, canvas.y + 200);
      await page.waitForTimeout(250);
    }
    if (alt) await page.keyboard.up('Alt');
    const res = await page.evaluate((plainPrice) => {
      const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
      const price = c.drawings[c.drawings.length - 1].points[0].price as number;
      const isPivot = (c.snapPivots() as { price: number }[]).some((p) => Math.abs(p.price - price) < 1e-9);
      return { price, isPivot, onPlainWick: plainPrice !== 0 && Math.abs(price - plainPrice) < 1e-9 };
    }, t.plainPrice);
    return { ...res, dots };
  }
  test('sem Alt e sem automático: a linha fica onde clicas (não prende)', async ({ page }) => {
    const r = await dropHline(page, false, {}, 'free', 11);
    expect(r.isPivot).toBe(false);
  });
  test('com Alt: prende ao topo/fundo isolado mais próximo, mesmo no espaço vazio à direita', async ({ page }) => {
    const r = await dropHline(page, true, {}, 'near-pivot', 10);
    expect(r.isPivot).toBe(true);
  });
  test('íman normal ligado: o íman de preço NÃO liga sozinho (sem pontos de pivôs, sem ir ao pivô) no Fibonacci', async ({ page }) => {
    const r = await dropHline(page, false, { magnet: 'medium' }, 'near-pivot', 10, 'fib');
    expect(r.dots).toBe(0);
  });
  for (const lvl of ['weak', 'strong']) {
    test(`íman normal no nível ${lvl}: o íman de preço também não liga sozinho (linha horizontal)`, async ({ page }) => {
      const r = await dropHline(page, false, { magnet: lvl }, 'near-pivot', 10, 'hline');
      expect(r.dots).toBe(0);
    });
  }
  test('íman normal ligado + Alt premido: o íman de preço age (pontos dos pivôs e prende ao pivô)', async ({ page }) => {
    const r = await dropHline(page, true, { magnet: 'medium' }, 'near-pivot', 10, 'fib');
    expect(r.isPivot).toBe(true);
    expect(r.dots).toBeGreaterThan(1);
  });
  test('íman desligado e sem Alt: nada prende, sem anel nem pontos', async ({ page }) => {
    const r = await dropHline(page, false, { magnet: 'off' }, 'plain-wick', 0, 'fib');
    expect(r.onPlainWick).toBe(true); // ficou exatamente no pavio onde estava o cursor, sem ir ao pivô
    expect(r.dots).toBe(0);
  });
  test('não prende a pavios normais: com o cursor em cima de um pavio que não é pivô, vai ao pivô', async ({ page }) => {
    const r = await dropHline(page, true, {}, 'plain-wick');
    expect(r.isPivot).toBe(true);
    expect(r.onPlainWick).toBe(false);
  });
  test('alcance fixo: não prende quando o cursor está a 60 px do pivô mais próximo', async ({ page }) => {
    const far = await dropHline(page, true, {}, 'far-from-all', 60, 'fib');
    expect(far.isPivot).toBe(false);
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
