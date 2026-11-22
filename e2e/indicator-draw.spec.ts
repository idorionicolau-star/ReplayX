import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

type Ctl = { drawings: { type: string; pane?: string; points: { time: number; price: number }[] }[]; indicators: Map<string, { def?: { id: string }; inst: { uid: string } }>; chart: { panes(): { getHTMLElement(): HTMLElement | null }[] } };
const ctl = `[...window.__rxCharts.values()][0]`;

async function setup(page: Page) {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('RSI');
  await page.getByTestId('indicator-rsi').first().click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(`${ctl}.chart.panes().length`)).toBeGreaterThan(1);
  await page.waitForTimeout(500);
}

/** Retângulo do painel do RSI (e do principal) no ecrã. */
async function panes(page: Page) {
  return page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts.values()][0];
    const r = (i: number) => {
      const b = c.chart.panes()[i].getHTMLElement()!.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    let uid = '';
    for (const v of c.indicators.values()) if (v.def?.id === 'rsi') uid = v.inst.uid;
    return { main: r(0), rsi: r(1), uid };
  });
}

test('desenhar dentro do painel do RSI: fica ligado ao indicador, com a escala dele', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  const p = await panes(page);
  await page.click('[data-testid=fav-tool-trendline]');
  await page.mouse.click(p.rsi.x + 200, p.rsi.y + p.rsi.h * 0.3);
  await page.mouse.move(p.rsi.x + 400, p.rsi.y + p.rsi.h * 0.7);
  await page.mouse.click(p.rsi.x + 400, p.rsi.y + p.rsi.h * 0.7);
  await page.waitForTimeout(300);
  const d = (await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings'];
  expect(d).toHaveLength(1);
  expect(d[0].type).toBe('trendline');
  expect(d[0].pane).toBe(p.uid);
  // os preços são do RSI (0 a 100), não os do símbolo (~1,2)
  for (const pt of d[0].points) {
    expect(pt.price).toBeGreaterThan(0);
    expect(pt.price).toBeLessThan(100);
    expect(pt.price).toBeGreaterThan(5);
  }
  expect(errors).toEqual([]);
});

test('uma linha horizontal no RSI em 70: o preço é o do indicador e o desenho vê-se no painel', async ({ page }) => {
  await setup(page);
  const p = await panes(page);
  await page.click('[data-testid=fav-tool-hline]');
  await page.mouse.click(p.rsi.x + 300, p.rsi.y + p.rsi.h * 0.5);
  await page.waitForTimeout(300);
  const d = (await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings'];
  expect(d[0].pane).toBe(p.uid);
  expect(d[0].points[0].price).toBeGreaterThan(20);
  expect(d[0].points[0].price).toBeLessThan(80);
  await page.screenshot({ path: '/tmp/claude-0/ind-hline.png', clip: { x: p.rsi.x, y: p.main.y, width: p.rsi.w, height: p.main.h + p.rsi.h + 20 } });
});

test('no painel principal continua tudo igual (o desenho não tem painel)', async ({ page }) => {
  await setup(page);
  const p = await panes(page);
  await page.click('[data-testid=fav-tool-hline]');
  await page.mouse.click(p.main.x + 300, p.main.y + p.main.h * 0.5);
  await page.waitForTimeout(300);
  const d = (await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings'];
  expect(d).toHaveLength(1);
  expect(d[0].pane).toBeUndefined();
  expect(d[0].points[0].price).toBeGreaterThan(1); // preço do símbolo
});

test('ferramenta que depende do preço (Fibonacci) não cria desenho dentro do indicador', async ({ page }) => {
  await setup(page);
  const p = await panes(page);
  await page.click('[data-testid=fav-tool-fib]');
  await page.mouse.click(p.rsi.x + 300, p.rsi.y + p.rsi.h * 0.5);
  await page.mouse.move(p.rsi.x + 400, p.rsi.y + p.rsi.h * 0.3);
  await page.mouse.click(p.rsi.x + 400, p.rsi.y + p.rsi.h * 0.3);
  await page.waitForTimeout(300);
  expect(((await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings']).length).toBe(0);
});

test('o íman prende aos valores da linha do RSI e remover o indicador esconde os desenhos dele', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'medium' }, version: 3 })));
  await setup(page);
  const p = await panes(page);
  await page.click('[data-testid=fav-tool-hline]');
  const target = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
    for (const v of c.indicators.values()) {
      if (v.def?.id !== 'rsi') continue;
      const i = c.bars.length - 30;
      const val = v.values[v.series[0].key][i];
      return { val, x: c.timeToX(c.bars[i].time), y: v.series[0].s.priceToCoordinate(val) };
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(p.rsi.x + target!.x, p.rsi.y + target!.y + 6);
  await page.waitForTimeout(300);
  const d = (await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings'];
  expect(d).toHaveLength(1);
  expect(d[0].pane).toBe(p.uid);
  // prendeu a um valor do RSI (um dos valores da linha), não a um preço qualquer
  const onLine = await page.evaluate((price) => {
    const c = [...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0];
    for (const v of c.indicators.values()) {
      if (v.def?.id !== 'rsi') continue;
      return (v.values[v.series[0].key] as number[]).some((x) => Math.abs(x - price) < 1e-9);
    }
    return false;
  }, d[0].points[0].price);
  expect(onLine).toBe(true);
});

test.describe('telemóvel (toque)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test('desenhar no painel do RSI com o dedo: a mira passa para o painel e o desenho fica no indicador', async ({ page }) => {
    await enterAsGuest(page);
    await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
    await waitBars(page, 300);
    await page.getByTestId('compact-menu-button').tap();
    await page.getByRole('button', { name: 'Indicadores', exact: true }).tap();
    await page.getByPlaceholder('Procurar indicador').fill('RSI');
    await page.getByTestId('indicator-rsi').first().tap();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(`${ctl}.chart.panes().length`)).toBeGreaterThan(1);
    await page.waitForTimeout(500);
    const p = await panes(page);
    await page.getByRole('button', { name: 'Linha horizontal', exact: true }).tap();
    await page.touchscreen.tap(p.rsi.x + 300, p.rsi.y + p.rsi.h * 0.5); // toque no painel do RSI: a mira muda para lá
    await page.waitForTimeout(300);
    await page.touchscreen.tap(p.rsi.x + 300, p.rsi.y + p.rsi.h * 0.5); // 2.º toque marca o ponto na mira
    await page.waitForTimeout(400);
    const d = (await page.evaluate(`${ctl}.drawings`)) as Ctl['drawings'];
    expect(d).toHaveLength(1);
    expect(d[0].pane).toBe(p.uid);
    expect(d[0].points[0].price).toBeLessThan(100);
  });
});
