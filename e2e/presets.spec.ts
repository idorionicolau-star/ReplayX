import { expect, test } from '@playwright/test';
import { enterAsGuest } from './helpers';

test('estilos pré-definidos: menu expansível com 30 estilos e aplica as cores', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  const menu = page.getByTestId('chart-presets');
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('preset-terminal')).toHaveCount(0);
  await menu.getByRole('button', { name: /Estilos pré-definidos/ }).click();
  await expect(menu.locator('[data-testid^=preset-]:not([data-testid=preset-prev]):not([data-testid=preset-next]):not([data-testid=preset-save])')).toHaveCount(30);
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

const state = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state);

test('◀ ▶ passam de um estilo para o outro; guardar as cores atuais como tema meu, que segue o sol/lua e se apaga', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  // ▶ sem estilo escolhido vai para o primeiro; ◀ volta ao último
  await page.getByTestId('preset-next').click();
  expect((await state(page)).chartStyle).toBe('classic');
  await page.getByTestId('preset-next').click();
  expect((await state(page)).chartStyle).toBe('mono');
  await page.getByTestId('preset-prev').click();
  await page.getByTestId('preset-prev').click();
  expect((await state(page)).chartStyle).toBe('emerald-ruby');
  expect((await state(page)).appearance.background).toBe('#08201a');

  // guarda as cores atuais como tema meu
  page.once('dialog', (d) => d.accept('Meu verde'));
  await page.getByTestId('chart-presets').getByRole('button', { name: /Estilos pré-definidos/ }).click();
  await page.getByTestId('preset-save').click();
  const st = await state(page);
  expect(st.userPresets).toHaveLength(1);
  expect(st.userPresets[0].name).toBe('Meu verde');
  expect(st.chartStyle).toBe(st.userPresets[0].id);
  expect(st.userPresets[0].dark.background).toBe('#08201a');
  const lightBg: string = st.userPresets[0].light.background;
  await expect(page.getByTestId(`preset-${st.userPresets[0].id}`)).toBeVisible();

  // sol/lua: o tema meu também troca de versão
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await page.getByRole('button', { name: 'Tema claro' }).click();
  expect((await state(page)).appearance.background).toBe(lightBg);

  // apagar
  await page.getByRole('button', { name: 'Definições' }).first().click();
  await page.getByTestId('chart-presets').getByRole('button', { name: /Estilos pré-definidos/ }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId(`preset-del-${st.userPresets[0].id}`).click();
  const st2 = await state(page);
  expect(st2.userPresets).toHaveLength(0);
  expect(st2.chartStyle).toBeNull();
});
