import { describe, expect, it } from 'vitest';
import { compactExecMarkers, compactMoney, type ExecLike } from '@/chart/execMarkers';

const bar = (t: number) => Math.floor(t / 600) * 600; // velas de 10 minutos

describe('marcas de execução compactas', () => {
  it('lucro curto, sem moeda', () => {
    expect(compactMoney(175.4)).toBe('+175');
    expect(compactMoney(27.28)).toBe('+27,3');
    expect(compactMoney(8.84)).toBe('+8,84');
    expect(compactMoney(-1.36)).toBe('-1,36');
    expect(compactMoney(0)).toBe('+0');
  });

  it('as 6 saídas da mesma vela viram uma só com o resultado somado', () => {
    const pnls = [50.56, 40.96, 31.04, 27.28, 15.96, 8.84];
    const execs: ExecLike[] = pnls.map((pnl, i) => ({ time: 1000 + i, side: 'short', kind: 'exit', text: 'Fecho', pnl }));
    const m = compactExecMarkers(execs, bar);
    expect(m).toHaveLength(1);
    expect(m[0].text).toBe('+175 ×6');
    expect(m[0].color).toBe('#089981');
    expect(m[0].position).toBe('belowBar'); // fechar uma venda é uma compra: seta para cima
  });

  it('entradas: só a seta, e "×3" quando há várias na mesma vela; azul compra e laranja venda', () => {
    const execs: ExecLike[] = [
      { time: 100, side: 'long', kind: 'entry', text: 'Compra' },
      { time: 2000, side: 'short', kind: 'entry', text: 'Venda' },
      { time: 2100, side: 'short', kind: 'entry', text: 'Venda' },
      { time: 2200, side: 'short', kind: 'entry', text: 'Venda' },
    ];
    const m = compactExecMarkers(execs, bar);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ text: '', color: '#2962ff', position: 'belowBar', shape: 'arrowUp' });
    expect(m[1]).toMatchObject({ text: '×3', color: '#e65100', position: 'aboveBar', shape: 'arrowDown' });
  });

  it('saída com prejuízo é vermelha; SL e TP mantêm a etiqueta curta', () => {
    const m = compactExecMarkers([{ time: 100, side: 'long', kind: 'exit', text: 'SL', pnl: -9.99 }], bar);
    expect(m[0].text).toBe('SL -9,99');
    expect(m[0].color).toBe('#f23645');
    const tp = compactExecMarkers([{ time: 100, side: 'long', kind: 'exit', text: 'TP', pnl: 30 }], bar);
    expect(tp[0].text).toBe('TP +30');
  });

  it('velas diferentes não se juntam, e fora do gráfico são ignoradas', () => {
    const execs: ExecLike[] = [
      { time: 100, side: 'long', kind: 'entry', text: 'Compra' },
      { time: 700, side: 'long', kind: 'entry', text: 'Compra' },
      { time: 99999, side: 'long', kind: 'entry', text: 'Compra' },
    ];
    expect(compactExecMarkers(execs, (t) => (t > 5000 ? null : bar(t)))).toHaveLength(2);
  });
});
