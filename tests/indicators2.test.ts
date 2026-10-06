import { describe, expect, it } from 'vitest';
import * as ta from '@/core/indicators/ta';
import { defaultParams, getIndicator, INDICATORS } from '@/core/indicators/registry';
import type { Bar } from '@/core/types';

const T0 = 1_700_000_000;
const bar = (i: number, o: number, h: number, l: number, c: number, v = 100): Bar => ({ time: T0 + i * 60, open: o, high: h, low: l, close: c, volume: v });

/** Série determinística com tendência e ruído. */
function wave(n: number): Bar[] {
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p += Math.sin(i / 7) * 1.4 + Math.cos(i / 3) * 0.6 + 0.05;
    const hi = Math.max(o, p) + 0.5 + Math.abs(Math.sin(i)) * 0.4;
    const lo = Math.min(o, p) - 0.5 - Math.abs(Math.cos(i)) * 0.4;
    out.push(bar(i, o, hi, lo, p, 100 + (i % 9) * 10));
  }
  return out;
}

/** Cada barra fecha no máximo e abre/mínimo no fecho anterior, sempre a subir 1. */
const rising = (n: number) => Array.from({ length: n }, (_, i) => bar(i, i, i + 1, i, i + 1));
const falling = (n: number) => Array.from({ length: n }, (_, i) => bar(i, 1000 - i, 1000 - i, 999 - i, 999 - i));
const finite = (s: number[]) => s.filter((v) => Number.isFinite(v));

describe('Accelerator Oscillator', () => {
  it('é o AO menos a sua média de 5 e só existe depois de 34+4 barras', () => {
    const bars = wave(120);
    const ao = ta.awesome(bars);
    const ac = ta.accelerator(bars);
    expect(ac).toHaveLength(120);
    const avg5 = ta.sma(ao, 5);
    for (const i of [40, 77, 119]) expect(ac[i]).toBeCloseTo(ao[i] - avg5[i], 10);
    expect(ac.findIndex((v) => Number.isFinite(v))).toBe(37);
  });

  it('os histogramas ficam verdes quando o AC sobe e vermelhos quando desce', () => {
    const bars = wave(120);
    const r = getIndicator('ac')!.compute(bars, defaultParams(getIndicator('ac')!));
    const ac = r.values.ac;
    const colors = r.colors!.ac;
    for (const i of [50, 60, 90]) expect(colors[i]).toBe(ac[i] >= ac[i - 1] ? '#089981' : '#f23645');
  });
});

describe('fórmulas dos osciladores', () => {
  it('Ultimate Oscillator vale 100 quando cada barra fecha no máximo e abre no fecho anterior', () => {
    const u = ta.ultimate(rising(60));
    expect(u[59]).toBeCloseTo(100, 8);
    expect(finite(ta.ultimate(wave(80))).every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  it('CMO vale 100 a subir sempre, −100 a descer sempre e 0 em zigue-zague simétrico', () => {
    const up = Array.from({ length: 30 }, (_, i) => i);
    const down = up.map((v) => -v);
    const zig = up.map((i) => (i % 2 ? 1 : 0));
    expect(ta.cmo(up, 9)[29]).toBeCloseTo(100, 8);
    expect(ta.cmo(down, 9)[29]).toBeCloseTo(-100, 8);
    expect(Math.abs(ta.cmo(zig, 10)[29])).toBeLessThan(25);
  });

  it('Elder Ray: máximo e mínimo menos a EMA', () => {
    const flat = Array.from({ length: 40 }, (_, i) => bar(i, 50, 51, 49, 50));
    const e = ta.elderRay(flat, 13);
    expect(e.bull[39]).toBeCloseTo(1, 8);
    expect(e.bear[39]).toBeCloseTo(-1, 8);
  });

  it('PPO e TSI são nulos numa série constante', () => {
    const flat = Array.from({ length: 80 }, () => 50);
    expect(ta.ppo(flat).ppo[79]).toBeCloseTo(0, 10);
    expect(Number.isNaN(ta.tsi(flat).tsi[79])).toBe(true); // 0/0: sem movimento não há força
  });

  it('TSI positivo numa subida; KST e Coppock positivos numa subida acelerada', () => {
    const up = Array.from({ length: 120 }, (_, i) => 100 + i * 1.5 + i * i * 0.01);
    expect(ta.tsi(up).tsi[119]).toBeGreaterThan(0);
    expect(ta.kst(up).kst[119]).toBeGreaterThan(0);
    expect(ta.coppock(up)[119]).toBeGreaterThan(0);
  });

  it('DPO tira a tendência: numa reta perfeita dá um valor constante', () => {
    const line = Array.from({ length: 80 }, (_, i) => 10 + i * 2);
    const d = ta.dpo(line, 20);
    expect(d[60]).toBeCloseTo(d[70], 8);
  });

  it('Vortex: VI+ acima de VI− numa subida e o contrário numa descida', () => {
    const up = ta.vortex(rising(40), 14);
    const down = ta.vortex(falling(40), 14);
    expect(up.plus[39]).toBeGreaterThan(up.minus[39]);
    expect(down.minus[39]).toBeGreaterThan(down.plus[39]);
  });

  it('Choppiness vale 0 numa tendência perfeita e sobe num mercado lateral', () => {
    expect(ta.choppiness(rising(40), 14)[39]).toBeCloseTo(0, 8);
    const side = Array.from({ length: 40 }, (_, i) => bar(i, 50, 51 + (i % 2), 49 - (i % 2), 50));
    expect(ta.choppiness(side, 14)[39]).toBeGreaterThan(61.8);
  });
});

describe('volume, bandas e médias', () => {
  it('A/D soma o volume inteiro quando fecha sempre no máximo', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(i, 10, 12, 8, 12, 100));
    expect(ta.adl(bars)).toEqual([100, 200, 300, 400, 500]);
  });

  it('%B vale 0,5 na média e 1 na banda de cima', () => {
    const close = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 1 : -1));
    const b = ta.bollinger(close, 20, 2);
    const pb = ta.percentB(close, 20, 2);
    const i = 29;
    expect(pb[i]).toBeCloseTo((close[i] - b.lower[i]) / (b.upper[i] - b.lower[i]), 10);
    const probe = [...close.slice(0, 29), b.upper[29]];
    expect(ta.percentB(probe, 20, 2)[29]).toBeGreaterThan(0.9);
  });

  it('Envelope fica à percentagem pedida em volta da média', () => {
    const c = Array.from({ length: 40 }, (_, i) => 100 + i);
    const e = ta.envelope(c, 10, 5, 'sma');
    expect(e.upper[30]).toBeCloseTo(e.basis[30] * 1.05, 10);
    expect(e.lower[30]).toBeCloseTo(e.basis[30] * 0.95, 10);
  });

  it('Alligator: três médias suavizadas do preço médio', () => {
    const bars = wave(60);
    const a = ta.alligator(bars);
    expect(a.jaw.findIndex((v) => Number.isFinite(v))).toBe(12);
    expect(a.teeth.findIndex((v) => Number.isFinite(v))).toBe(7);
    expect(a.lips.findIndex((v) => Number.isFinite(v))).toBe(4);
    const def = getIndicator('alligator')!;
    expect(def.outputs.map((o) => o.offset?.({}))).toEqual([8, 5, 3]);
  });
});

describe('Squeeze Momentum', () => {
  it('uma compressão (mercado parado com amplitude pequena) liga os pontos laranja', () => {
    const calm = Array.from({ length: 60 }, (_, i) => bar(i, 50, 50.2, 49.8, 50));
    const s = ta.squeeze(calm);
    expect(s.on[59]).toBe(true);
  });

  it('uma tendência firme com barras pequenas não está em compressão (as bandas ficam fora dos canais)', () => {
    const trend = Array.from({ length: 60 }, (_, i) => bar(i, 50 + i, 50.05 + i, 49.95 + i, 50 + i));
    expect(ta.squeeze(trend).on[59]).toBe(false);
  });
});

describe('todos os indicadores novos', () => {
  const IDS = ['ac', 'alligator', 'squeeze', 'uo', 'cmo', 'elder', 'kst', 'coppock', 'dpo', 'vortex', 'chaikinosc', 'force', 'ad', 'chop', 'ppo', 'tsi', 'pctb', 'envelope'];
  const bars = wave(300);

  it('estão registados, sem ids repetidos e com descrição', () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of IDS) {
      const d = getIndicator(id);
      expect(d, id).toBeDefined();
      expect(d!.description.length, id).toBeGreaterThan(20);
    }
  });

  for (const id of IDS) {
    it(`${id}: calcula com os parâmetros por omissão, com séries do tamanho das barras`, () => {
      const d = getIndicator(id)!;
      const r = d.compute(bars, defaultParams(d));
      for (const o of d.outputs) {
        const s = r.values[o.key];
        expect(s, `${id}.${o.key}`).toHaveLength(bars.length);
        expect(finite(s).length, `${id}.${o.key} tem valores`).toBeGreaterThan(50);
      }
      for (const [k, c] of Object.entries(r.colors ?? {})) expect(c, `${id}.${k} cores`).toHaveLength(bars.length);
    });
  }
});
