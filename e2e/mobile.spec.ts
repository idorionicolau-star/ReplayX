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
  // como no TradingView: a mira aparece no centro, anda com o dedo em qualquer parte (relativo) e um toque marca o ponto
  const aim = () => page.evaluate(`${ctl}.aimMark`) as Promise<{ x: number; y: number } | null>;
  const tap = async (x: number, y: number) => {
    await send('touchStart', [{ x, y }]);
    await send('touchEnd', []);
  };
  const a0 = (await aim())!;
  expect(a0).not.toBeNull();
  // arrastar longe da mira move-a pela mesma distância, sem marcar nada
  await send('touchStart', [{ x: 60, y: 600 }]);
  for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: 60 + i * 10, y: 600 - i * 10 }]);
  await send('touchEnd', []);
  const a1 = (await aim())!;
  expect(Math.round(a1.x - a0.x)).toBeGreaterThan(60);
  expect(Math.round(a0.y - a1.y)).toBeGreaterThan(60);
  expect(await count()).toBe(0);
  await tap(60, 600); // toque em qualquer sítio marca o 1.º ponto na mira
  expect(await count()).toBe(0);
  await send('touchStart', [{ x: 60, y: 300 }]);
  for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: 60 + i * 8, y: 300 + i * 10 }]);
  await send('touchEnd', []);
  await tap(60, 600); // 2.º ponto
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
  // objeto não selecionado: arrastar por cima dele não o move; só um toque o seleciona
  const midOf = () => page.evaluate(`(() => { const c = ${ctl}; const d = c.drawings[0]; const a = d.points[0], b = d.points[1]; return { x: (c.timeToX(a.time) + c.timeToX(b.time)) / 2, y: (c.priceToY(a.price) + c.priceToY(b.price)) / 2 }; })()`) as Promise<{ x: number; y: number }>;
  const mid = await midOf();
  const pts = () => page.evaluate(`JSON.stringify(${ctl}.drawings[0].points)`);
  const before = await pts();
  await send('touchStart', [{ x: mid.x, y: mid.y }]);
  for (let i = 1; i <= 8; i++) await send('touchMove', [{ x: mid.x - i * 6, y: mid.y }]);
  await send('touchEnd', []);
  expect(await pts()).toBe(before);
  const mid2 = await midOf(); // o gráfico andou com o dedo
  await send('touchStart', [{ x: mid2.x, y: mid2.y }]);
  await send('touchEnd', []);
  expect(await page.evaluate(`${ctl}.selectedId`)).not.toBeNull();
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

test('mostrar as barras de baixo (recolhidas por defeito) tira espaço ao gráfico; esconder devolve-o', async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId('bottom-tab-journal')).toBeHidden();
  const h0 = (await page.getByTestId('chart-0').boundingBox())!.height;
  await page.getByTestId('toggle-bottom').click();
  await expect(page.getByTestId('bottom-tab-journal')).toBeVisible();
  expect((await page.getByTestId('chart-0').boundingBox())!.height).toBeLessThan(h0 - 20);
  await page.getByTestId('toggle-bottom').click();
  await expect(page.getByTestId('bottom-tab-journal')).toBeHidden();
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

test('zoom no mínimo: continuar a afastar os dedos não mexe no gráfico e avisa', async ({ page }) => {
  await setup(page);
  const { send } = await touch(page);
  const range = () => page.evaluate(`JSON.stringify(${ctl}.chart.timeScale().getVisibleLogicalRange())`) as Promise<string>;
  const pinchOut = async () => {
    await send('touchStart', [
      { x: 90, y: 300 },
      { x: 300, y: 300 },
    ]);
    for (let i = 1; i <= 20; i++)
      await send('touchMove', [
        { x: 90 + i * 4, y: 300 },
        { x: 300 - i * 4, y: 300 },
      ]);
    await send('touchEnd', []);
  };
  for (let i = 0; i < 6; i++) await pinchOut();
  await page.waitForTimeout(150);
  const at = await range();
  await pinchOut();
  await page.waitForTimeout(150);
  expect(await range()).toBe(at);
});

test('faixa de baixo: roda de símbolo e intervalo com arrasto; toque abre a pesquisa', async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const drag = async (testid: string | null, dyTotal: number) => {
    const loc = page.getByTestId(testid ?? 'mobile-tf');
    const b = (await loc.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    const n = 8;
    for (let i = 1; i <= n; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dyTotal * i) / n }] });
    return async () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const sym = () => page.evaluate(`${ctl}.symbol.id`) as Promise<string>;
  const tf = () => page.evaluate(`${ctl}.tf`) as Promise<string>;
  // a faixa de baixo existe e o botão do símbolo da barra de cima fica escondido no telemóvel
  await expect(page.getByTestId('mobile-strip')).toBeVisible();
  await expect(page.getByTestId('symbol-button')).toBeHidden();
  const s0 = await sym();
  // símbolo: arrastar para baixo (o símbolo de teste é o último da lista) recua ~2 itens
  let release = await drag('mobile-symbol', 75);
  await expect(page.getByTestId('wheel-picker')).toBeVisible();
  await release();
  await expect(page.getByTestId('wheel-picker')).toBeHidden();
  await expect.poll(sym).not.toBe(s0);
  // a pesquisa não abriu (o clique foi suprimido)
  await expect(page.getByPlaceholder(/Símbolo, nome ou mercado/)).toBeHidden();
  // intervalo: arrastar para cima muda para um intervalo maior
  const t0 = await tf();
  release = await drag(null, -75);
  await expect(page.getByTestId('wheel-picker')).toBeVisible();
  await release();
  await expect.poll(tf).not.toBe(t0);
  // toque simples abre a pesquisa
  await page.waitForTimeout(600);
  await page.getByTestId('mobile-symbol').tap();
  await expect(page.getByPlaceholder(/Símbolo, nome ou mercado/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  // toque no intervalo abre a grelha de intervalos
  await page.getByTestId('mobile-tf').tap();
  await page.locator('div.grid-cols-4 button[title="1 hora"]').tap();
  await expect.poll(tf).toBe('1h');
});

test('telemóvel: barras de baixo recolhidas por defeito, sem linha de escalas; faixa e navegação sempre visíveis', async ({ page }) => {
  await setup(page);
  // recolhidas por defeito: sem separadores do Diário/Testador e sem linha de escalas
  await expect(page.getByTestId('chart-bottom-bar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Mostrar as barras de baixo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Testador de estratégias' })).toBeHidden();
  // a faixa de símbolo/intervalo e a navegação ficam sempre
  await expect(page.getByTestId('mobile-strip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lista de observação' })).toBeVisible();
  // mostrar: aparecem os separadores, mas a linha de escalas nunca existe no telemóvel
  await page.getByRole('button', { name: 'Mostrar as barras de baixo' }).click();
  await expect(page.getByRole('button', { name: /Testador de estratégias/ })).toBeVisible();
  await expect(page.getByTestId('chart-bottom-bar')).toBeHidden();
  await expect(page.getByTestId('mobile-strip')).toBeVisible();
  // o que restava da linha (escala automática, ir para data) está nas Definições
  await page.getByRole('button', { name: 'Definições', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Geral' }).click().catch(async () => page.getByText('Geral', { exact: true }).first().click());
  await expect(page.getByText('Escala de preços automática')).toBeVisible();
  await expect(page.getByText('Ir para uma data no gráfico')).toBeVisible();
});

test('roda infinita: depois do último símbolo vem o primeiro', async ({ page }) => {
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const sym = () => page.evaluate(`${ctl}.symbol.id`) as Promise<string>;
  const s0 = await sym(); // SIM-FX é o último da lista de observação
  const b = (await page.getByTestId('mobile-symbol').boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (40 * i) / 8 }] }); // para cima 1 item
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(sym).not.toBe(s0); // deu a volta ao início
});

test('a faixa mostra a mini-roda: item anterior por cima e seguinte por baixo, e atualiza ao girar', async ({ page }) => {
  await setup(page);
  const sym = page.getByTestId('mobile-symbol');
  const tf = page.getByTestId('mobile-tf');
  await expect(sym.getByTestId('wheel-prev')).not.toHaveText('');
  await expect(sym.getByTestId('wheel-next')).not.toHaveText('');
  await expect(tf.getByTestId('wheel-prev')).not.toHaveText('');
  await expect(tf.getByTestId('wheel-next')).not.toHaveText('');
  // girar o intervalo para o seguinte: o que estava por baixo passa a ser o atual (e muda o gráfico)
  const nextBefore = (await tf.getByTestId('wheel-next').innerText()).trim();
  const cdp = await page.context().newCDPSession(page);
  const b = (await tf.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (40 * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(tf).toContainText(nextBefore);
});
