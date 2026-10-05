import { expect, test } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

type Pt = { time: number; price: number };
type Ctl = { drawings: { type: string; points: Pt[] }[]; timeToX(t: number): number | null; priceToY(p: number): number | null; bars: { close: number }[] };

function firstDrawing(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const charts = (window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts;
    const c = [...charts.values()][0];
    const d = c.drawings[c.drawings.length - 1];
    return d ? { type: d.type, xy: d.points.map((p) => ({ x: c.timeToX(p.time)!, y: c.priceToY(p.price)! })) } : null;
  });
}

test('favoritos: ferramentas e indicadores', async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.getByTestId('favorites-bar')).toBeVisible();
  // indicador favorito pelo menu rápido
  await page.getByRole('button', { name: 'Indicadores favoritos' }).click();
  await page.getByRole('button', { name: /Média Móvel Exponencial/ }).click();
  await expect(page.getByText('Média Móvel Exponencial adicionado')).toBeVisible();
  // marcar um indicador novo como favorito
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Estocástico');
  await page.getByTestId('fav-indicator-stoch').click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Indicadores favoritos' }).click();
  await expect(page.getByRole('button', { name: /Estocástico/ }).first()).toBeVisible();
});

test('alinhar ângulo: a linha encaixa em múltiplos de 15°', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  await page.click('[data-testid=right-tab-watchlist]');
  await page.click('[data-testid=angle-snap]');
  await page.click('[data-testid=tool-trendline]');
  await page.mouse.click(400, 600);
  await page.mouse.click(760, 437);
  const d = await firstDrawing(page);
  expect(d?.type).toBe('trendline');
  const [a, b] = d!.xy;
  const deg = (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  expect(Math.abs(deg / 15 - Math.round(deg / 15))).toBeLessThan(0.08);
});

test('alertas: valor, janela e painel; alerta num desenho', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-BTC', 'DEMO:SIMBTC');
  await waitBars(page, 500);

  // "maior que" um valor abaixo do preço: dispara logo na próxima cotação
  await page.click('[data-testid=right-tab-alerts]');
  await page.click('[data-testid=new-alert]');
  await expect(page.getByTestId('alert-dialog')).toBeVisible();
  await page.getByTestId('alert-condition').selectOption('greater');
  const price = await page.evaluate(() => {
    const charts = (window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts;
    const c = [...charts.values()][0];
    return c.bars[c.bars.length - 1].close;
  });
  const input = page.getByTestId('alert-dialog').locator('input[inputmode=decimal]').first();
  await input.fill(String(Math.floor(price * 0.5)));
  await page.getByTestId('alert-save').click();
  await expect(page.getByTestId('alert-row')).toHaveCount(1);
  await expect(page.getByTestId('alert-popups')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/maior que/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText(/Disparou 1×/)).toBeVisible();

  // linha horizontal → sino na barra do desenho → alvo já escolhido
  await page.keyboard.press('Alt+H');
  await page.mouse.click(600, 400);
  await page.getByRole('button', { name: 'Adicionar alerta neste desenho' }).click();
  await expect(page.getByTestId('alert-target')).toHaveValue(/^draw:/);
  await page.getByTestId('alert-save').click();
  await expect(page.getByTestId('alert-row')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test.describe('telemóvel', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('lupa ao desenhar com o dedo', async ({ page }) => {
    await enterAsGuest(page);
    await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
    await waitBars(page, 300);
    // escolhe a linha de tendência na barra de favoritos e arrasta com o dedo
    await page.getByTestId('favorites-bar').getByRole('button', { name: 'Linha de tendência' }).click();
    const box = (await page.getByTestId('chart-0').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = (x: number, y: number) => [{ x: box.x + x, y: box.y + y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(80, 400) });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(80 + i * 20, 400 - i * 15) });
    await expect(page.getByTestId('loupe')).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('loupe')).toBeHidden();
    const d = await firstDrawing(page);
    expect(d?.type).toBe('trendline');
  });
});

test('PWA: manifesto e service worker', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json();
  expect(m.short_name).toBe('ReplayX');
  expect(m.display).toBe('standalone');
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
  await page.goto('/');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);
});

test('contador da vela, cores do gráfico e texto com modelo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=right-tab-watchlist]');

  // contador até ao fecho da vela (em tempo real)
  const cd = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { countdownLabel(): { text: string } | null }> }).__rxCharts.values()][0];
    return c.countdownLabel()?.text ?? null;
  });
  expect(cd).toMatch(/^\d\d:\d\d/);

  // fundo do gráfico pelo código da cor
  await page.getByRole('button', { name: 'Definições', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: 'Fundo (cima)' }).click();
  await page.getByLabel('Código da cor').fill('#102030');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = [...(window as unknown as { __rxCharts: Map<string, { chart: { options(): { layout: { background: { color?: string } } } } }> }).__rxCharts.values()][0];
        return c.chart.options().layout.background.color;
      }),
    )
    .toBe('#102030');
  // guardar a cor nas "minhas cores"
  await page.getByRole('button', { name: 'Guardar esta cor' }).click();
  await expect(page.getByTestId('custom-colors').getByRole('button', { name: '#102030', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // linha com texto → modelo → outra linha com o mesmo texto
  await page.click('[data-testid=tool-trendline]');
  await page.mouse.click(300, 600);
  await page.mouse.click(700, 400);
  await page.getByRole('button', { name: 'Texto na linha' }).click();
  await page.getByPlaceholder('Escreva o texto…').fill('Suporte forte');
  await page.getByRole('dialog').getByTestId('template-menu').click();
  await page.getByRole('button', { name: 'Guardar como modelo…' }).click();
  await page.getByTestId('template-name').fill('Suporte');
  await page.getByRole('button', { name: 'Guardar modelo' }).click();
  await page.getByRole('button', { name: 'Ok' }).click();

  await page.click('[data-testid=tool-trendline]');
  await page.mouse.click(300, 300);
  await page.mouse.click(700, 250);
  await page.getByTestId('template-menu').first().click();
  await page.getByRole('button', { name: /^Suporte/ }).click();
  const texts = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { drawings: { style: { text?: string } }[] }> }).__rxCharts.values()][0];
    return c.drawings.map((d) => d.style.text ?? '');
  });
  expect(texts).toEqual(['Suporte forte', 'Suporte forte']);
  expect(errors).toEqual([]);
});

test('barra de baixo: períodos, navegação, "+" do preço e ir para data', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=right-tab-watchlist]');
  type C = { tf: string; bars: { time: number }[]; chart: { timeScale(): { getVisibleLogicalRange(): { from: number; to: number } | null } }; logicalToTime(l: number): number | null };
  const view = () =>
    page.evaluate(() => {
      const c = [...(window as unknown as { __rxCharts: Map<string, C> }).__rxCharts.values()][0];
      const r = c.chart.timeScale().getVisibleLogicalRange()!;
      const last = c.bars[c.bars.length - 1].time;
      return { tf: c.tf, from: c.logicalToTime(Math.max(0, r.from))!, last, width: r.to - r.from };
    });

  // 5D: velas de 5 minutos e ~5 dias à vista
  await page.click('[data-testid=range-5D]');
  await expect.poll(async () => (await view()).tf).toBe('5m');
  await expect.poll(async () => { const v = await view(); return Math.round((v.last - v.from) / 86400); }, { timeout: 20_000 }).toBe(5);

  // navegação: aproximar reduz a largura visível
  const before = (await view()).width;
  await page.getByTestId('chart-0').hover();
  await page.getByRole('button', { name: 'Aproximar' }).click();
  expect((await view()).width).toBeLessThan(before);

  // "+" junto à escala de preços abre o menu com alerta e linha horizontal
  const box = (await page.getByTestId('chart-0').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId('price-plus').click();
  await page.getByRole('button', { name: /Linha horizontal em/ }).click();
  const n = await page.evaluate(() => [...(window as unknown as { __rxCharts: Map<string, { drawings: { type: string }[] }> }).__rxCharts.values()][0].drawings.filter((d) => d.type === 'hline').length);
  expect(n).toBe(1);

  // relógio com fuso horário
  await expect(page.getByTestId('clock')).toHaveText(/\d\d:\d\d:\d\d/);

  // ir para data sem replay
  await page.getByRole('button', { name: 'Ir para data' }).first().click();
  await page.getByTestId('goto-show').click();
  await expect(page.getByTestId('replay-bar')).toBeHidden();
  expect(errors).toEqual([]);
});
