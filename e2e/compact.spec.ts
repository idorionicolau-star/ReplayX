import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test('telemóvel em paisagem: ecrã limpo (barra fina + favoritos) e o resto no menu ☰', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);

  // limpo: só a barra fina, o par, o intervalo e os favoritos; sem barra lateral, sem períodos, sem ícones à direita
  await expect(page.getByTestId('compact-bar')).toBeVisible();
  await expect(page.getByTestId('mobile-symbol')).toBeVisible(); // as rodas do par e do intervalo
  await expect(page.getByTestId('mobile-tf')).toBeVisible();
  await expect(page.getByTestId('favorites-bar')).toBeVisible();
  await expect(page.getByTestId('tool-trendline')).toHaveCount(0); // sem barra lateral de desenho
  await expect(page.getByTestId('chart-bottom-bar')).toHaveCount(0);
  await expect(page.getByTestId('right-tab-watchlist')).toHaveCount(0);
  const bar = (await page.getByTestId('compact-bar').boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(48);
  const chart = (await page.getByTestId('chart-0').boundingBox())!;
  expect(chart.height).toBeGreaterThan(390 * 0.8); // o gráfico ocupa quase todo o ecrã

  // menu ☰: ferramentas de desenho
  await page.getByTestId('compact-menu-button').click();
  await expect(page.getByTestId('compact-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Ferramentas de desenho' }).click();
  await expect(page.getByTestId('compact-menu')).toHaveCount(0);
  await expect(page.getByTestId('mobile-tools')).toBeVisible();
  await page.getByTestId('mobile-tools').getByTestId('tool-trendline').click();
  await expect(page.getByTestId('mobile-tools')).toHaveCount(0); // fecha ao escolher a ferramenta

  // menu ☰: painéis
  await page.getByTestId('compact-menu-button').click();
  await page.getByRole('button', { name: 'Lista de observação' }).click();
  await expect(page.getByRole('button', { name: 'Fechar painel' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar painel' }).click();

  // menu ☰: barras de baixo
  await page.getByTestId('compact-menu-button').click();
  await page.getByRole('button', { name: 'Barra de períodos e diário' }).click();
  await page.getByRole('button', { name: 'Fechar o menu' }).click();
  await expect(page.getByTestId('chart-bottom-bar')).toBeVisible();
});

test('ecrã grande e em pé não mudam (a barra completa continua)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await enterAsGuest(page);
  await expect(page.getByTestId('compact-bar')).toHaveCount(0);
  await expect(page.getByTestId('chart-bottom-bar')).toBeVisible();
  await ctx.close();
});

test('paisagem: as rodas do par e do intervalo giram com o dedo e o toque abre a pesquisa', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  const cdp = await page.context().newCDPSession(page);
  const ctl = `[...window.__rxCharts.values()][0]`;
  const tf = () => page.evaluate(`${ctl}.tf`) as Promise<string>;
  const sym = () => page.evaluate(`${ctl}.symbol.id`) as Promise<string>;
  const drag = async (testid: string, dyTotal: number) => {
    const b = (await page.getByTestId(testid).boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dyTotal * i) / 8 }] });
    return () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const t0 = await tf();
  let release = await drag('mobile-tf', -75);
  await expect(page.getByTestId('wheel-picker')).toBeVisible();
  await release();
  await expect.poll(tf).not.toBe(t0);
  const s0 = await sym();
  release = await drag('mobile-symbol', 75);
  await release();
  await expect.poll(sym).not.toBe(s0);
  await page.waitForTimeout(600);
  await page.getByTestId('mobile-symbol').tap();
  await expect(page.getByPlaceholder(/Símbolo, nome ou mercado/)).toBeVisible();
});
