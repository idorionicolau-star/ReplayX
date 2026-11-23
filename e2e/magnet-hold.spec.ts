import { expect, test, type Page } from '@playwright/test';
import { enterAsGuest } from './helpers';

const magnetNow = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') ?? '{}').state?.magnet as string | undefined);

test('íman: 3 s premido desliga-o, em qualquer nível (1 a 5)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'strong' }, version: 3 })));
  await enterAsGuest(page);
  const btn = page.getByRole('button', { name: 'Íman', exact: true });
  await expect(btn).toBeVisible();
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  expect(await magnetNow(page)).toBe('strong'); // 1,5 s ainda não chega
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await expect.poll(() => magnetNow(page)).toBe('off');
  // largar não conta como clique (não passou para o nível 1)
  await page.waitForTimeout(300);
  expect(await magnetNow(page)).toBe('off');
});

test('íman: um toque normal continua a rodar os níveis', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'off' }, version: 3 })));
  await enterAsGuest(page);
  const btn = page.getByRole('button', { name: 'Íman', exact: true });
  await btn.click();
  await expect.poll(() => magnetNow(page)).toBe('weak');
  await btn.click();
  await expect.poll(() => magnetNow(page)).toBe('light');
});

test('íman: premir menos de 3 s e largar conta como um toque normal (roda o nível)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'weak' }, version: 3 })));
  await enterAsGuest(page);
  const btn = page.getByRole('button', { name: 'Íman', exact: true });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect.poll(() => magnetNow(page)).toBe('light');
});

test('barra de desenho (esquerda): 3 s premido no íman também o desliga, sem abrir o menu', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'medium' }, version: 3 })));
  await enterAsGuest(page);
  const btn = page.locator('aside button[title^="Íman"]').first();
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await expect.poll(() => magnetNow(page)).toBe('off');
  await expect(page.getByText('Sem íman')).toHaveCount(0); // o menu dos níveis não abriu
});

test.describe('telemóvel (toque)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test('3 s com o dedo no botão do íman desliga-o', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { magnet: 'firm' }, version: 3 })));
    await enterAsGuest(page);
    const btn = page.getByRole('button', { name: 'Íman', exact: true });
    const b = (await btn.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(3400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => magnetNow(page)).toBe('off');
  });
});
