// Gera os ícones PNG da app a partir da marca (usa o Chromium do Playwright).
// Uso: PW_CHROMIUM=/caminho/do/chrome node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const glyph = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="56">
    <path d="M150 150 L220 220 M292 292 L362 362" stroke="#ffffff"/>
    <path d="M150 362 L362 150 M290 150 H362 V222" stroke="url(#up)"/>
  </g>`;
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b5cff"/><stop offset="1" stop-color="#7b3ff2"/></linearGradient>
  <radialGradient id="glow" cx=".25" cy=".15" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="up" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2dffc0"/><stop offset="1" stop-color="#22d3ff"/></linearGradient>
</defs>`;
const svg = (rx, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" rx="${rx}" fill="url(#bg)"/><rect width="512" height="512" rx="${rx}" fill="url(#glow)"/>${glyph(scale)}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="64"><path d="M130 130 L222 222 M290 290 L382 382"/><path d="M130 382 L382 130 M290 130 H382 V222"/></g></svg>`;

writeFileSync('public/icon.svg', svg(116, 1));

const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const render = async (markup, size, out, transparent = false) => {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body>`);
  await p.screenshot({ path: out, omitBackground: transparent });
  await p.close();
};
await render(svg(116, 1), 192, 'public/icons/icon-192.png', true);
await render(svg(116, 1), 512, 'public/icons/icon-512.png', true);
await render(svg(0, 0.78), 512, 'public/icons/maskable-512.png');
await render(svg(0, 0.9), 180, 'public/icons/apple-touch-icon.png');
await render(badge, 96, 'public/icons/badge-96.png', true);
await b.close();
console.log('ícones gerados');
