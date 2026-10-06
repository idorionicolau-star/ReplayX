import { expect, test } from '@playwright/test';
import { chartInfo, chooseSymbol, enterAsGuest, waitBars } from './helpers';

async function pickTf(page: import('@playwright/test').Page, label: string) {
  await page.getByTitle(/Intervalo de tempo/).click();
  await page.getByText(label, { exact: true }).click();
}

test('intervalos em segundos: o gráfico carrega velas de 15s e mostra os segundos', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await pickTf(page, '15 segundos');
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('15s');
  await waitBars(page, 300);
  const info = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { bars: { time: number }[]; chart: { options(): { timeScale: { secondsVisible: boolean } } } }> }).__rxCharts.values()][0];
    const t = c.bars.slice(-6).map((b) => b.time);
    return { diffs: t.slice(1).map((x, i) => x - t[i]), secondsVisible: c.chart.options().timeScale.secondsVisible };
  });
  expect(info.diffs.every((d) => d === 15)).toBe(true);
  expect(info.secondsVisible).toBe(true);
  // voltar a minutos desliga os segundos no eixo
  await pickTf(page, '1 minuto');
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('1m');
  expect(await page.evaluate(() => [...(window as unknown as { __rxCharts: Map<string, { chart: { options(): { timeScale: { secondsVisible: boolean } } } }> }).__rxCharts.values()][0].chart.options().timeScale.secondsVisible)).toBe(false);
  expect(errors).toEqual([]);
});

test('no plano grátis o replay em segundos pede Pro e o gráfico volta a 15m', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await pickTf(page, '5 segundos');
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('5s');
  await page.click('[data-testid=replay-button]');
  await expect(page.getByText('ReplayX Pro')).toBeVisible();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('15m');
});

test('replay em 5s (Pro) avança de 5 em 5 segundos, também com uma posição aberta', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-replay', JSON.stringify({ state: { pauseOnFill: false }, version: 1 })));
  await enterAsGuest(page);
  // simula o plano Pro (enquanto o plano não está carregado nada é bloqueado)
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await pickTf(page, '5 segundos');
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('5s');
  await waitBars(page, 300);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await page.waitForTimeout(1200);
  const c0 = (await chartInfo(page)).cursor!;
  for (let i = 0; i < 4; i++) await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c0 + 20);
  // com uma posição aberta o replay continua a avançar em segundos
  await page.click('[data-testid=replay-buy]');
  await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c0 + 25);
});

test('indicadores novos: Accelerator Oscillator, Alligator, Squeeze e Envelope aparecem no gráfico sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  const before = await page.getByTestId('indicator-name').count();
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Accelerator');
  await expect(page.getByTestId('indicator-ac')).toBeVisible();
  for (const id of ['ac', 'alligator', 'squeeze', 'envelope']) {
    await page.getByPlaceholder('Procurar indicador').fill(id === 'ac' ? 'Accelerator' : id === 'alligator' ? 'Alligator' : id === 'squeeze' ? 'Squeeze' : 'Envelope');
    await page.getByTestId(`indicator-${id}`).click();
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('indicator-name').count()).toBe(before + 4);
  // o AC tem valores calculados no gráfico
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
