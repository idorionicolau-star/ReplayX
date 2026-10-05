import { expect, test } from '@playwright/test';

test('páginas legais: existem, têm a atribuição ao TradingView e os preços certos', async ({ page }) => {
  for (const [path, heading] of [
    ['/termos', 'Termos de utilização'],
    ['/privacidade', 'Política de privacidade'],
    ['/aviso-de-risco', 'Aviso de risco'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    // atribuição exigida pela licença do gráfico
    await expect(page.getByRole('link', { name: /Lightweight Charts™ da TradingView, Inc\./ })).toHaveAttribute('href', 'https://www.tradingview.com/');
    await expect(page.getByText(/não é afiliado ao TradingView/)).toBeVisible();
  }
  await page.goto('/termos');
  await expect(page.getByText(/detido por Major Group/)).toBeVisible();
  await expect(page.getByText(/mensal 100 MT/)).toBeVisible();
  await expect(page.getByText(/não há renovação automática/i)).toBeVisible();
  await expect(page.getByText(/e-Mola/i)).toHaveCount(0);
});

test('a página inicial mostra o consentimento e as ligações legais', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('consent')).toContainText('Termos');
  await expect(page.getByRole('link', { name: 'Aviso de risco' }).first()).toHaveAttribute('href', '/aviso-de-risco');
  await expect(page.getByRole('link', { name: /Lightweight Charts/ })).toBeVisible();
});

test('rotas de pagamento recusam pedidos sem sessão ou sem assinatura válida', async ({ request }) => {
  expect((await request.post('/api/billing/checkout', { data: { planId: 'mensal' } })).status()).toBe(401);
  expect((await request.get('/api/billing/status?ref=RPXABC')).status()).toBe(401);
  const hook = await request.post('/api/billing/webhook', { data: { event: 'payment.succeeded', data: { description: 'RPXABC' } }, headers: { 'x-zumbopay-signature': 'abcdef' } });
  expect(hook.status()).toBe(401);
});
