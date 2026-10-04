import { describe, expect, it } from 'vitest';
import { barPath, closePosition, newAccount, placeOrder, processBar, qtyForRisk, type ContractSpec } from '@/core/trading/engine';
import { computeStats, monteCarlo } from '@/core/trading/stats';

const spec: ContractSpec = { contractSize: 1, toAccount: () => 1, spread: 0, slippage: 0, commission: { type: 'none', value: 0 } };
const bar = (time: number, open: number, high: number, low: number, close: number) => ({ time, open, high, low, close });

describe('motor de ordens', () => {
  it('abre a mercado e fecha com lucro', () => {
    const acc = newAccount(1000);
    const r = placeOrder(acc, { symbolId: 'X', side: 'long', type: 'market', qty: 2 }, 100, 1, spec);
    expect(r.fill?.price).toBe(100);
    expect(acc.positions).toHaveLength(1);
    closePosition(acc, acc.positions[0].id, 110, 2, 'manual', spec);
    expect(acc.balance).toBe(1020);
    expect(acc.trades[0].pnl).toBe(20);
  });

  it('executa o stop loss dentro da barra', () => {
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'market', qty: 1, sl: 95, tp: 120 }, 100, 1, spec);
    const fills = processBar(acc, 'X', bar(2, 100, 102, 94, 101), spec);
    expect(fills).toHaveLength(1);
    expect(fills[0].reason).toBe('sl');
    expect(fills[0].price).toBe(95);
    expect(acc.trades[0].r).toBeCloseTo(-1);
  });

  it('usa o extremo mais próximo da abertura primeiro', () => {
    expect(barPath(bar(1, 100, 101, 90, 95))).toEqual([100, 101, 90, 95]);
    expect(barPath(bar(1, 100, 110, 99, 105))).toEqual([100, 99, 110, 105]);
    // SL e TP na mesma barra: a abertura está perto do máximo → TP primeiro
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'market', qty: 1, sl: 92, tp: 104 }, 100, 1, spec);
    const fills = processBar(acc, 'X', bar(2, 103, 105, 91, 95), spec);
    expect(fills[0].reason).toBe('tp');
  });

  it('preenche limites em gap ao preço de abertura', () => {
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'limit', qty: 1, price: 98 }, 100, 1, spec);
    expect(acc.orders).toHaveLength(1);
    const fills = processBar(acc, 'X', bar(2, 96, 97, 95, 96.5), spec);
    expect(fills[0].kind).toBe('entry');
    expect(fills[0].price).toBe(96);
  });

  it('entrada limite e stop na mesma barra', () => {
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'limit', qty: 1, price: 98, sl: 96 }, 100, 1, spec);
    const fills = processBar(acc, 'X', bar(2, 100, 100.5, 95, 97), spec);
    expect(fills.map((f) => f.kind)).toEqual(['entry', 'exit']);
    expect(acc.balance).toBe(998);
  });

  it('trailing stop acompanha o preço', () => {
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'market', qty: 1, trail: 5 }, 100, 1, spec);
    expect(acc.positions[0].sl).toBe(95);
    processBar(acc, 'X', bar(2, 100, 120, 99, 119), spec);
    expect(acc.positions[0].sl).toBe(115);
    const f = processBar(acc, 'X', bar(3, 119, 119.5, 110, 111), spec);
    expect(f[0].reason).toBe('trail');
    expect(acc.trades[0].pnl).toBe(15);
  });

  it('calcula lotes pelo risco', () => {
    expect(qtyForRisk(100, 1.1, 1.095, { ...spec, contractSize: 100000 })).toBeCloseTo(0.2);
  });

  it('spread e comissão contam no resultado', () => {
    const s2: ContractSpec = { ...spec, spread: 1, commission: { type: 'perLot', value: 2 } };
    const acc = newAccount(1000);
    placeOrder(acc, { symbolId: 'X', side: 'long', type: 'market', qty: 1 }, 100, 1, s2);
    expect(acc.positions[0].entryPrice).toBe(100.5);
    closePosition(acc, acc.positions[0].id, 110, 2, 'manual', s2);
    expect(acc.trades[0].pnl).toBeCloseTo(9.5 - 4);
  });
});

describe('estatísticas', () => {
  it('calcula métricas principais', () => {
    const mk = (pnl: number, i: number) => ({ id: String(i), symbolId: 'X', side: 'long' as const, qty: 1, entryPrice: 1, entryTime: i * 10, exitPrice: 1, exitTime: i * 10 + 5, grossPnl: pnl, commission: 0, pnl, exitReason: 'manual' as const, mae: 0, mfe: 0, r: pnl / 10 });
    const trades = [100, -50, 200, -50, -50].map(mk);
    const s = computeStats(trades, 1000);
    expect(s.trades).toBe(5);
    expect(s.winRate).toBe(40);
    expect(s.netProfit).toBe(150);
    expect(s.profitFactor).toBe(2);
    expect(s.maxConsecLosses).toBe(2);
    expect(s.maxDrawdown).toBe(100);
    expect(s.totalR).toBe(15);
    const mc = monteCarlo(trades, 1000, 200);
    expect(mc.finalMedian).toBe(1150);
    expect(mc.dd95).toBeGreaterThanOrEqual(mc.ddMedian);
  });
});
