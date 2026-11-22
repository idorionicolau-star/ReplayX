import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test.describe('telemóvel: botão do íman de preço (faz de Alt)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('só aparece com uma ferramenta de desenho ativa; um toque arma, outro desarma; some ao largar a ferramenta', async ({ page }) => {
    await enterAsGuest(page);
    await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
    await waitBars(page, 300);
    const btn = page.getByTestId('price-snap-button');
    await expect(btn).toHaveCount(0); // sem ferramenta: nada
    await page.getByRole('button', { name: 'Retração de Fibonacci', exact: true }).tap();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.tap();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    // armado: os pontos dos pivôs aparecem logo
    await expect.poll(() => page.evaluate(() => ([...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].pivotDots ?? []).length)).toBeGreaterThan(1);
    await btn.tap();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    // desarmado: os pontos somem
    await expect.poll(() => page.evaluate(() => ([...(window as unknown as { __rxCharts: Map<string, any> }).__rxCharts.values()][0].pivotDots ?? []).length)).toBe(0);
    await btn.tap(); // arma de novo
    await page.getByRole('button', { name: 'Retração de Fibonacci', exact: true }).tap(); // largar a ferramenta (volta ao cursor)
    await expect(btn).toHaveCount(0);
    await page.getByRole('button', { name: 'Retração de Fibonacci', exact: true }).tap();
    await expect(page.getByTestId('price-snap-button')).toHaveAttribute('aria-pressed', 'false'); // desarmou ao sair
  });
});

test('computador (rato): não há botão do íman de preço no ecrã (tem o Alt)', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=fav-tool-fib]');
  await expect(page.getByTestId('price-snap-button')).toHaveCount(0);
});
