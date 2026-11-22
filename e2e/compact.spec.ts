import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test('telemóvel em paisagem: ecrã limpo (barra fina + favoritos) e o resto no menu ☰', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);

  // limpo: só a barra fina, o par, o intervalo e os favoritos; sem barra lateral, sem períodos, sem ícones à direita
  await expect(page.getByTestId('compact-bar')).toBeVisible();
  await expect(page.getByTestId('symbol-button')).toBeVisible();
  await expect(page.getByTestId('favorites-bar')).toBeVisible();
  await expect(page.getByTestId('tool-trendline')).toHaveCount(0); // sem barra lateral de desenho
  await expect(page.getByTestId('chart-bottom-bar')).toHaveCount(0);
  await expect(page.getByTestId('right-tab-watchlist')).toHaveCount(0);
  const bar = (await page.getByTestId('compact-bar').boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(40);
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
