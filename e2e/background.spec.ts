import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

const ctl = `[...window.__rxCharts.values()][0]`;
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test('segundo plano: o tempo real do gráfico pára ao fim de uns segundos e retoma ao voltar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.evaluate(`${ctl}.pauseAfterMs = 300`);
  const live = () => page.evaluate(`!!${ctl}.liveUnsub`) as Promise<boolean>;
  expect(await live()).toBe(true);
  await hide(page, true);
  await expect.poll(() => page.evaluate(`${ctl}.livePaused`)).toBe(true);
  expect(await live()).toBe(false); // sem subscrição enquanto está em segundo plano
  const before = (await page.evaluate(`${ctl}.bars.length`)) as number;
  await hide(page, false);
  await expect.poll(() => page.evaluate(`${ctl}.livePaused`)).toBe(false);
  await expect.poll(live).toBe(true);
  expect(((await page.evaluate(`${ctl}.bars.length`)) as number) >= before).toBe(true);
  expect(errors).toEqual([]);
});

test('segundo plano curto (menos do tempo de pausa): o tempo real não pára', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.evaluate(`${ctl}.pauseAfterMs = 3000`);
  await hide(page, true);
  await page.waitForTimeout(400);
  await hide(page, false);
  await page.waitForTimeout(3500);
  expect(await page.evaluate(`${ctl}.livePaused`)).toBe(false);
  expect(await page.evaluate(`!!${ctl}.liveUnsub`)).toBe(true);
});

test('lista de observação: a atualização é escolhida nas Definições (por omissão a cada 5 s)', async ({ page }) => {
  await enterAsGuest(page);
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state?.watchRefresh as number | undefined);
  await page.getByRole('button', { name: 'Definições' }).first().click();
  await page.getByRole('dialog').getByText('Geral', { exact: true }).click();
  const sel = page.getByTestId('watch-refresh');
  await expect(sel).toHaveValue('5');
  await sel.selectOption('0');
  await expect.poll(st).toBe(0);
  await sel.selectOption('60');
  await expect.poll(st).toBe(60);
});

test('poupança de dados ligada: o tempo real pára 10 s depois de ir para segundo plano (e não antes)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { dataSaver: 'on' }, version: 3 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await hide(page, true);
  await page.waitForTimeout(6000);
  expect(await page.evaluate(`${ctl}.livePaused`)).toBe(false); // 6 s: ainda não
  await expect.poll(() => page.evaluate(`${ctl}.livePaused`), { timeout: 10_000 }).toBe(true); // passou dos 10 s
  await hide(page, false);
  await expect.poll(() => page.evaluate(`${ctl}.livePaused`)).toBe(false);
});
