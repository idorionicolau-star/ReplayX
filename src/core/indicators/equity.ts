import type { Bar } from '../types';
import { signalR, type DtSignal } from './doubletop';

export interface EquityOptions {
  /** Capital inicial da conta. */
  capital: number;
  /** Risco por operação, em % do capital da conta nesse momento. */
  riskPct: number;
  /** Retira o lucro acima do capital inicial no fim de cada N dias (0 = nunca retira). */
  everyDays: number;
}

export interface EquityCurve {
  /** Capital na conta, vela a vela. */
  account: number[];
  /** Total já retirado, vela a vela. */
  withdrawn: number[];
  /** Conta + retiradas. */
  total: number[];
  /** Quantas retiradas se fizeram e o maior capital da conta (para o utilizador ver o efeito de retirar). */
  withdrawals: number;
}

const DAY = 86400;

/**
 * Curva de capital dos sinais do indicador: cada operação fechada arrisca `riskPct` da conta e rende `R` vezes isso.
 * No fim de cada N dias retira-se o que a conta tem acima do capital inicial (a conta volta ao capital inicial);
 * se estiver abaixo, não se retira nem se repõe nada. O dia conta-se em UTC.
 */
export function equityCurve(bars: readonly Bar[], signals: readonly DtSignal[], o: EquityOptions): EquityCurve {
  const n = bars.length;
  const account = new Array<number>(n).fill(NaN);
  const withdrawn = new Array<number>(n).fill(NaN);
  const total = new Array<number>(n).fill(NaN);
  const byExit = new Map<number, number[]>();
  for (const s of signals) {
    const r = signalR(s);
    if (!s.exit || r === null) continue;
    const list = byExit.get(s.exit.idx) ?? [];
    list.push(r);
    byExit.set(s.exit.idx, list);
  }
  let acc = o.capital;
  let out = 0;
  let count = 0;
  let days = 0;
  for (let t = 0; t < n; t++) {
    for (const r of byExit.get(t) ?? []) acc += acc * (o.riskPct / 100) * r;
    // fim de dia: a vela seguinte é de outro dia
    const endOfDay = t === n - 1 || Math.floor(bars[t + 1].time / DAY) !== Math.floor(bars[t].time / DAY);
    if (endOfDay && t < n - 1) {
      days++;
      if (o.everyDays > 0 && days % o.everyDays === 0 && acc > o.capital) {
        out += acc - o.capital;
        acc = o.capital;
        count++;
      }
    }
    account[t] = acc;
    withdrawn[t] = out;
    total[t] = acc + out;
  }
  return { account, withdrawn, total, withdrawals: count };
}
