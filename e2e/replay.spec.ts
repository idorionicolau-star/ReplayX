import { expect, test } from '@playwright/test';
import { chartInfo, chooseSymbol, enterAsGuest, waitBars } from './helpers';

test('bar replay: começar, avançar, trocar de timeframe e negociar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=right-tab-watchlist]');

  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  const start = await chartInfo(page);
  expect(start.cursor).not.toBeNull();
  expect(start.tf).toBe('15m');

  for (let i = 0; i < 4; i++) await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 4 * 900);

  await page.click('[data-testid=replay-buy]');
  await expect(page.getByText('Compra executada')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 7 * 900);
  // o teste precisa de uma vela de 1h a meio: se o cursor calhar numa hora certa, avança mais 15m
  if ((start.cursor! + 7 * 900) % 3600 === 0) {
    await page.click('[data-testid=replay-forward]');
    await expect.poll(async () => (await chartInfo(page)).cursor).toBe(start.cursor! + 8 * 900);
  }
  const c15 = (await chartInfo(page)).cursor!;

  // troca para 1h a meio do replay: o cursor mantém-se e a vela de 1h fica parcial
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('1h');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c15);
  // espera que as velas de 1h estejam carregadas
  await expect.poll(async () => (await chartInfo(page)).last.time % 3600).toBe(0);
  const h = await chartInfo(page);
  expect(h.last.time).toBeLessThan(c15);
  expect(h.last.time + 3600).toBeGreaterThanOrEqual(c15);

  // avançar no 1h completa a vela
  await page.click('[data-testid=replay-forward]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(h.last.time + 3600);
  const done = await chartInfo(page);
  expect(done.last.time).toBe(h.last.time);
  expect(done.last.high).toBeGreaterThanOrEqual(h.last.high);
  expect(done.last.low).toBeLessThanOrEqual(h.last.low);

  // recuar volta ao ponto anterior
  await page.click('[data-testid=replay-back]');
  await expect.poll(async () => (await chartInfo(page)).cursor).toBe(c15);

  // fecha a posição pelo painel e confirma no diário
  await page.click('[data-testid=right-tab-trade]');
  await page.getByText('Fechar', { exact: true }).click();
  await page.click('[data-testid=bottom-tab-journal]');
  await expect(page.getByText(/Operações \(1\)/)).toBeVisible();

  await page.click('[data-testid=replay-exit]');
  await expect(page.getByTestId('replay-bar')).toBeHidden();
  expect(errors).toEqual([]);
});

test('desenhos sobrevivem à troca de timeframe', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-FX', 'DEMO:SIMFX');
  await waitBars(page, 500);
  await page.click('[data-testid=right-tab-watchlist]');
  await page.click('[data-testid=tool-trendline]');
  await page.mouse.click(400, 600);
  await page.mouse.click(800, 300);
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await expect.poll(async () => (await chartInfo(page)).tf).toBe('1h');
  const xs = await page.evaluate(() => {
    const charts = (window as unknown as { __rxCharts: Map<string, { drawings: { points: { time: number }[] }[]; timeToX(t: number): number | null }> }).__rxCharts;
    const c = [...charts.values()][0];
    return c.drawings[0].points.map((p) => c.timeToX(p.time));
  });
  expect(xs[0]).toBeGreaterThan(0);
  expect(xs[1]).toBeGreaterThan(xs[0]!);
});

test('a barra do replay arrasta-se e fica onde foi deixada (duplo clique repõe)', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  const bar = page.getByTestId('replay-bar');
  await expect(bar).toBeVisible();
  const b0 = (await bar.boundingBox())!;
  const g = (await page.getByTestId('replay-grip').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 40, g.y + g.height / 2 - 160, { steps: 6 });
  await page.mouse.up();
  const b1 = (await bar.boundingBox())!;
  expect(b0.y - b1.y).toBeGreaterThan(120);
  expect(b1.x - b0.x).toBeGreaterThan(20);
  // fica guardada
  await page.reload();
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') || '{}').state?.replayBarPos);
  expect(saved).toBeTruthy();
  // duplo clique na pega repõe a posição
  const g2 = page.getByTestId('replay-grip');
  if (await g2.isVisible()) {
    await g2.dblclick();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rx-settings') || '{}').state?.replayBarPos)).toBeNull();
  }
});

type Ctl = {
  drawings: { id: string; type: string; points: { time: number; price: number }[]; data?: { stop: number; target: number; riskPct: number } }[];
  container: HTMLElement;
  timeToX(t: number): number | null;
  priceToY(p: number): number | null;
  overlay: { regions: { target: { type: string; id: string; field: string }; kind: string; x: number; y: number; w: number; h: number }[] };
};
const ctlJs = `[...window.__rxCharts.values()][0]`;

async function startReplay(page: import('@playwright/test').Page) {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await page.waitForTimeout(1200);
}

/** Coordenadas de ecrã da pega (0 entrada, 2 stop, 3 alvo) da 1.ª ferramenta de posição. */
async function handleXY(page: import('@playwright/test').Page, id: 0 | 2 | 3) {
  return page.evaluate(
    ({ id }) => {
      const c = [...(window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts.values()][0];
      const d = c.drawings[0];
      const r = c.container.getBoundingClientRect();
      const price = id === 0 ? d.points[0].price : id === 2 ? d.data!.stop : d.data!.target;
      return { x: r.left + c.timeToX(d.points[0].time)!, y: r.top + c.priceToY(price)! };
    },
    { id },
  );
}

test('o botão Ordem cria a ferramenta de posição: arrastar a entrada abaixo do preço dá ordem limite e envia', async ({ page }) => {
  await startReplay(page);
  await page.getByTestId('replay-order').click();
  const send = page.getByTestId('position-send');
  await expect(send).toBeVisible();
  expect(await page.evaluate(`${ctlJs}.drawings.length`)).toBe(1);
  expect(await page.evaluate(`${ctlJs}.drawings[0].type`)).toBe('long');
  // entrada no preço atual: ordem a mercado
  await expect(send).toHaveText(/Enviar$/);
  // arrasta a entrada para baixo (compra abaixo do preço = limite)
  const e = await handleXY(page, 0);
  await page.mouse.move(e.x, e.y);
  await page.mouse.down();
  await page.mouse.move(e.x, e.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect(send).toHaveText(/Enviar limite/);
  await send.click();
  await expect(page.getByText('Ordem limite pendente colocada')).toBeVisible();
});

test('posição: lote pelo risco recalcula ao afastar o stop, e Lote manual usa a escada do ativo', async ({ page }) => {
  await startReplay(page);
  await page.getByTestId('replay-order').click();
  const info = page.getByTestId('position-info');
  await expect(info).toBeVisible();
  await page.getByTestId('position-mode-risk').click();
  const lot = async () => parseFloat((await info.locator('b').first().innerText()).replace(',', '.'));
  const l0 = await lot();
  expect(l0).toBeGreaterThan(0);
  // stop mais longe da entrada: com o risco fixo o lote baixa
  const s0 = await handleXY(page, 2);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.down();
  await page.mouse.move(s0.x, s0.y + 90, { steps: 8 });
  await page.mouse.up();
  await expect.poll(lot).toBeLessThan(l0);
  const l1 = await lot();
  await page.getByTestId('risk-plus').click();
  await expect.poll(lot).toBeGreaterThan(l1);
  // modo Lote: o valor é um degrau válido do ativo
  await page.getByTestId('position-mode-lot').click();
  await expect(page.getByTestId('qty-value').first()).toHaveText(/\d/);
  await page.getByTestId('qty-plus').first().click();
  await expect(info).toContainText('Lote');
});

test('inverter a posição espelha stop e alvo; ordem pendente tem SL e TP arrastáveis', async ({ page }) => {
  await startReplay(page);
  await page.getByTestId('replay-order').click();
  await expect(page.getByTestId('position-send')).toBeVisible();
  const before = await page.evaluate(`JSON.stringify(${ctlJs}.drawings[0].data)`);
  await page.getByTestId('position-flip').click();
  expect(await page.evaluate(`${ctlJs}.drawings[0].type`)).toBe('short');
  const after = JSON.parse((await page.evaluate(`JSON.stringify(${ctlJs}.drawings[0].data)`)) as string);
  const b = JSON.parse(before as string);
  // espelhado à volta da entrada: novo = 2 × entrada − antigo (o stop passa para cima e o alvo para baixo)
  const entry = (await page.evaluate(`${ctlJs}.drawings[0].points[0].price`)) as number;
  expect(after.stop).toBeCloseTo(2 * entry - b.stop, 5);
  expect(after.target).toBeCloseTo(2 * entry - b.target, 5);
  expect(after.stop).toBeGreaterThan(entry);
  expect(after.target).toBeLessThan(entry);
  // põe a entrada acima do preço (venda acima = limite) e envia; depois apaga o desenho para sobrar só a ordem
  const e = await handleXY(page, 0);
  await page.mouse.move(e.x, e.y);
  await page.mouse.down();
  await page.mouse.move(e.x, e.y - 60, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('position-send').click();
  await expect(page.getByText(/Ordem (limite|stop) pendente colocada/)).toBeVisible();
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(`${ctlJs}.drawings.length`)).toBe(0);
  // a linha do SL da ordem pendente arrasta-se
  const slRegion = () =>
    page.evaluate(() => {
      const c = [...(window as unknown as { __rxCharts: Map<string, Ctl> }).__rxCharts.values()][0];
      const r = c.overlay.regions.find((x) => x.kind === 'line' && x.target.type === 'order' && x.target.field === 'sl');
      const box = c.container.getBoundingClientRect();
      return r ? { x: box.left + r.x + r.w / 2, y: box.top + r.y + r.h / 2 } : null;
    });
  const sl0 = await slRegion();
  expect(sl0).not.toBeNull();
  await page.mouse.move(sl0!.x, sl0!.y);
  await page.mouse.down();
  await page.mouse.move(sl0!.x, sl0!.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await slRegion())?.y ?? 0).not.toBe(sl0!.y);
});

test('definições: regras de lote por tipo de mercado e ajuste do lote ao enviar', async ({ page }) => {
  await enterAsGuest(page);
  await chooseSymbol(page, 'SIM-VOL', 'DEMO:SIMVOL');
  await waitBars(page, 500);
  // lote guardado fora das regras (0,004) é ajustado ao mínimo do ativo (0,01) ao enviar
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rx-settings') || '{}');
    raw.state = { ...(raw.state ?? {}), trading: { ...(raw.state?.trading ?? {}), defaultQty: 0.004 } };
    localStorage.setItem('rx-settings', JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __rxCharts?: Map<string, unknown> }).__rxCharts?.size);
  await waitBars(page, 500);
  await page.click('[data-testid=replay-button]');
  await page.mouse.click(600, 450);
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  await expect(page.getByTestId('qty-value').first()).toHaveText(/0[.,]01/);
  await page.getByTestId('replay-buy').click();
  await expect(page.getByText('Compra executada')).toBeVisible();
});
