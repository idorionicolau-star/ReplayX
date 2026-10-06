import type { AssetClass } from '@/core/types';
import { pnlFor, qtyForRisk, type ContractSpec, type Side } from './engine';

/** Regra de lote de um tipo de mercado: mínimo, passo (múltiplos permitidos) e máximo. */
export interface LotRule {
  min: number;
  step: number;
  max: number;
}
export type LotRules = Record<AssetClass, LotRule>;

/**
 * Regras por omissão por tipo de mercado (editáveis nas Definições). São valores típicos e não os de uma corretora em
 * concreto: em forex e metais o lote clássico é 0,01; em ações as quantidades são inteiras; cripto aceita frações finas.
 */
export const DEFAULT_LOT_RULES: LotRules = {
  forex: { min: 0.01, step: 0.01, max: 100 },
  commodities: { min: 0.01, step: 0.01, max: 100 },
  synthetic: { min: 0.01, step: 0.01, max: 1000 },
  crypto: { min: 0.001, step: 0.001, max: 1000 },
  indices: { min: 0.01, step: 0.01, max: 1000 },
  stocks: { min: 1, step: 1, max: 100000 },
  futures: { min: 1, step: 1, max: 1000 },
  demo: { min: 0.01, step: 0.01, max: 1000 },
};

export const LOT_CLASS_LABEL: Record<AssetClass, string> = {
  forex: 'Forex',
  commodities: 'Metais e matérias-primas',
  synthetic: 'Índices sintéticos',
  crypto: 'Cripto',
  indices: 'Índices',
  stocks: 'Ações',
  futures: 'Futuros',
  demo: 'Demonstração',
};

export function lotRule(assetClass: AssetClass, rules: Partial<LotRules> = DEFAULT_LOT_RULES): LotRule {
  return { ...DEFAULT_LOT_RULES[assetClass], ...(rules[assetClass] ?? {}) };
}

const decimals = (step: number) => {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
};

/** Ajusta a quantidade à regra: múltiplo do passo (para baixo ou ao mais próximo) e dentro de [mín, máx]. */
export function snapLot(q: number, rule: LotRule, mode: 'nearest' | 'down' = 'nearest'): number {
  const step = rule.step > 0 ? rule.step : rule.min;
  const base = Number.isFinite(q) ? q : rule.min;
  const k = mode === 'down' ? Math.floor(base / step + 1e-9) : Math.round(base / step);
  const v = +(k * step).toFixed(decimals(step) + 2);
  return Math.min(rule.max, Math.max(rule.min, +v.toFixed(decimals(step))));
}

/** Escada de lotes para os botões + e −: o mínimo, depois 1-2-5 por década, sempre em múltiplos do passo e até ao máximo. */
export function lotLadder(rule: LotRule): number[] {
  const out = [rule.min];
  const lo = Math.floor(Math.log10(rule.min));
  for (let k = lo; k <= Math.ceil(Math.log10(rule.max)); k++) {
    for (const m of [1, 2, 5]) {
      const v = snapLot(m * Math.pow(10, k), rule);
      if (v > out[out.length - 1] && v <= rule.max) out.push(v);
    }
  }
  return out;
}

/** Próximo (dir=1) ou anterior (dir=-1) degrau da escada desta regra. */
export function stepLotRule(q: number, dir: 1 | -1, rule: LotRule): number {
  const ladder = lotLadder(rule);
  const v = Number.isFinite(q) ? q : rule.min;
  if (dir === 1) return ladder.find((x) => x > v * (1 + 1e-9)) ?? ladder[ladder.length - 1];
  for (let i = ladder.length - 1; i >= 0; i--) if (ladder[i] < v * (1 - 1e-9)) return ladder[i];
  return ladder[0];
}

export interface RiskLot {
  /** Lote já ajustado à regra (arredondado para baixo, para nunca arriscar mais do que o pretendido). */
  qty: number;
  /** Risco real em dinheiro com este lote (da entrada ao stop). */
  risk: number;
  /** O lote mínimo do ativo já arrisca mais do que o pretendido. */
  minExceeds: boolean;
}

/** Lote que arrisca `riskAmount` entre a entrada e o stop, respeitando a regra de lote do ativo. */
export function lotForRisk(side: Side, riskAmount: number, entry: number, stop: number, spec: ContractSpec, rule: LotRule): RiskLot {
  const raw = qtyForRisk(riskAmount, entry, stop, spec);
  const down = snapLot(raw, rule, 'down');
  const minExceeds = raw < rule.min;
  const qty = minExceeds ? rule.min : down;
  const risk = Math.abs(pnlFor(side, qty, entry, stop, spec));
  return { qty, risk, minExceeds };
}

export function fmtLotWith(q: number, rule: LotRule): string {
  return q.toFixed(decimals(rule.step)).replace(/\.0+$/, '');
}
