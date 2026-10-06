import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('Apocalypse: acrescenta-se ao gráfico, desenha as zonas e a leitura sem erros, também no replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  const before = await page.getByTestId('indicator-name').count();
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Apocalypse');
  await page.getByTestId('indicator-apocalypse').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('indicator-name').count()).toBe(before + 1);
  await expect(page.getByTestId('indicator-name').filter({ hasText: 'APOC' })).toBeVisible();
  // a legenda não lista os 8 limites das zonas, só o nome e os parâmetros
  const legend = await page.getByTestId('indicator-name').filter({ hasText: 'APOC' }).locator('xpath=..').innerText();
  expect(legend.split(/\s+/).length).toBeLessThan(12);
  await page.waitForTimeout(600);

  // no replay recalcula só com as velas até ao cursor
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
