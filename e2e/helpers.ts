import type { Page } from '@playwright/test';

export async function enterAsGuest(page: Page) {
  await page.goto('/');
  await page.getByText('Continuar sem conta').click();
  await page.waitForURL('**/terminal');
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
}

export async function chooseSymbol(page: Page, query: string, id: string) {
  await page.click('[data-testid=symbol-button]');
  await page.fill('[data-testid=symbol-search-input]', query);
  await page.click(`[data-testid="symbol-row-${id}"]`);
}

/** Estado do primeiro gráfico (via gancho de depuração). */
export function chartInfo(page: Page) {
  return page.evaluate(() => {
    const charts = (window as unknown as { __rxCharts: Map<string, { tf: string; cursor: number | null; symbol: { id: string } | null; bars: { time: number; open: number; high: number; low: number; close: number }[] }> }).__rxCharts;
    const c = [...charts.values()][0];
    const b = c.bars;
    return { tf: c.tf, cursor: c.cursor, symbol: c.symbol?.id, n: b.length, last: b[b.length - 1], first: b[0] };
  });
}

export async function waitBars(page: Page, min = 10) {
  await page.waitForFunction(
    (m) => {
      const charts = (window as unknown as { __rxCharts: Map<string, { bars: unknown[] }> }).__rxCharts;
      const c = [...charts.values()][0];
      return c && c.bars.length >= m;
    },
    min,
    { timeout: 30_000 },
  );
}
