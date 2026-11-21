import { expect, test } from '@playwright/test';
import { enterAsGuest } from './helpers';

test('estilos pré-definidos: menu expansível com 10 estilos e aplica as cores', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  const menu = page.getByTestId('chart-presets');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('preset-terminal')).toHaveCount(0);
  await menu.getByRole('button', { name: /Estilos pré-definidos/ }).click();
  await expect(menu.locator('[data-testid^=preset-]')).toHaveCount(10);
  await page.getByTestId('preset-terminal').click();
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state);
  expect(st.upColor).toBe('#00e676');
  expect(st.appearance.background).toBe('#050805');
  expect(st.theme).toBe('dark');
});
