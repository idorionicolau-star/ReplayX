import { expect, test } from '@playwright/test';

test('abertura: grelha de cenas a preto e branco, marca e nome; sem cores de marca antigas', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  await page.goto('/');
  const splash = page.getByTestId('splash');
  await expect(splash).toBeVisible();
  // 12 cenas duas vezes, cada uma com a sua legenda
  await expect(splash.locator('figure')).toHaveCount(24);
  await expect(splash.getByLabel('Iate ao pôr do sol').first()).toBeAttached();
  await expect(splash.getByLabel('ReplayX')).toBeAttached();
  const html = await splash.innerHTML();
  for (const old of ['#2b5cff', '#7b3ff2', '#2dffc0', '#22d3ff']) expect(html.toLowerCase()).not.toContain(old);
  await ctx.close();
});
