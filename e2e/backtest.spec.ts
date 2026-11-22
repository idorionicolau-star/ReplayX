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
