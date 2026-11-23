import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

const ctl = `[...window.__rxCharts.values()][0]`;

async function addTopo(page: Page, settings: Record<string, unknown> = {}) {
  await page.addInitScript((st) => localStorage.setItem('rx-settings', JSON.stringify({ state: st, version: 3 })), settings);
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  // o aviso aparece ao passar das 1600 velas (em vez das 5000) para o teste ser curto; 1 sinal a procurar é pouco: pede muitos
  await page.evaluate(`${ctl}.historyAskAt = 1600`);
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Topo e Fundo');
  await page.getByTestId('indicator-doubletop').click();
  await page.keyboard.press('Escape');
}

const barsNow = (page: Page) => page.evaluate(`${ctl}.bars.length`) as Promise<number>;

test('histórico automático: ao passar do limite pergunta antes de descarregar mais', async ({ page }) => {
  test.setTimeout(90_000);
  await addTopo(page);
  const ask = page.getByTestId('history-ask');
  await expect(ask).toBeVisible({ timeout: 60_000 });
  await expect(ask).toContainText('MB');
  const at = await barsNow(page);
  await page.waitForTimeout(1500);
  expect(await barsNow(page)).toBe(at); // à espera da resposta: não carrega mais
  await page.getByTestId('history-yes').click();
  await expect(ask).toHaveCount(0);
  await expect.poll(() => barsNow(page), { timeout: 30_000 }).toBeGreaterThan(at);
});

test('"Agora não": fica pelas velas que tem e não volta a perguntar neste símbolo/intervalo', async ({ page }) => {
  test.setTimeout(90_000);
  await addTopo(page);
  await expect(page.getByTestId('history-ask')).toBeVisible({ timeout: 60_000 });
  const at = await barsNow(page);
  await page.getByTestId('history-no').click();
  await expect(page.getByTestId('history-ask')).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect(await barsNow(page)).toBe(at);
  await expect(page.getByTestId('history-ask')).toHaveCount(0);
});

test('"Parar no limite": não pergunta e nunca passa do limite', async ({ page }) => {
  test.setTimeout(90_000);
  await addTopo(page, { autoHistory: 'limit' });
  await page.waitForTimeout(6000);
  await expect(page.getByTestId('history-ask')).toHaveCount(0);
  expect(await barsNow(page)).toBeLessThanOrEqual(1600 + 1500); // no máximo uma ronda além do limite
});

test('"Carregar sempre": não pergunta e continua a carregar', async ({ page }) => {
  test.setTimeout(90_000);
  await addTopo(page, { autoHistory: 'always' });
  await expect.poll(() => barsNow(page), { timeout: 40_000 }).toBeGreaterThan(3200);
  await expect(page.getByTestId('history-ask')).toHaveCount(0);
});

test('poupança de dados ligada: não pergunta e pára nas velas do limite, mesmo com "carregar sempre"', async ({ page }) => {
  test.setTimeout(90_000);
  await addTopo(page, { autoHistory: 'always', dataSaver: 'on' });
  await page.waitForTimeout(6000);
  await expect(page.getByTestId('history-ask')).toHaveCount(0);
  expect(await barsNow(page)).toBeLessThanOrEqual(1600 + 1500);
});

test('poupança de dados: a opção escolhe-se nas Definições e mostra o estado', async ({ page }) => {
  await enterAsGuest(page);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  await page.getByRole('dialog').getByText('Geral', { exact: true }).click();
  const sel = page.getByTestId('data-saver');
  await expect(sel).toHaveValue('auto');
  await sel.selectOption('on');
  await expect(page.getByText(/Poupança de dados — agora ligada\./)).toBeVisible();
  await sel.selectOption('off');
  await expect(page.getByText(/Poupança de dados — agora desligada\./)).toBeVisible();
});
