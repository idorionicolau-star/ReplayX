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
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.length ? pt(pts[0].x, pts[0].y) : [] });
    // arrastar o dedo move a mira (mesmo longe dela) e mostra a lupa
    await send('touchStart', [{ x: 80, y: 400 }]);
    for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: 80 + i * 20, y: 400 - i * 15 }]);
    await expect(page.getByTestId('loupe')).toBeVisible();
    // por defeito a lupa fica no canto superior direito do gráfico
    const lb = (await page.getByTestId('loupe').boundingBox())!;
    expect(lb.x + lb.width).toBeGreaterThan(box.x + box.width - 20);
    expect(lb.y).toBeLessThan(box.y + 20);
    await send('touchEnd', []);
    await expect(page.getByTestId('loupe')).toBeHidden();
    // toque marca o 1.º ponto, arrasta-se a mira e outro toque marca o 2.º
    await send('touchStart', [{ x: 200, y: 500 }]);
    await send('touchEnd', []);
    await send('touchStart', [{ x: 200, y: 500 }]);
    for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: 200 - i * 10, y: 500 }]);
    await send('touchEnd', []);
    await send('touchStart', [{ x: 200, y: 500 }]);
    await send('touchEnd', []);
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

test('texto antigo guardado no navegador não aparece em linhas novas', async ({ page }) => {
  // simula o que ficou guardado de uma versão anterior: o "último estilo" da linha de tendência com texto
  await page.addInitScript(() => {
    if (!localStorage.getItem('rx-drawings')) {
      localStorage.setItem('rx-drawings', JSON.stringify({ state: { bySymbol: { 'DEMO:SIMFX': [{ id: 'old1', type: 'hline', points: [{ time: Math.floor(Date.now() / 1000) - 3600, price: 1.2 }], style: { color: '#00ff00', width: 1, dash: 0, text: 'guardada' }, createdAt: 1 }] }, lastStyle: { trendline: { color: '#ff0000', text: 'olá', visibleOn: ['h'] } }, locked: false, hidden: false, updatedAt: 0 }, version: 1 }));
    }
  });
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=right-tab-watchlist]');
  for (let i = 0; i < 2; i++) {
    await page.click('[data-testid=tool-trendline]');
    await page.mouse.click(300, 500 - i * 120);
    await page.mouse.click(700, 400 - i * 120);
    await page.keyboard.press('Escape');
  }
  const ds = await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { drawings: { style: { text?: string; color: string; visibleOn?: string[] } }[] }> }).__rxCharts.values()][0];
    return c.drawings.map((d) => ({ text: d.style.text ?? null, color: d.style.color, visibleOn: d.style.visibleOn ?? null }));
  });
  // o desenho guardado antes continua lá (com o seu texto) e os dois novos saem sem texto
  expect(ds).toHaveLength(3);
  expect(ds[0].text).toBe('guardada');
  for (const d of ds.slice(1)) {
    expect(d.text).toBeNull();
    expect(d.visibleOn).toBeNull();
    expect(d.color).toBe('#ff0000'); // a cor continua a ser lembrada
  }
});

test('com o rato, o modo contínuo mantém a ferramenta ativa', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { stayInDrawingMode: true }, version: 2 })));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=right-tab-watchlist]');
  await page.click('[data-testid=tool-trendline]');
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(300, 500 - i * 100);
    await page.mouse.click(700, 400 - i * 100);
  }
  const n = await page.evaluate(() => [...(window as unknown as { __rxCharts: Map<string, { drawings: unknown[] }> }).__rxCharts.values()][0].drawings.length);
  expect(n).toBe(2);
});

test('fechar a barra de favoritos deixa um botão para a voltar a abrir', async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.getByTestId('favorites-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Esconder a barra de favoritos' }).click();
  await expect(page.getByTestId('favorites-bar')).toBeHidden();
  await page.getByTestId('favorites-show').click();
  await expect(page.getByTestId('favorites-bar')).toBeVisible();
  await expect(page.getByTestId('favorites-show')).toBeHidden();
});

test('legenda dos indicadores acompanha os painéis e o nome abre as ações (remover)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  await page.click('[data-testid=right-tab-watchlist]');
  // tira as médias que já vêm no gráfico (o plano grátis só deixa 3 indicadores) pelo menu do nome
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('indicator-name').first().click();
    await page.getByRole('button', { name: 'Remover indicador' }).click();
  }
  await expect(page.getByTestId('indicator-name')).toHaveCount(0);
  // dois indicadores de painel próprio
  await page.click('[data-testid=indicators-button]');
  await page.getByPlaceholder('Procurar indicador').fill('Estocástico');
  await page.getByTestId('indicator-stoch').click();
  await page.getByTestId('indicator-stoch').click();
  await page.keyboard.press('Escape');

  type P = { getHeight(): number; getHTMLElement(): HTMLElement | null; setStretchFactor(n: number): void };
  const geometry = () =>
    page.evaluate(() => {
      const c = [...(window as unknown as { __rxCharts: Map<string, { container: HTMLElement; chart: { panes(): P[] } }> }).__rxCharts.values()][0];
      const base = c.container.getBoundingClientRect().top;
      const panes = c.chart.panes().map((p) => Math.round(p.getHTMLElement()!.getBoundingClientRect().top - base));
      const labels = [...document.querySelectorAll('[data-testid=indicator-name]')].map((e) => Math.round(e.getBoundingClientRect().top - base));
      return { panes, labels };
    });
  await expect.poll(async () => (await geometry()).labels.length).toBe(2);
  const g0 = await geometry();
  // cada etiqueta fica no topo do seu painel (painéis 1 e 2)
  expect(Math.abs(g0.labels[0] - g0.panes[1])).toBeLessThan(14);
  expect(Math.abs(g0.labels[1] - g0.panes[2])).toBeLessThan(14);

  // muda a altura do 1.º painel de indicadores sem mexer na janela: a etiqueta do 2.º tem de acompanhar
  await page.evaluate(() => {
    const c = [...(window as unknown as { __rxCharts: Map<string, { chart: { panes(): P[] } }> }).__rxCharts.values()][0];
    c.chart.panes()[1].setStretchFactor(4);
  });
  await expect
    .poll(async () => {
      const g = await geometry();
      return Math.abs(g.labels[1] - g.panes[2]) < 14 && g.panes[2] !== g0.panes[2];
    })
    .toBe(true);

  // tocar no nome abre as ações; remover tira o indicador
  await page.getByTestId('indicator-name').first().click();
  await page.getByRole('button', { name: 'Remover indicador' }).click();
  await expect(page.getByTestId('indicator-name')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('barra de favoritos pode ficar na vertical', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 300);
  const bar = page.getByTestId('favorites-bar');
  const h = (await bar.boundingBox())!;
  expect(h.width).toBeGreaterThan(h.height);
  await page.getByTestId('favorites-orient').click();
  const v = (await bar.boundingBox())!;
  expect(v.height).toBeGreaterThan(v.width);
  // a escolha fica guardada
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') || '{}').state?.favoritesBarVertical)).toBe(true);
  await page.getByTestId('favorites-orient').click();
  const back = (await bar.boundingBox())!;
  expect(back.width).toBeGreaterThan(back.height);
});
