import { expect, test } from '@playwright/test';
import { enterAsGuest } from './helpers';

test('estilos pré-definidos: menu expansível com 20 estilos e aplica as cores', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  const menu = page.getByTestId('chart-presets');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('preset-terminal')).toHaveCount(0);
  await menu.getByRole('button', { name: /Estilos pré-definidos/ }).click();
  await expect(menu.locator('[data-testid^=preset-]')).toHaveCount(20);
  await page.getByTestId('preset-terminal').click();
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state);
  expect(st.upColor).toBe('#00ff7b');
  expect(st.appearance.background).toBe('#050805');
  expect(st.theme).toBe('dark');
  // sol/lua: o mesmo estilo passa para a versão clara
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await page.getByRole('button', { name: 'Tema claro' }).click();
  const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state);
  expect(st2.theme).toBe('light');
  expect(st2.upColor).toBe('#0a9d4e');
  expect(st2.appearance.background).toBe('#eef6ee');
});
