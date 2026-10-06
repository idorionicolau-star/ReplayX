import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Ctl = {
  container: HTMLElement;
  isAutoScale(): boolean;
  chart: { timeScale(): { scrollToPosition(n: number, animated: boolean): void }; priceScale(id: string): { applyOptions(o: { autoScale: boolean }): void } };
};
const ctl = `[...window.__rxCharts.values()][0]`;

test('escala de preços mexida à mão fica até tocar em Ajustar; o botão Auto liga e desliga', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  const auto = page.getByTestId('mobile-auto');
  await expect(auto).toHaveAttribute('aria-label', 'Escala automática: ligada');

  // o utilizador muda a escala à mão (o eixo deixa de ser automático) e levanta o dedo
  await page.evaluate(`(() => { const c = ${ctl}; c.chart.priceScale('right').applyOptions({ autoScale: false }); c.container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`);
  await expect(auto).toHaveAttribute('aria-label', 'Escala automática: desligada');

  // mover o gráfico no tempo não repõe a escala
  await page.evaluate(`${ctl}.chart.timeScale().scrollToPosition(-15, false)`);
  await page.waitForTimeout(400);
  expect(await page.evaluate(`${ctl}.isAutoScale()`)).toBe(false);

  // "Ajustar" repõe a escala e volta a ligar o automático
  await page.getByTestId('fit-view').click();
  await expect(auto).toHaveAttribute('aria-label', 'Escala automática: ligada');
  expect(await page.evaluate(`${ctl}.isAutoScale()`)).toBe(true);

  // o botão Auto desliga (a escala fica como está) e volta a ligar (ajusta)
  await auto.click();
  await expect(auto).toHaveAttribute('aria-label', 'Escala automática: desligada');
  await page.evaluate(`${ctl}.chart.priceScale('right').applyOptions({ autoScale: false })`);
  await page.evaluate(`${ctl}.chart.timeScale().scrollToPosition(-8, false)`);
  await page.waitForTimeout(400);
  expect(await page.evaluate(`${ctl}.isAutoScale()`)).toBe(false);
  await auto.click();
  await expect(auto).toHaveAttribute('aria-label', 'Escala automática: ligada');
  await expect.poll(() => page.evaluate(`${ctl}.isAutoScale()`)).toBe(true);
});
