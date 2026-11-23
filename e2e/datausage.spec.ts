import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('consumo de dados: aparece nas Definições > Dados, soma e repõe', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  await page.getByRole('dialog').getByText('Dados', { exact: true }).click();
  const box = page.getByTestId('data-usage');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Histórico');
  await expect(box).toContainText('Tempo real');
  await expect(box.getByTestId('usage-total-session')).toBeVisible();
  await box.getByTestId('data-usage-reset').click();
  await expect(box.getByTestId('usage-total-session')).toHaveText('0 B');
  await expect(box.getByTestId('usage-total-month')).toHaveText('0 B');
});
