'use client';
import { useSettings } from '@/store/settings';
import { resolveSymbol } from '@/core/symbols';
import { lotRule, type LotRule } from '@/core/trading/lots';

/** Regra de lote (mínimo, passo, máximo) do símbolo, a partir do tipo de mercado e das Definições. */
export function ruleFor(symbolId: string): LotRule {
  return lotRule(resolveSymbol(symbolId).assetClass, useSettings.getState().lotRules);
}

export function useLotRule(symbolId: string | undefined): LotRule {
  const rules = useSettings((s) => s.lotRules);
  return lotRule(symbolId ? resolveSymbol(symbolId).assetClass : 'demo', rules);
}
