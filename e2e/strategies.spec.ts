import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('testador, scripts e otimizador', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-BTC', 'DEMO:SIMBTC');
  await waitBars(page, 500);
  await page.click('[data-testid=bottom-tab-tester]');
  await page.click('[data-testid=tester-run]');
  await expect(page.getByText('Lucro líquido').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Operações \(\d+\)/)).toBeVisible();

  await page.click('[data-testid=bottom-tab-script]');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText(/sem erros/)).toBeVisible();

  await page.click('[data-testid=bottom-tab-optimizer]');
  await page.getByRole('button', { name: /Aprender \(/ }).click();
  await expect(page.getByRole('button', { name: 'Aplicar os melhores' })).toBeVisible({ timeout: 90_000 });
  expect(errors).toEqual([]);
});
