import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('backtest: o selo aparece com a 1.ª caixa de posição e abre o resumo com a curva', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await expect(page.getByTestId('backtest')).toHaveCount(0); // sem caixas: nada no ecrã
  await page.click('[data-testid=fav-tool-long]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(canvas.x + 400, canvas.y + 300);
  await expect(page.getByTestId('backtest-chip')).toBeVisible();
  await page.getByTestId('backtest-chip').click();
  await expect(page.getByTestId('backtest-panel')).toBeVisible();
  await expect(page.getByTestId('bt-curve')).toBeVisible();
  await expect(page.getByTestId('backtest-panel')).toContainText('Acerto');
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await expect(page.getByTestId('backtest-panel')).toHaveCount(0);
});

test('backtest: desligado nas definições, o selo não aparece', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { backtestChip: false }, version: 3 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-long]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.click(canvas.x + 400, canvas.y + 300);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('backtest')).toHaveCount(0);
});

test('backtest: "E se o alvo fosse…?" compara de 1:1 a 1:20 com as mesmas entradas', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-long]');
  const canvas = (await page.locator('canvas').first().boundingBox())!;
  // caixa longa numa vela do passado, com a entrada no fecho dessa vela: o preço toca-lhe de certeza
  const pt = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { bars: { time: number; close: number }[]; timeToX(t: number): number; priceToY(p: number): number }> }).__rxCharts.values()][0];
    const b = c.bars[c.bars.length - 60];
    return { x: c.timeToX(b.time), y: c.priceToY(b.close) };
  });
  await page.mouse.click(canvas.x + pt.x, canvas.y + pt.y);
  await page.waitForTimeout(500);
  await page.getByTestId('backtest-chip').click();
  const toggle = page.getByTestId('bt-whatif-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('bt-whatif')).toBeVisible();
  for (const rr of ['1', '1.5', '2', '3', '5', '10', '20']) await expect(page.getByTestId(`bt-whatif-${rr}`)).toBeVisible();
  await expect(page.getByTestId('bt-whatif')).toContainText('E se o alvo fosse');
  await expect(page.getByTestId('bt-whatif')).toContainText('1:1,5');
  await expect(page.getByTestId('bt-whatif')).toContainText('1 trades');
  await toggle.click();
  await expect(page.getByTestId('bt-whatif')).toHaveCount(0);
});
