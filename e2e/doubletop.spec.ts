import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

const layerOf = `(() => { const c = [...window.__rxCharts.values()][0]; for (const v of c.indicators.values()) if (v.def?.id === 'doubletop') return v.layer?.data ?? null; return null; })()`;

test('Topo e Fundo Duplo: entra no catálogo, desenha o cartão e corre no replay sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  const before = await page.getByTestId('indicator-name').count();
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Topo e Fundo');
  await page.getByTestId('indicator-doubletop').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.getByTestId('indicator-name').count()).toBe(before + 1);
  await expect(page.getByTestId('indicator-name').filter({ hasText: 'TD' })).toBeVisible();

  const data = (await page.evaluate(layerOf)) as { panel?: { lines: { text: string }[] } } | null;
  expect(data).not.toBeNull();
  expect(data!.panel!.lines[0].text).toMatch(/^Topo\/fundo duplo: \d+ sinais/);

  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  await page.waitForTimeout(800);
  expect(await page.evaluate(layerOf)).not.toBeNull();
  expect(errors).toEqual([]);
});

test('Topo e Fundo Duplo: carrega passado sozinho até 200 sinais (ou até o histórico acabar)', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await page.evaluate(() => (window as unknown as { __rxBilling: { setState(s: object): void } }).__rxBilling.setState({ loaded: false }));
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  const barsBefore = await page.evaluate(() => [...(window as unknown as { __rxCharts: Map<string, { bars: unknown[] }> }).__rxCharts.values()][0].bars.length);
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Topo e Fundo');
  await page.getByTestId('indicator-doubletop').click();
  await page.keyboard.press('Escape');
  const signals = async () => {
    const d = (await page.evaluate(layerOf)) as { panel?: { lines: { text: string }[] } } | null;
    const t = d?.panel?.lines.map((l) => l.text).join(' | ') ?? '';
    const m = /Topo\/fundo duplo: (\d+) sinais/.exec(t);
    return { n: m ? Number(m[1]) : 0, text: t };
  };
  await expect.poll(async () => {
    const s = await signals();
    return s.n >= 200 || /o histórico acabou/.test(s.text);
  }, { timeout: 60_000 }).toBe(true);
  const barsAfter = await page.evaluate(() => [...(window as unknown as { __rxCharts: Map<string, { bars: unknown[] }> }).__rxCharts.values()][0].bars.length);
  expect(barsAfter).toBeGreaterThan(barsBefore);
  expect(errors).toEqual([]);
});
