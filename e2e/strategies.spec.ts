import { expect, test } from '@playwright/test';
import { chartInfo, chooseSymbol, enterAsGuest, waitBars } from './helpers';

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

  // convidado = plano grátis: o otimizador pede o Pro
  await page.click('[data-testid=bottom-tab-optimizer]');
  await page.getByRole('button', { name: /Aprender \(/ }).click();
  await expect(page.getByTestId('upgrade-dialog')).toBeVisible();
  await expect(page.getByText(/Otimizador, walk-forward e teste em vários mercados são do plano Pro/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta para assinar o Pro' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('limites do plano grátis', async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.getByTestId('plan-badge')).toHaveText(/Assinar Pro/);

  // vários gráficos → Pro
  await page.getByRole('button', { name: /Layout/ }).first().click();
  await page.getByText('4 gráficos').click();
  await expect(page.getByText('Vários gráficos ao mesmo tempo são do plano Pro.')).toBeVisible();
  await page.keyboard.press('Escape');

  // replay num intervalo abaixo de 15m → passa para 15m e explica
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('5m');
  await page.click('[data-testid=replay-button]');
  await expect(page.getByText(/No plano grátis o replay funciona a partir de 15m/)).toBeVisible();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('15m');
});
