import { describe, expect, it } from 'vitest';
import { allowedByTrigger, check, drawingValue, fillMessage, indicatorValue, migrateV1 } from '@/core/alerts';
import type { Bar } from '@/core/types';

describe('condições dos alertas', () => {
  it('cruzar um valor fixo', () => {
    expect(check('cross', { l: 1.09, r: 1.1 }, { l: 1.1, r: 1.1 })).toBe(true);
    expect(check('crossUp', { l: 1.09, r: 1.1 }, { l: 1.11, r: 1.1 })).toBe(true);
    expect(check('crossDown', { l: 1.09, r: 1.1 }, { l: 1.11, r: 1.1 })).toBe(false);
    expect(check('crossDown', { l: 1.11, r: 1.1 }, { l: 1.09, r: 1.1 })).toBe(true);
    // sem amostra anterior não há cruzamento
    expect(check('cross', undefined, { l: 1.2, r: 1.1 })).toBe(false);
  });

  it('cruzar uma linha que se mexe (preço parado, linha sobe)', () => {
    expect(check('crossDown', { l: 100, r: 99 }, { l: 100, r: 101 })).toBe(true);
  });

  it('maior/menor que', () => {
    expect(check('greater', undefined, { l: 71, r: 70 })).toBe(true);
    expect(check('less', undefined, { l: 71, r: 70 })).toBe(false);
  });

  it('entrar e sair de um canal', () => {
    const out = { l: 90, lo: 95, hi: 105 };
    const inside = { l: 100, lo: 95, hi: 105 };
    expect(check('enter', out, inside)).toBe(true);
    expect(check('exit', inside, out)).toBe(true);
    expect(check('enter', inside, inside)).toBe(false);
    expect(check('inside', undefined, inside)).toBe(true);
    expect(check('outside', undefined, out)).toBe(true);
  });

  it('uma vez por barra', () => {
    expect(allowedByTrigger({ trigger: 'perBar', lastBar: 100 }, 100)).toBe(false);
    expect(allowedByTrigger({ trigger: 'perBar', lastBar: 100 }, 200)).toBe(true);
    expect(allowedByTrigger({ trigger: 'every', lastBar: 100 }, 100)).toBe(true);
  });
});

describe('valor dos desenhos', () => {
  const style = {};
  it('linha de tendência: só no segmento; raio continua para a direita', () => {
    const pts = [
      { time: 0, price: 100 },
      { time: 100, price: 200 },
    ];
    expect(drawingValue({ type: 'trendline', points: pts, style }, 50)?.r).toBe(150);
    expect(drawingValue({ type: 'trendline', points: pts, style }, 150)).toBeUndefined();
    expect(drawingValue({ type: 'ray', points: pts, style }, 150)?.r).toBe(250);
    expect(drawingValue({ type: 'extended', points: pts, style }, -50)?.r).toBe(50);
  });
  it('linha e raio horizontais', () => {
    expect(drawingValue({ type: 'hline', points: [{ time: 10, price: 5 }], style }, 0)?.r).toBe(5);
    expect(drawingValue({ type: 'hray', points: [{ time: 10, price: 5 }], style }, 0)).toBeUndefined();
    expect(drawingValue({ type: 'hray', points: [{ time: 10, price: 5 }], style }, 20)?.r).toBe(5);
  });
  it('canal paralelo e retângulo dão limites', () => {
    const ch = drawingValue(
      {
        type: 'channel',
        points: [
          { time: 0, price: 100 },
          { time: 100, price: 200 },
          { time: 0, price: 90 },
        ],
        style,
      },
      50,
    );
    expect(ch).toEqual({ lo: 140, hi: 150 });
    const r = drawingValue(
      {
        type: 'rect',
        points: [
          { time: 0, price: 10 },
          { time: 100, price: 20 },
        ],
        style,
      },
      50,
    );
    expect(r).toEqual({ lo: 10, hi: 20 });
  });
});

describe('indicadores e mensagens', () => {
  it('valor de um indicador na última barra', () => {
    const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ time: i * 60, open: i, high: i, low: i, close: i, volume: 1 }));
    expect(indicatorValue({ type: 'sma', params: { length: 10, source: 'close' }, output: 'ma', label: 'SMA' }, bars)).toBeCloseTo(24.5);
  });
  it('mensagem com marcadores', () => {
    expect(fillMessage('{{ticker}} a {{close}} ({{interval}})', { ticker: 'EURUSD', close: '1.1', value: '1', time: 't', interval: '15m' })).toBe('EURUSD a 1.1 (15m)');
  });
  it('alertas antigos passam ao modelo novo', () => {
    const a = migrateV1({ id: 'a', symbolId: 'X', price: 10, condition: 'crossUp', message: '', active: true, once: true, createdAt: 1 });
    expect(a.source.kind).toBe('price');
    expect(a.target).toEqual({ kind: 'value', value: 10 });
    expect(a.trigger).toBe('once');
  });
});
