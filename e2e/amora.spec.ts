import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

const layerOf = `(() => { const c = [...window.__rxCharts.values()][0]; for (const v of c.indicators.values()) if (v.def?.id === 'amora') return v.layer?.data ?? null; return null; })()`;

type Layer = { rects?: unknown[]; panel?: { lines: { text: string }[] } } | null;

test('Amora: entra no catálogo, desenha as caixas de RR e o placar, e corre no replay sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Amora');
  await page.getByTestId('indicator-amora').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('indicator-name').filter({ hasText: 'Amora' })).toBeVisible();

  await expect.poll(async () => ((await page.evaluate(layerOf)) as Layer)?.panel?.lines[0].text ?? '').toMatch(/^Amora \(breakouts 1:1\.5\): \d+ sinais/);
  const d = (await page.evaluate(layerOf)) as Layer;
  const n = Number(/(\d+) sinais/.exec(d!.panel!.lines[0].text)![1]);
  expect(n).toBeGreaterThan(0);
  // duas zonas (alvo e stop) por sinal
  expect(d!.rects!.length).toBe(2 * n);

  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  await page.waitForTimeout(800);
  expect(await page.evaluate(layerOf)).not.toBeNull();
  expect(errors).toEqual([]);
});
