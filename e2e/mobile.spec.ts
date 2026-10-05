import { expect, test, type Page } from '@playwright/test';
import { chooseSymbol, enterAsGuest, waitBars } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Ctl = {
  tf: string;
  bars: { time: number }[];
  drawings: { type: string; points: { time: number; price: number }[] }[];
  chart: { timeScale(): { getVisibleLogicalRange(): { from: number; to: number } | null } };
  pickTime: number | null;
  pickX(): number | null;
  timeToX(t: number): number | null;
  priceToY(p: number): number | null;
};
const ctl = `[...window.__rxCharts.values()][0]`;

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.getByTestId('chart-0').boundingBox())!;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: box.x + p.x, y: box.y + p.y, id: i })) });
  return { send, box };
}

async function setup(page: Page, symbol = ['SIM-FX', 'DEMO:SIMFX'] as const) {
  await enterAsGuest(page);
  await chooseSymbol(page, symbol[0], symbol[1]);
  await waitBars(page, 300);
}

test('barra de ferramentas não fecha ao mexer nas opções; fecha ao escolher uma ferramenta', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Ferramentas de desenho' }).click();
  await expect(page.getByTestId('mobile-tools')).toBeVisible();
  // opções (íman, ângulo, bloquear…) deixam a barra aberta
  await page.getByTestId('mobile-tools').getByRole('button', { name: 'Alinhar ângulo' }).click();
  await page.getByTestId('mobile-tools').getByRole('button', { name: /Íman/ }).click();
  await page.getByRole('button', { name: 'Íman fraco (perto do preço)' }).click();
  await expect(page.getByTestId('mobile-tools')).toBeVisible();
  // escolher uma ferramenta fecha-a para se desenhar logo
  await page.getByTestId('mobile-tools').getByTestId('tool-trendline').click();
  await expect(page.getByTestId('mobile-tools')).toBeHidden();
});

test('no dedo, a ferramenta volta ao cursor depois de criar: arrastar/editar não cria outro objeto', async ({ page }) => {
  // mesmo com o "modo contínuo" ligado (só vale com rato)
  await page.addInitScript(() => localStorage.setItem('rx-settings', JSON.stringify({ state: { stayInDrawingMode: true }, version: 2 })));
  await setup(page);
  const { send } = await touch(page);
  const count = () => page.evaluate(`${ctl}.drawings.length`) as Promise<number>;
  await page.getByTestId('favorites-bar').getByRole('button', { name: 'Linha de tendência' }).click();
  // como no TradingView: 1.º toque posiciona o cursor, 2.º toque nele marca o ponto; o mesmo para o 2.º ponto
  const tap = async (x: number, y: number) => {
    await send('touchStart', [{ x, y }]);
    await send('touchEnd', []);
  };
  await tap(80, 420);
  expect(await count()).toBe(0);
  await tap(80, 420);
  expect(await count()).toBe(0);
  // arrastar move o cursor (sem marcar nada)
  await send('touchStart', [{ x: 80, y: 420 }]);
  for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: 80 + i * 25, y: 420 - i * 15 }]);
  await send('touchEnd', []);
  expect(await count()).toBe(0);
  await tap(280, 300);
  expect(await count()).toBe(1);
  // a ferramenta já não está ativa (o botão deixou de estar marcado)
  await expect(page.getByTestId('favorites-bar').getByRole('button', { name: 'Linha de tendência' })).not.toHaveClass(/text-accent/);
  const end = (await page.evaluate(`(() => { const c = ${ctl}; const d = c.drawings[0]; return { x: c.timeToX(d.points[1].time), y: c.priceToY(d.points[1].price) }; })()`)) as { x: number; y: number };
  // arrastar a pega do fim edita a linha e não cria outra
  await send('touchStart', [{ x: end.x, y: end.y }]);
  for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: end.x - i * 8, y: end.y + i * 8 }]);
  await send('touchEnd', []);
  expect(await count()).toBe(1);
  const moved = (await page.evaluate(`(() => { const c = ${ctl}; const d = c.drawings[0]; return c.priceToY(d.points[1].price); })()`)) as number;
  expect(moved).toBeGreaterThan(end.y + 20);
  // tocar noutro sítio só deseleciona: continua a haver um objeto
  await send('touchStart', [{ x: 300, y: 150 }]);
  await send('touchEnd', []);
  expect(await count()).toBe(1);
});

test('zoom com dois dedos é rápido: afastar os dedos 2× aproxima mais de 2,5×', async ({ page }) => {
  await setup(page);
  const { send } = await touch(page);
  const width = () => page.evaluate(`(() => { const r = ${ctl}.chart.timeScale().getVisibleLogicalRange(); return r.to - r.from; })()`) as Promise<number>;
  const w0 = await width();
  await send('touchStart', [
    { x: 150, y: 300 },
    { x: 250, y: 300 },
  ]);
  for (let i = 1; i <= 20; i++)
    await send('touchMove', [
      { x: 150 - i * 2.5, y: 300 },
      { x: 250 + i * 2.5, y: 300 },
    ]);
  await send('touchEnd', []);
  const w1 = await width();
  expect(w0 / w1).toBeGreaterThan(2.5);
  expect(w0 / w1).toBeLessThan(60);
});

test('esconder as barras de baixo dá mais espaço ao gráfico', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('chart-bottom-bar')).toBeVisible();
  const h0 = (await page.getByTestId('chart-0').boundingBox())!.height;
  await page.getByTestId('toggle-bottom').click();
  await expect(page.getByTestId('chart-bottom-bar')).toBeHidden();
  await expect(page.getByTestId('bottom-tab-journal')).toBeHidden();
  expect((await page.getByTestId('chart-0').boundingBox())!.height).toBeGreaterThan(h0 + 60);
  await page.getByTestId('toggle-bottom').click();
  await expect(page.getByTestId('chart-bottom-bar')).toBeVisible();
});

test('replay no telemóvel: arrastar a linha, ajuste fino e confirmar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  const { send } = await touch(page);
  await page.getByTestId('replay-button').click();
  await expect(page.getByTestId('pick-panel')).toBeVisible();
  const pick = () => page.evaluate(`(() => { const c = ${ctl}; return { t: c.pickTime, x: c.pickX(), tf: c.tf }; })()`) as Promise<{ t: number; x: number; tf: string }>;
  const p0 = await pick();
  expect(p0.t).not.toBeNull();
  // arrasta a linha para a esquerda; segue o dedo (não é um "toque e começa")
  await send('touchStart', [{ x: p0.x, y: 300 }]);
  for (let i = 1; i <= 10; i++) await send('touchMove', [{ x: p0.x - i * 12, y: 300 }]);
  await send('touchEnd', []);
  await expect(page.getByTestId('replay-bar')).toBeHidden();
  const p1 = await pick();
  expect(p1.t).toBeLessThan(p0.t);
  // ajuste fino: uma barra para a frente
  await page.getByTestId('pick-next').click();
  const p2 = await pick();
  expect(p2.t).toBeGreaterThan(p1.t);
  expect(p2.t - p1.t).toBe(900); // 15m
  // confirmar começa o replay nesse ponto
  await page.getByTestId('pick-confirm').click();
  await expect(page.getByTestId('replay-bar')).toBeVisible();
  const cursor = await page.evaluate(`${ctl}.cursor`);
  expect(cursor).toBe(p2.t + 900);
  expect(errors).toEqual([]);
});

test('depois do zoom com dois dedos, um dedo volta a mover o gráfico (dedos a sair um de cada vez)', async ({ page }) => {
  await setup(page);
  const { send } = await touch(page);
  const range = () => page.evaluate(`(() => { const r = ${ctl}.chart.timeScale().getVisibleLogicalRange(); return { from: r.from, to: r.to }; })()`) as Promise<{ from: number; to: number }>;
  const A = (x: number) => ({ x, y: 300 });
  // zoom com os dedos a sair um de cada vez (o normal numa mão real)
  await send('touchStart', [A(150), A(250)]);
  for (let i = 1; i <= 10; i++) await send('touchMove', [A(150 - i * 3), A(250 + i * 3)]);
  await send('touchEnd', [A(120)]); // levanta o 2.º dedo, o 1.º continua
  await send('touchEnd', []); // levanta o 1.º
  const before = await range();
  // um dedo arrasta o gráfico para a direita: tem de mostrar barras mais antigas
  await send('touchStart', [A(120)]);
  for (let i = 1; i <= 10; i++) await send('touchMove', [A(120 + i * 15)]);
  await send('touchEnd', []);
  const after = await range();
  expect(before.from - after.from).toBeGreaterThan(2);
  // e o inverso também (para cima/baixo não muda a escala de preços fixa, mas o arrasto horizontal funciona sempre)
  await send('touchStart', [A(300)]);
  for (let i = 1; i <= 10; i++) await send('touchMove', [A(300 - i * 15)]);
  await send('touchEnd', []);
  const back = await range();
  expect(back.from).toBeGreaterThan(after.from + 2);
});
