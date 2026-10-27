import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

type Ctl = { indicators: Map<string, { def?: { id: string }; layer?: { data: { rects?: unknown[]; panel?: { lines: { text: string }[] }; lines: { p1: number }[] } | null } }>; chart: { timeScale(): { setVisibleLogicalRange(r: { from: number; to: number }): void } } };
const layerOf = `(() => { const c = [...window.__rxCharts.values()][0]; for (const v of c.indicators.values()) if (v.def?.id === 'vpvr') return v.layer?.data ?? null; return null; })()`;

test('Perfil de volume (intervalo visível): aparece, desenha o histograma e muda com o gráfico', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Perfil de volume');
  await page.getByTestId('indicator-vpvr').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('indicator-name').filter({ hasText: 'VP' })).toBeVisible();

  await expect.poll(async () => ((await page.evaluate(layerOf)) as { rects?: unknown[] } | null)?.rects?.length ?? 0).toBeGreaterThan(10);
  const first = (await page.evaluate(layerOf)) as { panel: { lines: { text: string }[] }; lines: { p1: number }[] };
  expect(first.panel.lines[0].text).toBe('Perfil de volume');
  const poc1 = first.lines[0].p1;

  // mexer no gráfico (outro intervalo visível) recalcula o perfil
  await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts.values()][0];
    c.chart.timeScale().setVisibleLogicalRange({ from: 20, to: 120 });
  });
  await expect.poll(async () => ((await page.evaluate(layerOf)) as { lines: { p1: number }[] } | null)?.lines[0]?.p1 ?? poc1).not.toBe(poc1);
  expect(errors).toEqual([]);
});
