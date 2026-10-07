import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

const layerOf = `(() => { const c = [...window.__rxCharts.values()][0]; for (const v of c.indicators.values()) if (v.def?.id === 'structure') return v.layer?.data ?? null; return null; })()`;

test('Estrutura de Mercado (top-down): desenha topos, fundos, BOS/CHoCH e o cartão, também no replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  const before = await page.getByTestId('indicator-name').count();
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Estrutura');
  await page.getByTestId('indicator-structure').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('indicator-name').count()).toBe(before + 1);
  await expect(page.getByTestId('indicator-name').filter({ hasText: 'ESTR' })).toBeVisible();

  const data = await page.evaluate(layerOf) as { lines: unknown[]; texts: { text: string }[]; panel?: { lines: { text: string }[] } } | null;
  expect(data).not.toBeNull();
  expect(data!.lines.length).toBeGreaterThan(5);
  expect(data!.texts.some((t) => /^4h (HH|HL|LH|LL)$/.test(t.text))).toBe(true);
  expect(data!.panel!.lines[0].text).toMatch(/^4h: /);

  // o replay recalcula só com as velas até ao cursor
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  await page.waitForTimeout(800);
  const inReplay = await page.evaluate(layerOf) as { panel?: { lines: { text: string }[] } } | null;
  expect(inReplay).not.toBeNull();
  expect(inReplay!.panel!.lines.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
