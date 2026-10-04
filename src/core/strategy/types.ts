import type { Bar } from '../types';
import type { ContractSpec, Fill, Side, Trade } from '../trading/engine';
import type { EquityPoint, Stats } from '../trading/stats';
import type { PlotStyle } from '../indicators/registry';

export interface SpecData {
  contractSize: number;
  /** direct: cotação em USD; inverse: base em USD (ex.: USDJPY); none: sem conversão. */
  conversion: 'direct' | 'inverse' | 'none';
  spread: number;
  slippage: number;
  commission: ContractSpec['commission'];
}

export function toSpec(d: SpecData): ContractSpec {
  return {
    contractSize: d.contractSize,
    spread: d.spread,
    slippage: d.slippage,
    commission: d.commission,
    toAccount: d.conversion === 'inverse' ? (p: number) => (p > 0 ? 1 / p : 1) : () => 1,
  };
}

export interface SizingRule {
  mode: 'fixed' | 'equityPct' | 'riskPct';
  value: number;
}

export interface BacktestSettings {
  initialCapital: number;
  sizing: SizingRule;
  pyramiding: number;
  /** Só negoceia a partir deste instante (as barras anteriores servem de aquecimento). */
  startTime?: number;
  endTime?: number;
  /** Fecha posições abertas no fim do teste. */
  closeAtEnd: boolean;
}

export const DEFAULT_BACKTEST: BacktestSettings = {
  initialCapital: 10000,
  sizing: { mode: 'riskPct', value: 1 },
  pyramiding: 1,
  closeAtEnd: true,
};

export interface EntryOptions {
  qty?: number;
  /** Preços absolutos. */
  sl?: number;
  tp?: number;
  /** Distâncias a partir do preço de entrada efetivo. */
  slDist?: number;
  tpDist?: number;
  trail?: number;
  limit?: number;
  stop?: number;
  comment?: string;
}

export interface PositionInfo {
  size: number;
  side: Side | null;
  avgPrice: number;
  openTrades: number;
  barsInTrade: number;
}

export interface StrategyApi {
  entry(id: string, side: Side, opts?: EntryOptions): void;
  exit(id: string, opts: { sl?: number; tp?: number; trail?: number }): void;
  close(id?: string, comment?: string): void;
  closeAll(comment?: string): void;
  cancel(id: string): void;
  readonly position: PositionInfo;
  readonly equity: number;
  readonly balance: number;
}

export interface StrategyProgram {
  name: string;
  onBar(i: number, api: StrategyApi): void;
}

export interface PlotOutput {
  title: string;
  color: string;
  width: number;
  style: PlotStyle;
  overlay: boolean;
  data: number[];
  colors?: (string | undefined)[];
}

export interface ShapeOutput {
  index: number;
  position: 'above' | 'below';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text?: string;
}

export interface BacktestResult {
  trades: Trade[];
  fills: Fill[];
  equity: EquityPoint[];
  stats: Stats;
  buyHoldPct: number;
  bars: number;
  from: number;
  to: number;
  openPositions: number;
}

export interface BacktestInput {
  bars: Bar[];
  symbolId: string;
  spec: SpecData;
  settings: BacktestSettings;
}
