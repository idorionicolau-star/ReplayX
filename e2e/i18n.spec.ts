import { expect, test, type Page } from '@playwright/test';

// navegador em inglês: a app abre sozinha em inglês
test.use({ locale: 'en-US' });

/** Palavras que só aparecem em texto português (para apanhar textos que ficaram por traduzir). */
const PT = /(^|[^\p{L}])(não|são|está|também|você|seus?|suas?|para|com|sem|pelo|pela|até|já|mais|quando|gráficos?|desenhos?|velas?|barras?|preço|símbolo|definições|guardar|apagar|mostrar|ocultar|ligad[oa]|desligad[oa]|\p{L}+ções|\p{L}+ões)(?![\p{L}])/iu;

/** Linhas de texto visíveis e dicas (title, aria-label, placeholder) que parecem português. */
async function ptLeftovers(page: Page): Promise<string[]> {
  const lines = await page.evaluate(() => {
    const out = document.body.innerText.split('\n');
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    }
    return out;
  });
  // nomes próprios que não são texto da app
  const ok = /São Paulo|\.com\b|Idioma \/ Language|Português|^\/\//;
  return [...new Set(lines.map((l) => l.trim()).filter((l) => l && PT.test(l) && !ok.test(l)))];
}

test('navegador em inglês: página de entrada, páginas legais e app em inglês; trocar para português', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Try the free demo (20 min)')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Train on the past/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');

  await page.goto('/termos');
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible();
  await expect(page.getByText('the Portuguese version prevails')).toBeVisible();
  await expect(page.getByText('days of free Pro')).toBeVisible();

  await page.goto('/');
  await page.getByText('Try the free demo (20 min)').click();
  await page.waitForURL('**/terminal');
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  await expect(page.getByTestId('indicators-button')).toContainText('Indicators');

  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await expect(page.getByText('Chart settings')).toBeVisible();
  await page.getByRole('tab', { name: 'General' }).click().catch(() => {});
  await expect(page.getByText('Language')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Português' }).click()]);
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  await expect(page.getByTestId('indicators-button')).toContainText('Indicadores');
  expect(await page.evaluate(() => localStorage.getItem('rx-lang'))).toBe('pt');
});

test('em inglês não sobra texto em português nos sítios principais', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Try the free demo (20 min)').click();
  await page.waitForURL('**/terminal');
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  const found: Record<string, string[]> = {};
  const check = async (where: string) => {
    await page.waitForTimeout(300);
    const left = await ptLeftovers(page);
    if (left.length) found[where] = left;
  };
  await check('terminal');

  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  for (const tab of ['Symbol', 'Scales', 'Canvas', 'General', 'Trading', 'Data']) {
    const t = page.getByRole('tab', { name: tab });
    if (await t.count()) {
      await t.first().click();
      await check(`settings/${tab}`);
    }
  }
  await page.keyboard.press('Escape');

  await page.getByTestId('indicators-button').click();
  await check('indicators');
  await page.keyboard.press('Escape');

  await page.getByTestId('symbol-button').click();
  await check('symbols');
  await page.keyboard.press('Escape');

  // painéis da direita e de baixo
  for (const name of ['Watchlist', 'Trade', 'Alerts', 'News', 'Economic calendar', 'Journal', 'Strategy tester', 'Visual builder', 'Scripts', 'Optimize / Learn']) {
    const b = page.getByRole('button', { name, exact: true }).or(page.getByRole('tab', { name, exact: true }));
    if (await b.count()) {
      await b.first().click().catch(() => {});
      await check(`panel/${name}`);
    }
  }

  await page.getByTestId('user-menu').click();
  await check('user-menu');
  await page.keyboard.press('Escape');

  await page.getByTestId('chart-0').click({ button: 'right', position: { x: 300, y: 200 }, force: true });
  await check('context-menu');
  await page.keyboard.press('Escape');

  await page.getByTestId('replay-button').click();
  await check('replay');

  console.log(JSON.stringify(found, null, 1));
  expect(found).toEqual({});
});
