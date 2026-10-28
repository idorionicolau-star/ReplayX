import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('barra de favoritos nunca passa da largura do gráfico em ecrãs estreitos', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  // muitas ferramentas favoritas: a barra é mais larga do que o ecrã
  await page.addInitScript(() => {
    const favs = ['trendline', 'hline', 'fib', 'rect', 'long', 'short', 'ray', 'vline', 'channel', 'ellipse', 'text', 'measure'];
    localStorage.setItem('rx-settings', JSON.stringify({ state: { favoriteTools: favs, favoritesBar: true }, version: 0 }));
  });
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 100);
  const bar = page.getByTestId('favorites-bar');
  await expect(bar).toBeVisible();
  const box = (await bar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360 + 0.5);
});
